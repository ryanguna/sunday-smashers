import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  advanceKnockoutBracket,
  advanceKnockoutForMatch,
  isDecidedStatus,
  knockoutNextMatchLinks,
  planKnockoutAdvance,
  semiOutcome,
  type KnockoutMatchRow,
} from './knockout-advance'
import { generateKnockout, type StandingRow } from './draw'
import { knockoutToMatchInserts, publishSafety } from './draw-admin'
import type { Database } from './supabase/types'

/**
 * Regression cover for the bug that made the Championship and the Battle for
 * 3rd unplayable: they are published with `null` teams and nothing ever filled
 * them in, so the console showed "TBC v TBC", the saved result carried no
 * winner, and no champion could ever be crowned.
 */

const FINALS = { points_to_win: 21, deuce_enabled: false, cap: null }

function row(over: Partial<KnockoutMatchRow> & Pick<KnockoutMatchRow, 'id'>): KnockoutMatchRow {
  return {
    bracket_key: null,
    status: 'scheduled',
    team_a_id: null,
    team_b_id: null,
    score_a: 0,
    score_b: 0,
    winner_team_id: null,
    forfeited_by_team_id: null,
    ...FINALS,
    ...over,
  }
}

/** A freshly published bracket: semis drawn, final and third-place empty. */
function publishedBracket(over: Record<string, Partial<KnockoutMatchRow>> = {}): KnockoutMatchRow[] {
  return [
    row({ id: 'm1', bracket_key: 'M1', team_a_id: 't1', team_b_id: 't4', ...over.m1 }),
    row({ id: 'm2', bracket_key: 'M2', team_a_id: 't2', team_b_id: 't3', ...over.m2 }),
    row({ id: 'third', bracket_key: 'THIRD', ...over.third }),
    row({ id: 'final', bracket_key: 'FINAL', ...over.final }),
  ]
}

describe('isDecidedStatus', () => {
  it('covers every decided status, not just completed', () => {
    expect(isDecidedStatus('completed')).toBe(true)
    expect(isDecidedStatus('forfeited')).toBe(true)
    expect(isDecidedStatus('walkover')).toBe(true)
    expect(isDecidedStatus('retired')).toBe(true)
    expect(isDecidedStatus('scheduled')).toBe(false)
    expect(isDecidedStatus('in_progress')).toBe(false)
    expect(isDecidedStatus('cancelled')).toBe(false)
  })
})

describe('semiOutcome', () => {
  it('reads winner and loser off a completed score', () => {
    expect(
      semiOutcome(
        row({ id: 'm1', bracket_key: 'M1', team_a_id: 't1', team_b_id: 't4', status: 'completed', score_a: 21, score_b: 14 }),
      ),
    ).toEqual({ winner: 't1', loser: 't4' })
  })

  it('advances the pair that did not forfeit', () => {
    expect(
      semiOutcome(
        row({
          id: 'm1',
          bracket_key: 'M1',
          team_a_id: 't1',
          team_b_id: 't4',
          status: 'forfeited',
          score_a: 0,
          score_b: 21,
          forfeited_by_team_id: 't4',
        }),
      ),
    ).toEqual({ winner: 't1', loser: 't4' })
  })

  it('honours the recorded winner of a retirement, whose score is short', () => {
    expect(
      semiOutcome(
        row({
          id: 'm2',
          bracket_key: 'M2',
          team_a_id: 't2',
          team_b_id: 't3',
          status: 'retired',
          score_a: 11,
          score_b: 7,
          winner_team_id: 't2',
        }),
      ),
    ).toEqual({ winner: 't2', loser: 't3' })
  })

  it('is unresolved while the semi is still in progress', () => {
    expect(
      semiOutcome(row({ id: 'm1', bracket_key: 'M1', team_a_id: 't1', team_b_id: 't4', status: 'in_progress', score_a: 19, score_b: 12 })),
    ).toBeNull()
  })

  it('is unresolved when a self-contradictory row names a winner who is not playing', () => {
    expect(
      semiOutcome(
        row({ id: 'm1', bracket_key: 'M1', team_a_id: 't1', team_b_id: 't4', status: 'completed', winner_team_id: 't9' }),
      ),
    ).toBeNull()
  })
})

describe('planKnockoutAdvance', () => {
  it('sends both winners to the final and both losers to the third-place match', () => {
    const plan = planKnockoutAdvance(
      publishedBracket({
        m1: { status: 'completed', score_a: 21, score_b: 14 },
        m2: { status: 'completed', score_a: 15, score_b: 21 },
      }),
    )

    expect(plan).toEqual([
      { matchId: 'final', bracketKey: 'FINAL', patch: { team_a_id: 't1', team_b_id: 't3' } },
      { matchId: 'third', bracketKey: 'THIRD', patch: { team_a_id: 't4', team_b_id: 't2' } },
    ])
  })

  it('fills only the M1 slots when just one semi has finished', () => {
    const plan = planKnockoutAdvance(
      publishedBracket({ m1: { status: 'completed', score_a: 21, score_b: 14 } }),
    )

    expect(plan).toEqual([
      { matchId: 'final', bracketKey: 'FINAL', patch: { team_a_id: 't1' } },
      { matchId: 'third', bracketKey: 'THIRD', patch: { team_a_id: 't4' } },
    ])
  })

  it('advances a forfeited semi, which still has a winner', () => {
    const plan = planKnockoutAdvance(
      publishedBracket({
        m1: { status: 'forfeited', score_a: 21, score_b: 0, forfeited_by_team_id: 't4' },
        m2: { status: 'walkover', score_a: 0, score_b: 21, forfeited_by_team_id: 't2' },
      }),
    )

    expect(plan).toEqual([
      { matchId: 'final', bracketKey: 'FINAL', patch: { team_a_id: 't1', team_b_id: 't3' } },
      { matchId: 'third', bracketKey: 'THIRD', patch: { team_a_id: 't4', team_b_id: 't2' } },
    ])
  })

  it('plans nothing when the slots already hold the right pairs (idempotent re-run)', () => {
    const plan = planKnockoutAdvance(
      publishedBracket({
        m1: { status: 'completed', score_a: 21, score_b: 14 },
        m2: { status: 'completed', score_a: 15, score_b: 21 },
        final: { team_a_id: 't1', team_b_id: 't3' },
        third: { team_a_id: 't4', team_b_id: 't2' },
      }),
    )

    expect(plan).toEqual([])
  })

  it('plans nothing while both semis are unplayed', () => {
    expect(planKnockoutAdvance(publishedBracket())).toEqual([])
  })

  it('refuses to rewrite the line-up of a final that has already been played', () => {
    const plan = planKnockoutAdvance(
      publishedBracket({
        m1: { status: 'completed', score_a: 21, score_b: 14 },
        m2: { status: 'completed', score_a: 15, score_b: 21 },
        final: { team_a_id: 't9', team_b_id: 't8', status: 'completed', score_a: 21, score_b: 9, winner_team_id: 't9' },
      }),
    )

    expect(plan).toEqual([
      { matchId: 'third', bracketKey: 'THIRD', patch: { team_a_id: 't4', team_b_id: 't2' } },
    ])
  })

  it('never puts the same pair in both slots of the final', () => {
    const plan = planKnockoutAdvance(
      publishedBracket({
        m1: { status: 'completed', score_a: 21, score_b: 14 },
        m2: { status: 'completed', score_a: 21, score_b: 14 },
        final: { team_b_id: 't1' },
      }),
    )

    const finalPatch = plan.find((update) => update.bracketKey === 'FINAL')
    expect(finalPatch?.patch.team_a_id).toBeUndefined()
  })

  it('uses the same slot convention as generateKnockout()', () => {
    const standings = ['t1', 't2', 't3', 't4'].map<StandingRow>((teamId, index) => ({
      teamId,
      rank: index + 1,
      played: 0,
      wins: 0,
      losses: 0,
      forfeits: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0,
      tiebreak: 'wins',
      needsAdminDecision: false,
    }))

    const preview = generateKnockout(standings, {
      m1: { teamA: 't1', teamB: 't4', pointsA: 21, pointsB: 14 },
      m2: { teamA: 't2', teamB: 't3', pointsA: 15, pointsB: 21 },
    })
    const finalPreview = preview.find((fixture) => fixture.key === 'FINAL')
    const thirdPreview = preview.find((fixture) => fixture.key === 'THIRD')

    const plan = planKnockoutAdvance(
      publishedBracket({
        m1: { status: 'completed', score_a: 21, score_b: 14 },
        m2: { status: 'completed', score_a: 15, score_b: 21 },
      }),
    )
    const planned = (key: 'FINAL' | 'THIRD') =>
      plan.find((update) => update.bracketKey === key)?.patch

    expect(planned('FINAL')).toEqual({
      team_a_id: finalPreview?.teamA,
      team_b_id: finalPreview?.teamB,
    })
    expect(planned('THIRD')).toEqual({
      team_a_id: thirdPreview?.teamA,
      team_b_id: thirdPreview?.teamB,
    })
  })
})

describe('knockoutNextMatchLinks', () => {
  it('points both semis at the final', () => {
    expect(knockoutNextMatchLinks({ M1: 'm1', M2: 'm2', THIRD: 'third', FINAL: 'final' })).toEqual([
      { matchId: 'm1', nextMatchId: 'final' },
      { matchId: 'm2', nextMatchId: 'final' },
    ])
  })

  it('links nothing when the final was not published', () => {
    expect(knockoutNextMatchLinks({ M1: 'm1', M2: 'm2' })).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Persistence, against a stand-in PostgREST client
// ---------------------------------------------------------------------------

interface FakeOptions {
  /** Simulates an RLS refusal: no error, zero rows affected. */
  silentlyRefuseUpdates?: boolean
  readError?: string
}

function fakeClient(rows: KnockoutMatchRow[], options: FakeOptions = {}) {
  const updates: { matchId: string; patch: Record<string, unknown> }[] = []
  const divisionId = 'div-1'

  const client = {
    from() {
      return {
        select(columns: string) {
          const builder = {
            eq(column: string, value: string) {
              if (column === 'id') {
                const match = rows.find((r) => r.id === value)
                return {
                  maybeSingle: async () => ({
                    data: match ? { division_id: divisionId, bracket_key: match.bracket_key } : null,
                    error: null,
                  }),
                }
              }
              return {
                in: async () =>
                  options.readError
                    ? { data: null, error: { message: options.readError } }
                    : { data: rows, error: null },
              }
            },
          }
          void columns
          return builder
        },
        update(patch: Record<string, unknown>) {
          return {
            eq(_column: string, matchId: string) {
              return {
                select: async () => {
                  if (options.silentlyRefuseUpdates) return { data: [], error: null }
                  const target = rows.find((r) => r.id === matchId)
                  if (!target) return { data: [], error: null }
                  Object.assign(target, patch)
                  updates.push({ matchId, patch })
                  return { data: [{ id: matchId }], error: null }
                },
              }
            },
          }
        },
      }
    },
  }

  return { client: client as unknown as SupabaseClient<Database>, updates, rows }
}

describe('advanceKnockoutBracket', () => {
  it('writes only team_a_id / team_b_id on the final and third-place rows', async () => {
    const { client, updates } = fakeClient(
      publishedBracket({
        m1: { status: 'completed', score_a: 21, score_b: 14 },
        m2: { status: 'completed', score_a: 15, score_b: 21 },
      }),
    )

    const result = await advanceKnockoutBracket(client, 'div-1')

    expect(result).toEqual({ ok: true, updated: 2 })
    expect(updates).toEqual([
      { matchId: 'final', patch: { team_a_id: 't1', team_b_id: 't3' } },
      { matchId: 'third', patch: { team_a_id: 't4', team_b_id: 't2' } },
    ])
    for (const update of updates) {
      expect(Object.keys(update.patch).every((key) => key === 'team_a_id' || key === 'team_b_id')).toBe(true)
    }
  })

  it('writes nothing the second time it runs', async () => {
    const { client, updates } = fakeClient(
      publishedBracket({
        m1: { status: 'completed', score_a: 21, score_b: 14 },
        m2: { status: 'completed', score_a: 15, score_b: 21 },
      }),
    )

    await advanceKnockoutBracket(client, 'div-1')
    const second = await advanceKnockoutBracket(client, 'div-1')

    expect(second).toEqual({ ok: true, updated: 0 })
    expect(updates).toHaveLength(2)
  })

  it('reports a silent RLS refusal instead of claiming success', async () => {
    const { client } = fakeClient(
      publishedBracket({
        m1: { status: 'completed', score_a: 21, score_b: 14 },
        m2: { status: 'completed', score_a: 15, score_b: 21 },
      }),
      { silentlyRefuseUpdates: true },
    )

    const result = await advanceKnockoutBracket(client, 'div-1')

    expect(result.ok).toBe(false)
    expect(result.updated).toBe(0)
    expect(result.message).toMatch(/no row was changed/i)
  })

  it('reports a failed read without touching anything', async () => {
    const { client, updates } = fakeClient(publishedBracket(), { readError: 'boom' })
    const result = await advanceKnockoutBracket(client, 'div-1')

    expect(result.ok).toBe(false)
    expect(result.message).toContain('boom')
    expect(updates).toEqual([])
  })
})

describe('advanceKnockoutForMatch', () => {
  it('advances the bracket when the saved match is a semi', async () => {
    const { client, updates } = fakeClient(
      publishedBracket({ m1: { status: 'completed', score_a: 21, score_b: 14 } }),
    )

    const result = await advanceKnockoutForMatch(client, 'm1')

    expect(result).toEqual({ ok: true, updated: 2 })
    expect(updates.map((u) => u.matchId)).toEqual(['final', 'third'])
  })

  it('is a no-op for a match that feeds nothing', async () => {
    const { client, updates } = fakeClient([
      row({ id: 'rr-1', bracket_key: null, status: 'completed', team_a_id: 't1', team_b_id: 't2', score_a: 15, score_b: 3 }),
    ])

    expect(await advanceKnockoutForMatch(client, 'rr-1')).toEqual({ ok: true, updated: 0 })
    expect(updates).toEqual([])
  })

  it('is a no-op for a final, which feeds nothing further', async () => {
    const { client, updates } = fakeClient(
      publishedBracket({
        final: { status: 'completed', team_a_id: 't1', team_b_id: 't3', score_a: 21, score_b: 18 },
      }),
    )

    expect(await advanceKnockoutForMatch(client, 'final')).toEqual({ ok: true, updated: 0 })
    expect(updates).toEqual([])
  })

  it('is a no-op for an unknown match id', async () => {
    const { client } = fakeClient(publishedBracket())
    expect(await advanceKnockoutForMatch(client, 'nope')).toEqual({ ok: true, updated: 0 })
  })
})

describe('re-publishing the bracket after the semis have been played', () => {
  const standings = ['t1', 't2', 't3', 't4'].map<StandingRow>((teamId, index) => ({
    teamId,
    rank: index + 1,
    played: 0,
    wins: 0,
    losses: 0,
    forfeits: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    pointDiff: 0,
    tiebreak: 'wins',
    needsAdminDecision: false,
  }))

  it('is blocked until the admin explicitly accepts destroying the results', () => {
    const existing = [
      { id: 'm1', stage: 'semi' as const, hasResult: true },
      { id: 'm2', stage: 'semi' as const, hasResult: false },
      { id: 'third', stage: 'third_place' as const, hasResult: false },
      { id: 'final', stage: 'final' as const, hasResult: false },
    ]

    expect(publishSafety(existing, { confirmReplace: true }).canPublish).toBe(false)
    expect(
      publishSafety(existing, { confirmReplace: true, confirmDestroyResults: true }).canPublish,
    ).toBe(true)
  })

  it('regenerates empty final/third slots, so advancement has to run again', () => {
    const inserts = knockoutToMatchInserts(generateKnockout(standings), 'div-1', {
      pointsToWin: 21,
      deuce: false,
    })
    const byKey = Object.fromEntries(inserts.map((insert) => [insert.bracket_key, insert]))

    expect(byKey.FINAL.team_a_id).toBeNull()
    expect(byKey.FINAL.team_b_id).toBeNull()
    expect(byKey.THIRD.team_a_id).toBeNull()
    expect(byKey.M1.team_a_id).toBe('t1')

    // ...and re-running advancement over the fresh rows refills them from the
    // semis, so a forced republish is recoverable rather than terminal.
    const refreshed = publishedBracket({
      m1: { status: 'completed', score_a: 21, score_b: 14 },
      m2: { status: 'completed', score_a: 15, score_b: 21 },
    })
    expect(planKnockoutAdvance(refreshed)).toHaveLength(2)
  })

  it('publishes every knockout row with a null next_match_id, to be linked afterwards', () => {
    const inserts = knockoutToMatchInserts(generateKnockout(standings), 'div-1', {
      pointsToWin: 21,
      deuce: false,
    })
    expect(inserts.every((insert) => insert.next_match_id === null)).toBe(true)
  })
})
