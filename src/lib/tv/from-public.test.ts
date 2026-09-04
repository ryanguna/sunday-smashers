import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  bySlot,
  buildCourtSnapshot,
  courtSlug,
  toLiveMatch,
  toTvBracket,
  toTvStandings,
  toUpcomingMatch,
  type LiveMatchExtras,
} from './from-public'
import type {
  PublicBracket,
  PublicDivisionStandings,
  PublicMatch,
  PublicTeam,
} from '@/lib/public-data'

/**
 * The courtside TV was wired to `demo-data.ts` unconditionally — the
 * Supabase branch of `getCourtSnapshot` fetched a client, discarded it, and
 * returned the fixtures anyway. Production `/tv/court-1` served "The Tinsel
 * Smashers vs Mistletoe Mashers" with an invented score, an invented duty
 * roster and invented standings, and would have done so all through match
 * day on the arena monitor.
 *
 * It survived because demo mode is *supposed* to show demo data, so every
 * e2e run looked correct. These tests pin the real mapping, and the guard
 * block at the bottom pins the thing that actually went wrong: the shape of
 * the code path, which no rendering test can see.
 */

const NO_EXTRAS: LiveMatchExtras = { server: null, startedAt: null, endedAt: null }

function team(id: string, name: string, players: string[]): PublicTeam {
  return {
    id,
    division: 'mens',
    name,
    seed: null,
    players: players.map((p, i) => ({ id: `${id}-p${i}`, name: p })),
  }
}

function match(overrides: Partial<PublicMatch> = {}): PublicMatch {
  return {
    id: 'm1',
    division: 'mens',
    stage: 'elims',
    court: 'Court 1',
    slotIndex: 0,
    slotLabel: '9:00 AM',
    slotStartsAt: null,
    teamA: team('ta', 'Alpha', ['Ana', 'Bea']),
    teamB: team('tb', 'Bravo', ['Cara', 'Dee']),
    sourceA: null,
    sourceB: null,
    status: 'scheduled',
    resultDisputed: false,
    scoreA: 0,
    scoreB: 0,
    pointsToWin: 15,
    deuce: false,
    cap: null,
    forfeitedBy: null,
    winnerTeamId: null,
    duties: [],
    ...overrides,
  }
}

describe('courtSlug', () => {
  it('turns a court name into something a person can type into a smart TV', () => {
    expect(courtSlug('Court 1')).toBe('court-1')
    expect(courtSlug('  Show Court A  ')).toBe('show-court-a')
  })

  it('collapses punctuation rather than emitting it into a URL', () => {
    expect(courtSlug('Court #2 (Main)')).toBe('court-2-main')
  })
})

describe('toLiveMatch', () => {
  it('carries the score, target and stage the arena needs', () => {
    const live = toLiveMatch(
      match({ status: 'in_progress', scoreA: 11, scoreB: 8, pointsToWin: 21 }),
      "Men's Doubles",
      NO_EXTRAS,
    )
    expect(live.pointsA).toBe(11)
    expect(live.pointsB).toBe(8)
    expect(live.pointsToWin).toBe(21)
    expect(live.status).toBe('live')
    expect(live.stageLabel).toBe('Round Robin')
    expect(live.divisionLabel).toBe("Men's Doubles")
  })

  it('shows both players of each pair', () => {
    const live = toLiveMatch(match(), "Men's Doubles", NO_EXTRAS)
    expect(live.teamA.players).toEqual(['Ana', 'Bea'])
    expect(live.teamB.players).toEqual(['Cara', 'Dee'])
  })

  it('does not print undefined when a pair is still one player short', () => {
    const live = toLiveMatch(
      match({ teamA: team('ta', 'Alpha', ['Ana']) }),
      "Men's Doubles",
      NO_EXTRAS,
    )
    expect(live.teamA.players).toEqual(['Ana', 'TBC'])
  })

  it('falls back to the placeholder when a knockout side is undecided', () => {
    const live = toLiveMatch(
      match({ teamA: null, sourceA: 'Winner of M1' }),
      "Men's Doubles",
      NO_EXTRAS,
    )
    expect(live.teamA.name).toBe('Winner of M1')
  })

  /**
   * A walkover and a retirement are over, but neither is a forfeit. Only a
   * forfeit should raise the blame banner courtside.
   */
  it.each([
    ['completed', 'completed', null],
    ['walkover', 'completed', null],
    ['retired', 'completed', null],
    ['forfeited', 'forfeit', 'a'],
  ] as const)('maps %s to %s', (status, expected, forfeitSide) => {
    const live = toLiveMatch(
      match({ status, forfeitedBy: status === 'forfeited' ? 'ta' : null }),
      "Men's Doubles",
      NO_EXTRAS,
    )
    expect(live.status).toBe(expected)
    expect(live.forfeitedBy).toBe(forfeitSide)
  })

  it('passes the serving side and true start time through', () => {
    const live = toLiveMatch(match({ status: 'in_progress' }), "Men's Doubles", {
      server: 'b',
      startedAt: '2026-12-13T01:00:00.000Z',
      endedAt: null,
    })
    expect(live.server).toBe('b')
    expect(live.startedAt).toBe('2026-12-13T01:00:00.000Z')
  })
})

describe('toUpcomingMatch', () => {
  it('carries the duty roster, which is how this tournament officiates itself', () => {
    const next = toUpcomingMatch(
      match({
        duties: [
          { role: 'umpire_scorer', playerId: 'p1', playerName: 'Ana', source: 'derived' },
          { role: 'scoresheet', playerId: 'p2', playerName: 'Bea', source: 'manual' },
        ],
      }),
      "Men's Doubles",
    )
    expect(next.duties).toEqual([
      { role: 'umpire_scorer', playerName: 'Ana' },
      { role: 'scoresheet', playerName: 'Bea' },
    ])
  })

  it('drops unfilled duty slots instead of printing a row of placeholders', () => {
    const next = toUpcomingMatch(
      match({
        duties: [
          { role: 'umpire_scorer', playerId: 'p1', playerName: 'Ana', source: 'derived' },
          { role: 'line_judge', playerId: '', playerName: '', source: 'unassigned' },
        ],
      }),
      "Men's Doubles",
    )
    expect(next.duties).toHaveLength(1)
  })

  it('says the time is unknown rather than showing a blank', () => {
    expect(toUpcomingMatch(match({ slotLabel: null }), "Men's Doubles").scheduledLabel).toBe(
      'Time TBC',
    )
  })
})

describe('bySlot', () => {
  it('orders a court by the schedule, not by insertion', () => {
    const order = [match({ id: 'c', slotIndex: 2 }), match({ id: 'a', slotIndex: 0 })]
      .sort(bySlot)
      .map((m) => m.id)
    expect(order).toEqual(['a', 'c'])
  })

  it('sorts an unscheduled match last rather than letting it jump the queue', () => {
    const order = [match({ id: 'x', slotIndex: null }), match({ id: 'a', slotIndex: 5 })]
      .sort(bySlot)
      .map((m) => m.id)
    expect(order).toEqual(['a', 'x'])
  })
})

describe('buildCourtSnapshot', () => {
  const base = {
    court: 'court-1',
    courtLabel: 'Court 1',
    divisionLabels: { mens: "Men's Doubles" },
    standings: [] as PublicDivisionStandings[],
    brackets: [] as PublicBracket[],
    extrasFor: () => NO_EXTRAS,
  }

  it('shows the match in progress as live', () => {
    const snapshot = buildCourtSnapshot({
      ...base,
      matches: [
        match({ id: 'done', slotIndex: 0, status: 'completed' }),
        match({ id: 'now', slotIndex: 1, status: 'in_progress' }),
        match({ id: 'next', slotIndex: 2, status: 'scheduled' }),
      ],
    })
    expect(snapshot.live?.matchId).toBe('now')
    expect(snapshot.upNext?.matchId).toBe('next')
  })

  /**
   * The seconds after match point are exactly when people look up to check
   * the final score. Blanking to the idle view the instant a match ends
   * would throw the result away at the one moment it is wanted.
   */
  it('holds the last finished match on screen between games', () => {
    const snapshot = buildCourtSnapshot({
      ...base,
      matches: [
        match({ id: 'older', slotIndex: 0, status: 'completed' }),
        match({ id: 'just-finished', slotIndex: 1, status: 'completed' }),
        match({ id: 'next', slotIndex: 2, status: 'scheduled' }),
      ],
    })
    expect(snapshot.live?.matchId).toBe('just-finished')
  })

  it('goes idle only when the court has nothing played and nothing running', () => {
    const snapshot = buildCourtSnapshot({
      ...base,
      matches: [match({ id: 'next', status: 'scheduled' })],
    })
    expect(snapshot.live).toBeNull()
    expect(snapshot.upNext?.matchId).toBe('next')
  })

  it('lists the following fixtures but caps the list for the panel', () => {
    const snapshot = buildCourtSnapshot({
      ...base,
      matches: [0, 1, 2, 3, 4, 5].map((i) =>
        match({ id: `m${i}`, slotIndex: i, status: 'scheduled' }),
      ),
    })
    expect(snapshot.upNext?.matchId).toBe('m0')
    expect(snapshot.laterOnCourt.map((m) => m.matchId)).toEqual(['m1', 'm2', 'm3'])
  })

  it('resolves the division label rather than showing a raw id', () => {
    const snapshot = buildCourtSnapshot({
      ...base,
      matches: [match({ status: 'in_progress' })],
    })
    expect(snapshot.live?.divisionLabel).toBe("Men's Doubles")
  })
})

describe('panel mappings', () => {
  it('indexes standings team names so the table can label its rows', () => {
    const standings = {
      division: { slug: 'mens', name: "Men's Doubles" },
      rows: [{ teamId: 'ta', team: team('ta', 'Alpha', ['Ana', 'Bea']) }],
    } as unknown as PublicDivisionStandings
    const mapped = toTvStandings(standings)
    expect(mapped.divisionLabel).toBe("Men's Doubles")
    expect(mapped.teamNames.ta).toBe('Alpha')
  })

  it('flattens bracket fixtures to team ids and keeps the placeholder text', () => {
    const bracket = {
      division: { slug: 'mens', name: "Men's Doubles" },
      fixtures: [
        {
          key: 'FINAL',
          stage: 'final',
          label: 'Championship',
          teamA: team('ta', 'Alpha', ['Ana', 'Bea']),
          teamB: null,
          sourceA: 'Winner of M1',
          sourceB: 'Winner of M2',
          match: null,
        },
      ],
    } as unknown as PublicBracket
    const mapped = toTvBracket(bracket)
    expect(mapped.fixtures[0].teamA).toBe('ta')
    expect(mapped.fixtures[0].teamB).toBeNull()
    expect(mapped.fixtures[0].sourceB).toBe('Winner of M2')
    expect(mapped.teamNames.ta).toBe('Alpha')
  })
})

/**
 * The bug itself was structural, so it is pinned structurally.
 */
describe('the TV reads the real tournament, not the demo fixtures', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'lib', 'tv', 'data.ts'), 'utf8')

  function configuredBranch(): string {
    // Everything after the demo-mode early return in getCourtSnapshot.
    const start = source.indexOf('export async function getCourtSnapshot')
    const end = source.indexOf('export async function getAllCourtOverviews')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    return source.slice(start, end)
  }

  it('queries the real data layer when Supabase is configured', () => {
    expect(configuredBranch()).toContain('getSchedule()')
    expect(configuredBranch()).toContain('buildCourtSnapshot')
  })

  it('no longer fetches a client only to throw it away', () => {
    // The exact line that hid the bug: `void supabase // referenced so the
    // client is exercised once schema lands`, followed by a demo return.
    expect(source).not.toContain('void supabase')
  })

  it('leaves demo data as a fallback, never the configured path', () => {
    const branch = configuredBranch()
    const demoReturns = [...branch.matchAll(/return getDemoCourtSnapshot\(/g)]
    // Three by design: demo mode itself, an unknown court slug, and the
    // catch-all so an unattended screen never renders an error in front of a
    // crowd. The bug was a fourth — on the configured happy path.
    expect(demoReturns.length).toBe(3)
    expect(branch).toContain('catch')
    // The happy path must reach the real builder before any of them.
    expect(branch.indexOf('buildCourtSnapshot')).toBeGreaterThan(
      branch.indexOf('if (!isSupabaseConfigured())'),
    )
  })

  it('builds the overview grid from one fetch, not one per court', () => {
    const overview = source.slice(source.indexOf('export async function getAllCourtOverviews'))
    // The old implementation mapped getCourtSnapshot over every court, which
    // re-ran the schedule, standings, bracket and division queries per court
    // on every poll of a screen that polls all day.
    expect(overview).not.toMatch(/courts\.map\(\(court\) => getCourtSnapshot\(court\)\)/)
    expect(overview).toContain('getSchedule()')
  })

  it('derives the serving side from the rally log', () => {
    expect(source).toContain("from('score_events')")
    expect(source).toContain("eq('event_type', 'point')")
  })
})
