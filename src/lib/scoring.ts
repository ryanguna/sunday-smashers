/**
 * The courtside scoring state machine.
 *
 * This is the brain behind `/scoring/[matchId]` — the screen a player-turned
 * umpire holds at the side of a court with cold hands and flaky venue wifi.
 * Everything in this module is **pure**: no React, no Supabase, no
 * `next/headers`, no wall-clock reads. That means it can be unit tested
 * exhaustively (`./scoring.test.ts`) and safely bundled into a Client
 * Component.
 *
 * Design decisions that matter:
 *
 *   1. **The rally log is the state.** A score is never stored as a pair of
 *      numbers we mutate; it is *derived* by replaying an append-only list of
 *      rallies. Undo is therefore "drop the last rally", correcting a rally
 *      from five points ago is "remove/replace rally #n", and both recompute
 *      the score AND the serve rotation for free. Mis-taps are inevitable, so
 *      this is the single most important property of the design.
 *
 *   2. **Rules always come from the match record.** `pointsToWin`,
 *      `deuceEnabled` and `cap` are read off the fixture and handed to
 *      `evaluateGame()` in `@/lib/draw` — the source of truth the tournament
 *      already uses for standings. Nothing here hardcodes 15 or 21.
 *
 *   3. **A `baseline`** lets the console pick up a match that already has a
 *      score on the server but no local rally history (page reload, handover
 *      to another phone). Points below the baseline cannot be undone, and the
 *      umpire can correct the serving side/positions by hand, because who was
 *      serving at 8–6 is genuinely unknowable from a bare score.
 *
 *   4. **Serve rotation is derived, not stored.** BWF doubles rotation is a
 *      pure function of (first server, rally winners): the serving side's
 *      score decides the service court (even → right), the serving pair swap
 *      courts each time they win, and the receiving pair never swap. The
 *      schema needs no serve columns as a result.
 */

import { evaluateGame, type StageRules, type TeamId } from '@/lib/draw'
import { compareByStartTime, type DutyRole, type PlayerIdentity } from '@/lib/dashboard'
import { isMatchDecided, type PublicMatch, type PublicTeam } from '@/lib/public-data'
import type { MatchStatus, ScoreEventRow } from '@/lib/supabase/types'

// ---------------------------------------------------------------------------
// Core vocabulary
// ---------------------------------------------------------------------------

/** Which pair a point, serve or ending belongs to. Matches `score_events.side`. */
export type ScoringSide = 'a' | 'b'

/** The two service courts. Even score serves from the right, odd from the left. */
export type ServiceCourt = 'right' | 'left'

export const SCORING_SIDES: readonly ScoringSide[] = ['a', 'b']

/** The other pair. */
export function otherSide(side: ScoringSide): ScoringSide {
  return side === 'a' ? 'b' : 'a'
}

export interface ScoringPlayer {
  id: string
  name: string
}

/** One pair as the console knows them. `players` is in court order at the start. */
export interface ScoringTeam {
  id: TeamId | null
  name: string
  players: readonly ScoringPlayer[]
}

/**
 * Points already on the board before the local rally log starts, plus who was
 * serving at that moment. Defaults to a clean 0–0 with side A to serve.
 */
export interface ScoringBaseline {
  scoreA: number
  scoreB: number
  servingSide: ScoringSide
  /** Player ids in `[right court, left court]` order at the baseline. */
  positionsA: readonly [string, string] | null
  positionsB: readonly [string, string] | null
}

export interface MatchScoringConfig {
  matchId: string
  /** Read straight off the match/division record — never hardcoded. */
  rules: StageRules
  teamA: ScoringTeam
  teamB: ScoringTeam
  baseline: ScoringBaseline
}

/** One recorded rally. `at` is injected by the caller — this module never reads a clock. */
export interface RallyEvent {
  /** 1-based position in the local log. Renumbered whenever a rally is removed. */
  seq: number
  side: ScoringSide
  at: number | null
}

/** How a match ended other than by someone reaching the target score. */
export type MatchEndKind = 'forfeit' | 'walkover' | 'retired'

export interface MatchEnding {
  kind: MatchEndKind
  /** The pair that forfeited / didn't show / retired. The other pair wins. */
  side: ScoringSide
  reason: string
  at: number | null
}

/** The whole serialisable state of a scoring session. */
export interface ScoringState {
  config: MatchScoringConfig
  rallies: readonly RallyEvent[]
  ending: MatchEnding | null
}

/** How the match finished. `'points'` is the happy path. */
export type MatchOutcome = 'in_progress' | 'points' | MatchEndKind

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export const EMPTY_BASELINE: ScoringBaseline = {
  scoreA: 0,
  scoreB: 0,
  servingSide: 'a',
  positionsA: null,
  positionsB: null,
}

/** `StageRules` for a match, taken from its own record. Never assumes 15 or 21. */
export function rulesFromMatch(match: {
  pointsToWin: number
  deuce?: boolean
  deuceEnabled?: boolean
  cap?: number | null
}): StageRules {
  const deuce = match.deuceEnabled ?? match.deuce ?? false
  const rules: StageRules = { pointsToWin: match.pointsToWin, deuce }
  if (match.cap != null) rules.cap = match.cap
  return rules
}

export interface CreateScoringConfigInput {
  matchId: string
  rules: StageRules
  teamA: ScoringTeam
  teamB: ScoringTeam
  baseline?: Partial<ScoringBaseline>
}

export function createScoringConfig(input: CreateScoringConfigInput): MatchScoringConfig {
  return {
    matchId: input.matchId,
    rules: input.rules,
    teamA: input.teamA,
    teamB: input.teamB,
    baseline: { ...EMPTY_BASELINE, ...input.baseline },
  }
}

export function createScoringState(
  config: MatchScoringConfig,
  init?: { rallies?: readonly RallyEvent[]; ending?: MatchEnding | null },
): ScoringState {
  return {
    config,
    rallies: renumber(init?.rallies ?? []),
    ending: init?.ending ?? null,
  }
}

/**
 * Builds a console config from a public fixture. Rules come straight off the
 * record — `pointsToWin`, `deuce` and `cap` — so nothing here assumes 15 or 21.
 * `options.cap` exists only to override a fixture that has no cap of its own.
 */
export function scoringConfigFromMatch(
  match: PublicMatch,
  options?: {
    cap?: number | null
    firstServer?: ScoringSide
    useCurrentScore?: boolean
  },
): MatchScoringConfig {
  const useCurrent = options?.useCurrentScore ?? true
  return createScoringConfig({
    matchId: match.id,
    rules: rulesFromMatch({
      pointsToWin: match.pointsToWin,
      deuce: match.deuce,
      cap: options?.cap ?? match.cap,
    }),
    teamA: toScoringTeam(match.teamA, match.sourceA, 'Pair A'),
    teamB: toScoringTeam(match.teamB, match.sourceB, 'Pair B'),
    baseline: {
      scoreA: useCurrent ? match.scoreA : 0,
      scoreB: useCurrent ? match.scoreB : 0,
      servingSide: options?.firstServer ?? 'a',
    },
  })
}

function toScoringTeam(
  team: PublicTeam | null,
  source: string | null,
  fallback: string,
): ScoringTeam {
  return {
    id: team?.id ?? null,
    name: team?.name ?? source ?? fallback,
    players: team?.players ?? [],
  }
}

export function teamForSide(config: MatchScoringConfig, side: ScoringSide): ScoringTeam {
  return side === 'a' ? config.teamA : config.teamB
}

/** "Candy Cane Crew" — the pair on that side of the console. */
export function sideName(config: MatchScoringConfig, side: ScoringSide): string {
  return teamForSide(config, side).name
}

// ---------------------------------------------------------------------------
// Serve tracking (BWF doubles rotation)
// ---------------------------------------------------------------------------

export interface ServeState {
  servingSide: ScoringSide
  /** Player id of the server, or `''` when the pair's line-up is unknown. */
  serverId: string
  serverName: string
  receiverId: string
  receiverName: string
  /** Which service court the serve is delivered from. */
  court: ServiceCourt
  /** Current `[right, left]` court occupancy per side, by player id. */
  positionsA: readonly [string, string]
  positionsB: readonly [string, string]
}

function defaultPositions(team: ScoringTeam): [string, string] {
  return [team.players[0]?.id ?? '', team.players[1]?.id ?? '']
}

function nameOf(team: ScoringTeam, playerId: string): string {
  return team.players.find((p) => p.id === playerId)?.name ?? ''
}

interface Replay {
  scoreA: number
  scoreB: number
  servingSide: ScoringSide
  positionsA: [string, string]
  positionsB: [string, string]
}

function baselineReplay(config: MatchScoringConfig): Replay {
  const { baseline } = config
  return {
    scoreA: baseline.scoreA,
    scoreB: baseline.scoreB,
    servingSide: baseline.servingSide,
    positionsA: baseline.positionsA
      ? [baseline.positionsA[0], baseline.positionsA[1]]
      : defaultPositions(config.teamA),
    positionsB: baseline.positionsB
      ? [baseline.positionsB[0], baseline.positionsB[1]]
      : defaultPositions(config.teamB),
  }
}

/** Applies one rally to a replay state, in place. */
function stepReplay(state: Replay, rally: RallyEvent): void {
  if (rally.side === 'a') state.scoreA++
  else state.scoreB++

  if (rally.side === state.servingSide) {
    // The serving pair held serve, so they swap service courts and the same
    // player serves again from the other side.
    if (rally.side === 'a') state.positionsA = [state.positionsA[1], state.positionsA[0]]
    else state.positionsB = [state.positionsB[1], state.positionsB[0]]
  } else {
    // Serve passes over. The receiving pair never swap positions.
    state.servingSide = rally.side
  }
}

function replay(config: MatchScoringConfig, rallies: readonly RallyEvent[]): Replay {
  const state = baselineReplay(config)
  for (const rally of rallies) stepReplay(state, rally)
  return state
}

function serveFromReplay(config: MatchScoringConfig, state: Replay): ServeState {
  const servingScore = state.servingSide === 'a' ? state.scoreA : state.scoreB
  const court: ServiceCourt = servingScore % 2 === 0 ? 'right' : 'left'
  const slot = court === 'right' ? 0 : 1

  const servingTeam = teamForSide(config, state.servingSide)
  const receivingTeam = teamForSide(config, otherSide(state.servingSide))
  const servingPositions = state.servingSide === 'a' ? state.positionsA : state.positionsB
  const receivingPositions = state.servingSide === 'a' ? state.positionsB : state.positionsA

  const serverId = servingPositions[slot] ?? ''
  // The receiver stands diagonally opposite, which is the same-named service
  // court on their own side.
  const receiverId = receivingPositions[slot] ?? ''

  return {
    servingSide: state.servingSide,
    serverId,
    serverName: nameOf(servingTeam, serverId),
    receiverId,
    receiverName: nameOf(receivingTeam, receiverId),
    court,
    positionsA: state.positionsA,
    positionsB: state.positionsB,
  }
}

// ---------------------------------------------------------------------------
// Derived scoreboard
// ---------------------------------------------------------------------------

export interface ScoreboardState {
  matchId: string
  scoreA: number
  scoreB: number
  /** Score attributed to each side once forfeits/walkovers are applied. */
  awardedA: number
  awardedB: number
  serve: ServeState
  /** The side one rally away from winning, or `null`. */
  gamePointFor: ScoringSide | null
  /** Both pairs on game point at once (only reachable with deuce + cap). */
  doubleGamePoint: boolean
  /** True when the pair on game point would also win the match by taking it. */
  matchPoint: boolean
  complete: boolean
  winner: ScoringSide | null
  outcome: MatchOutcome
  ending: MatchEnding | null
  /** False at the baseline — there is nothing left to take back. */
  canUndo: boolean
  /** Rallies recorded on this device (excludes anything below the baseline). */
  ralliesPlayed: number
  /** Total rallies including the baseline — what the scoresheet calls "points played". */
  totalPoints: number
  pointsToWin: number
  deuceEnabled: boolean
  cap: number | null
}

export function deriveScoreboard(state: ScoringState): ScoreboardState {
  const { config, rallies, ending } = state
  const played = replay(config, rallies)
  const serve = serveFromReplay(config, played)
  const { rules } = config

  const game = evaluateGame(played.scoreA, played.scoreB, rules)

  let winner: ScoringSide | null = game.winner
  let outcome: MatchOutcome = game.complete ? 'points' : 'in_progress'
  let awardedA = played.scoreA
  let awardedB = played.scoreB

  if (ending) {
    winner = otherSide(ending.side)
    outcome = ending.kind
    if (ending.kind === 'forfeit' || ending.kind === 'walkover') {
      // A forfeit or no-show is scored as a clean win to the target, matching
      // how `computeStandings` normalises it in `@/lib/draw`.
      awardedA = ending.side === 'a' ? 0 : rules.pointsToWin
      awardedB = ending.side === 'b' ? 0 : rules.pointsToWin
    }
  }

  const complete = ending != null || game.complete

  let gamePointFor: ScoringSide | null = null
  let doubleGamePoint = false
  if (!complete) {
    const aWouldWin = evaluateGame(played.scoreA + 1, played.scoreB, rules)
    const bWouldWin = evaluateGame(played.scoreA, played.scoreB + 1, rules)
    const aOnPoint = aWouldWin.complete && aWouldWin.winner === 'a'
    const bOnPoint = bWouldWin.complete && bWouldWin.winner === 'b'
    doubleGamePoint = aOnPoint && bOnPoint
    if (aOnPoint && bOnPoint) gamePointFor = serve.servingSide
    else if (aOnPoint) gamePointFor = 'a'
    else if (bOnPoint) gamePointFor = 'b'
  }

  return {
    matchId: config.matchId,
    scoreA: played.scoreA,
    scoreB: played.scoreB,
    awardedA,
    awardedB,
    serve,
    gamePointFor,
    doubleGamePoint,
    // Every fixture in this tournament is a single game, so game point and
    // match point are the same moment. Kept separate so a best-of-three
    // format can change one without the other.
    matchPoint: gamePointFor != null,
    complete,
    winner,
    outcome,
    ending,
    canUndo: rallies.length > 0,
    ralliesPlayed: rallies.length,
    totalPoints: played.scoreA + played.scoreB,
    pointsToWin: rules.pointsToWin,
    deuceEnabled: rules.deuce,
    cap: rules.cap ?? null,
  }
}

/** Score for one side, honouring forfeit/walkover awards. */
export function scoreForSide(board: ScoreboardState, side: ScoringSide): number {
  return side === 'a' ? board.awardedA : board.awardedB
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type ScoringAction =
  /** Award the rally to a pair. Ignored once the match is complete. */
  | { type: 'point'; side: ScoringSide; at?: number | null }
  /** Take back the most recent rally. A no-op at the baseline. */
  | { type: 'undo' }
  /** Delete one rally from the middle of the log and replay everything after it. */
  | { type: 'remove_rally'; seq: number }
  /** Re-award a rally to the other pair — the "I tapped the wrong side" fix. */
  | { type: 'correct_rally'; seq: number; side: ScoringSide }
  /** Forfeit, walkover or retirement. */
  | {
      type: 'end_match'
      kind: MatchEndKind
      side: ScoringSide
      reason?: string
      at?: number | null
    }
  /** Undo an ending and carry on playing. */
  | { type: 'resume' }
  /** Correct who is serving when the console picked up a match mid-game. */
  | { type: 'set_serving_side'; side: ScoringSide }
  /** Correct which of a pair is standing in the right service court. */
  | { type: 'swap_serve_positions'; side: ScoringSide }
  /** Wipe the local rally log back to the baseline. */
  | { type: 'reset' }
  /** Replace the session wholesale — used to restore an unsent local log. */
  | { type: 'load'; snapshot: ScoringSnapshot }

function renumber(rallies: readonly RallyEvent[]): RallyEvent[] {
  return rallies.map((rally, index) => ({ ...rally, seq: index + 1 }))
}

/** True when a point may still be recorded — the console stops at the target. */
export function canRecordPoint(state: ScoringState): boolean {
  return !deriveScoreboard(state).complete
}

/**
 * The state machine. Every transition returns a brand new state (or the same
 * reference when the action was a no-op) so React sees an honest change.
 */
export function scoringReducer(state: ScoringState, action: ScoringAction): ScoringState {
  switch (action.type) {
    case 'point': {
      if (deriveScoreboard(state).complete) return state
      const rally: RallyEvent = {
        seq: state.rallies.length + 1,
        side: action.side,
        at: action.at ?? null,
      }
      return { ...state, rallies: [...state.rallies, rally] }
    }

    case 'undo': {
      if (state.ending) return { ...state, ending: null }
      if (state.rallies.length === 0) return state
      return { ...state, rallies: state.rallies.slice(0, -1) }
    }

    case 'remove_rally': {
      if (!state.rallies.some((r) => r.seq === action.seq)) return state
      return {
        ...state,
        rallies: renumber(state.rallies.filter((r) => r.seq !== action.seq)),
      }
    }

    case 'correct_rally': {
      const target = state.rallies.find((r) => r.seq === action.seq)
      if (!target || target.side === action.side) return state
      return {
        ...state,
        rallies: state.rallies.map((r) => (r.seq === action.seq ? { ...r, side: action.side } : r)),
      }
    }

    case 'end_match': {
      return {
        ...state,
        ending: {
          kind: action.kind,
          side: action.side,
          reason: action.reason?.trim() ?? '',
          at: action.at ?? null,
        },
      }
    }

    case 'resume':
      return state.ending ? { ...state, ending: null } : state

    case 'set_serving_side': {
      // A statement about who served at the baseline. Once rallies have been
      // recorded the current server is fully determined by who won them, so
      // the console only offers this control before the first rally — a
      // mid-game serve error is really a mis-recorded rally, fixed in the
      // rally history instead.
      if (state.config.baseline.servingSide === action.side) return state
      return {
        ...state,
        config: {
          ...state.config,
          baseline: { ...state.config.baseline, servingSide: action.side },
        },
      }
    }

    case 'swap_serve_positions': {
      const { baseline } = state.config
      const team = teamForSide(state.config, action.side)
      const current =
        (action.side === 'a' ? baseline.positionsA : baseline.positionsB) ?? defaultPositions(team)
      const swapped: [string, string] = [current[1], current[0]]
      return {
        ...state,
        config: {
          ...state.config,
          baseline: {
            ...baseline,
            positionsA: action.side === 'a' ? swapped : baseline.positionsA,
            positionsB: action.side === 'b' ? swapped : baseline.positionsB,
          },
        },
      }
    }

    case 'reset':
      return { ...state, rallies: [], ending: null }

    case 'load':
      return fromSnapshot(state.config, action.snapshot)

    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Rally history — an umpire correcting a point from several rallies ago
// ---------------------------------------------------------------------------

export interface RallyHistoryRow {
  seq: number
  side: ScoringSide
  /** Score immediately after this rally. */
  scoreA: number
  scoreB: number
  /** The pair that won the rally. */
  teamName: string
  /** "8–6 to Candy Cane Crew". */
  label: string
  /** Who was serving *for* this rally, before it was played. */
  servedBy: ScoringSide
  at: number | null
  /** True for the most recent rally — the one a plain Undo removes. */
  latest: boolean
}

/**
 * Newest rally first, which is the order an umpire scans it in. Single pass —
 * the replay is stepped forward one rally at a time.
 */
export function rallyHistory(state: ScoringState): RallyHistoryRow[] {
  const { config } = state
  const running = baselineReplay(config)
  const rows: RallyHistoryRow[] = []

  for (let i = 0; i < state.rallies.length; i++) {
    const rally = state.rallies[i]
    const servedBy = running.servingSide
    stepReplay(running, rally)
    rows.push({
      seq: rally.seq,
      side: rally.side,
      scoreA: running.scoreA,
      scoreB: running.scoreB,
      teamName: sideName(config, rally.side),
      label: `${running.scoreA}–${running.scoreB} to ${sideName(config, rally.side)}`,
      servedBy,
      at: rally.at,
      latest: i === state.rallies.length - 1,
    })
  }

  return rows.reverse()
}

// ---------------------------------------------------------------------------
// Announcements — the umpire's voice, and the screen reader's
// ---------------------------------------------------------------------------

export const MATCH_END_KINDS: readonly {
  kind: MatchEndKind
  label: string
  blurb: string
}[] = [
  {
    kind: 'forfeit',
    label: 'Forfeit',
    blurb: 'Late to court or refused to play — automatic loss of the game.',
  },
  {
    kind: 'walkover',
    label: 'Walkover (no-show)',
    blurb: 'The pair never arrived, so the game was never started.',
  },
  {
    kind: 'retired',
    label: 'Retired',
    blurb: 'Injury or illness part-way through — the score so far stands.',
  },
]

export function endKindLabel(kind: MatchEndKind): string {
  return MATCH_END_KINDS.find((k) => k.kind === kind)?.label ?? kind
}

/** "Serving: Ivy Novak, right court" — mirrors the TV scoreboard indicator. */
export function serveSummary(board: ScoreboardState, config: MatchScoringConfig): string {
  const team = sideName(config, board.serve.servingSide)
  const who = board.serve.serverName ? `${board.serve.serverName} (${team})` : team
  return `Serving: ${who}, ${board.serve.court} service court`
}

/** The rule line, straight from the match record. */
export function rulesSummary(board: ScoreboardState): string {
  const base = `First to ${board.pointsToWin}`
  if (!board.deuceEnabled) return `${base} — no deuce`
  return board.cap != null ? `${base} — deuce, capped at ${board.cap}` : `${base} — deuce`
}

/** The big banner above the score: game point, match won, forfeit, or the rules. */
export function scoreHeadline(board: ScoreboardState, config: MatchScoringConfig): string {
  if (board.complete && board.winner) {
    const winner = sideName(config, board.winner)
    if (board.outcome === 'walkover') return `Walkover — ${winner} win`
    if (board.outcome === 'forfeit') return `Forfeit — ${winner} win`
    if (board.outcome === 'retired') return `Opponents retired — ${winner} win`
    return `Game and match — ${winner}!`
  }
  if (board.doubleGamePoint) return 'Game point — both pairs!'
  if (board.gamePointFor) return `Game point — ${sideName(config, board.gamePointFor)}`
  return rulesSummary(board)
}

/**
 * The text pushed into the polite live region after every change. Written the
 * way an umpire calls it: score first, serving pair second.
 */
export function scoreAnnouncement(board: ScoreboardState, config: MatchScoringConfig): string {
  const a = sideName(config, 'a')
  const b = sideName(config, 'b')
  if (board.complete && board.winner) {
    return `${scoreHeadline(board, config)}. Final score ${scoreForSide(board, 'a')} ${a}, ${scoreForSide(board, 'b')} ${b}.`
  }
  const parts = [`${board.scoreA} ${a}, ${board.scoreB} ${b}.`, serveSummary(board, config) + '.']
  if (board.gamePointFor) parts.unshift(`${scoreHeadline(board, config)}.`)
  return parts.join(' ')
}

// ---------------------------------------------------------------------------
// Persistence mapping (`matches` + `score_events`)
// ---------------------------------------------------------------------------

/**
 * Match status values the console can write.
 *
 * Derived from the `match_status` enum rather than restated, so adding a
 * status is a compile error here instead of a silent omission. Only
 * `'cancelled'` is excluded — an umpire cannot cancel a fixture from court.
 */
export type ScoringMatchStatus = Exclude<MatchStatus, 'cancelled'>

/** Each ending has its own `match_status`, so nothing has to parse a reason string. */
const END_KIND_STATUS: Record<MatchEndKind, ScoringMatchStatus> = {
  forfeit: 'forfeited',
  walkover: 'walkover',
  retired: 'retired',
}

/** ...and its own `score_events.event_type`, for the same reason. */
const END_KIND_EVENT: Record<MatchEndKind, ScoreEventInsert['event_type']> = {
  forfeit: 'forfeit',
  walkover: 'walkover',
  retired: 'retire',
}

export interface MatchScorePatch {
  status: ScoringMatchStatus
  score_a: number
  score_b: number
  winner_team_id: string | null
  forfeited_by_team_id: string | null
  forfeit_reason: string | null
}

/**
 * The `matches` row update for a scoreboard.
 *
 * The three early endings map to three distinct statuses. That keeps the
 * scoring difference honest — a forfeit and a walkover normalise to
 * `pointsToWin`-0, a retirement keeps the score actually played — and it
 * stops the public results page calling an injured pair a forfeit.
 * `forfeit_reason` therefore holds the plain note, with no label smuggled
 * into it.
 */
export function matchScorePatch(
  board: ScoreboardState,
  config: MatchScoringConfig,
): MatchScorePatch {
  const teamIdFor = (side: ScoringSide) => teamForSide(config, side).id ?? null

  if (!board.complete) {
    return {
      status: board.totalPoints > 0 ? 'in_progress' : 'scheduled',
      score_a: board.scoreA,
      score_b: board.scoreB,
      winner_team_id: null,
      forfeited_by_team_id: null,
      forfeit_reason: null,
    }
  }

  const ending = board.ending

  return {
    status: ending ? END_KIND_STATUS[ending.kind] : 'completed',
    score_a: scoreForSide(board, 'a'),
    score_b: scoreForSide(board, 'b'),
    winner_team_id: board.winner ? teamIdFor(board.winner) : null,
    // A retirement is not a forfeit, so the pair that stopped is recorded on
    // the reason rather than blamed in `forfeited_by_team_id`.
    forfeited_by_team_id:
      ending && ending.kind !== 'retired' ? teamIdFor(ending.side) : null,
    forfeit_reason: ending ? (ending.reason || null) : null,
  }
}

/**
 * "Retired: rolled an ankle" — a self-describing line for the `score_events`
 * audit log. `matches.forfeit_reason` gets the plain note instead, because
 * `matches.status` already says which kind of ending it was.
 */
export function formatEndingReason(ending: MatchEnding): string {
  const label = endKindLabel(ending.kind)
  return ending.reason ? `${label}: ${ending.reason}` : label
}

/** A `score_events` insert payload. `event_type` matches the schema's check constraint. */
export interface ScoreEventInsert {
  match_id: string
  sequence: number
  side: ScoringSide
  event_type: ScoreEventRow['event_type']
  score_a_after: number
  score_b_after: number
  note: string | null
}

/**
 * The full point-by-point log for a match, ready to replace the server's copy.
 *
 * Rewritten wholesale on every sync rather than appended: the umpire's device
 * holds the authoritative rally list, corrections can change rallies in the
 * middle of it, and a full replace is idempotent when a flaky connection
 * retries the same snapshot twice.
 */
export function scoreEventInserts(state: ScoringState): ScoreEventInsert[] {
  const { config } = state
  const rows: ScoreEventInsert[] = []
  let scoreA = config.baseline.scoreA
  let scoreB = config.baseline.scoreB
  let sequence = 0

  rows.push({
    match_id: config.matchId,
    sequence: ++sequence,
    side: config.baseline.servingSide,
    event_type: 'game_start',
    score_a_after: scoreA,
    score_b_after: scoreB,
    note: `First to ${config.rules.pointsToWin}${config.rules.deuce ? '' : ', no deuce'}`,
  })

  for (const rally of state.rallies) {
    if (rally.side === 'a') scoreA++
    else scoreB++
    rows.push({
      match_id: config.matchId,
      sequence: ++sequence,
      side: rally.side,
      event_type: 'point',
      score_a_after: scoreA,
      score_b_after: scoreB,
      note: null,
    })
  }

  const board = deriveScoreboard(state)
  if (board.ending) {
    rows.push({
      match_id: config.matchId,
      sequence: ++sequence,
      side: board.ending.side,
      event_type: END_KIND_EVENT[board.ending.kind],
      score_a_after: board.awardedA,
      score_b_after: board.awardedB,
      note: formatEndingReason(board.ending),
    })
  }
  if (board.complete && board.winner) {
    rows.push({
      match_id: config.matchId,
      sequence: ++sequence,
      side: board.winner,
      event_type: 'game_end',
      score_a_after: board.awardedA,
      score_b_after: board.awardedB,
      note: scoreHeadline(board, config),
    })
  }

  return rows
}

// ---------------------------------------------------------------------------
// Restoring a session from the server's `score_events` log
// ---------------------------------------------------------------------------

/** The subset of a `score_events` row the console needs to rebuild a session. */
export interface StoredScoreEvent {
  sequence: number
  side: ScoringSide
  event_type: ScoreEventInsert['event_type']
  score_a_after: number
  score_b_after: number
  note?: string | null
}

/**
 * Rebuilds a full scoring session from the server's event log, so an umpire
 * who reloads the page — or picks the match up on a different phone — keeps
 * the whole rally history, and with it the ability to undo.
 *
 * Falls back to `config.baseline` when the match has a score but no log.
 */
export function restoreFromScoreEvents(
  config: MatchScoringConfig,
  rows: readonly StoredScoreEvent[],
): ScoringState {
  const ordered = [...rows].sort((a, b) => a.sequence - b.sequence)
  const start = ordered.find((r) => r.event_type === 'game_start')
  const pointRows = ordered.filter((r) => r.event_type === 'point')

  if (!start && pointRows.length === 0) return createScoringState(config)

  const baseline: ScoringBaseline = {
    ...config.baseline,
    scoreA: start?.score_a_after ?? 0,
    scoreB: start?.score_b_after ?? 0,
    servingSide: start?.side ?? config.baseline.servingSide,
  }

  const stop = ordered.find(
    (r) =>
      r.event_type === 'forfeit' || r.event_type === 'walkover' || r.event_type === 'retire',
  )
  const ending: MatchEnding | null = stop
    ? {
        kind: endKindFromEvent(stop.event_type, stop.note),
        side: stop.side,
        reason: reasonFromNote(stop.note),
        at: null,
      }
    : null

  return createScoringState(
    { ...config, baseline },
    {
      rallies: pointRows.map((row, index) => ({
        seq: index + 1,
        side: row.side,
        at: null,
      })),
      ending,
    },
  )
}

/**
 * The event type is authoritative. Rows written before `'walkover'`/`'retire'`
 * existed all say `'forfeit'`, so those still fall back to the note's label
 * prefix rather than silently mislabelling an old retirement.
 */
function endKindFromEvent(
  eventType: ScoreEventInsert['event_type'],
  note: string | null | undefined,
): MatchEndKind {
  if (eventType === 'walkover') return 'walkover'
  if (eventType === 'retire') return 'retired'
  const label = (note ?? '').split(':')[0].trim().toLowerCase()
  return MATCH_END_KINDS.find((k) => k.label.toLowerCase() === label)?.kind ?? 'forfeit'
}

/**
 * Recovers the umpire's own words from a log note.
 *
 * Notes written by this module are `"<label>: <reason>"`, but a note may also
 * be a plain reason with no label at all, so only a recognised label prefix is
 * stripped — anything else is returned whole rather than thrown away.
 */
function reasonFromNote(note: string | null | undefined): string {
  const text = (note ?? '').trim()
  if (!text) return ''

  const index = text.indexOf(':')
  const isLabel = (value: string) =>
    MATCH_END_KINDS.some((k) => k.label.toLowerCase() === value.trim().toLowerCase())

  if (index !== -1 && isLabel(text.slice(0, index))) return text.slice(index + 1).trim()
  return isLabel(text) ? '' : text
}

// ---------------------------------------------------------------------------
// Snapshots — local persistence and the sync payload
// ---------------------------------------------------------------------------

/** Everything needed to rebuild a session, small enough for `localStorage`. */
export interface ScoringSnapshot {
  v: 1
  matchId: string
  baseline: ScoringBaseline
  rallies: readonly RallyEvent[]
  ending: MatchEnding | null
}

export const SCORING_SNAPSHOT_VERSION = 1

export function toSnapshot(state: ScoringState): ScoringSnapshot {
  return {
    v: SCORING_SNAPSHOT_VERSION,
    matchId: state.config.matchId,
    baseline: state.config.baseline,
    rallies: state.rallies,
    ending: state.ending,
  }
}

export function fromSnapshot(
  config: MatchScoringConfig,
  snapshot: ScoringSnapshot | null,
): ScoringState {
  if (!snapshot || snapshot.matchId !== config.matchId) return createScoringState(config)
  return createScoringState(
    { ...config, baseline: { ...config.baseline, ...snapshot.baseline } },
    { rallies: snapshot.rallies, ending: snapshot.ending },
  )
}

/** `localStorage` key for one match's in-progress rally log. */
export function scoringStorageKey(matchId: string): string {
  return `ss:scoring:${matchId}`
}

export function serialiseSnapshot(state: ScoringState): string {
  return JSON.stringify(toSnapshot(state))
}

/** Tolerant parse — a corrupt or stale entry must never break the console. */
export function parseSnapshot(raw: string | null): ScoringSnapshot | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const candidate = parsed as Partial<ScoringSnapshot>
    if (candidate.v !== SCORING_SNAPSHOT_VERSION) return null
    if (typeof candidate.matchId !== 'string') return null
    if (!Array.isArray(candidate.rallies)) return null
    const rallies = candidate.rallies.filter(
      (r): r is RallyEvent =>
        !!r && (r.side === 'a' || r.side === 'b') && typeof r.seq === 'number',
    )
    const ending =
      candidate.ending &&
      typeof candidate.ending === 'object' &&
      (candidate.ending.side === 'a' || candidate.ending.side === 'b') &&
      MATCH_END_KINDS.some((k) => k.kind === candidate.ending?.kind)
        ? candidate.ending
        : null
    return {
      v: SCORING_SNAPSHOT_VERSION,
      matchId: candidate.matchId,
      baseline: { ...EMPTY_BASELINE, ...(candidate.baseline ?? {}) },
      rallies: renumber(rallies),
      ending,
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Sync tracking — loud failures, never a silently lost point
// ---------------------------------------------------------------------------

export type SyncStatus =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'pending'
  | 'failed'
  | 'offline'
  | 'local'
  /** Another official's phone has written to this match. Retrying cannot help. */
  | 'conflict'

export interface SyncTracker {
  status: SyncStatus
  /** Rally count that is known to be on the server. */
  syncedRallies: number
  /** Rally count sitting on this device. */
  localRallies: number
  attempts: number
  lastError: string | null
  /** Caller-supplied clock reading of the last successful save. */
  lastSyncedAt: number | null
}

export function createSyncTracker(status: SyncStatus = 'idle', rallies = 0): SyncTracker {
  return {
    status,
    syncedRallies: rallies,
    localRallies: rallies,
    attempts: 0,
    lastError: null,
    lastSyncedAt: null,
  }
}

export function syncStarted(tracker: SyncTracker, localRallies: number): SyncTracker {
  return {
    ...tracker,
    status: 'saving',
    localRallies,
    attempts: tracker.attempts + 1,
  }
}

export function syncSucceeded(
  tracker: SyncTracker,
  localRallies: number,
  at: number | null = null,
): SyncTracker {
  return {
    ...tracker,
    status: 'saved',
    syncedRallies: localRallies,
    localRallies,
    attempts: 0,
    lastError: null,
    lastSyncedAt: at,
  }
}

export function syncFailed(
  tracker: SyncTracker,
  localRallies: number,
  error: string,
  offline = false,
): SyncTracker {
  return {
    ...tracker,
    status: offline ? 'offline' : 'failed',
    localRallies,
    lastError: error,
  }
}

/**
 * Another duty official has scored this match from their own phone.
 *
 * Kept apart from `failed` because the advice is the opposite: a failed save
 * says "nothing is lost, tap Retry", which is true of a dropped request and
 * false here. Retrying a stale log cannot succeed, and the points at risk are
 * the other official's, so the banner has to say reload instead.
 */
export function syncConflict(
  tracker: SyncTracker,
  localRallies: number,
  error: string,
): SyncTracker {
  return { ...tracker, status: 'conflict', localRallies, lastError: error }
}

/** Demo mode / no database: honest about the fact nothing leaves the device. */
export function syncLocalOnly(tracker: SyncTracker, localRallies: number): SyncTracker {
  return {
    ...tracker,
    status: 'local',
    localRallies,
    syncedRallies: localRallies,
    lastError: null,
  }
}

export type SyncTone = 'ok' | 'busy' | 'warn' | 'danger' | 'info'

export interface SyncBannerView {
  tone: SyncTone
  title: string
  detail: string
  /** True when a retry button should be offered. */
  retryable: boolean
}

/**
 * Rallies recorded on this phone that the server has not acknowledged.
 *
 * Exported because the reconnect flush in `ScoringConsole` and the banner
 * below must agree on what "behind" means: the banner tells the umpire the
 * points "will send themselves when the wifi returns", and the flush is what
 * keeps that promise.
 */
export function unsentRallies(tracker: SyncTracker): number {
  return Math.max(0, tracker.localRallies - tracker.syncedRallies)
}

/** What the umpire sees about the connection. Never silent about a failure. */
export function describeSync(tracker: SyncTracker): SyncBannerView {
  const behind = unsentRallies(tracker)
  const points = `${behind} point${behind === 1 ? '' : 's'}`

  switch (tracker.status) {
    case 'saving':
      return {
        tone: 'busy',
        title: 'Saving…',
        detail: 'Sending the score to the scoreboard.',
        retryable: false,
      }
    case 'saved':
      return {
        tone: 'ok',
        title: 'Saved',
        detail: 'The live scores and TV scoreboard are up to date.',
        retryable: false,
      }
    case 'offline':
      return {
        tone: 'warn',
        title: 'No connection',
        detail: `${points} held safely on this phone. Keep scoring — they will send themselves when the wifi returns.`,
        retryable: true,
      }
    case 'failed':
      return {
        tone: 'danger',
        title: "Couldn't save",
        detail: `${points} not on the scoreboard yet${tracker.lastError ? ` (${tracker.lastError})` : ''}. Nothing is lost — tap Retry.`,
        retryable: true,
      }
    case 'conflict':
      return {
        tone: 'danger',
        title: 'Someone else is scoring this match',
        detail:
          `${points} on this phone were not saved, because another official has scored ` +
          'points your phone has not seen. Reload this page to pick up their score — ' +
          'saving over it would wipe their points.',
        retryable: false,
      }
    case 'pending':
      return {
        tone: 'info',
        title: 'Waiting to save',
        detail: `${points} queued on this phone.`,
        retryable: true,
      }
    case 'local':
      return {
        tone: 'info',
        title: 'On this device only',
        detail: 'No database is connected, so nothing is sent to the live scoreboard.',
        retryable: false,
      }
    default:
      return {
        tone: 'info',
        title: 'Ready',
        detail: 'Tap a pair to award the rally.',
        retryable: false,
      }
  }
}

// ---------------------------------------------------------------------------
// "Matches I am officiating"
// ---------------------------------------------------------------------------

/**
 * Duty roles allowed to drive the console. The umpire/scorer runs it; the
 * scoresheet person is the designated backup (and the pair of them sit
 * together with the sheet). Line judges get a read-only view — this mirrors
 * the `is_match_duty_official()` RLS helper, which is deliberately wider.
 */
export const SCORING_ROLES: readonly DutyRole[] = ['umpire_scorer', 'scoresheet']

export function canScoreWithRole(role: DutyRole): boolean {
  return SCORING_ROLES.includes(role)
}

export type AssignmentState = 'live' | 'up_next' | 'upcoming' | 'done'

export interface ScoringAssignment {
  match: PublicMatch
  /** Every seat this person holds on the match — usually one. */
  roles: DutyRole[]
  /** True when at least one role may drive the console. */
  canScore: boolean
  state: AssignmentState
  /** Set when the roster has this person officiating and playing at once. */
  clash: boolean
}

/**
 * The signed-in official's duty list, in playing order, tagged with whether
 * each match is live, next up or already done.
 *
 * Matching prefers `duty.playerId` (`profiles.id`) and only falls back to a
 * case-insensitive name comparison, because display names are
 * `nickname || full_name` and are not unique.
 */
export function scoringAssignments(
  matches: readonly PublicMatch[],
  player: PlayerIdentity,
  playingTeamId: TeamId | null = null,
): ScoringAssignment[] {
  const name = player.name.trim().toLowerCase()
  const id = player.id.trim()
  if (!id && !name) return []

  const isMe = (duty: { playerId?: string; playerName: string }): boolean => {
    if (id && duty.playerId) return duty.playerId === id
    return name.length > 0 && duty.playerName.trim().toLowerCase() === name
  }

  const byMatch = new Map<string, ScoringAssignment>()
  for (const match of [...matches].sort(compareByStartTime)) {
    for (const duty of match.duties) {
      if (!isMe(duty)) continue
      const existing = byMatch.get(match.id)
      if (existing) {
        if (!existing.roles.includes(duty.role)) existing.roles.push(duty.role)
        existing.canScore = existing.roles.some(canScoreWithRole)
        continue
      }
      byMatch.set(match.id, {
        match,
        roles: [duty.role],
        canScore: canScoreWithRole(duty.role),
        state: assignmentState(match),
        clash:
          playingTeamId != null &&
          matches.some(
            (m) =>
              m.id !== match.id &&
              m.slotIndex != null &&
              m.slotIndex === match.slotIndex &&
              (m.teamA?.id === playingTeamId || m.teamB?.id === playingTeamId),
          ),
      })
    }
  }

  const rows = [...byMatch.values()]
  const firstUpcoming = rows.find((r) => r.state === 'upcoming')
  if (firstUpcoming && !rows.some((r) => r.state === 'live')) firstUpcoming.state = 'up_next'
  return rows
}

function assignmentState(match: PublicMatch): AssignmentState {
  if (isMatchDecided(match.status)) return 'done'
  return match.status === 'in_progress' ? 'live' : 'upcoming'
}

export interface AssignmentGroups {
  live: ScoringAssignment[]
  upcoming: ScoringAssignment[]
  done: ScoringAssignment[]
}

/** Split for the `/scoring` list: on now, still to come, already finished. */
export function groupAssignments(assignments: readonly ScoringAssignment[]): AssignmentGroups {
  return {
    live: assignments.filter((a) => a.state === 'live'),
    upcoming: assignments.filter((a) => a.state === 'up_next' || a.state === 'upcoming'),
    done: assignments.filter((a) => a.state === 'done'),
  }
}

/** The one match to push the official straight into, if there is an obvious one. */
export function primaryAssignment(
  assignments: readonly ScoringAssignment[],
): ScoringAssignment | null {
  return (
    assignments.find((a) => a.state === 'live' && a.canScore) ??
    assignments.find((a) => a.state === 'up_next' && a.canScore) ??
    assignments.find((a) => a.canScore) ??
    null
  )
}

// ---------------------------------------------------------------------------
// Match clock
// ---------------------------------------------------------------------------

/**
 * Elapsed match time, formatted `m:ss` (or `h:mm:ss` past an hour).
 * `now` is always passed in — this module never reads a clock itself.
 */
export function formatElapsed(startedAtMs: number | null, now: number): string {
  if (startedAtMs == null) return '—'
  const totalSeconds = Math.max(0, Math.floor((now - startedAtMs) / 1000))
  const seconds = totalSeconds % 60
  const minutes = Math.floor(totalSeconds / 60) % 60
  const hours = Math.floor(totalSeconds / 3600)
  const mm = minutes.toString().padStart(2, '0')
  const ss = seconds.toString().padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`
}
