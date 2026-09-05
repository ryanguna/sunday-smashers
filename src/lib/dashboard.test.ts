import { describe, expect, it } from 'vitest'
import {
  ARRIVE_BEFORE_MINUTES,
  buildPlayerDashboard,
  canDriveScoring,
  dashboardStage,
  demoClock,
  distanceToCut,
  dutyRoleLabel,
  endKindFor,
  findPlayerTeam,
  fixtureCountdown,
  formatCountdown,
  formatMoney,
  gamesRemaining,
  isDecidedOutcome,
  isDoubleBooked,
  isWinOutcome,
  liveFixture,
  matchStartIso,
  nextDuty,
  nextFixture,
  parseSlotLabel,
  paymentStatusView,
  playerDuties,
  playerFixtures,
  podiumFor,
  pointsToWinLabel,
  recordFor,
  registrationStatusView,
  rewindSchedule,
  scoringConsoleHref,
  stageLabel,
  standingsFromMatches,
  TOP_FOUR_CUT,
  type RegistrationSnapshot,
} from './dashboard'
import type { PublicDivisionInfo, PublicMatch, PublicTeam } from './public-data'
import { TOURNAMENT_DATE } from './tournament'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function team(id: string, name: string, players: [string, string], seed = 1): PublicTeam {
  return {
    id,
    division: 'womens_doubles',
    name,
    seed,
    players: players.map((p, i) => ({ id: `${id}-p${i + 1}`, name: p })),
  }
}

const candy = team('w-candy', 'Candy Cane Crew', ['Ivy Novak', 'Jade Kupenga'], 5)
const cocoa = team('w-cocoa', 'Cocoa Crushers', ['Uma Reddy', 'Vera Kalani'], 11)
const jingle = team('w-jingle', 'Jingle Ballers', ['Sasha Moe', 'Tui Faleolo'], 10)
const berry = team('w-berry', 'Holly Berry Smashers', ['Mila Petelo', 'Nadia Osei'], 7)

const DIVISION: PublicDivisionInfo = {
  slug: 'womens_doubles',
  name: "Women's Doubles",
  gender: 'womens',
  qualifyingPlaces: 4,
  elimsRules: { pointsToWin: 15, deuce: false },
  finalsRules: { pointsToWin: 21, deuce: false },
}

function slotLabel(index: number): string {
  const total = 9 * 60 + index * 15
  const h24 = Math.floor(total / 60)
  const m = total % 60
  const h12 = ((h24 + 11) % 12) + 1
  return `${h12}:${String(m).padStart(2, '0')}${h24 < 12 ? 'am' : 'pm'}`
}

function match(partial: Partial<PublicMatch> & { id: string; slotIndex: number }): PublicMatch {
  return {
    resultDisputed: false,
    division: 'womens_doubles',
    stage: 'elims',
    court: 'Court 4',
    slotLabel: slotLabel(partial.slotIndex),
    slotStartsAt: null,
    teamA: null,
    teamB: null,
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
    ...partial,
  }
}

const SCHEDULE: PublicMatch[] = [
  match({
    id: 'm0',
    slotIndex: 0,
    teamA: candy,
    teamB: cocoa,
    status: 'completed',
    scoreA: 15,
    scoreB: 9,
    winnerTeamId: candy.id,
  }),
  match({
    id: 'm1',
    slotIndex: 1,
    teamA: jingle,
    teamB: berry,
    status: 'completed',
    scoreA: 15,
    scoreB: 12,
    winnerTeamId: jingle.id,
    duties: [
      { role: 'umpire_scorer', playerId: 'w-candy-p1', playerName: 'Ivy Novak', source: 'derived' },
      { role: 'scoresheet', playerId: 'w-candy-p2', playerName: 'Jade Kupenga', source: 'derived' },
    ],
  }),
  match({
    id: 'm2',
    slotIndex: 2,
    teamA: candy,
    teamB: jingle,
    status: 'in_progress',
    scoreA: 11,
    scoreB: 8,
  }),
  match({
    id: 'm3',
    slotIndex: 3,
    court: 'Court 5',
    teamA: cocoa,
    teamB: berry,
    duties: [
      { role: 'line_judge', playerId: 'w-candy-p1', playerName: 'Ivy Novak', source: 'derived' },
      { role: 'line_judge', playerId: '', playerName: '', source: 'unassigned' },
    ],
  }),
  match({ id: 'm4', slotIndex: 4, teamA: candy, teamB: berry }),
]

const IVY = { id: 'w-candy-p1', name: 'Ivy Novak' }

// ---------------------------------------------------------------------------

describe('labels', () => {
  it('names each stage', () => {
    expect(stageLabel('elims')).toBe('Round Robin')
    expect(stageLabel('semi')).toBe('Semi-Final')
    expect(stageLabel('third_place')).toBe('Battle for 3rd')
    expect(stageLabel('final')).toBe('Championship')
  })

  it('names each duty role', () => {
    expect(dutyRoleLabel('umpire_scorer')).toBe('Umpire / Scorer')
    expect(dutyRoleLabel('scoresheet')).toBe('Scoresheet')
    expect(dutyRoleLabel('line_judge')).toBe('Line judge')
  })

  it('spells out the points-to-win rule for the stage', () => {
    expect(pointsToWinLabel({ pointsToWin: 15, deuce: false })).toBe('First to 15 — no deuce')
    expect(pointsToWinLabel({ pointsToWin: 21, deuce: true })).toBe('First to 21')
  })

  it('formats money without trailing cents', () => {
    expect(formatMoney(2500)).toBe('$25')
    expect(formatMoney(2550)).toBe('$25.50')
  })
})

describe('findPlayerTeam', () => {
  it('finds the pair by player id', () => {
    expect(findPlayerTeam(SCHEDULE, IVY)?.id).toBe('w-candy')
  })

  it('falls back to a case-insensitive name match', () => {
    expect(findPlayerTeam(SCHEDULE, { id: 'auth-uuid', name: 'ivy novak' })?.id).toBe('w-candy')
  })

  it('returns null for a free agent', () => {
    expect(findPlayerTeam(SCHEDULE, { id: 'nobody', name: 'Santa Claus' })).toBeNull()
  })
})

describe('playerFixtures', () => {
  const fixtures = playerFixtures(SCHEDULE, candy.id)

  it('returns only this pair’s matches, in playing order', () => {
    expect(fixtures.map((f) => f.match.id)).toEqual(['m0', 'm2', 'm4'])
  })

  it('resolves the opponent and scores from the player’s point of view', () => {
    expect(fixtures[0].opponentName).toBe('Cocoa Crushers')
    expect(fixtures[0].yourScore).toBe(15)
    expect(fixtures[0].theirScore).toBe(9)
    expect(fixtures[0].outcome).toBe('win')
  })

  it('marks live and upcoming matches', () => {
    expect(fixtures[1].outcome).toBe('live')
    expect(fixtures[2].outcome).toBe('upcoming')
  })

  it('reads scores from side B correctly', () => {
    const asB = playerFixtures(
      [match({ id: 'x', slotIndex: 9, teamA: cocoa, teamB: candy, status: 'completed', scoreA: 15, scoreB: 3, winnerTeamId: cocoa.id })],
      candy.id,
    )
    expect(asB[0].side).toBe('B')
    expect(asB[0].yourScore).toBe(3)
    expect(asB[0].outcome).toBe('loss')
  })

  it('reports forfeits from both sides', () => {
    const forfeited = match({
      id: 'ff',
      slotIndex: 8,
      teamA: candy,
      teamB: cocoa,
      status: 'forfeited',
      forfeitedBy: candy.id,
      winnerTeamId: cocoa.id,
    })
    expect(playerFixtures([forfeited], candy.id)[0].outcome).toBe('forfeit_loss')
    expect(playerFixtures([forfeited], cocoa.id)[0].outcome).toBe('forfeit_win')
  })

  it('uses the knockout placeholder when the opponent is undecided', () => {
    const semi = match({ id: 's', slotIndex: 20, stage: 'semi', teamA: candy, teamB: null, sourceB: 'Winner of M2' })
    expect(playerFixtures([semi], candy.id)[0].opponentName).toBe('Winner of M2')
  })

  it('is empty for a player with no team', () => {
    expect(playerFixtures(SCHEDULE, null)).toEqual([])
  })
})

describe('nextFixture / liveFixture', () => {
  it('prefers the match already in progress', () => {
    const fixtures = playerFixtures(SCHEDULE, candy.id)
    expect(nextFixture(fixtures)?.match.id).toBe('m2')
    expect(liveFixture(fixtures)?.match.id).toBe('m2')
  })

  it('falls back to the earliest upcoming match', () => {
    const fixtures = playerFixtures(SCHEDULE, candy.id).filter((f) => f.outcome !== 'live')
    expect(nextFixture(fixtures)?.match.id).toBe('m4')
  })

  it('returns null once the day is done', () => {
    expect(nextFixture(playerFixtures([SCHEDULE[0]], candy.id))).toBeNull()
    expect(liveFixture([])).toBeNull()
  })
})

describe('playerDuties', () => {
  it('finds duties by player id', () => {
    const duties = playerDuties(SCHEDULE, IVY, candy.id)
    expect(duties.map((d) => d.match.id)).toEqual(['m1', 'm3'])
    expect(duties[0].role).toBe('umpire_scorer')
    expect(duties[1].role).toBe('line_judge')
  })

  it('ignores unassigned duty slots', () => {
    expect(playerDuties(SCHEDULE, { id: '', name: '' }, null)).toEqual([])
  })

  it('never matches a duty on the display name alone', () => {
    // Same person, wrong id: the roster is keyed on ids, so nothing matches.
    expect(playerDuties(SCHEDULE, { id: 'someone-else', name: 'Ivy Novak' }, null)).toEqual([])
    // Right id, unrecognisable name: still theirs.
    expect(
      playerDuties(SCHEDULE, { id: 'w-candy-p1', name: 'not-a-real-name' }, null).map(
        (d) => d.match.id,
      ),
    ).toEqual(['m1', 'm3'])
  })

  it('keeps two players with identical display names on separate rosters', () => {
    const roster = [
      match({
        id: 'd1',
        slotIndex: 1,
        teamA: jingle,
        teamB: berry,
        duties: [{ role: 'umpire_scorer', playerId: 'ivy-one', playerName: 'Ivy', source: 'derived' }],
      }),
      match({
        id: 'd2',
        slotIndex: 2,
        teamA: cocoa,
        teamB: berry,
        duties: [{ role: 'line_judge', playerId: 'ivy-two', playerName: 'Ivy', source: 'derived' }],
      }),
    ]
    expect(playerDuties(roster, { id: 'ivy-one', name: 'Ivy' }, null).map((d) => d.match.id)).toEqual([
      'd1',
    ])
    expect(playerDuties(roster, { id: 'ivy-two', name: 'Ivy' }, null).map((d) => d.match.id)).toEqual([
      'd2',
    ])
  })

  it('treats a blank duty player id as unassigned, not a wildcard', () => {
    const unstaffed = [
      match({
        id: 'blank',
        slotIndex: 1,
        teamA: jingle,
        teamB: berry,
        duties: [{ role: 'line_judge', playerId: '', playerName: '', source: 'unassigned' }],
      }),
    ]
    expect(playerDuties(unstaffed, IVY, null)).toEqual([])
    expect(playerDuties(unstaffed, { id: '  ', name: 'Nobody' }, null)).toEqual([])
  })

  it('picks the next unplayed duty', () => {
    expect(nextDuty(playerDuties(SCHEDULE, IVY, candy.id))?.match.id).toBe('m3')
  })

  it('flags a duty that clashes with the player’s own match in the same slot', () => {
    const clashing = [
      match({ id: 'own', slotIndex: 7, teamA: candy, teamB: cocoa }),
      match({
        id: 'duty',
        slotIndex: 7,
        court: 'Court 9',
        teamA: jingle,
        teamB: berry,
        duties: [{ role: 'scoresheet', playerId: 'w-candy-p1', playerName: 'Ivy Novak', source: 'manual' }],
      }),
    ]
    expect(playerDuties(clashing, IVY, candy.id)[0].clash).toBe(true)
  })
})

describe('retirements and walkovers', () => {
  // The retiring pair (candy) was AHEAD when they pulled out, so the scoreline
  // says they won while winnerTeamId says they didn't. The result is authority.
  const retiredWhileAhead = match({
    id: 'ret',
    slotIndex: 6,
    status: 'retired',
    teamA: candy,
    teamB: cocoa,
    scoreA: 12,
    scoreB: 7,
    winnerTeamId: cocoa.id,
  })

  it('records a loss for a pair that retired while ahead', () => {
    const [fixture] = playerFixtures([retiredWhileAhead], candy.id)
    expect(fixture.outcome).toBe('loss')
    expect(fixture.endKind).toBe('retired')
    expect(isWinOutcome(fixture.outcome)).toBe(false)
    // Their own score is still the higher one — the scoreline must not decide it.
    expect(fixture.yourScore).toBeGreaterThan(fixture.theirScore)
  })

  it('records the win for the pair that stayed on court', () => {
    const [fixture] = playerFixtures([retiredWhileAhead], cocoa.id)
    expect(fixture.outcome).toBe('win')
    expect(fixture.endKind).toBe('retired')
    expect(isWinOutcome(fixture.outcome)).toBe(true)
  })

  it('counts a retirement in the standings, to the pair that did not retire', () => {
    const rows = standingsFromMatches([retiredWhileAhead], 'womens_doubles')
    expect(rows.find((r) => r.teamId === cocoa.id)?.wins).toBe(1)
    expect(rows.find((r) => r.teamId === candy.id)?.wins).toBe(0)
    expect(rows.find((r) => r.teamId === candy.id)?.losses).toBe(1)
  })

  it('treats a walkover as an awarded result, not a contest', () => {
    const walkover = match({
      id: 'wo',
      slotIndex: 8,
      status: 'walkover',
      teamA: candy,
      teamB: berry,
      scoreA: 0,
      scoreB: 0,
      winnerTeamId: candy.id,
    })
    expect(playerFixtures([walkover], candy.id)[0].outcome).toBe('forfeit_win')
    expect(playerFixtures([walkover], berry.id)[0].outcome).toBe('forfeit_loss')
    expect(playerFixtures([walkover], candy.id)[0].endKind).toBe('walkover')
  })

  it('never leaves a decided match looking upcoming', () => {
    for (const status of ['completed', 'forfeited', 'walkover', 'retired'] as const) {
      const m = match({ id: `s-${status}`, slotIndex: 9, status, teamA: candy, teamB: berry, winnerTeamId: candy.id })
      const [fixture] = playerFixtures([m], candy.id)
      expect(isDecidedOutcome(fixture.outcome)).toBe(true)
    }
  })

  it('reads the end kind off the status', () => {
    expect(endKindFor({ status: 'retired', forfeitedBy: null })).toBe('retired')
    expect(endKindFor({ status: 'walkover', forfeitedBy: null })).toBe('walkover')
    expect(endKindFor({ status: 'forfeited', forfeitedBy: candy.id })).toBe('forfeit')
    expect(endKindFor({ status: 'completed', forfeitedBy: null })).toBe('normal')
  })

  it('does not offer a scoring console link for a retired match', () => {
    const duty = playerDuties(
      [
        match({
          id: 'Court 4#20',
          slotIndex: 20,
          status: 'retired',
          teamA: jingle,
          teamB: berry,
          duties: [{ role: 'umpire_scorer', playerId: 'w-candy-p1', playerName: 'Ivy Novak', source: 'derived' }],
        }),
      ],
      IVY,
      null,
    )[0]
    expect(scoringConsoleHref(duty)).toBeNull()
  })
})

describe('scoringConsoleHref', () => {
  const dutyFor = (role: 'umpire_scorer' | 'scoresheet' | 'line_judge', status: PublicMatch['status'] = 'scheduled') =>
    playerDuties(
      [
        match({
          id: 'Court 5#16',
          slotIndex: 16,
          status,
          teamA: jingle,
          teamB: berry,
          duties: [{ role, playerId: 'w-candy-p1', playerName: 'Ivy Novak', source: 'derived' }],
        }),
      ],
      IVY,
      null,
    )[0]

  it('links an umpire/scorer to the console with the match id percent-encoded', () => {
    // Demo match ids contain '#', which would otherwise be read as a fragment.
    expect(scoringConsoleHref(dutyFor('umpire_scorer'))).toBe('/scoring/Court%205%2316')
  })

  it('links the scoresheet keeper too', () => {
    expect(scoringConsoleHref(dutyFor('scoresheet'))).toBe('/scoring/Court%205%2316')
  })

  it('never links a line judge — they have no console permission', () => {
    expect(scoringConsoleHref(dutyFor('line_judge'))).toBeNull()
    expect(canDriveScoring('line_judge')).toBe(false)
    expect(canDriveScoring('umpire_scorer')).toBe(true)
    expect(canDriveScoring('scoresheet')).toBe(true)
  })

  it('links a match already in progress, but not one that has finished', () => {
    expect(scoringConsoleHref(dutyFor('umpire_scorer', 'in_progress'))).toBe('/scoring/Court%205%2316')
    expect(scoringConsoleHref(dutyFor('umpire_scorer', 'completed'))).toBeNull()
    expect(scoringConsoleHref(dutyFor('umpire_scorer', 'forfeited'))).toBeNull()
  })

  it('handles a missing duty', () => {
    expect(scoringConsoleHref(null)).toBeNull()
    expect(scoringConsoleHref(undefined)).toBeNull()
  })
})

describe('isDoubleBooked', () => {
  const fixtures = playerFixtures(SCHEDULE, candy.id)
  const duties = playerDuties(SCHEDULE, IVY, candy.id)

  it('is false when the duty is in a different slot', () => {
    expect(isDoubleBooked(nextFixture(fixtures), nextDuty(duties))).toBe(false)
  })

  it('is true when a duty and a match share a slot', () => {
    const own = playerFixtures([match({ id: 'own', slotIndex: 7, teamA: candy, teamB: cocoa })], candy.id)[0]
    const duty = playerDuties(
      [match({ id: 'duty', slotIndex: 7, teamA: jingle, teamB: berry, duties: [{ role: 'scoresheet', playerId: 'w-candy-p1', playerName: 'Ivy Novak', source: 'manual' }] })],
      IVY,
      null,
    )[0]
    expect(isDoubleBooked(own, duty)).toBe(true)
  })

  it('never flags a match against itself, or missing halves', () => {
    expect(isDoubleBooked(null, null)).toBe(false)
    expect(isDoubleBooked(fixtures[0], null)).toBe(false)
  })
})

describe('time helpers', () => {
  it('parses slot labels', () => {
    expect(parseSlotLabel('9:00am')).toBe(540)
    expect(parseSlotLabel('2:15pm')).toBe(855)
    expect(parseSlotLabel('12:30am')).toBe(30)
    expect(parseSlotLabel('12:30pm')).toBe(750)
    expect(parseSlotLabel('14:45')).toBe(885)
    expect(parseSlotLabel(null)).toBeNull()
    expect(parseSlotLabel('soon')).toBeNull()
  })

  it('turns a slot index into a real moment on tournament day', () => {
    const base = new Date(TOURNAMENT_DATE).getTime()
    expect(matchStartIso({ slotIndex: 0, slotLabel: '9:00am', slotStartsAt: null })).toBe(new Date(base).toISOString())
    expect(matchStartIso({ slotIndex: 4, slotLabel: '10:00am', slotStartsAt: null })).toBe(new Date(base + 60 * 60_000).toISOString())
  })

  it('prefers the schedule\'s real slot time over the 15-minute guess', () => {
    // An organiser who starts at 8:00am with 30-minute slots: the third slot
    // really begins at 9:00am, while slotIndex 2 read as 15-minute steps from
    // 9:00am says 9:30am. The player must be told the time on the schedule.
    const realStart = '2026-12-13T09:00:00.000Z'
    expect(
      matchStartIso({ slotIndex: 2, slotLabel: '9:30am', slotStartsAt: realStart }),
    ).toBe(realStart)
  })

  it('ignores an unparseable slot time rather than reporting an invalid date', () => {
    const base = new Date(TOURNAMENT_DATE).getTime()
    expect(
      matchStartIso({ slotIndex: 4, slotLabel: null, slotStartsAt: 'not a date' }),
    ).toBe(new Date(base + 60 * 60_000).toISOString())
  })

  it('falls back to the slot label when there is no index', () => {    const base = new Date(TOURNAMENT_DATE).getTime()
    expect(matchStartIso({ slotIndex: null, slotLabel: '2:15pm', slotStartsAt: null })).toBe(
      new Date(base + 5.25 * 60 * 60_000).toISOString(),
    )
    expect(matchStartIso({ slotIndex: null, slotLabel: null, slotStartsAt: null })).toBeNull()
  })

  it('formats countdowns at every scale', () => {
    expect(formatCountdown(30_000).text).toBe('under a minute')
    expect(formatCountdown(22 * 60_000).text).toBe('22 min')
    expect(formatCountdown(3 * 3600_000 + 15 * 60_000).text).toBe('3h 15m')
    expect(formatCountdown(2 * 86_400_000).text).toBe('2 days')
    expect(formatCountdown(86_400_000).text).toBe('1 day')
  })

  it('marks the arrive-by window as urgent, and past starts as started', () => {
    expect(formatCountdown((ARRIVE_BEFORE_MINUTES - 1) * 60_000).urgent).toBe(true)
    expect(formatCountdown(60 * 60_000).urgent).toBe(false)
    const past = formatCountdown(-5 * 60_000)
    expect(past.started).toBe(true)
    expect(past.text).toBe('5 min ago')
    expect(formatCountdown(0).text).toBe('now')
  })

  it('builds a countdown for a fixture', () => {
    const now = new Date(TOURNAMENT_DATE).getTime()
    const view = fixtureCountdown({ slotIndex: 4, slotLabel: '10:00am', slotStartsAt: null }, now)
    expect(view?.msUntil).toBe(3600_000)
    expect(view?.text).toBe('1h 0m')
    expect(fixtureCountdown({ slotIndex: null, slotLabel: null, slotStartsAt: null }, now)).toBeNull()
  })
})

describe('standings and the top-4 cut', () => {
  const standings = standingsFromMatches(SCHEDULE, 'womens_doubles')

  it('recomputes round-robin standings from the fixtures on screen', () => {
    expect(standings).toHaveLength(4)
    expect(standings.map((r) => r.teamId).slice(0, 2).sort()).toEqual(['w-candy', 'w-jingle'])
    expect(recordFor(standings, candy.id)).toMatchObject({ played: 1, wins: 1, losses: 0, pointDiff: 6 })
  })

  it('ignores in-progress and knockout matches', () => {
    const withSemi = standingsFromMatches(
      [...SCHEDULE, match({ id: 'semi', slotIndex: 30, stage: 'semi', teamA: candy, teamB: cocoa, status: 'completed', scoreA: 21, scoreB: 4, winnerTeamId: candy.id })],
      'womens_doubles',
    )
    expect(withSemi.find((r) => r.teamId === candy.id)?.played).toBe(1)
  })

  it('returns an empty record for an unknown team', () => {
    expect(recordFor(standings, 'nope').played).toBe(0)
    expect(recordFor(standings, null).wins).toBe(0)
  })

  it('counts unplayed round-robin games', () => {
    expect(gamesRemaining(playerFixtures(SCHEDULE, candy.id))).toBe(1)
  })

  it('reports being inside the cut', () => {
    const cut = distanceToCut(standings, candy.id, 1)
    expect(cut?.inCut).toBe(true)
    expect(cut?.winsBehind).toBe(0)
    expect(cut?.message).toContain(`Rank ${cut?.rank}`)
  })

  it('reports the gap for a pair outside the cut', () => {
    const wide = [
      ...['a', 'b', 'c', 'd'].map((id, i) =>
        match({ id: `w${i}`, slotIndex: i, teamA: team(id, id.toUpperCase(), ['P1 ' + id, 'P2 ' + id]), teamB: team('z' + id, 'Z' + id, ['Q1', 'Q2']), status: 'completed', scoreA: 15, scoreB: 2, winnerTeamId: id }),
      ),
    ]
    const table = standingsFromMatches(wide, 'womens_doubles')
    const outside = table[table.length - 1]
    const cut = distanceToCut(table, outside.teamId, 3)
    expect(cut?.inCut).toBe(false)
    expect(cut?.winsBehind).toBeGreaterThan(0)
    expect(cut?.message).toContain('top 4')
  })

  it('says the semis are locked in once the round robin is over', () => {
    const cut = distanceToCut(standings, candy.id, 0)
    expect(cut?.message).toContain('through to the semis')
  })

  it('is null for a pair that is not in the table', () => {
    expect(distanceToCut(standings, 'ghost', 2)).toBeNull()
  })

  it('exposes the cut size', () => {
    expect(TOP_FOUR_CUT).toBe(4)
  })
})

describe('podiumFor', () => {
  const final = (won: boolean) =>
    match({
      id: 'f',
      slotIndex: 40,
      stage: 'final',
      teamA: candy,
      teamB: cocoa,
      status: 'completed',
      scoreA: won ? 21 : 12,
      scoreB: won ? 12 : 21,
      winnerTeamId: won ? candy.id : cocoa.id,
      pointsToWin: 21,
    })

  it('crowns the champion and the runner up', () => {
    expect(podiumFor(playerFixtures([final(true)], candy.id), candy.id)).toBe('champion')
    expect(podiumFor(playerFixtures([final(false)], candy.id), candy.id)).toBe('runner_up')
  })

  it('handles the battle for 3rd', () => {
    const third = match({ id: 't', slotIndex: 38, stage: 'third_place', teamA: candy, teamB: jingle, status: 'completed', scoreA: 21, scoreB: 15, winnerTeamId: candy.id, pointsToWin: 21 })
    expect(podiumFor(playerFixtures([third], candy.id), candy.id)).toBe('third')
    expect(podiumFor(playerFixtures([third], jingle.id), jingle.id)).toBe('fourth')
  })

  it('is null before the knockouts are decided', () => {
    expect(podiumFor(playerFixtures(SCHEDULE, candy.id), candy.id)).toBeNull()
    expect(podiumFor([], null)).toBeNull()
  })
})

describe('registration and payment status', () => {
  it('celebrates an approved entry with nothing left to do', () => {
    const view = registrationStatusView('approved')
    expect(view.tone).toBe('success')
    expect(view.nudge).toBeNull()
  })

  it('sends each undecided state somewhere it can actually act', () => {
    // An entry that exists belongs on `/status`; the form has nothing left to
    // offer it and now redirects there anyway. Only "never entered" goes to
    // the form. Every one of them keeps a nudge — a status card with no next
    // step is just a label.
    expect(registrationStatusView('pending').href).toBe('/status')
    expect(registrationStatusView('waitlisted').href).toBe('/status')
    expect(registrationStatusView(null).href).toBe('/register')
    for (const status of ['pending', 'waitlisted', null] as const) {
      expect(registrationStatusView(status).nudge).not.toBeNull()
    }
  })

  it('sends a rejected player to the committee, not back to a form that refuses them', () => {
    // `unique (division_id, player_id)` blocks a second entry, so the old
    // "Try again" button led to a permanently disabled submit.
    const view = registrationStatusView('rejected')
    expect(view.href).not.toBe('/register')
    expect(view.href).toBe('/#contact')
    expect(view.actionLabel).toBe('Contact the committee')
  })

  it('promises no email it cannot send', () => {
    // There is no mailer in this project.
    for (const status of ['pending', 'waitlisted', 'rejected', 'approved', null] as const) {
      const view = registrationStatusView(status)
      expect(`${view.message} ${view.nudge ?? ''}`).not.toMatch(/email/i)
    }
  })

  it('describes paid, part-paid and unpaid entries', () => {
    const base: RegistrationSnapshot = {
      status: 'approved',
      payment: 'paid',
      amountDueCents: 2500,
      amountPaidCents: 2500,
      divisionName: "Women's Doubles",
    }
    expect(paymentStatusView(base).tone).toBe('success')

    const partial = paymentStatusView({ ...base, payment: 'partial', amountPaidCents: 1000 })
    expect(partial.tone).toBe('warn')
    expect(partial.message).toContain('$15')

    const unpaid = paymentStatusView({ ...base, payment: 'unpaid', amountPaidCents: 0 })
    expect(unpaid.tone).toBe('danger')
    expect(unpaid.message).toContain('$25')
    expect(paymentStatusView({ ...base, payment: null, amountDueCents: 0, amountPaidCents: 0 }).message).toContain(
      'hasn’t been recorded',
    )
  })

  it('sends anyone who owes money to /pay, not /register', () => {
    // /register says nothing about money: a player told to pay used to land on
    // a page that could not tell them the amount, the method or who to pay.
    const base: RegistrationSnapshot = {
      status: 'approved',
      payment: 'unpaid',
      amountDueCents: 2500,
      amountPaidCents: 0,
      divisionName: "Men's Doubles",
    }
    expect(paymentStatusView(base).href).toBe('/pay')
    expect(paymentStatusView({ ...base, payment: 'partial', amountPaidCents: 1000 }).href).toBe('/pay')
  })
})

describe('dashboardStage', () => {
  it('detects a player who has not entered', () => {
    expect(dashboardStage({ registered: false, hasTeam: false, fixtures: [] })).toBe('not-registered')
  })

  it('detects a registered player with no draw yet', () => {
    expect(dashboardStage({ registered: true, hasTeam: false, fixtures: [] })).toBe('awaiting-draw')
  })

  it('detects tournament day and a finished day', () => {
    const fixtures = playerFixtures(SCHEDULE, candy.id)
    expect(dashboardStage({ registered: true, hasTeam: true, fixtures })).toBe('tournament-day')
    expect(
      dashboardStage({ registered: true, hasTeam: true, fixtures: fixtures.filter((f) => f.outcome === 'win') }),
    ).toBe('finished')
  })
})

describe('rewindSchedule / demoClock', () => {
  it('replays the day as it looked at the cursor slot', () => {
    const rewound = rewindSchedule(SCHEDULE, 2)
    const byId = new Map(rewound.map((m) => [m.id, m]))
    expect(byId.get('m0')?.status).toBe('completed')
    expect(byId.get('m2')?.status).toBe('in_progress')
    expect(byId.get('m4')?.status).toBe('scheduled')
    expect(byId.get('m4')?.scoreA).toBe(0)
  })

  it('clamps the live score below the winning target', () => {
    const rewound = rewindSchedule([SCHEDULE[0]], 0)
    expect(rewound[0].status).toBe('in_progress')
    expect(rewound[0].scoreA).toBeLessThanOrEqual(13)
    expect(rewound[0].winnerTeamId).toBeNull()
  })

  it('leaves matches without a slot index alone', () => {
    const noSlot = { ...SCHEDULE[0], slotIndex: null }
    expect(rewindSchedule([noSlot], 0)[0]).toBe(noSlot)
  })

  it('produces a clock that sits inside the cursor slot', () => {
    const now = demoClock(2)
    const start = new Date(matchStartIso({ slotIndex: 2, slotLabel: null, slotStartsAt: null })!).getTime()
    expect(now - start).toBe(8 * 60_000)
  })
})

describe('buildPlayerDashboard', () => {
  const dashboard = buildPlayerDashboard({
    player: IVY,
    matches: SCHEDULE,
    divisions: [DIVISION],
    registration: {
      status: 'approved',
      payment: 'unpaid',
      amountDueCents: 2500,
      amountPaidCents: 0,
      divisionName: "Women's Doubles",
    },
    now: demoClock(2),
  })

  it('resolves the player’s team, partner and division', () => {
    expect(dashboard.team?.id).toBe('w-candy')
    expect(dashboard.partnerNames).toEqual(['Jade Kupenga'])
    expect(dashboard.division?.name).toBe("Women's Doubles")
  })

  it('surfaces the live match, the next duty and no clash', () => {
    expect(dashboard.live?.match.id).toBe('m2')
    expect(dashboard.next?.match.id).toBe('m2')
    expect(dashboard.duty?.match.id).toBe('m3')
    expect(dashboard.doubleBooked).toBe(false)
    expect(dashboard.dutyCountdown?.msUntil).toBeGreaterThan(0)
  })

  it('derives the record, cut and stage', () => {
    expect(dashboard.record.wins).toBe(1)
    expect(dashboard.cut?.rank).toBeGreaterThan(0)
    expect(dashboard.gamesLeft).toBe(1)
    expect(dashboard.stage).toBe('tournament-day')
  })

  it('carries the registration and payment views', () => {
    expect(dashboard.registrationView.label).toBe('Approved')
    expect(dashboard.paymentView?.label).toBe('Unpaid')
  })

  it('handles a free agent with no team, no fixtures and no registration', () => {
    const empty = buildPlayerDashboard({
      player: { id: 'free', name: 'Santa Claus' },
      matches: SCHEDULE,
      divisions: [DIVISION],
      registration: null,
      now: demoClock(0),
    })
    expect(empty.team).toBeNull()
    expect(empty.fixtures).toEqual([])
    expect(empty.next).toBeNull()
    expect(empty.countdown).toBeNull()
    expect(empty.cut).toBeNull()
    expect(empty.paymentView).toBeNull()
    expect(empty.stage).toBe('not-registered')
  })

  it('celebrates once every fixture is done', () => {
    const done = buildPlayerDashboard({
      player: IVY,
      matches: [SCHEDULE[0]],
      divisions: [DIVISION],
      registration: null,
      now: demoClock(20),
    })
    expect(done.stage).toBe('finished')
    expect(done.celebrate).toBe(true)
  })
})
