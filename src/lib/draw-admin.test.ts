import { describe, expect, it } from 'vitest'
import {
  computeStandings,
  DEFAULT_ELIMS_RULES,
  DEFAULT_FINALS_RULES,
  generateKnockout,
  generateRoundRobin,
  type PlayedMatch,
  type StandingRow,
} from './draw'
import {
  allTiesResolved,
  applyManualTiebreaks,
  buildDrawPreview,
  drawSummary,
  eligibleTeams,
  entryWarnings,
  fixturesToMatchInserts,
  groupByRound,
  ineligibleTeams,
  knockoutReadiness,
  knockoutToMatchInserts,
  toPublishDrawCalls,
  describePublishRpcError,
  publishSafety,
  reorder,
  roundRobinProgress,
  seedOrder,
  shuffleOrder,
  spreadSeeds,
  summarySentence,
  unresolvedTieGroups,
  worstWarningLevel,
  type DrawTeamEntry,
  type ExistingMatchSummary,
} from './draw-admin'

function team(
  id: string,
  overrides: Partial<DrawTeamEntry> = {}
): DrawTeamEntry {
  return {
    id,
    name: `Pair ${id}`,
    players: [`${id} one`, `${id} two`],
    seed: null,
    approved: true,
    paid: true,
    ...overrides,
  }
}

const ELEVEN = Array.from({ length: 11 }, (_, i) => team(`t${i + 1}`))

describe('eligibility', () => {
  it('keeps only approved and paid pairs', () => {
    const teams = [
      team('a'),
      team('b', { paid: false }),
      team('c', { approved: false }),
    ]
    expect(eligibleTeams(teams).map((t) => t.id)).toEqual(['a'])
  })

  it('explains why each held-back pair is out', () => {
    const teams = [team('a'), team('b', { paid: false }), team('c', { approved: false })]
    expect(ineligibleTeams(teams)).toEqual([
      { team: teams[1], reason: 'Entry fee still outstanding' },
      { team: teams[2], reason: 'Registration not approved yet' },
    ])
  })
})

describe('entryWarnings', () => {
  it('is quiet for a clean even-numbered field', () => {
    expect(entryWarnings([team('a'), team('b'), team('c'), team('d')])).toEqual([])
  })

  it('flags unpaid approved pairs as danger', () => {
    const warnings = entryWarnings([team('a'), team('b'), team('c', { paid: false })])
    const unpaid = warnings.find((w) => w.code === 'unpaid_teams')
    expect(unpaid?.level).toBe('danger')
    expect(unpaid?.detail).toContain('Pair c')
  })

  it('flags unapproved pairs and pending registrations', () => {
    const warnings = entryWarnings([team('a'), team('b'), team('c', { approved: false })], {
      pendingRegistrations: 3,
      unpairedPlayers: 2,
    })
    expect(warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining(['unapproved_teams', 'pending_registrations', 'unpaired_players'])
    )
  })

  it('notes a bye round for an odd field but does not block it', () => {
    const warnings = entryWarnings(ELEVEN)
    expect(warnings).toHaveLength(1)
    expect(warnings[0].code).toBe('bye_round')
    expect(warnings[0].level).toBe('info')
  })

  it('blocks when fewer than two eligible pairs remain', () => {
    const warnings = entryWarnings([team('a'), team('b', { paid: false })])
    expect(warnings[0]).toMatchObject({ code: 'too_few_teams', level: 'danger' })
  })

  it('reports the worst level present', () => {
    expect(worstWarningLevel([])).toBeNull()
    expect(worstWarningLevel(entryWarnings(ELEVEN))).toBe('info')
    expect(worstWarningLevel(entryWarnings([team('a'), team('b'), team('c', { paid: false })]))).toBe(
      'danger'
    )
  })
})

describe('seeding and ordering', () => {
  it('puts seeded pairs first in seed order, then unseeded alphabetically', () => {
    const teams = [
      team('z', { name: 'Zebra' }),
      team('b', { name: 'Bravo', seed: 2 }),
      team('a', { name: 'Alpha' }),
      team('s', { name: 'Sierra', seed: 1 }),
    ]
    expect(seedOrder(teams).map((t) => t.name)).toEqual(['Sierra', 'Bravo', 'Alpha', 'Zebra'])
  })

  it('does not mutate the input', () => {
    const teams = [team('b', { seed: 2 }), team('a', { seed: 1 })]
    seedOrder(teams)
    expect(teams.map((t) => t.id)).toEqual(['b', 'a'])
  })

  it('reorders items by index without mutating', () => {
    const items = ['a', 'b', 'c', 'd']
    expect(reorder(items, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(reorder(items, 3, 0)).toEqual(['d', 'a', 'b', 'c'])
    expect(items).toEqual(['a', 'b', 'c', 'd'])
  })

  it('clamps out-of-range reorder targets and ignores bad sources', () => {
    expect(reorder(['a', 'b', 'c'], 0, 99)).toEqual(['b', 'c', 'a'])
    expect(reorder(['a', 'b', 'c'], -1, 1)).toEqual(['a', 'b', 'c'])
  })

  it('shuffles deterministically for a given seed', () => {
    const ids = ELEVEN.map((t) => t.id)
    expect(shuffleOrder(ids, 42)).toEqual(shuffleOrder(ids, 42))
    expect(shuffleOrder(ids, 42)).not.toEqual(shuffleOrder(ids, 43))
    expect([...shuffleOrder(ids, 42)].sort()).toEqual([...ids].sort())
  })

  it('spreads seeds so 1 and 2 sit at opposite ends', () => {
    const spread = spreadSeeds(['s1', 's2', 's3', 's4', 's5', 's6'])
    expect(spread[0]).toBe('s1')
    expect(spread[spread.length - 1]).toBe('s2')
    expect([...spread].sort()).toEqual(['s1', 's2', 's3', 's4', 's5', 's6'])
  })
})

describe('drawSummary', () => {
  it('matches the draft rules for 11 pairs', () => {
    const summary = drawSummary(11)
    expect(summary).toEqual({
      teamCount: 11,
      totalGames: 55,
      gamesEach: 10,
      rounds: 11,
      concurrentPerRound: 5,
      hasBye: true,
    })
    expect(summarySentence(summary)).toBe(
      '11 pairs → 55 games, 10 each, 5 concurrent matches per round'
    )
  })

  it('handles an even field with no bye', () => {
    expect(drawSummary(8)).toEqual({
      teamCount: 8,
      totalGames: 28,
      gamesEach: 7,
      rounds: 7,
      concurrentPerRound: 4,
      hasBye: false,
    })
  })

  it('is empty below two pairs', () => {
    expect(drawSummary(1).totalGames).toBe(0)
    expect(summarySentence(drawSummary(0))).toContain('Not enough pairs')
  })

  it('agrees with the engine about the fixture count', () => {
    const ids = ELEVEN.map((t) => t.id)
    expect(generateRoundRobin(ids)).toHaveLength(drawSummary(ids.length).totalGames)
  })
})

describe('buildDrawPreview', () => {
  const preview = buildDrawPreview(ELEVEN.map((t) => t.id), 7)

  it('produces the full round robin', () => {
    expect(preview.fixtures).toHaveLength(55)
    expect(preview.rounds).toHaveLength(11)
    expect(preview.seed).toBe(7)
  })

  it('keeps every round internally disjoint so courts can run concurrently', () => {
    for (const round of preview.rounds) {
      const ids = round.fixtures.flatMap((f) => [f.teamA, f.teamB])
      expect(new Set(ids).size).toBe(ids.length)
      expect(round.fixtures).toHaveLength(5)
    }
  })

  it('identifies the resting pair in each round of an odd field', () => {
    const byes = preview.rounds.map((r) => r.byeTeamId)
    expect(byes.every((id) => id != null)).toBe(true)
    expect(new Set(byes).size).toBe(11)
  })

  it('has no bye when the field is even', () => {
    const even = buildDrawPreview(['a', 'b', 'c', 'd'])
    expect(even.rounds.every((r) => r.byeTeamId === null)).toBe(true)
    expect(even.seed).toBeNull()
  })

  it('gives every pair the same number of games', () => {
    const counts = new Map<string, number>()
    for (const fixture of preview.fixtures) {
      counts.set(fixture.teamA, (counts.get(fixture.teamA) ?? 0) + 1)
      counts.set(fixture.teamB, (counts.get(fixture.teamB) ?? 0) + 1)
    }
    expect([...counts.values()]).toEqual(Array(11).fill(10))
  })

  it('groups an arbitrary fixture list back into ordered rounds', () => {
    const rounds = groupByRound(
      [
        { round: 2, teamA: 'a', teamB: 'b' },
        { round: 1, teamA: 'a', teamB: 'c' },
      ],
      ['a', 'b', 'c']
    )
    expect(rounds.map((r) => r.round)).toEqual([1, 2])
    expect(rounds[0].byeTeamId).toBe('b')
  })
})

describe('publishSafety', () => {
  const scheduled = (id: string): ExistingMatchSummary => ({
    id,
    stage: 'elims',
    hasResult: false,
  })
  const played = (id: string): ExistingMatchSummary => ({ id, stage: 'elims', hasResult: true })

  it('allows a clean first publish', () => {
    const safety = publishSafety([])
    expect(safety.canPublish).toBe(true)
    expect(safety.requiresReplaceConfirmation).toBe(false)
    expect(safety.destructive).toBe(false)
  })

  it('refuses a second publish without a replace confirmation', () => {
    const existing = [scheduled('m1'), scheduled('m2')]
    expect(publishSafety(existing).canPublish).toBe(false)
    expect(publishSafety(existing).requiresReplaceConfirmation).toBe(true)
    expect(publishSafety(existing, { confirmReplace: true }).canPublish).toBe(true)
  })

  it('loudly blocks when results exist, even with a replace confirmation', () => {
    const existing = [scheduled('m1'), played('m2')]
    const safety = publishSafety(existing, { confirmReplace: true })
    expect(safety.canPublish).toBe(false)
    expect(safety.destructive).toBe(true)
    expect(safety.level).toBe('danger')
    expect(safety.resultCount).toBe(1)
  })

  it('only allows destroying results when both confirmations are given', () => {
    const existing = [played('m1')]
    expect(
      publishSafety(existing, { confirmDestroyResults: true }).canPublish
    ).toBe(false)
    expect(
      publishSafety(existing, { confirmReplace: true, confirmDestroyResults: true }).canPublish
    ).toBe(true)
  })
})

describe('fixture → matches row mapping', () => {
  it('maps round robin fixtures with the elims rules', () => {
    const rows = fixturesToMatchInserts(
      [
        { round: 2, teamA: 'c', teamB: 'd' },
        { round: 1, teamA: 'a', teamB: 'b' },
      ],
      'div-1',
      DEFAULT_ELIMS_RULES
    )
    expect(rows.map((r) => r.round)).toEqual([1, 2])
    expect(rows[0]).toEqual({
      division_id: 'div-1',
      stage: 'elims',
      round: 1,
      bracket_key: null,
      team_a_id: 'a',
      team_b_id: 'b',
      points_to_win: 15,
      deuce_enabled: false,
      cap: null,
      status: 'scheduled',
    })
  })

  it('carries a configured deuce cap through', () => {
    const rows = fixturesToMatchInserts([{ round: 1, teamA: 'a', teamB: 'b' }], 'div-1', {
      pointsToWin: 21,
      deuce: true,
      cap: 30,
    })
    expect(rows[0]).toMatchObject({ points_to_win: 21, deuce_enabled: true, cap: 30 })
  })

  it('maps the knockout bracket, leaving undecided teams null', () => {
    const standings: StandingRow[] = ['a', 'b', 'c', 'd'].map((teamId, i) => ({
      teamId,
      rank: i + 1,
      played: 3,
      wins: 3 - i,
      losses: i,
      forfeits: 0,
      pointsFor: 45,
      pointsAgainst: 30,
      pointDiff: 15,
      tiebreak: 'wins',
      needsAdminDecision: false,
    }))
    const rows = knockoutToMatchInserts(
      generateKnockout(standings, undefined, DEFAULT_FINALS_RULES),
      'div-1',
      DEFAULT_FINALS_RULES
    )
    expect(rows.map((r) => r.bracket_key)).toEqual(['M1', 'M2', 'THIRD', 'FINAL'])
    expect(rows.map((r) => r.stage)).toEqual(['semi', 'semi', 'third_place', 'final'])
    expect(rows[0]).toMatchObject({ team_a_id: 'a', team_b_id: 'd', points_to_win: 21 })
    expect(rows[1]).toMatchObject({ team_a_id: 'b', team_b_id: 'c' })
    expect(rows[3]).toMatchObject({ team_a_id: null, team_b_id: null, round: null })
  })
})

describe('toPublishDrawCalls', () => {
  const standings = (): StandingRow[] =>
    ['a', 'b', 'c', 'd'].map((teamId, i) => ({
      teamId,
      rank: i + 1,
      played: 3,
      wins: 3 - i,
      losses: i,
      forfeits: 0,
      pointsFor: 45,
      pointsAgainst: 30,
      pointDiff: 15,
      tiebreak: 'wins' as const,
      needsAdminDecision: false,
    }))

  it('produces a single call for a round robin, in round order', () => {
    const calls = toPublishDrawCalls(
      fixturesToMatchInserts(
        [
          { round: 2, teamA: 'c', teamB: 'd' },
          { round: 1, teamA: 'a', teamB: 'b' },
        ],
        'div-1',
        DEFAULT_ELIMS_RULES
      )
    )
    expect(calls).toHaveLength(1)
    expect(calls[0].stage).toBe('elims')
    expect(calls[0].matches.map((m) => m.round)).toEqual([1, 2])
  })

  it('drops the columns the RPC supplies itself', () => {
    const [call] = toPublishDrawCalls(
      fixturesToMatchInserts([{ round: 1, teamA: 'a', teamB: 'b' }], 'div-1', {
        pointsToWin: 21,
        deuce: true,
        cap: 30,
      })
    )
    expect(call.matches[0]).toEqual({
      round: 1,
      bracket_key: null,
      team_a_id: 'a',
      team_b_id: 'b',
      points_to_win: 21,
      deuce_enabled: true,
      cap: 30,
    })
    expect(call.matches[0]).not.toHaveProperty('division_id')
    expect(call.matches[0]).not.toHaveProperty('stage')
    expect(call.matches[0]).not.toHaveProperty('status')
  })

  it('splits the knockout into one call per stage, in playing order', () => {
    const calls = toPublishDrawCalls(
      knockoutToMatchInserts(
        generateKnockout(standings(), undefined, DEFAULT_FINALS_RULES),
        'div-1',
        DEFAULT_FINALS_RULES
      )
    )
    expect(calls.map((c) => c.stage)).toEqual(['semi', 'third_place', 'final'])
    expect(calls[0].matches.map((m) => m.bracket_key)).toEqual(['M1', 'M2'])
    expect(calls[2].matches[0]).toMatchObject({ team_a_id: null, team_b_id: null })
  })

  it('keeps every fixture and never loses one to grouping', () => {
    const inserts = knockoutToMatchInserts(
      generateKnockout(standings(), undefined, DEFAULT_FINALS_RULES),
      'div-1',
      DEFAULT_FINALS_RULES
    )
    const total = toPublishDrawCalls(inserts).reduce((sum, c) => sum + c.matches.length, 0)
    expect(total).toBe(inserts.length)
  })

  it('returns nothing for an empty draw', () => {
    expect(toPublishDrawCalls([])).toEqual([])
  })
})

describe('describePublishRpcError', () => {
  it('explains a lost admin role', () => {
    expect(describePublishRpcError('insufficient_privilege: Only admins may publish a draw')).toMatch(
      /not an admin/i
    )
  })

  it('names the played matches the database refused to destroy', () => {
    const message = describePublishRpcError(
      'Refusing to replace 7 match(es) in this division that already have results. Re-run with force to override.'
    )
    expect(message).toContain('7 match(es)')
    expect(message).toMatch(/nothing was changed/i)
  })

  it('points at the missing migration', () => {
    expect(
      describePublishRpcError('Could not find the function public.publish_draw(...) in the schema cache')
    ).toMatch(/0004_publish_draw_rpc/)
  })

  it('falls back to the raw message without losing it', () => {
    expect(describePublishRpcError('connection reset')).toContain('connection reset')
  })

  it('survives an empty message', () => {
    expect(describePublishRpcError('   ')).toMatch(/unknown error/)
  })
})

// ---------------------------------------------------------------------------
// Manual tiebreaks — built on a real head-to-head cycle from the engine
// ---------------------------------------------------------------------------

/** A, B, C beat each other in a cycle with identical point records. */
function cyclicStandings(): StandingRow[] {
  const teams = ['a', 'b', 'c']
  const matches: PlayedMatch[] = [
    { teamA: 'a', teamB: 'b', pointsA: 15, pointsB: 10 },
    { teamA: 'b', teamB: 'c', pointsA: 15, pointsB: 10 },
    { teamA: 'c', teamB: 'a', pointsA: 15, pointsB: 10 },
  ]
  return computeStandings(teams, matches, DEFAULT_ELIMS_RULES)
}

describe('unresolved ties', () => {
  it('finds the cycle the engine flagged', () => {
    const standings = cyclicStandings()
    expect(standings.some((row) => row.needsAdminDecision)).toBe(true)
    const groups = unresolvedTieGroups(standings)
    expect(groups).toHaveLength(1)
    expect([...groups[0].teamIds].sort()).toEqual(['a', 'b', 'c'])
    expect(groups[0].ranks).toEqual([1, 2, 3])
  })

  it('returns nothing when every row is separated', () => {
    const standings = computeStandings(
      ['a', 'b'],
      [{ teamA: 'a', teamB: 'b', pointsA: 15, pointsB: 3 }],
      DEFAULT_ELIMS_RULES
    )
    expect(unresolvedTieGroups(standings)).toEqual([])
  })

  it('does not group non-adjacent flagged rows together', () => {
    const rows: StandingRow[] = ['a', 'b', 'c'].map((teamId, i) => ({
      teamId,
      rank: i + 1,
      played: 2,
      wins: 1,
      losses: 1,
      forfeits: 0,
      pointsFor: 20,
      pointsAgainst: 20,
      pointDiff: 0,
      tiebreak: 'wins',
      needsAdminDecision: i !== 1,
    }))
    expect(unresolvedTieGroups(rows)).toEqual([])
  })
})

describe('applyManualTiebreaks', () => {
  it('reorders only the named rows and clears the flag', () => {
    const standings = cyclicStandings()
    const resolved = applyManualTiebreaks(standings, [{ teamIds: ['c', 'a', 'b'] }])
    expect(resolved.map((row) => row.teamId)).toEqual(['c', 'a', 'b'])
    expect(resolved.map((row) => row.rank)).toEqual([1, 2, 3])
    expect(resolved.every((row) => row.manuallyResolved)).toBe(true)
    expect(resolved.every((row) => !row.needsAdminDecision)).toBe(true)
  })

  it('never mutates the engine output', () => {
    const standings = cyclicStandings()
    const before = standings.map((row) => row.teamId)
    applyManualTiebreaks(standings, [{ teamIds: ['c', 'a', 'b'] }])
    expect(standings.map((row) => row.teamId)).toEqual(before)
    expect(standings.some((row) => row.needsAdminDecision)).toBe(true)
  })

  it('cannot move a pair outside the ranks the tie occupied', () => {
    const rows: StandingRow[] = ['w', 'x', 'y', 'z'].map((teamId, i) => ({
      teamId,
      rank: i + 1,
      played: 3,
      wins: 3 - i,
      losses: i,
      forfeits: 0,
      pointsFor: 30,
      pointsAgainst: 30,
      pointDiff: 0,
      tiebreak: i === 2 ? 'unresolved' : 'wins',
      needsAdminDecision: i === 2 || i === 3,
    }))
    const resolved = applyManualTiebreaks(rows, [{ teamIds: ['z', 'y'] }])
    expect(resolved.map((row) => row.teamId)).toEqual(['w', 'x', 'z', 'y'])
    expect(resolved[0].manuallyResolved).toBe(false)
  })

  it('ignores decisions that name fewer than two known pairs', () => {
    const standings = cyclicStandings()
    const resolved = applyManualTiebreaks(standings, [{ teamIds: ['a'] }, { teamIds: ['nope', 'x'] }])
    expect(resolved.map((row) => row.teamId)).toEqual(standings.map((row) => row.teamId))
    expect(resolved.every((row) => !row.manuallyResolved)).toBe(true)
  })

  it('de-duplicates repeated ids in a decision', () => {
    const standings = cyclicStandings()
    const resolved = applyManualTiebreaks(standings, [{ teamIds: ['c', 'c', 'a', 'b'] }])
    expect(resolved.map((row) => row.teamId)).toEqual(['c', 'a', 'b'])
  })
})

describe('allTiesResolved', () => {
  it('is false until a decision covers the flagged group', () => {
    const standings = cyclicStandings()
    expect(allTiesResolved(standings, [])).toBe(false)
    expect(allTiesResolved(standings, [{ teamIds: ['a', 'b'] }])).toBe(false)
    expect(allTiesResolved(standings, [{ teamIds: ['c', 'a', 'b'] }])).toBe(true)
  })

  it('is trivially true when nothing is flagged', () => {
    expect(allTiesResolved([], [])).toBe(true)
  })
})

describe('roundRobinProgress', () => {
  it('tracks completion', () => {
    expect(roundRobinProgress(55, 0)).toMatchObject({ complete: false, percent: 0, remaining: 55 })
    expect(roundRobinProgress(55, 55)).toMatchObject({ complete: true, percent: 100, remaining: 0 })
    expect(roundRobinProgress(55, 11).percent).toBe(20)
  })

  it('clamps nonsense input', () => {
    expect(roundRobinProgress(10, 99)).toMatchObject({ played: 10, complete: true })
    expect(roundRobinProgress(-5, -5)).toMatchObject({ total: 0, played: 0, complete: false })
  })
})

describe('knockoutReadiness', () => {
  const four: StandingRow[] = ['a', 'b', 'c', 'd'].map((teamId, i) => ({
    teamId,
    rank: i + 1,
    played: 3,
    wins: 3 - i,
    losses: i,
    forfeits: 0,
    pointsFor: 40,
    pointsAgainst: 20,
    pointDiff: 20,
    tiebreak: 'wins',
    needsAdminDecision: false,
  }))

  it('blocks while the round robin is unfinished', () => {
    const result = knockoutReadiness(roundRobinProgress(6, 4), four, [], 4)
    expect(result.ready).toBe(false)
    expect(result.reason).toContain('2 round robin games')
  })

  it('blocks when there are not enough pairs to fill the semis', () => {
    const result = knockoutReadiness(roundRobinProgress(3, 3), four.slice(0, 3), [], 4)
    expect(result.ready).toBe(false)
    expect(result.reason).toContain('4 are needed')
  })

  it('blocks on an unresolved tie', () => {
    const result = knockoutReadiness(roundRobinProgress(3, 3), cyclicStandings(), [], 3)
    expect(result.ready).toBe(false)
    expect(result.reason).toContain('unresolved tie')
  })

  it('is ready once everything is settled', () => {
    expect(knockoutReadiness(roundRobinProgress(6, 6), four, [], 4)).toEqual({
      ready: true,
      reason: null,
    })
  })
})
