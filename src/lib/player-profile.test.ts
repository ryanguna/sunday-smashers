import { describe, expect, it } from 'vitest'
import {
  biggestWinMargin,
  buildPlayerDirectory,
  buildPlayerProfile,
  closestGame,
  decidedFixtures,
  funStats,
  getPlayerDirectory,
  getPlayerProfile,
  initialsFor,
  longestWinStreak,
  pointWinRate,
  profileHeadline,
  resolvePlayer,
  slugifyName,
  totalPointsScored,
  totalRalliesPlayed,
} from './player-profile'
import { EMPTY_RECORD, playerFixtures, type PlayerDuty, type PlayerFixture } from './dashboard'
import type { PublicMatch, PublicStandingRow, PublicTeam } from './public-data'
import { computeStandings, DEFAULT_ELIMS_RULES } from './draw'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function team(id: string, name: string, players: string[], seed: number | null = null): PublicTeam {
  return {
    id,
    division: 'mens_doubles',
    name,
    seed,
    players: players.map((p, i) => ({ id: `${id}-p${i + 1}`, name: p })),
  }
}

const tinsel = team('t1', 'Tinsel Titans', ['Aroha Ngata', 'Ben Cole'], 1)
const sleigh = team('t2', 'Sleigh Servers', ['Chris Doyle', 'Dev Patel'], 2)
const holly = team('t3', 'Holly Jolly Smash', ['Ezra Wills', 'Finn Ahern'], 3)

function match(overrides: Partial<PublicMatch> & Pick<PublicMatch, 'id'>): PublicMatch {
  return {
    division: 'mens_doubles',
    stage: 'elims',
    court: 'Court 1',
    slotIndex: 0,
    slotLabel: '9:00am',
    slotStartsAt: null,
    teamA: tinsel,
    teamB: sleigh,
    sourceA: null,
    sourceB: null,
    status: 'completed',
    scoreA: 15,
    scoreB: 9,
    pointsToWin: 15,
    deuce: false,
    cap: null,
    forfeitedBy: null,
    winnerTeamId: tinsel.id,
    duties: [],
    ...overrides,
  }
}

/** Builds fixtures from `tinsel`'s point of view. */
function fixturesFor(matches: PublicMatch[]): PlayerFixture[] {
  return playerFixtures(matches, tinsel.id)
}

// ---------------------------------------------------------------------------
// Handles
// ---------------------------------------------------------------------------

describe('slugifyName', () => {
  it('lowercases and hyphenates', () => {
    expect(slugifyName('Aroha Ngata')).toBe('aroha-ngata')
  })

  it('strips accents and punctuation', () => {
    expect(slugifyName("Renée O'Brien-Smith")).toBe('renee-o-brien-smith')
  })

  it('returns an empty string for an unusable name', () => {
    expect(slugifyName('   ')).toBe('')
    expect(slugifyName('🏸')).toBe('')
  })
})

describe('buildPlayerDirectory', () => {
  it('creates one entry per player with a partner link', () => {
    const directory = buildPlayerDirectory([tinsel, sleigh])
    expect(directory).toHaveLength(4)
    const aroha = directory.find((e) => e.handle === 'aroha-ngata')!
    expect(aroha.partner?.name).toBe('Ben Cole')
    expect(aroha.partnerHandle).toBe('ben-cole')
    expect(aroha.division).toBe('mens_doubles')
  })

  it('disambiguates duplicate names with a numeric suffix', () => {
    const twin = team('t9', 'Twin Tinsel', ['Ben Cole', 'Ben Cole'])
    const directory = buildPlayerDirectory([tinsel, twin])
    expect(directory.map((e) => e.handle)).toEqual([
      'aroha-ngata',
      'ben-cole',
      'ben-cole-2',
      'ben-cole-3',
    ])
  })

  it('falls back to the player id when the name has no usable characters', () => {
    const odd = team('t8', 'Mystery Pair', ['🎄', '🎁'])
    const directory = buildPlayerDirectory([odd])
    expect(directory.map((e) => e.handle)).toEqual(['t8-p1', 't8-p2'])
  })

  it('handles a solo pair with no partner', () => {
    const solo = team('t7', 'Lone Elf', ['Solo Player'])
    const [entry] = buildPlayerDirectory([solo])
    expect(entry.partner).toBeNull()
    expect(entry.partnerHandle).toBeNull()
  })

  it('copes with an odd number of pairs in a division', () => {
    const directory = buildPlayerDirectory([tinsel, sleigh, holly])
    expect(directory).toHaveLength(6)
    expect(new Set(directory.map((e) => e.handle)).size).toBe(6)
  })
})

describe('resolvePlayer', () => {
  const directory = buildPlayerDirectory([tinsel, sleigh])

  it('resolves by handle, id and name slug', () => {
    expect(resolvePlayer(directory, 'aroha-ngata')?.name).toBe('Aroha Ngata')
    expect(resolvePlayer(directory, 't1-p1')?.name).toBe('Aroha Ngata')
    expect(resolvePlayer(directory, 'Aroha%20Ngata')?.name).toBe('Aroha Ngata')
  })

  it('is case insensitive and returns null for unknown handles', () => {
    expect(resolvePlayer(directory, 'AROHA-NGATA')?.name).toBe('Aroha Ngata')
    expect(resolvePlayer(directory, 'santa-claus')).toBeNull()
    expect(resolvePlayer(directory, '')).toBeNull()
  })
})

describe('initialsFor', () => {
  it('takes first and last initials', () => {
    expect(initialsFor('Aroha Ngata')).toBe('AN')
    expect(initialsFor('Kira Ah Chong')).toBe('KC')
  })

  it('handles single names and empty names', () => {
    expect(initialsFor('Prince')).toBe('PR')
    expect(initialsFor('   ')).toBe('🏸')
  })
})

// ---------------------------------------------------------------------------
// Derived stats
// ---------------------------------------------------------------------------

describe('derived stats', () => {
  const played = fixturesFor([
    match({ id: 'm1', scoreA: 15, scoreB: 2, winnerTeamId: tinsel.id }),
    match({ id: 'm2', slotIndex: 1, teamB: holly, scoreA: 13, scoreB: 15, winnerTeamId: holly.id }),
    match({ id: 'm3', slotIndex: 2, scoreA: 15, scoreB: 14, winnerTeamId: tinsel.id }),
    match({ id: 'm4', slotIndex: 3, teamB: holly, scoreA: 15, scoreB: 8, winnerTeamId: tinsel.id }),
    match({ id: 'm5', slotIndex: 4, status: 'scheduled', scoreA: 0, scoreB: 0, winnerTeamId: null }),
    match({ id: 'm6', slotIndex: 5, status: 'in_progress', scoreA: 7, scoreB: 4, winnerTeamId: null }),
  ])

  it('ignores unfinished matches', () => {
    expect(decidedFixtures(played)).toHaveLength(4)
    expect(totalPointsScored(played)).toBe(15 + 13 + 15 + 15)
    expect(totalRalliesPlayed(played)).toBe(15 + 2 + 13 + 15 + 15 + 14 + 15 + 8)
  })

  it('finds the biggest winning margin', () => {
    const best = biggestWinMargin(played)
    expect(best?.margin).toBe(13)
    expect(best?.fixture.match.id).toBe('m1')
  })

  it('finds the closest game, win or loss', () => {
    const closest = closestGame(played)
    expect(closest?.margin).toBe(1)
    expect(closest?.fixture.match.id).toBe('m3')
  })

  it('breaks a tie in a stat by playing order', () => {
    const tied = fixturesFor([
      match({ id: 'a', scoreA: 15, scoreB: 10, winnerTeamId: tinsel.id }),
      match({ id: 'b', slotIndex: 1, teamB: holly, scoreA: 15, scoreB: 10, winnerTeamId: tinsel.id }),
    ])
    expect(biggestWinMargin(tied)?.fixture.match.id).toBe('a')
    expect(closestGame(tied)?.fixture.match.id).toBe('a')
  })

  it('computes the longest and current win streak', () => {
    expect(longestWinStreak(played)).toEqual({ length: 2, current: true })

    const endedInLoss = fixturesFor([
      match({ id: 'a', scoreA: 15, scoreB: 1, winnerTeamId: tinsel.id }),
      match({ id: 'b', slotIndex: 1, scoreA: 15, scoreB: 3, winnerTeamId: tinsel.id }),
      match({ id: 'c', slotIndex: 2, scoreA: 3, scoreB: 15, winnerTeamId: sleigh.id }),
    ])
    expect(longestWinStreak(endedInLoss)).toEqual({ length: 2, current: false })
  })

  it('counts a forfeit win in the streak but not in margins', () => {
    const forfeits = fixturesFor([
      match({
        id: 'a',
        status: 'forfeited',
        scoreA: 15,
        scoreB: 0,
        forfeitedBy: sleigh.id,
        winnerTeamId: tinsel.id,
      }),
    ])
    expect(longestWinStreak(forfeits).length).toBe(1)
    expect(biggestWinMargin(forfeits)).toBeNull()
    expect(closestGame(forfeits)).toBeNull()
  })

  it('reports a point win rate', () => {
    expect(pointWinRate(played)).toBeCloseTo(58 / 97, 6)
  })
})

describe('derived stats with nothing played', () => {
  const none = fixturesFor([
    match({ id: 'm1', status: 'scheduled', scoreA: 0, scoreB: 0, winnerTeamId: null }),
  ])

  it('returns empty results rather than throwing', () => {
    expect(biggestWinMargin(none)).toBeNull()
    expect(closestGame(none)).toBeNull()
    expect(longestWinStreak(none)).toEqual({ length: 0, current: false })
    expect(totalPointsScored(none)).toBe(0)
    expect(totalRalliesPlayed(none)).toBe(0)
    expect(pointWinRate(none)).toBeNull()
  })

  it('still renders all six stat tiles with fallback copy', () => {
    const stats = funStats({ fixtures: none, duties: [], record: EMPTY_RECORD })
    expect(stats).toHaveLength(6)
    expect(stats.every((s) => s.detail.length > 0)).toBe(true)
    expect(stats.find((s) => s.key === 'sleigh-ride')?.value).toBe('—')
    expect(stats.find((s) => s.key === 'elf-on-duty')?.value).toBe('0')
  })
})

describe('funStats duty counting', () => {
  it('counts duty rows and distinct matches separately', () => {
    const duties: PlayerDuty[] = [
      { match: match({ id: 'd1' }), role: 'umpire_scorer', clash: false },
      { match: match({ id: 'd1' }), role: 'line_judge', clash: false },
      { match: match({ id: 'd2' }), role: 'scoresheet', clash: false },
    ]
    const stat = funStats({ fixtures: [], duties, record: EMPTY_RECORD }).find(
      (s) => s.key === 'elf-on-duty',
    )!
    expect(stat.value).toBe('3')
    expect(stat.detail).toContain('2 matches')
  })
})

// ---------------------------------------------------------------------------
// Profile assembly
// ---------------------------------------------------------------------------

function standingsFor(matches: PublicMatch[], teams: PublicTeam[]): PublicStandingRow[] {
  const rows = computeStandings(
    teams.map((t) => t.id),
    matches
      .filter((m) => m.status === 'completed' || m.status === 'forfeited')
      .map((m) => ({
        teamA: m.teamA!.id,
        teamB: m.teamB!.id,
        pointsA: m.scoreA,
        pointsB: m.scoreB,
        forfeitedBy: m.forfeitedBy,
      })),
    DEFAULT_ELIMS_RULES,
  )
  const byId = new Map(teams.map((t) => [t.id, t]))
  return rows.map((r) => ({ ...r, team: byId.get(r.teamId)! }))
}

describe('buildPlayerProfile', () => {
  const matches = [
    match({ id: 'm1', scoreA: 15, scoreB: 4, winnerTeamId: tinsel.id }),
    match({ id: 'm2', slotIndex: 1, teamA: tinsel, teamB: holly, scoreA: 15, scoreB: 12, winnerTeamId: tinsel.id }),
    match({ id: 'm3', slotIndex: 2, teamA: sleigh, teamB: holly, scoreA: 15, scoreB: 6, winnerTeamId: sleigh.id }),
  ]
  const teams = [tinsel, sleigh, holly]
  const standings = standingsFor(matches, teams)
  const directory = buildPlayerDirectory(teams)
  const entry = resolvePlayer(directory, 'aroha-ngata')!

  it('assembles record, standing, partner and stats', () => {
    const profile = buildPlayerProfile({ entry, matches, standings, division: null })
    expect(profile.name).toBe('Aroha Ngata')
    expect(profile.partner?.name).toBe('Ben Cole')
    expect(profile.partnerHandle).toBe('ben-cole')
    expect(profile.seed).toBe(1)
    expect(profile.record.wins).toBe(2)
    expect(profile.record.losses).toBe(0)
    expect(profile.standing.rank).toBe(1)
    expect(profile.standing.totalPairs).toBe(3)
    expect(profile.standing.inTopFour).toBe(true)
    expect(profile.fixtures).toHaveLength(2)
    expect(profile.stats).toHaveLength(6)
  })

  it('gives a player with no games an empty record rather than throwing', () => {
    const rookieTeam = team('t4', 'Rookie Robins', ['Gus Reyes', 'Hemi Ropata'], 4)
    const dir = buildPlayerDirectory([...teams, rookieTeam])
    const rookie = resolvePlayer(dir, 'gus-reyes')!
    const profile = buildPlayerProfile({
      entry: rookie,
      matches,
      standings,
      division: null,
    })
    expect(profile.record).toEqual(EMPTY_RECORD)
    expect(profile.standing.rank).toBeNull()
    expect(profile.standing.inTopFour).toBe(false)
    expect(profile.fixtures).toEqual([])
    expect(profile.podium).toBeNull()
    expect(profile.headline).toContain('Not a shuttle struck yet')
  })
})

describe('profileHeadline', () => {
  const standing = { rank: 2, totalPairs: 11, inTopFour: true, tiebreak: null }

  it('celebrates a podium finish', () => {
    const headline = profileHeadline({
      name: 'Aroha Ngata',
      teamName: 'Tinsel Titans',
      divisionName: "Men's Doubles",
      record: { ...EMPTY_RECORD, played: 10, wins: 9, losses: 1, pointDiff: 60 },
      standing,
      podium: 'champion',
    })
    expect(headline).toContain('Christmas champion')
    expect(headline).toContain("Men's Doubles")
  })

  it('signs a positive point difference', () => {
    const headline = profileHeadline({
      name: 'Aroha Ngata',
      teamName: 'Tinsel Titans',
      divisionName: null,
      record: { ...EMPTY_RECORD, played: 4, wins: 3, losses: 1, pointDiff: 12 },
      standing,
      podium: null,
    })
    expect(headline).toContain('3–1')
    expect(headline).toContain('+12')
    expect(headline).toContain('semi-final cut')
  })
})

// ---------------------------------------------------------------------------
// Demo-mode data access (no Supabase env vars in the test environment)
// ---------------------------------------------------------------------------

describe('demo-mode data access', () => {
  it('builds a directory with unique handles for every demo player', async () => {
    const directory = await getPlayerDirectory()
    expect(directory.length).toBeGreaterThan(0)
    expect(new Set(directory.map((e) => e.handle)).size).toBe(directory.length)
    expect(directory.every((e) => e.handle === e.handle.toLowerCase())).toBe(true)
  })

  it('loads a real demo profile with fixtures and duties', async () => {
    const profile = await getPlayerProfile('ivy-novak')
    expect(profile).not.toBeNull()
    expect(profile!.name).toBe('Ivy Novak')
    expect(profile!.team.name).toBe('Candy Cane Crew')
    expect(profile!.partner?.name).toBe('Jade Kupenga')
    expect(profile!.division?.name).toBe("Women's Doubles")
    expect(profile!.fixtures.length).toBeGreaterThan(0)
    expect(profile!.duties.length).toBeGreaterThan(0)
    expect(profile!.standing.rank).not.toBeNull()
  })

  it('returns null for an unknown handle', async () => {
    expect(await getPlayerProfile('mrs-claus')).toBeNull()
  })
})
