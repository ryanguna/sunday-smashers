/**
 * Tournament draw, scoring and ranking engine for the Sunday Smashers
 * Christmas Mini Tournament.
 *
 * Draft rules (v1, from the admin team — configurable, not final):
 *   Eliminations : single round robin, first to 15 points, no deuce.
 *                  Ranking by number of wins, ties broken head-to-head.
 *   Semis        : top 4 pairs. M1 = Rank 1 v Rank 4, M2 = Rank 2 v Rank 3.
 *                  First to 21 points, no deuce.
 *   Finals       : M1/M2 losers play the Battle for 3rd, winners play the
 *                  Championship.
 *   Forfeit      : late or no-show is an automatic loss of that game.
 *
 * Every rule value is passed in as configuration so admins can change the
 * format without a code change.
 */

export type TeamId = string

export type MatchStage = 'elims' | 'semi' | 'third_place' | 'final'

/** A scheduled but not-yet-played fixture. */
export interface Fixture {
  round: number
  teamA: TeamId
  teamB: TeamId
}

/**
 * A played fixture. `forfeitedBy` marks the pair that forfeited (late or
 * no-show); the opponent wins regardless of the points recorded.
 */
export interface PlayedMatch {
  teamA: TeamId
  teamB: TeamId
  pointsA: number
  pointsB: number
  forfeitedBy?: TeamId | null
  /**
   * Explicit result, for matches the score alone cannot decide.
   *
   * A **retirement** stops mid-game and keeps the score actually played, so
   * that score is short of `pointsToWin` and `evaluateGame` correctly reports
   * the game as incomplete. Without this field such a match looks identical to
   * one still in progress and gets skipped, silently vanishing from the
   * standings — including from the win count that decides who makes the semis.
   *
   * Ignored when `forfeitedBy` is set, since a forfeit already names a loser.
   */
  winner?: TeamId | null
}

export interface StageRules {
  /** Points needed to win a game. 15 in elims, 21 in semis/finals. */
  pointsToWin: number
  /**
   * When false the first pair to reach `pointsToWin` wins immediately.
   * The draft rules say "no deuce", so this defaults to false.
   */
  deuce: boolean
  /** Hard ceiling when deuce is enabled (e.g. 30 in standard badminton). */
  cap?: number
}

export const DEFAULT_ELIMS_RULES: StageRules = { pointsToWin: 15, deuce: false }
export const DEFAULT_FINALS_RULES: StageRules = { pointsToWin: 21, deuce: false }

/** Score awarded to the non-forfeiting pair when a pair forfeits. */
export const DEFAULT_FORFEIT_SCORE = 15

// ---------------------------------------------------------------------------
// Round robin generation
// ---------------------------------------------------------------------------

/** Sentinel used by the circle method when there is an odd number of pairs. */
const BYE = Symbol('bye')
type Slot = TeamId | typeof BYE

/**
 * Generates a full single round robin: every pair meets every other pair
 * exactly once.
 *
 * The admin team's draft rules quote "10 games each pair", which is what a
 * full round robin produces with 11 pairs. Rather than truncating the draw to
 * hit a fixed number, we always play the complete round robin and let the
 * game count follow the entry count — see `gamesPerTeam`.
 *
 * Uses the circle method so each round contains disjoint fixtures, which lets
 * the scheduler run rounds concurrently across courts. With an odd number of
 * pairs one pair sits out each round.
 */
export function generateRoundRobin(teams: readonly TeamId[]): Fixture[] {
  assertUniqueTeams(teams)
  if (teams.length < 2) return []

  const slots: Slot[] = [...teams]
  if (slots.length % 2 !== 0) slots.push(BYE)

  const n = slots.length
  const rounds = n - 1
  const half = n / 2
  const fixtures: Fixture[] = []

  // Slot 0 is fixed; the remaining slots rotate one position each round.
  const rotating = slots.slice(1)

  for (let round = 0; round < rounds; round++) {
    const lineup: Slot[] = [slots[0], ...rotating]

    for (let i = 0; i < half; i++) {
      const home = lineup[i]
      const away = lineup[n - 1 - i]
      if (home === BYE || away === BYE) continue

      // Alternate sides each round so no pair is always listed first.
      const flip = round % 2 === 1
      fixtures.push({
        round: round + 1,
        teamA: flip ? away : home,
        teamB: flip ? home : away,
      })
    }

    rotating.unshift(rotating.pop() as Slot)
  }

  return fixtures
}

/** Games each pair plays in a full single round robin. */
export function gamesPerTeam(teamCount: number): number {
  return teamCount < 2 ? 0 : teamCount - 1
}

/** Total fixtures in a full single round robin. */
export function totalRoundRobinMatches(teamCount: number): number {
  return teamCount < 2 ? 0 : (teamCount * (teamCount - 1)) / 2
}

// ---------------------------------------------------------------------------
// Game scoring
// ---------------------------------------------------------------------------

export interface GameState {
  complete: boolean
  /** 'a' | 'b' | null — null while the game is still in progress. */
  winner: 'a' | 'b' | null
}

/**
 * Decides whether a game has been won under the given rules.
 *
 * With `deuce: false` (the draft rules) the first pair to reach the target
 * wins immediately — reaching 15 beats an opponent on 14.
 */
export function evaluateGame(
  pointsA: number,
  pointsB: number,
  rules: StageRules = DEFAULT_ELIMS_RULES,
): GameState {
  if (pointsA < 0 || pointsB < 0) {
    throw new Error('Scores cannot be negative')
  }

  const { pointsToWin, deuce } = rules

  if (!deuce) {
    if (pointsA >= pointsToWin && pointsA > pointsB) return { complete: true, winner: 'a' }
    if (pointsB >= pointsToWin && pointsB > pointsA) return { complete: true, winner: 'b' }
    return { complete: false, winner: null }
  }

  const cap = rules.cap ?? pointsToWin + 9
  const leader = pointsA > pointsB ? 'a' : pointsB > pointsA ? 'b' : null
  if (!leader) return { complete: false, winner: null }

  const high = Math.max(pointsA, pointsB)
  const margin = Math.abs(pointsA - pointsB)

  if (high >= cap) return { complete: true, winner: leader }
  if (high >= pointsToWin && margin >= 2) return { complete: true, winner: leader }
  return { complete: false, winner: null }
}

/** Convenience: the winning team id of a played match, honouring forfeits. */
export function matchWinner(match: PlayedMatch, rules?: StageRules): TeamId | null {
  if (match.forfeitedBy) {
    if (match.forfeitedBy === match.teamA) return match.teamB
    if (match.forfeitedBy === match.teamB) return match.teamA
    throw new Error(
      `forfeitedBy "${match.forfeitedBy}" is not a participant of this match`,
    )
  }

  // An explicitly recorded winner beats anything derived from the score. This
  // is what lets a retirement count: the score is legitimately short of the
  // target, so deriving would report "not finished yet" and drop the match.
  if (match.winner) {
    if (match.winner !== match.teamA && match.winner !== match.teamB) {
      throw new Error(`winner "${match.winner}" is not a participant of this match`)
    }
    return match.winner
  }

  if (rules) {
    const state = evaluateGame(match.pointsA, match.pointsB, rules)
    if (!state.complete) return null
    return state.winner === 'a' ? match.teamA : match.teamB
  }

  if (match.pointsA === match.pointsB) return null
  return match.pointsA > match.pointsB ? match.teamA : match.teamB
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

export type TiebreakReason =
  | 'wins'
  | 'head_to_head'
  | 'mini_league'
  | 'head_to_head_points'
  | 'point_difference'
  | 'points_scored'
  | 'unresolved'

export interface StandingRow {
  teamId: TeamId
  rank: number
  played: number
  wins: number
  losses: number
  forfeits: number
  pointsFor: number
  pointsAgainst: number
  pointDiff: number
  /** Why this row sits above the next one. */
  tiebreak: TiebreakReason
  /**
   * True when the position could not be separated by any rule and needs an
   * admin decision (e.g. a head-to-head cycle with identical point records).
   */
  needsAdminDecision: boolean
}

/**
 * Ranks pairs after the round robin.
 *
 * Order of precedence:
 *   1. Number of wins (the rule the admin team specified).
 *   2. Head to head — for a two-way tie, the winner of their meeting.
 *      For three or more tied pairs, a mini league of wins among only the
 *      tied pairs. This is where cycles (A beat B, B beat C, C beat A) appear.
 *   3. Point difference across all games.
 *   4. Points scored across all games.
 *   5. Unresolved — flagged for an admin decision (coin toss).
 */
export function computeStandings(
  teams: readonly TeamId[],
  matches: readonly PlayedMatch[],
  rules: StageRules = DEFAULT_ELIMS_RULES,
): StandingRow[] {
  assertUniqueTeams(teams)
  const known = new Set(teams)

  const rows = new Map<TeamId, StandingRow>(
    teams.map((teamId) => [
      teamId,
      {
        teamId,
        rank: 0,
        played: 0,
        wins: 0,
        losses: 0,
        forfeits: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDiff: 0,
        tiebreak: 'wins' as TiebreakReason,
        needsAdminDecision: false,
      },
    ]),
  )

  for (const match of matches) {
    if (!known.has(match.teamA) || !known.has(match.teamB)) {
      throw new Error(
        `Match references unknown team: ${match.teamA} vs ${match.teamB}`,
      )
    }
    if (match.teamA === match.teamB) {
      throw new Error(`A pair cannot play itself: ${match.teamA}`)
    }

    const winner = matchWinner(match, match.forfeitedBy ? undefined : rules)
    if (winner === null) continue // still in progress — ignore

    const a = rows.get(match.teamA)!
    const b = rows.get(match.teamB)!

    // A forfeit is recorded as a loss with the standard forfeit scoreline so
    // the forfeiting pair does not benefit from points already played.
    let pointsA = match.pointsA
    let pointsB = match.pointsB
    if (match.forfeitedBy) {
      const forfeitScore = rules.pointsToWin || DEFAULT_FORFEIT_SCORE
      pointsA = match.forfeitedBy === match.teamA ? 0 : forfeitScore
      pointsB = match.forfeitedBy === match.teamB ? 0 : forfeitScore
      if (match.forfeitedBy === match.teamA) a.forfeits++
      else b.forfeits++
    }

    a.played++
    b.played++
    a.pointsFor += pointsA
    a.pointsAgainst += pointsB
    b.pointsFor += pointsB
    b.pointsAgainst += pointsA

    if (winner === match.teamA) {
      a.wins++
      b.losses++
    } else {
      b.wins++
      a.losses++
    }
  }

  for (const row of rows.values()) {
    row.pointDiff = row.pointsFor - row.pointsAgainst
  }

  const ordered = rankRows([...rows.values()], matches, rules)
  ordered.forEach((row, index) => {
    row.rank = index + 1
  })
  return ordered
}

function rankRows(
  rows: StandingRow[],
  matches: readonly PlayedMatch[],
  rules: StageRules,
): StandingRow[] {
  // Group by win count first, then resolve each tied cluster independently.
  const byWins = new Map<number, StandingRow[]>()
  for (const row of rows) {
    const bucket = byWins.get(row.wins)
    if (bucket) bucket.push(row)
    else byWins.set(row.wins, [row])
  }

  const winCounts = [...byWins.keys()].sort((x, y) => y - x)
  const result: StandingRow[] = []

  for (const wins of winCounts) {
    const cluster = byWins.get(wins)!
    if (cluster.length === 1) {
      cluster[0].tiebreak = 'wins'
      result.push(cluster[0])
      continue
    }
    result.push(...breakTie(cluster, matches, rules))
  }

  return result
}

function breakTie(
  cluster: StandingRow[],
  matches: readonly PlayedMatch[],
  rules: StageRules,
): StandingRow[] {
  const tiedIds = new Set(cluster.map((r) => r.teamId))
  const isTwoWay = cluster.length === 2

  // Mini league: wins counted only from games between the tied pairs.
  const miniWins = new Map<TeamId, number>(cluster.map((r) => [r.teamId, 0]))
  const miniDiff = new Map<TeamId, number>(cluster.map((r) => [r.teamId, 0]))

  for (const match of matches) {
    if (!tiedIds.has(match.teamA) || !tiedIds.has(match.teamB)) continue
    const winner = matchWinner(match, match.forfeitedBy ? undefined : rules)
    if (winner === null) continue
    miniWins.set(winner, (miniWins.get(winner) ?? 0) + 1)

    const diff = match.pointsA - match.pointsB
    miniDiff.set(match.teamA, (miniDiff.get(match.teamA) ?? 0) + diff)
    miniDiff.set(match.teamB, (miniDiff.get(match.teamB) ?? 0) - diff)
  }

  /**
   * Applied in order until one separates the pairs. `reason` is used for a
   * cluster of three or more; `twoWayReason` for a straight two-way tie,
   * where the mini league is simply the single match they played.
   */
  const comparatorChain: {
    reason: TiebreakReason
    twoWayReason: TiebreakReason
    compare: (a: StandingRow, b: StandingRow) => number
  }[] = [
    {
      reason: 'mini_league',
      twoWayReason: 'head_to_head',
      compare: (a, b) => (miniWins.get(b.teamId) ?? 0) - (miniWins.get(a.teamId) ?? 0),
    },
    {
      reason: 'head_to_head_points',
      twoWayReason: 'head_to_head',
      compare: (a, b) => (miniDiff.get(b.teamId) ?? 0) - (miniDiff.get(a.teamId) ?? 0),
    },
    {
      reason: 'point_difference',
      twoWayReason: 'point_difference',
      compare: (a, b) => b.pointDiff - a.pointDiff,
    },
    {
      reason: 'points_scored',
      twoWayReason: 'points_scored',
      compare: (a, b) => b.pointsFor - a.pointsFor,
    },
  ]

  const sorted = [...cluster].sort((a, b) => {
    for (const step of comparatorChain) {
      const delta = step.compare(a, b)
      if (delta !== 0) return delta
    }
    // Stable, deterministic last resort so the UI never reorders randomly.
    return a.teamId.localeCompare(b.teamId)
  })

  // Annotate each row with the rule that separated it from the next one.
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i]
    const next = sorted[i + 1]
    if (!next) {
      row.tiebreak = isTwoWay ? 'head_to_head' : 'mini_league'
      continue
    }

    const step = comparatorChain.find((s) => s.compare(row, next) !== 0)
    if (step) {
      row.tiebreak = isTwoWay ? step.twoWayReason : step.reason
    } else {
      row.tiebreak = 'unresolved'
      row.needsAdminDecision = true
      next.needsAdminDecision = true
    }
  }

  return sorted
}

// ---------------------------------------------------------------------------
// Knockout stage
// ---------------------------------------------------------------------------

export interface KnockoutFixture {
  key: 'M1' | 'M2' | 'THIRD' | 'FINAL'
  stage: MatchStage
  label: string
  /** Resolved team ids, or null while the feeding match is undecided. */
  teamA: TeamId | null
  teamB: TeamId | null
  /** Human-readable source, e.g. "Rank 1" or "Winner of M1". */
  sourceA: string
  sourceB: string
}

export const QUALIFYING_PLACES = 4

/** The top N pairs that qualify for the semi finals. */
export function qualifiers(
  standings: readonly StandingRow[],
  places: number = QUALIFYING_PLACES,
): StandingRow[] {
  return standings.slice(0, places)
}

/**
 * Builds the semi final and final fixtures.
 *
 * M1 = Rank 1 v Rank 4, M2 = Rank 2 v Rank 3. The losers meet in the Battle
 * for 3rd and the winners in the Championship. Pass `results` as semis are
 * played to fill in the final and third-place fixtures.
 */
export function generateKnockout(
  standings: readonly StandingRow[],
  results?: { m1?: PlayedMatch; m2?: PlayedMatch },
  rules: StageRules = DEFAULT_FINALS_RULES,
): KnockoutFixture[] {
  const top = qualifiers(standings)
  const at = (i: number): TeamId | null => top[i]?.teamId ?? null

  const m1Winner = results?.m1 ? matchWinner(results.m1, rules) : null
  const m2Winner = results?.m2 ? matchWinner(results.m2, rules) : null
  const loserOf = (match: PlayedMatch | undefined, winner: TeamId | null) => {
    if (!match || !winner) return null
    return winner === match.teamA ? match.teamB : match.teamA
  }

  return [
    {
      key: 'M1',
      stage: 'semi',
      label: 'Semi Final 1',
      teamA: at(0),
      teamB: at(3),
      sourceA: 'Rank 1',
      sourceB: 'Rank 4',
    },
    {
      key: 'M2',
      stage: 'semi',
      label: 'Semi Final 2',
      teamA: at(1),
      teamB: at(2),
      sourceA: 'Rank 2',
      sourceB: 'Rank 3',
    },
    {
      key: 'THIRD',
      stage: 'third_place',
      label: 'Battle for 3rd',
      teamA: loserOf(results?.m1, m1Winner),
      teamB: loserOf(results?.m2, m2Winner),
      sourceA: 'Loser of M1',
      sourceB: 'Loser of M2',
    },
    {
      key: 'FINAL',
      stage: 'final',
      label: 'Championship',
      teamA: m1Winner,
      teamB: m2Winner,
      sourceA: 'Winner of M1',
      sourceB: 'Winner of M2',
    },
  ]
}

export interface FinalPlacings {
  champion: TeamId | null
  runnerUp: TeamId | null
  third: TeamId | null
  fourth: TeamId | null
}

/** Resolves the podium once the final and third-place matches are played. */
export function finalPlacings(
  finalMatch?: PlayedMatch,
  thirdPlaceMatch?: PlayedMatch,
  rules: StageRules = DEFAULT_FINALS_RULES,
): FinalPlacings {
  const championshipWinner = finalMatch ? matchWinner(finalMatch, rules) : null
  const thirdWinner = thirdPlaceMatch ? matchWinner(thirdPlaceMatch, rules) : null

  const other = (match: PlayedMatch | undefined, winner: TeamId | null) => {
    if (!match || !winner) return null
    return winner === match.teamA ? match.teamB : match.teamA
  }

  return {
    champion: championshipWinner,
    runnerUp: other(finalMatch, championshipWinner),
    third: thirdWinner,
    fourth: other(thirdPlaceMatch, thirdWinner),
  }
}

// ---------------------------------------------------------------------------

function assertUniqueTeams(teams: readonly TeamId[]): void {
  const seen = new Set<TeamId>()
  for (const team of teams) {
    if (seen.has(team)) throw new Error(`Duplicate team in draw: ${team}`)
    seen.add(team)
  }
}
