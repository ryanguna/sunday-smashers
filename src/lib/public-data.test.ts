import { describe, expect, it } from 'vitest'
import {
  compareByCourtAndSlot,
  filterMatchesByDivision,
  getBrackets,
  getDivisions,
  getLiveMatches,
  getPlayersDirectory,
  getSchedule,
  getStandings,
  groupMatchesByCourt,
  isMatchDecided,
  showsScore,
  matchesForPlayerQuery,
  statusLabel,
  statusToBadgeStatus,
  teamDisplayName,
  tiebreakLabel,
  type PublicMatch,
  type PublicTeam,
} from './public-data'
import { computeStandings, DEFAULT_ELIMS_RULES } from './draw'

// ---------------------------------------------------------------------------
// Test fixtures for the pure helpers
// ---------------------------------------------------------------------------

const teamA: PublicTeam = {
  id: 'team-a',
  division: 'mens_doubles',
  name: 'Tinsel Titans',
  seed: 1,
  players: [
    { id: 'p1', name: 'Aroha Ngata' },
    { id: 'p2', name: 'Ben Cole' },
  ],
}

const teamB: PublicTeam = {
  id: 'team-b',
  division: 'mens_doubles',
  name: 'Sleigh Servers',
  seed: 2,
  players: [
    { id: 'p3', name: 'Chris Doyle' },
    { id: 'p4', name: 'Dev Patel' },
  ],
}

const teamC: PublicTeam = {
  id: 'team-c',
  division: 'womens_doubles',
  name: 'Bauble Bashers',
  seed: 1,
  players: [
    { id: 'p5', name: 'Amy Chen' },
    { id: 'p6', name: 'Bree Walsh' },
  ],
}

function makeMatch(overrides: Partial<PublicMatch>): PublicMatch {
  return {
    id: 'match-1',
    division: 'mens_doubles',
    stage: 'elims',
    court: 'Court 1',
    slotIndex: 0,
    slotLabel: '9:00am',
    teamA,
    teamB,
    sourceA: null,
    sourceB: null,
    status: 'scheduled',
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

describe('compareByCourtAndSlot / groupMatchesByCourt', () => {
  const matches: PublicMatch[] = [
    makeMatch({ id: 'm1', court: 'Court 2', slotIndex: 1 }),
    makeMatch({ id: 'm2', court: 'Court 1', slotIndex: 2 }),
    makeMatch({ id: 'm3', court: 'Court 1', slotIndex: 0 }),
    makeMatch({ id: 'm4', court: null, slotIndex: 0 }),
  ]

  it('sorts by court name then slot index', () => {
    const sorted = [...matches].sort(compareByCourtAndSlot)
    expect(sorted.map((m) => m.id)).toEqual(['m4', 'm3', 'm2', 'm1'])
  })

  it('groups matches by court, sorted within each group by slot', () => {
    const groups = groupMatchesByCourt(matches)
    expect(groups.map((g) => g.court)).toEqual(['Court 1', 'Court 2', 'Court TBC'])
    expect(groups[0].matches.map((m) => m.id)).toEqual(['m3', 'm2'])
    expect(groups[1].matches.map((m) => m.id)).toEqual(['m1'])
    expect(groups[2].matches.map((m) => m.id)).toEqual(['m4'])
  })
})

describe('filterMatchesByDivision', () => {
  const matches: PublicMatch[] = [
    makeMatch({ id: 'm1', division: 'mens_doubles' }),
    makeMatch({ id: 'm2', division: 'womens_doubles' }),
  ]

  it('returns every match when no division is given', () => {
    expect(filterMatchesByDivision(matches, null)).toHaveLength(2)
    expect(filterMatchesByDivision(matches, undefined)).toHaveLength(2)
  })

  it('filters to a single division', () => {
    const result = filterMatchesByDivision(matches, 'mens_doubles')
    expect(result.map((m) => m.id)).toEqual(['m1'])
  })
})

describe('matchesForPlayerQuery', () => {
  const matches: PublicMatch[] = [
    makeMatch({ id: 'm1', teamA, teamB }),
    makeMatch({ id: 'm2', teamA: teamC, teamB: null }),
  ]

  it('returns nothing for a blank query', () => {
    expect(matchesForPlayerQuery(matches, '  ')).toEqual([])
  })

  it('matches by team name, case-insensitively', () => {
    const result = matchesForPlayerQuery(matches, 'sleigh')
    expect(result.map((m) => m.id)).toEqual(['m1'])
  })

  it('matches by individual player name', () => {
    const result = matchesForPlayerQuery(matches, 'amy chen')
    expect(result.map((m) => m.id)).toEqual(['m2'])
  })

  it('tolerates a null team on one side', () => {
    const result = matchesForPlayerQuery(matches, 'bauble')
    expect(result.map((m) => m.id)).toEqual(['m2'])
  })
})

describe('tiebreakLabel', () => {
  it('describes every tiebreak reason distinctly, including the unresolved/admin-decision case', () => {
    const reasons = [
      'wins',
      'head_to_head',
      'mini_league',
      'head_to_head_points',
      'point_difference',
      'points_scored',
      'unresolved',
    ] as const
    const labels = reasons.map(tiebreakLabel)
    expect(new Set(labels).size).toBe(reasons.length)
    expect(tiebreakLabel('unresolved')).toMatch(/admin decision/i)
  })
})

describe('a genuine unresolved 3-way cycle needs an admin decision', () => {
  it('flags needsAdminDecision via the real engine, and tiebreakLabel explains it', () => {
    // A, B, C each beat one and lose to another by the exact same score line,
    // so wins/head-to-head-mini-league/point-diff/points-scored are all tied.
    const standings = computeStandings(
      ['A', 'B', 'C'],
      [
        { teamA: 'A', teamB: 'B', pointsA: 15, pointsB: 10 },
        { teamA: 'B', teamB: 'C', pointsA: 15, pointsB: 10 },
        { teamA: 'C', teamB: 'A', pointsA: 15, pointsB: 10 },
      ],
      DEFAULT_ELIMS_RULES,
    )
    // The engine can't fully separate a genuine cycle: at least one row is
    // flagged for an admin decision, and at least one carries the
    // 'unresolved' reason (the trailing row in a 3+ cluster is labelled
    // with the last comparator it *did* check, even when nothing actually
    // separated it — `needsAdminDecision` is the authoritative flag).
    expect(standings.some((s) => s.needsAdminDecision)).toBe(true)
    const unresolvedRow = standings.find((s) => s.tiebreak === 'unresolved')
    expect(unresolvedRow).toBeTruthy()
    expect(tiebreakLabel(unresolvedRow!.tiebreak)).toMatch(/admin decision/i)
  })
})

describe('statusToBadgeStatus / statusLabel', () => {
  it('maps every status to a distinct badge status and label', () => {
    expect(statusToBadgeStatus('scheduled')).toBe('info')
    expect(statusToBadgeStatus('in_progress')).toBe('live')
    expect(statusToBadgeStatus('completed')).toBe('final')
    expect(statusToBadgeStatus('forfeited')).toBe('forfeit')

    expect(statusLabel('scheduled')).toBe('Upcoming')
    expect(statusLabel('in_progress')).toBe('Live')
    expect(statusLabel('completed')).toBe('Final')
    expect(statusLabel('forfeited')).toBe('Forfeit')
  })

  it('gives a retirement and a walkover their own wording, not "Forfeit"', () => {
    // A retirement is an injury, a walkover is a no-show, a forfeit is a
    // penalty. Labelling an injured pair as having forfeited is a distinction
    // players care about, so these must never collapse together.
    expect(statusLabel('retired')).toBe('Retired')
    expect(statusLabel('walkover')).toBe('Walkover')
    expect(statusLabel('forfeited')).toBe('Forfeit')

    // All three are finished results, so all three read as final on a badge.
    expect(statusToBadgeStatus('retired')).toBe('final')
    expect(statusToBadgeStatus('walkover')).toBe('final')
  })
})

describe('isMatchDecided / showsScore', () => {
  it('counts every played-out result, not just completed and forfeited', () => {
    // Four call sites hand-wrote this list and each omitted something
    // different, under-counting played matches on the admin dashboard.
    for (const s of ['completed', 'forfeited', 'walkover', 'retired'] as const) {
      expect(isMatchDecided(s)).toBe(true)
    }
    expect(isMatchDecided('scheduled')).toBe(false)
    expect(isMatchDecided('in_progress')).toBe(false)
  })

  it('shows a score for a retirement, which keeps the score actually played', () => {
    expect(showsScore('retired')).toBe(true)
    expect(showsScore('walkover')).toBe(true)
    expect(showsScore('in_progress')).toBe(true)
    // Nothing has happened yet, so there is no score to show.
    expect(showsScore('scheduled')).toBe(false)
  })
})

describe('teamDisplayName', () => {
  it('shows the team name when resolved', () => {
    expect(teamDisplayName(teamA, 'Rank 1')).toBe('Tinsel Titans')
  })

  it('falls back to the knockout placeholder source when unresolved', () => {
    expect(teamDisplayName(null, 'Winner of M1')).toBe('Winner of M1')
  })

  it('falls back to "TBC" when neither a team nor a source is known', () => {
    expect(teamDisplayName(null, null)).toBe('TBC')
  })
})

// ---------------------------------------------------------------------------
// Demo-mode data access (no Supabase env vars set in the test environment)
// ---------------------------------------------------------------------------

describe('demo-mode data access', () => {
  it('getDivisions returns both divisions', async () => {
    const divisions = await getDivisions()
    expect(divisions.map((d) => d.slug).sort()).toEqual(['mens_doubles', 'womens_doubles'])
  })

  it('getStandings ranks 11 pairs per division with resolved team names', async () => {
    const standings = await getStandings()
    expect(standings).toHaveLength(2)
    for (const division of standings) {
      expect(division.rows).toHaveLength(11)
      expect(division.rows[0].rank).toBe(1)
      expect(division.rows[0].team.name).toBeTruthy()
    }
  })

  it('getSchedule returns a fully sorted timetable with duty rosters', async () => {
    const schedule = await getSchedule()
    expect(schedule.length).toBeGreaterThan(0)
    const sorted = [...schedule].sort(compareByCourtAndSlot)
    expect(schedule).toEqual(sorted)
    const withDuties = schedule.filter((m) => m.duties.length > 0)
    expect(withDuties.length).toBeGreaterThan(0)
  })

  it('getSchedule includes a forfeit and the women’s live semis', async () => {
    const schedule = await getSchedule()
    expect(schedule.some((m) => m.status === 'forfeited')).toBe(true)
    const live = schedule.filter((m) => m.status === 'in_progress')
    expect(live.length).toBeGreaterThan(0)
    expect(live.every((m) => m.division === 'womens_doubles')).toBe(true)
  })

  it('getLiveMatches matches the live subset of getSchedule', async () => {
    const [schedule, live] = await Promise.all([getSchedule(), getLiveMatches()])
    expect(live).toEqual(schedule.filter((m) => m.status === 'in_progress'))
  })

  it('getBrackets shows the resolved Men’s podium and the still-open Women’s bracket', async () => {
    const brackets = await getBrackets()
    const mens = brackets.find((b) => b.division.slug === 'mens_doubles')!
    const womens = brackets.find((b) => b.division.slug === 'womens_doubles')!

    expect(mens.placings.champion).toBeTruthy()
    expect(mens.fixtures.every((f) => f.teamA && f.teamB)).toBe(true)

    expect(womens.placings.champion).toBeNull()
    const finalFixture = womens.fixtures.find((f) => f.key === 'FINAL')!
    expect(finalFixture.teamA).toBeNull()
    expect(finalFixture.sourceA).toBe('Winner of M1')
  })

  it('getPlayersDirectory never exposes phone/email/emergency-contact fields', async () => {
    const directory = await getPlayersDirectory()
    expect(directory.length).toBe(22)
    const serialised = JSON.stringify(directory).toLowerCase()
    expect(serialised).not.toContain('phone')
    expect(serialised).not.toContain('emergency')
    expect(serialised).not.toContain('email')
  })
})
