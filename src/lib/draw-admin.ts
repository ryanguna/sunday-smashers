/**
 * Pure helpers for the admin draw workbench (`/admin/draw`).
 *
 * The tournament maths itself lives in `src/lib/draw.ts` and is NOT
 * reimplemented here. This module is the thin, fully-testable layer that
 * sits between that engine and the UI/persistence:
 *
 *   - entry eligibility + the warnings an admin must see before drawing
 *   - seeding order (manual drag order, seed spreading, seeded reshuffle)
 *   - preview summary maths ("11 pairs → 55 games, 10 each…")
 *   - publish safety rails (never silently destroy recorded results)
 *   - fixture → `matches` row mapping
 *   - manual resolution of ties the engine flagged `needsAdminDecision`
 *
 * Everything here is dependency-free and client-safe: it imports only the
 * pure engines, never `next/headers` or a Supabase client, so it can be
 * shared by Server Components, Server Actions and `'use client'` UI.
 */

import {
  gamesPerTeam,
  generateRoundRobin,
  totalRoundRobinMatches,
  type Fixture,
  type KnockoutFixture,
  type MatchStage,
  type StageRules,
  type StandingRow,
  type TeamId,
  type TiebreakReason,
} from './draw'
import { mulberry32 } from './schedule'

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

/** A pair as the draw workbench sees it. */
export interface DrawTeamEntry {
  id: TeamId
  name: string
  /** Both players' display names. */
  players: string[]
  /** Committee seed, 1 = strongest. `null` when unseeded. */
  seed: number | null
  /** Both registrations approved. */
  approved: boolean
  /** Entry fee settled for both players. */
  paid: boolean
}

export type DrawWarningLevel = 'info' | 'warn' | 'danger'

export interface DrawWarning {
  code:
    | 'unapproved_teams'
    | 'unpaid_teams'
    | 'pending_registrations'
    | 'unpaired_players'
    | 'too_few_teams'
    | 'bye_round'
  level: DrawWarningLevel
  title: string
  detail: string
}

/** Pairs that may be drawn: approved *and* paid. */
export function eligibleTeams(teams: readonly DrawTeamEntry[]): DrawTeamEntry[] {
  return teams.filter((team) => team.approved && team.paid)
}

/** Pairs held back from the draw, with the reason attached. */
export function ineligibleTeams(
  teams: readonly DrawTeamEntry[]
): { team: DrawTeamEntry; reason: string }[] {
  return teams
    .filter((team) => !team.approved || !team.paid)
    .map((team) => ({
      team,
      reason: !team.approved
        ? 'Registration not approved yet'
        : 'Entry fee still outstanding',
    }))
}

export interface EntryWarningInput {
  /** Registrations still sitting in `pending`. */
  pendingRegistrations?: number
  /** Approved players with no partner yet. */
  unpairedPlayers?: number
}

/**
 * Everything the admin should know before hitting Generate. Ordered most
 * severe first so the UI can render them top-down.
 */
export function entryWarnings(
  teams: readonly DrawTeamEntry[],
  input: EntryWarningInput = {}
): DrawWarning[] {
  const warnings: DrawWarning[] = []
  const unapproved = teams.filter((t) => !t.approved)
  const unpaid = teams.filter((t) => t.approved && !t.paid)
  const eligible = eligibleTeams(teams)
  const pending = input.pendingRegistrations ?? 0
  const unpaired = input.unpairedPlayers ?? 0

  if (eligible.length < 2) {
    warnings.push({
      code: 'too_few_teams',
      level: 'danger',
      title: 'Not enough pairs to draw',
      detail: `Only ${eligible.length} eligible pair${eligible.length === 1 ? '' : 's'} — you need at least 2 before a round robin means anything.`,
    })
  }

  if (unpaid.length > 0) {
    warnings.push({
      code: 'unpaid_teams',
      level: 'danger',
      title: `${unpaid.length} approved pair${unpaid.length === 1 ? ' has' : 's have'} not paid`,
      detail: `${unpaid.map((t) => t.name).join(', ')} — unpaid pairs are left out of the draw until the entry fee lands.`,
    })
  }

  if (unapproved.length > 0) {
    warnings.push({
      code: 'unapproved_teams',
      level: 'warn',
      title: `${unapproved.length} pair${unapproved.length === 1 ? '' : 's'} awaiting approval`,
      detail: `${unapproved.map((t) => t.name).join(', ')} — approve them in Registrations if they should be in this draw.`,
    })
  }

  if (pending > 0) {
    warnings.push({
      code: 'pending_registrations',
      level: 'warn',
      title: `${pending} registration${pending === 1 ? ' is' : 's are'} still pending`,
      detail: 'Publishing now means late approvals will need the draw regenerated.',
    })
  }

  if (unpaired > 0) {
    warnings.push({
      code: 'unpaired_players',
      level: 'info',
      title: `${unpaired} approved player${unpaired === 1 ? ' has' : 's have'} no partner`,
      detail: 'Free agents cannot be drawn until they are paired into a team.',
    })
  }

  if (eligible.length >= 2 && eligible.length % 2 !== 0) {
    warnings.push({
      code: 'bye_round',
      level: 'info',
      title: 'Odd number of pairs — one pair rests each round',
      detail: `With ${eligible.length} pairs, exactly one pair sits out per round. Everyone still plays everyone once.`,
    })
  }

  return warnings
}

/** Highest severity across a warning list, or `null` when there are none. */
export function worstWarningLevel(warnings: readonly DrawWarning[]): DrawWarningLevel | null {
  if (warnings.some((w) => w.level === 'danger')) return 'danger'
  if (warnings.some((w) => w.level === 'warn')) return 'warn'
  if (warnings.length > 0) return 'info'
  return null
}

// ---------------------------------------------------------------------------
// Seeding / ordering
// ---------------------------------------------------------------------------

/**
 * The default draw order: seeded pairs first (1, 2, 3…), then unseeded
 * pairs alphabetically. Stable and deterministic.
 */
export function seedOrder(teams: readonly DrawTeamEntry[]): DrawTeamEntry[] {
  return [...teams].sort((a, b) => {
    if (a.seed != null && b.seed != null) return a.seed - b.seed
    if (a.seed != null) return -1
    if (b.seed != null) return 1
    return a.name.localeCompare(b.name)
  })
}

/** Moves the item at `from` to index `to`, returning a new array. */
export function reorder<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items]
  if (from < 0 || from >= next.length) return next
  const clamped = Math.max(0, Math.min(next.length - 1, to))
  const [moved] = next.splice(from, 1)
  next.splice(clamped, 0, moved)
  return next
}

/**
 * Deterministic Fisher–Yates shuffle. The same `seed` always produces the
 * same order, so "Reshuffle" is reproducible and an admin can go back to an
 * arrangement they liked.
 */
export function shuffleOrder<T>(items: readonly T[], seed: number): T[] {
  const next = [...items]
  const rng = mulberry32(Math.floor(seed) || 1)
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

/**
 * Spreads the strongest pairs apart in the circle-method line-up so the top
 * seeds don't all meet in the opening rounds: seed 1 stays at the top, seed
 * 2 moves to the far side, then the rest interleave (1, 3, 5, … 6, 4, 2).
 */
export function spreadSeeds<T>(orderedByStrength: readonly T[]): T[] {
  const front: T[] = []
  const back: T[] = []
  orderedByStrength.forEach((item, index) => {
    if (index % 2 === 0) front.push(item)
    else back.unshift(item)
  })
  return [...front, ...back]
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export interface DrawSummary {
  teamCount: number
  /** Total fixtures in the full single round robin. */
  totalGames: number
  /** Games each pair plays (entries − 1). */
  gamesEach: number
  /** Number of rounds in the circle-method draw. */
  rounds: number
  /** Fixtures that can run at the same time within one round. */
  concurrentPerRound: number
  /** True when an odd entry count means one pair rests each round. */
  hasBye: boolean
}

export function drawSummary(teamCount: number): DrawSummary {
  const count = Math.max(0, Math.floor(teamCount))
  if (count < 2) {
    return {
      teamCount: count,
      totalGames: 0,
      gamesEach: 0,
      rounds: 0,
      concurrentPerRound: 0,
      hasBye: false,
    }
  }
  const hasBye = count % 2 !== 0
  return {
    teamCount: count,
    totalGames: totalRoundRobinMatches(count),
    gamesEach: gamesPerTeam(count),
    rounds: hasBye ? count : count - 1,
    concurrentPerRound: Math.floor(count / 2),
    hasBye,
  }
}

/** "11 pairs → 55 games, 10 each, 5 concurrent matches per round". */
export function summarySentence(summary: DrawSummary): string {
  if (summary.teamCount < 2) return 'Not enough pairs for a round robin yet.'
  return (
    `${summary.teamCount} pairs → ${summary.totalGames} games, ` +
    `${summary.gamesEach} each, ${summary.concurrentPerRound} concurrent ` +
    `match${summary.concurrentPerRound === 1 ? '' : 'es'} per round`
  )
}

export interface DrawPreviewRound {
  round: number
  fixtures: Fixture[]
  /** The pair resting this round, when the entry count is odd. */
  byeTeamId: TeamId | null
}

export interface DrawPreview {
  /** The team order the draw was generated from. */
  order: TeamId[]
  fixtures: Fixture[]
  rounds: DrawPreviewRound[]
  summary: DrawSummary
  /** The shuffle seed that produced `order`, when one was used. */
  seed: number | null
}

/** Groups a flat fixture list into rounds, filling in each round's bye. */
export function groupByRound(
  fixtures: readonly Fixture[],
  allTeamIds: readonly TeamId[]
): DrawPreviewRound[] {
  const byRound = new Map<number, Fixture[]>()
  for (const fixture of fixtures) {
    const bucket = byRound.get(fixture.round)
    if (bucket) bucket.push(fixture)
    else byRound.set(fixture.round, [fixture])
  }

  return [...byRound.keys()]
    .sort((a, b) => a - b)
    .map((round) => {
      const roundFixtures = byRound.get(round)!
      const playing = new Set<TeamId>()
      for (const fixture of roundFixtures) {
        playing.add(fixture.teamA)
        playing.add(fixture.teamB)
      }
      const resting = allTeamIds.filter((id) => !playing.has(id))
      return {
        round,
        fixtures: roundFixtures,
        byeTeamId: resting.length === 1 ? resting[0] : null,
      }
    })
}

/**
 * Builds a complete, unpersisted draw preview from an ordered team list.
 * Nothing is written anywhere — this is what the admin eyeballs before
 * publishing.
 */
export function buildDrawPreview(
  orderedTeamIds: readonly TeamId[],
  seed: number | null = null
): DrawPreview {
  const order = [...orderedTeamIds]
  const fixtures = generateRoundRobin(order)
  return {
    order,
    fixtures,
    rounds: groupByRound(fixtures, order),
    summary: drawSummary(order.length),
    seed,
  }
}

// ---------------------------------------------------------------------------
// Publish safety rails
// ---------------------------------------------------------------------------

/** The minimum an existing `matches` row needs for the safety check. */
export interface ExistingMatchSummary {
  id: string
  stage: MatchStage
  /** True once a score/forfeit/winner has been recorded. */
  hasResult: boolean
}

export interface PublishSafety {
  existingCount: number
  resultCount: number
  /** Safe to publish given the confirmations supplied. */
  canPublish: boolean
  /** The admin must tick "regenerate and replace" before publishing. */
  requiresReplaceConfirmation: boolean
  /** Publishing would wipe recorded results — needs a second, explicit OK. */
  destructive: boolean
  level: DrawWarningLevel
  headline: string
  detail: string
}

export interface PublishSafetyOptions {
  /** The admin ticked "yes, replace the existing draw". */
  confirmReplace?: boolean
  /** The admin *also* accepted that recorded results will be destroyed. */
  confirmDestroyResults?: boolean
}

/**
 * Decides whether a publish may proceed.
 *
 *   - nothing published yet          → go ahead
 *   - published, no results recorded → requires "regenerate and replace"
 *   - published, results recorded    → blocked until the admin explicitly
 *                                      accepts destroying those results
 */
export function publishSafety(
  existing: readonly ExistingMatchSummary[],
  options: PublishSafetyOptions = {}
): PublishSafety {
  const existingCount = existing.length
  const resultCount = existing.filter((match) => match.hasResult).length
  const confirmReplace = options.confirmReplace ?? false
  const confirmDestroyResults = options.confirmDestroyResults ?? false

  if (existingCount === 0) {
    return {
      existingCount,
      resultCount,
      canPublish: true,
      requiresReplaceConfirmation: false,
      destructive: false,
      level: 'info',
      headline: 'Ready to publish',
      detail: 'Nothing has been published for this division yet, so this is a clean first draw.',
    }
  }

  if (resultCount === 0) {
    return {
      existingCount,
      resultCount,
      canPublish: confirmReplace,
      requiresReplaceConfirmation: true,
      destructive: false,
      level: 'warn',
      headline: `${existingCount} fixture${existingCount === 1 ? ' is' : 's are'} already published`,
      detail:
        'No scores have been recorded yet, so replacing them is safe — but everyone who has seen the schedule will get a different one.',
    }
  }

  return {
    existingCount,
    resultCount,
    canPublish: confirmReplace && confirmDestroyResults,
    requiresReplaceConfirmation: true,
    destructive: true,
    level: 'danger',
    headline: `${resultCount} match${resultCount === 1 ? '' : 'es'} already ${resultCount === 1 ? 'has' : 'have'} a recorded result`,
    detail:
      'Republishing deletes those results permanently. Fix the individual match instead unless you are certain the whole draw must start again.',
  }
}

// ---------------------------------------------------------------------------
// Fixture → database row mapping
// ---------------------------------------------------------------------------

/** An insert payload for the `matches` table. */
export interface MatchInsert {
  division_id: string
  stage: MatchStage
  round: number | null
  bracket_key: 'M1' | 'M2' | 'THIRD' | 'FINAL' | null
  team_a_id: string | null
  team_b_id: string | null
  points_to_win: number
  deuce_enabled: boolean
  cap: number | null
  status: 'scheduled'
}

function rulesColumns(rules: StageRules) {
  return {
    points_to_win: rules.pointsToWin,
    deuce_enabled: rules.deuce,
    cap: rules.cap ?? null,
  }
}

/** Maps round robin fixtures onto `matches` rows, in round order. */
export function fixturesToMatchInserts(
  fixtures: readonly Fixture[],
  divisionId: string,
  rules: StageRules
): MatchInsert[] {
  return [...fixtures]
    .sort((a, b) => a.round - b.round)
    .map((fixture) => ({
      division_id: divisionId,
      stage: 'elims' as const,
      round: fixture.round,
      bracket_key: null,
      team_a_id: fixture.teamA,
      team_b_id: fixture.teamB,
      ...rulesColumns(rules),
      status: 'scheduled' as const,
    }))
}

/**
 * Maps the four knockout fixtures onto `matches` rows. The Battle for 3rd
 * and Championship are inserted with `null` teams — they are filled in once
 * the semis are played.
 */
export function knockoutToMatchInserts(
  knockout: readonly KnockoutFixture[],
  divisionId: string,
  rules: StageRules
): MatchInsert[] {
  return knockout.map((fixture) => ({
    division_id: divisionId,
    stage: fixture.stage,
    round: null,
    bracket_key: fixture.key,
    team_a_id: fixture.teamA,
    team_b_id: fixture.teamB,
    ...rulesColumns(rules),
    status: 'scheduled' as const,
  }))
}

/**
 * One element of the `p_matches` array accepted by the `publish_draw()`
 * Postgres function. The division and stage travel as their own arguments,
 * and the RPC always inserts as `scheduled`, so those three columns are
 * deliberately absent.
 */
/*
 * Declared as a `type`, not an `interface`, on purpose: only type aliases get
 * an implicit index signature, so only a type alias is assignable to the
 * generated `Json` parameter of `publish_draw()` without a cast.
 *
 * Every field is explicitly `| null` rather than optional. `JSON.stringify`
 * silently drops `undefined` values, so an optional key would post a fixture
 * with the field simply missing — the RPC would then apply its own default
 * instead of what the admin configured. Nulls survive the round trip.
 */
export type PublishDrawMatch = {
  round: number | null
  bracket_key: 'M1' | 'M2' | 'THIRD' | 'FINAL' | null
  team_a_id: string | null
  team_b_id: string | null
  points_to_win: number
  deuce_enabled: boolean
  cap: number | null
}

/** A single `publish_draw()` call: every fixture for one division + stage. */
export type PublishDrawCall = {
  stage: MatchStage
  matches: PublishDrawMatch[]
}

/**
 * Splits `MatchInsert[]` into one `publish_draw()` call per stage, because
 * the RPC swaps exactly one division+stage per transaction. Fixture order
 * within a stage is preserved. Stages appear in the order they are first
 * seen, which for `knockoutToMatchInserts` is semis → third → final: the
 * order they will actually be played.
 */
export function toPublishDrawCalls(inserts: readonly MatchInsert[]): PublishDrawCall[] {
  const calls: PublishDrawCall[] = []
  const byStage = new Map<MatchStage, PublishDrawCall>()

  for (const insert of inserts) {
    let call = byStage.get(insert.stage)
    if (!call) {
      call = { stage: insert.stage, matches: [] }
      byStage.set(insert.stage, call)
      calls.push(call)
    }
    call.matches.push({
      round: insert.round ?? null,
      bracket_key: insert.bracket_key ?? null,
      team_a_id: insert.team_a_id ?? null,
      team_b_id: insert.team_b_id ?? null,
      points_to_win: insert.points_to_win,
      deuce_enabled: insert.deuce_enabled,
      cap: insert.cap ?? null,
    })
  }

  return calls
}

/**
 * Turns a raw Postgres error from `publish_draw()` into something an admin
 * standing courtside can act on. The RPC is the last line of defence behind
 * `publishSafety()`, so if it fires the UI has usually already been told a
 * different story — say so plainly rather than leaking SQLSTATE noise.
 */
export function describePublishRpcError(message: string): string {
  const raw = message.trim()

  if (/insufficient_privilege|only admins may publish/i.test(raw)) {
    return 'The database rejected this: your account is not an admin any more. Sign in again as an admin and retry.'
  }

  const played = /refusing to replace (\d+) match/i.exec(raw)
  if (played) {
    return `The database blocked the swap because ${played[1]} match(es) in this stage already have results. Tick the "permanently delete recorded results" confirmation if you really must start again — nothing was changed.`
  }

  if (/could not find the function|does not exist|pgrst202/i.test(raw)) {
    return 'The publish_draw database function is missing. Apply the 0004_publish_draw_rpc migration, then try again — nothing was changed.'
  }

  return `The database refused to publish the draw: ${raw || 'unknown error'}. Nothing was changed.`
}

// ---------------------------------------------------------------------------
// Standings + manual tiebreaks
// ---------------------------------------------------------------------------

export const TIEBREAK_LABELS: Record<TiebreakReason, string> = {
  wins: 'Wins',
  head_to_head: 'Head to head',
  mini_league: 'Mini league (wins among tied pairs)',
  head_to_head_points: 'Mini league point difference',
  point_difference: 'Point difference',
  points_scored: 'Points scored',
  unresolved: 'Unresolved — needs your decision',
}

export const TIEBREAK_HINTS: Record<TiebreakReason, string> = {
  wins: 'Separated on wins alone.',
  head_to_head: 'Level on wins — decided by the game these two played.',
  mini_league: 'Three or more level on wins — decided by wins among only the tied pairs.',
  head_to_head_points: 'Still level — decided by point difference among the tied pairs.',
  point_difference: 'Still level — decided by point difference across all games.',
  points_scored: 'Still level — decided by total points scored.',
  unresolved: 'Every tiebreak came out level (a head-to-head cycle). An admin must call it.',
}

/** A cluster of pairs the engine could not separate. */
export interface TieGroup {
  /** In the engine's provisional order. */
  teamIds: TeamId[]
  /** The ranks these pairs currently occupy, e.g. [3, 4]. */
  ranks: number[]
}

/** Contiguous runs of rows flagged `needsAdminDecision`. */
export function unresolvedTieGroups(standings: readonly StandingRow[]): TieGroup[] {
  const groups: TieGroup[] = []
  let current: StandingRow[] = []

  const flush = () => {
    if (current.length > 1) {
      groups.push({
        teamIds: current.map((row) => row.teamId),
        ranks: current.map((row) => row.rank),
      })
    }
    current = []
  }

  for (const row of standings) {
    if (row.needsAdminDecision) current.push(row)
    else flush()
  }
  flush()
  return groups
}

/** An admin's manual call on a tie the engine flagged. */
export interface ManualTiebreak {
  /** The tied pairs in the admin's chosen final order. */
  teamIds: TeamId[]
  note?: string
}

export type ResolvedStandingRow = StandingRow & {
  /** True when this row's position came from an admin decision. */
  manuallyResolved: boolean
}

/**
 * Applies admin decisions to a standings table.
 *
 * Each decision reorders only the rows it names, within the ranks those
 * rows already occupy — a coin toss for 3rd/4th can never bump someone out
 * of the top four. Rows are re-ranked 1..n afterwards. Input is never
 * mutated.
 */
export function applyManualTiebreaks(
  standings: readonly StandingRow[],
  decisions: readonly ManualTiebreak[]
): ResolvedStandingRow[] {
  const rows: ResolvedStandingRow[] = standings.map((row) => ({
    ...row,
    manuallyResolved: false,
  }))

  for (const decision of decisions) {
    const wanted = decision.teamIds.filter((id, index) => decision.teamIds.indexOf(id) === index)
    const positions = wanted
      .map((id) => rows.findIndex((row) => row.teamId === id))
      .filter((index) => index >= 0)
    if (positions.length < 2) continue

    const slots = [...positions].sort((a, b) => a - b)
    const ordered = wanted
      .map((id) => rows.find((row) => row.teamId === id))
      .filter((row): row is ResolvedStandingRow => row != null)

    slots.forEach((slot, index) => {
      rows[slot] = {
        ...ordered[index],
        manuallyResolved: true,
        needsAdminDecision: false,
      }
    })
  }

  return rows.map((row, index) => ({ ...row, rank: index + 1 }))
}

/** True when every flagged tie has a decision covering it. */
export function allTiesResolved(
  standings: readonly StandingRow[],
  decisions: readonly ManualTiebreak[]
): boolean {
  const decided = new Set(decisions.flatMap((decision) => decision.teamIds))
  return unresolvedTieGroups(standings).every((group) =>
    group.teamIds.every((id) => decided.has(id))
  )
}

// ---------------------------------------------------------------------------
// Round robin progress → knockout readiness
// ---------------------------------------------------------------------------

export interface RoundRobinProgress {
  total: number
  played: number
  remaining: number
  complete: boolean
  /** 0–100, rounded. */
  percent: number
}

export function roundRobinProgress(total: number, played: number): RoundRobinProgress {
  const safeTotal = Math.max(0, Math.floor(total))
  const safePlayed = Math.max(0, Math.min(safeTotal, Math.floor(played)))
  return {
    total: safeTotal,
    played: safePlayed,
    remaining: safeTotal - safePlayed,
    complete: safeTotal > 0 && safePlayed === safeTotal,
    percent: safeTotal === 0 ? 0 : Math.round((safePlayed / safeTotal) * 100),
  }
}

export interface KnockoutReadiness {
  ready: boolean
  reason: string | null
}

/**
 * Whether the knockout bracket can be generated: the round robin must be
 * finished, enough pairs must have qualified, and no tie may still be
 * waiting on an admin decision.
 */
export function knockoutReadiness(
  progress: RoundRobinProgress,
  standings: readonly StandingRow[],
  decisions: readonly ManualTiebreak[],
  qualifyingPlaces: number
): KnockoutReadiness {
  if (!progress.complete) {
    return {
      ready: false,
      reason: `${progress.remaining} round robin game${progress.remaining === 1 ? '' : 's'} still to play.`,
    }
  }
  if (standings.length < qualifyingPlaces) {
    return {
      ready: false,
      reason: `Only ${standings.length} pairs — ${qualifyingPlaces} are needed for the semi finals.`,
    }
  }
  if (!allTiesResolved(standings, decisions)) {
    return {
      ready: false,
      reason: 'An unresolved tie still needs your decision before the bracket is fair.',
    }
  }
  return { ready: true, reason: null }
}
