import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ELIMS_RULES,
  DEFAULT_FINALS_RULES,
  computeStandings,
  evaluateGame,
  finalPlacings,
  gamesPerTeam,
  generateKnockout,
  generateRoundRobin,
  matchWinner,
  qualifiers,
  totalRoundRobinMatches,
  type PlayedMatch,
  type TeamId,
} from './draw'

const pairs = (n: number): TeamId[] =>
  Array.from({ length: n }, (_, i) => `pair-${String(i + 1).padStart(2, '0')}`)

const key = (a: string, b: string) => [a, b].sort().join('|')

describe('generateRoundRobin', () => {
  it('returns no fixtures for fewer than two pairs', () => {
    expect(generateRoundRobin([])).toEqual([])
    expect(generateRoundRobin(['solo'])).toEqual([])
  })

  it('pairs every team exactly once with an even entry count', () => {
    const teams = pairs(8)
    const fixtures = generateRoundRobin(teams)

    expect(fixtures).toHaveLength(totalRoundRobinMatches(8))

    const seen = new Set(fixtures.map((f) => key(f.teamA, f.teamB)))
    expect(seen.size).toBe(fixtures.length)

    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        expect(seen.has(key(teams[i], teams[j]))).toBe(true)
      }
    }
  })

  it('pairs every team exactly once with an odd entry count', () => {
    const teams = pairs(7)
    const fixtures = generateRoundRobin(teams)

    expect(fixtures).toHaveLength(totalRoundRobinMatches(7))
    const seen = new Set(fixtures.map((f) => key(f.teamA, f.teamB)))
    expect(seen.size).toBe(fixtures.length)
  })

  it('gives every pair exactly entries-1 games', () => {
    for (const count of [2, 3, 4, 5, 8, 11, 14]) {
      const teams = pairs(count)
      const fixtures = generateRoundRobin(teams)
      const played = new Map<TeamId, number>(teams.map((t) => [t, 0]))

      for (const f of fixtures) {
        played.set(f.teamA, played.get(f.teamA)! + 1)
        played.set(f.teamB, played.get(f.teamB)! + 1)
      }

      for (const team of teams) {
        expect(played.get(team)).toBe(gamesPerTeam(count))
      }
    }
  })

  it('produces the 10 games per pair quoted in the draft rules at 11 entries', () => {
    expect(gamesPerTeam(11)).toBe(10)
    const fixtures = generateRoundRobin(pairs(11))
    expect(fixtures).toHaveLength(55)
  })

  it('never schedules a pair twice in the same round', () => {
    const fixtures = generateRoundRobin(pairs(10))
    const byRound = new Map<number, TeamId[]>()

    for (const f of fixtures) {
      const list = byRound.get(f.round) ?? []
      list.push(f.teamA, f.teamB)
      byRound.set(f.round, list)
    }

    for (const [, teamsInRound] of byRound) {
      expect(new Set(teamsInRound).size).toBe(teamsInRound.length)
    }
  })

  it('never schedules a pair against itself', () => {
    for (const f of generateRoundRobin(pairs(9))) {
      expect(f.teamA).not.toBe(f.teamB)
    }
  })

  it('rejects duplicate entries', () => {
    expect(() => generateRoundRobin(['a', 'b', 'a'])).toThrow(/Duplicate team/)
  })
})

describe('evaluateGame', () => {
  it('ends the game the moment the target is reached when there is no deuce', () => {
    expect(evaluateGame(15, 14, DEFAULT_ELIMS_RULES)).toEqual({
      complete: true,
      winner: 'a',
    })
    expect(evaluateGame(14, 15, DEFAULT_ELIMS_RULES)).toEqual({
      complete: true,
      winner: 'b',
    })
  })

  it('keeps the game open below the target', () => {
    expect(evaluateGame(14, 13, DEFAULT_ELIMS_RULES).complete).toBe(false)
    expect(evaluateGame(0, 0, DEFAULT_ELIMS_RULES).complete).toBe(false)
  })

  it('uses 21 points for the semis and finals', () => {
    expect(evaluateGame(15, 3, DEFAULT_FINALS_RULES).complete).toBe(false)
    expect(evaluateGame(21, 20, DEFAULT_FINALS_RULES)).toEqual({
      complete: true,
      winner: 'a',
    })
  })

  it('requires a two point margin when deuce is enabled', () => {
    const rules = { pointsToWin: 21, deuce: true, cap: 30 }
    expect(evaluateGame(21, 20, rules).complete).toBe(false)
    expect(evaluateGame(22, 20, rules)).toEqual({ complete: true, winner: 'a' })
    expect(evaluateGame(30, 29, rules)).toEqual({ complete: true, winner: 'a' })
  })

  it('rejects negative scores', () => {
    expect(() => evaluateGame(-1, 4)).toThrow(/negative/)
  })
})

describe('matchWinner', () => {
  it('awards the win to the opponent of the forfeiting pair', () => {
    const match: PlayedMatch = {
      teamA: 'a',
      teamB: 'b',
      pointsA: 12,
      pointsB: 3,
      forfeitedBy: 'a',
    }
    expect(matchWinner(match)).toBe('b')
  })

  it('rejects a forfeit by a pair that is not in the match', () => {
    expect(() =>
      matchWinner({ teamA: 'a', teamB: 'b', pointsA: 0, pointsB: 0, forfeitedBy: 'c' }),
    ).toThrow(/not a participant/)
  })

  it('returns null while a match is still in progress', () => {
    expect(
      matchWinner({ teamA: 'a', teamB: 'b', pointsA: 9, pointsB: 7 }, DEFAULT_ELIMS_RULES),
    ).toBeNull()
  })
})

describe('computeStandings', () => {
  const played = (a: TeamId, b: TeamId, pa: number, pb: number): PlayedMatch => ({
    teamA: a,
    teamB: b,
    pointsA: pa,
    pointsB: pb,
  })

  it('ranks by number of wins', () => {
    const teams = ['a', 'b', 'c']
    const standings = computeStandings(teams, [
      played('a', 'b', 15, 9),
      played('a', 'c', 15, 4),
      played('b', 'c', 15, 11),
    ])

    expect(standings.map((r) => r.teamId)).toEqual(['a', 'b', 'c'])
    expect(standings[0]).toMatchObject({ rank: 1, wins: 2, losses: 0, played: 2 })
    expect(standings[2]).toMatchObject({ rank: 3, wins: 0, losses: 2 })
  })

  it('accumulates points for and against and the difference', () => {
    const standings = computeStandings(['a', 'b'], [played('a', 'b', 15, 9)])
    const a = standings.find((r) => r.teamId === 'a')!
    expect(a.pointsFor).toBe(15)
    expect(a.pointsAgainst).toBe(9)
    expect(a.pointDiff).toBe(6)

    const b = standings.find((r) => r.teamId === 'b')!
    expect(b.pointDiff).toBe(-6)
  })

  it('breaks a two-way tie head to head, per the draft rules', () => {
    // a and b both finish 3-1. b beat a during eliminations, so b ranks higher
    // even though a has by far the better point difference.
    const teams = ['a', 'b', 'c', 'd', 'e']
    const standings = computeStandings(teams, [
      played('b', 'a', 15, 13),
      played('a', 'c', 15, 2),
      played('a', 'd', 15, 2),
      played('a', 'e', 15, 2),
      played('b', 'c', 15, 13),
      played('b', 'd', 15, 13),
      played('e', 'b', 15, 13),
      played('c', 'e', 15, 9),
      played('d', 'e', 15, 9),
      played('c', 'd', 15, 9),
    ])

    const a = standings.find((r) => r.teamId === 'a')!
    const b = standings.find((r) => r.teamId === 'b')!

    expect(a.wins).toBe(3)
    expect(b.wins).toBe(3)
    expect(a.pointDiff).toBeGreaterThan(b.pointDiff)
    expect(standings.map((r) => r.teamId).slice(0, 2)).toEqual(['b', 'a'])
    expect(standings[0].tiebreak).toBe('head_to_head')
    expect(standings[0].needsAdminDecision).toBe(false)
  })

  it('matches the worked example from the rules sheet', () => {
    // "Pair A & B are tied at 8-2 standing, but Pair A won against B during
    // elims, Pair A is ranked higher."
    const teams = pairs(11)
    const [a, b, ...rest] = teams
    const matches: PlayedMatch[] = [played(a, b, 15, 13)]

    // a beats b, then loses two of the other nine  -> 8-2.
    for (const opponent of rest) {
      matches.push(
        opponent === rest[0] || opponent === rest[1]
          ? played(opponent, a, 15, 12)
          : played(a, opponent, 15, 8),
      )
    }
    // b loses to a, then loses one more of the other nine -> 8-2.
    for (const opponent of rest) {
      matches.push(
        opponent === rest[0]
          ? played(opponent, b, 15, 12)
          : played(b, opponent, 15, 8),
      )
    }

    const standings = computeStandings(teams, matches)
    const aRow = standings.find((r) => r.teamId === a)!
    const bRow = standings.find((r) => r.teamId === b)!

    expect(aRow.wins).toBe(8)
    expect(aRow.losses).toBe(2)
    expect(bRow.wins).toBe(8)
    expect(bRow.losses).toBe(2)
    expect(aRow.rank).toBeLessThan(bRow.rank)
    expect(aRow.tiebreak).toBe('head_to_head')
  })

  it('resolves a three-way tie with a mini league of the tied pairs', () => {
    // a, b and c all finish 4-2. Among themselves a beat b and c, and b beat
    // c, so the mini league orders them a > b > c.
    const teams = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const standings = computeStandings(teams, [
      played('a', 'b', 15, 13),
      played('a', 'c', 15, 13),
      played('b', 'c', 15, 13),
      // a beats two of the four extras.
      played('a', 'd', 15, 5),
      played('a', 'e', 15, 5),
      played('f', 'a', 15, 5),
      played('g', 'a', 15, 5),
      // b beats three.
      played('b', 'd', 15, 5),
      played('b', 'e', 15, 5),
      played('b', 'f', 15, 5),
      played('g', 'b', 15, 5),
      // c beats all four.
      played('c', 'd', 15, 5),
      played('c', 'e', 15, 5),
      played('c', 'f', 15, 5),
      played('c', 'g', 15, 5),
    ])

    for (const id of ['a', 'b', 'c']) {
      expect(standings.find((r) => r.teamId === id)!.wins).toBe(4)
    }
    expect(standings.map((r) => r.teamId).slice(0, 3)).toEqual(['a', 'b', 'c'])
    expect(standings[0].tiebreak).toBe('mini_league')
  })

  it('uses head-to-head point difference when a win cycle cannot be broken', () => {
    // a beat b, b beat c, c beat a — a perfect cycle, so every pair has one
    // win inside the mini league. The margins inside the cycle separate them.
    const teams = ['a', 'b', 'c']
    const standings = computeStandings(teams, [
      played('a', 'b', 15, 14),
      played('b', 'c', 15, 14),
      played('c', 'a', 15, 2),
    ])

    expect(standings.every((r) => r.wins === 1)).toBe(true)
    expect(standings[0].teamId).toBe('c')
    expect(standings[0].tiebreak).toBe('head_to_head_points')
  })

  it('falls through to overall point difference when the pairs never met', () => {
    // a and b both finish 1-0 but were never drawn against each other, so
    // head to head cannot help. a has the better overall difference.
    const standings = computeStandings(
      ['a', 'b', 'c', 'd'],
      [played('a', 'c', 15, 2), played('b', 'd', 15, 10)],
    )

    expect(standings.map((r) => r.teamId).slice(0, 2)).toEqual(['a', 'b'])
    expect(standings[0].tiebreak).toBe('point_difference')
  })

  it('flags a genuinely unresolvable tie for an admin decision', () => {
    // a and b never met and have identical records in every respect.
    const standings = computeStandings(
      ['a', 'b', 'c', 'd'],
      [played('a', 'c', 15, 10), played('b', 'd', 15, 10)],
    )

    expect(standings.some((r) => r.needsAdminDecision)).toBe(true)
    expect(standings.some((r) => r.tiebreak === 'unresolved')).toBe(true)
  })

  it('is deterministic for identical records', () => {
    const teams = ['z', 'y', 'x']
    const matches = [
      played('z', 'y', 15, 10),
      played('y', 'x', 15, 10),
      played('x', 'z', 15, 10),
    ]
    const first = computeStandings(teams, matches).map((r) => r.teamId)
    const second = computeStandings([...teams].reverse(), matches).map((r) => r.teamId)
    expect(first).toEqual(second)
  })

  it('records a forfeit as a loss with the standard scoreline', () => {
    const standings = computeStandings(
      ['a', 'b'],
      [{ teamA: 'a', teamB: 'b', pointsA: 11, pointsB: 4, forfeitedBy: 'a' }],
    )

    const a = standings.find((r) => r.teamId === 'a')!
    const b = standings.find((r) => r.teamId === 'b')!

    expect(b.wins).toBe(1)
    expect(a.losses).toBe(1)
    expect(a.forfeits).toBe(1)
    // The forfeiting pair keeps none of the points it had scored.
    expect(a.pointsFor).toBe(0)
    expect(b.pointsFor).toBe(15)
  })

  it('ignores matches that are still in progress', () => {
    const standings = computeStandings(['a', 'b'], [played('a', 'b', 9, 7)])
    expect(standings.every((r) => r.played === 0)).toBe(true)
  })

  it('includes pairs that have not played yet', () => {
    const standings = computeStandings(['a', 'b', 'c'], [played('a', 'b', 15, 3)])
    expect(standings).toHaveLength(3)
    expect(standings.find((r) => r.teamId === 'c')).toMatchObject({
      played: 0,
      wins: 0,
    })
  })

  it('rejects matches referencing an unknown pair', () => {
    expect(() => computeStandings(['a', 'b'], [played('a', 'zz', 15, 3)])).toThrow(
      /unknown team/,
    )
  })

  it('rejects a pair playing itself', () => {
    expect(() => computeStandings(['a'], [played('a', 'a', 15, 3)])).toThrow(
      /cannot play itself/,
    )
  })

  it('assigns sequential ranks with no gaps', () => {
    const teams = pairs(11)
    const fixtures = generateRoundRobin(teams)
    const matches = fixtures.map((f, i) =>
      i % 2 === 0 ? played(f.teamA, f.teamB, 15, i % 15) : played(f.teamA, f.teamB, i % 15, 15),
    )
    const standings = computeStandings(teams, matches)
    expect(standings.map((r) => r.rank)).toEqual(
      Array.from({ length: 11 }, (_, i) => i + 1),
    )
  })
})

describe('knockout stage', () => {
  const standingsOf = (order: TeamId[]) =>
    order.map((teamId, i) => ({
      teamId,
      rank: i + 1,
      played: 10,
      wins: 10 - i,
      losses: i,
      forfeits: 0,
      pointsFor: 150,
      pointsAgainst: 100,
      pointDiff: 50,
      tiebreak: 'wins' as const,
      needsAdminDecision: false,
    }))

  it('qualifies only the top four pairs', () => {
    const standings = standingsOf(['a', 'b', 'c', 'd', 'e', 'f'])
    expect(qualifiers(standings).map((r) => r.teamId)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('seeds M1 as rank 1 v rank 4 and M2 as rank 2 v rank 3', () => {
    const bracket = generateKnockout(standingsOf(['a', 'b', 'c', 'd']))
    const m1 = bracket.find((f) => f.key === 'M1')!
    const m2 = bracket.find((f) => f.key === 'M2')!

    expect([m1.teamA, m1.teamB]).toEqual(['a', 'd'])
    expect([m2.teamA, m2.teamB]).toEqual(['b', 'c'])
    expect(m1.stage).toBe('semi')
  })

  it('leaves the final and third-place slots empty until the semis are played', () => {
    const bracket = generateKnockout(standingsOf(['a', 'b', 'c', 'd']))
    const final = bracket.find((f) => f.key === 'FINAL')!
    const third = bracket.find((f) => f.key === 'THIRD')!

    expect(final.teamA).toBeNull()
    expect(final.teamB).toBeNull()
    expect(third.teamA).toBeNull()
    expect(final.sourceA).toBe('Winner of M1')
    expect(third.sourceA).toBe('Loser of M1')
  })

  it('sends semi winners to the championship and losers to the battle for 3rd', () => {
    const bracket = generateKnockout(standingsOf(['a', 'b', 'c', 'd']), {
      m1: { teamA: 'a', teamB: 'd', pointsA: 21, pointsB: 18 },
      m2: { teamA: 'b', teamB: 'c', pointsA: 19, pointsB: 21 },
    })

    expect(bracket.find((f) => f.key === 'FINAL')).toMatchObject({
      teamA: 'a',
      teamB: 'c',
    })
    expect(bracket.find((f) => f.key === 'THIRD')).toMatchObject({
      teamA: 'd',
      teamB: 'b',
    })
  })

  it('honours a forfeit in the semi finals', () => {
    const bracket = generateKnockout(standingsOf(['a', 'b', 'c', 'd']), {
      m1: { teamA: 'a', teamB: 'd', pointsA: 0, pointsB: 0, forfeitedBy: 'a' },
    })
    expect(bracket.find((f) => f.key === 'FINAL')!.teamA).toBe('d')
    expect(bracket.find((f) => f.key === 'THIRD')!.teamA).toBe('a')
  })

  it('handles a division with fewer than four qualified pairs', () => {
    const bracket = generateKnockout(standingsOf(['a', 'b', 'c']))
    const m1 = bracket.find((f) => f.key === 'M1')!
    expect(m1.teamA).toBe('a')
    expect(m1.teamB).toBeNull()
  })

  it('uses 21 points, no deuce, for the semis by default', () => {
    // 21-20 is a completed game under the no-deuce rule.
    const bracket = generateKnockout(standingsOf(['a', 'b', 'c', 'd']), {
      m1: { teamA: 'a', teamB: 'd', pointsA: 21, pointsB: 20 },
    })
    expect(bracket.find((f) => f.key === 'FINAL')!.teamA).toBe('a')
  })
})

describe('finalPlacings', () => {
  it('resolves the full podium', () => {
    const placings = finalPlacings(
      { teamA: 'a', teamB: 'c', pointsA: 21, pointsB: 15 },
      { teamA: 'd', teamB: 'b', pointsA: 12, pointsB: 21 },
    )

    expect(placings).toEqual({
      champion: 'a',
      runnerUp: 'c',
      third: 'b',
      fourth: 'd',
    })
  })

  it('returns nulls before the matches are played', () => {
    expect(finalPlacings()).toEqual({
      champion: null,
      runnerUp: null,
      third: null,
      fourth: null,
    })
  })

  it('resolves the champion from a forfeited final', () => {
    const placings = finalPlacings({
      teamA: 'a',
      teamB: 'c',
      pointsA: 0,
      pointsB: 0,
      forfeitedBy: 'c',
    })
    expect(placings.champion).toBe('a')
    expect(placings.runnerUp).toBe('c')
  })
})

describe('full tournament simulation', () => {
  it('runs 11 pairs from round robin through to a champion', () => {
    const teams = pairs(11)
    const fixtures = generateRoundRobin(teams)
    expect(fixtures).toHaveLength(55)

    // Deterministic outcome: the lower-numbered pair always wins, so the
    // final ranking should follow entry order exactly.
    const matches: PlayedMatch[] = fixtures.map((f) => {
      const aWins = f.teamA < f.teamB
      return {
        teamA: f.teamA,
        teamB: f.teamB,
        pointsA: aWins ? 15 : 7,
        pointsB: aWins ? 7 : 15,
      }
    })

    const standings = computeStandings(teams, matches)
    expect(standings.map((r) => r.teamId)).toEqual(teams)
    expect(standings[0].wins).toBe(10)
    expect(standings[10].wins).toBe(0)
    expect(standings.every((r) => r.played === 10)).toBe(true)

    const bracket = generateKnockout(standings, {
      m1: { teamA: teams[0], teamB: teams[3], pointsA: 21, pointsB: 14 },
      m2: { teamA: teams[1], teamB: teams[2], pointsA: 21, pointsB: 19 },
    })

    const final = bracket.find((f) => f.key === 'FINAL')!
    const third = bracket.find((f) => f.key === 'THIRD')!

    const placings = finalPlacings(
      { teamA: final.teamA!, teamB: final.teamB!, pointsA: 21, pointsB: 17 },
      { teamA: third.teamA!, teamB: third.teamB!, pointsA: 21, pointsB: 12 },
    )

    expect(placings.champion).toBe(teams[0])
    expect(placings.runnerUp).toBe(teams[1])
    expect(placings.third).toBe(teams[3])
    expect(placings.fourth).toBe(teams[2])
  })
})

describe('retirements count towards the standings', () => {
  // A retirement stops mid-game and keeps the score actually played, so that
  // score is short of pointsToWin. Without an explicit winner the match looks
  // indistinguishable from one still in progress and gets skipped — which
  // would quietly cost a pair a win in the table that decides the top four.
  it('honours an explicit winner when the score is short of the target', () => {
    const match: PlayedMatch = { teamA: 'a', teamB: 'b', pointsA: 7, pointsB: 13, winner: 'b' }

    expect(matchWinner(match, DEFAULT_ELIMS_RULES)).toBe('b')
    // Without the explicit winner the same scoreline is undecidable.
    expect(matchWinner({ ...match, winner: undefined }, DEFAULT_ELIMS_RULES)).toBeNull()
  })

  it('awards the win to the pair that stayed on court, even if they were behind', () => {
    // The pair that retired was *ahead* at 13-7. The score must not decide it.
    const match: PlayedMatch = { teamA: 'a', teamB: 'b', pointsA: 13, pointsB: 7, winner: 'b' }
    expect(matchWinner(match, DEFAULT_ELIMS_RULES)).toBe('b')
  })

  it('includes the retired match in the table rather than dropping it', () => {
    const standings = computeStandings(
      ['a', 'b'],
      [{ teamA: 'a', teamB: 'b', pointsA: 7, pointsB: 13, winner: 'b' }],
      DEFAULT_ELIMS_RULES,
    )

    const a = standings.find((r) => r.teamId === 'a')!
    const b = standings.find((r) => r.teamId === 'b')!
    expect(b.wins).toBe(1)
    expect(a.losses).toBe(1)
    expect(b.played).toBe(1)
    // The played score is preserved — a retirement is not normalised the way
    // a forfeit is, and neither pair is credited with a forfeit.
    expect(b.pointsFor).toBe(13)
    expect(a.pointsFor).toBe(7)
    expect(a.forfeits).toBe(0)
  })

  it('still lets a forfeit take precedence over an explicit winner', () => {
    const match: PlayedMatch = {
      teamA: 'a',
      teamB: 'b',
      pointsA: 5,
      pointsB: 3,
      forfeitedBy: 'b',
      winner: 'b',
    }
    expect(matchWinner(match, DEFAULT_ELIMS_RULES)).toBe('a')
  })

  it('rejects a winner that is not in the match', () => {
    expect(() =>
      matchWinner({ teamA: 'a', teamB: 'b', pointsA: 7, pointsB: 13, winner: 'c' }),
    ).toThrow(/not a participant/)
  })
})
