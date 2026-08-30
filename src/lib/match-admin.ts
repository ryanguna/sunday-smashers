/**
 * Admin match management — the pure logic behind `/admin/matches`.
 *
 * `/scoring` is the umpire's console and `/tabulator` verifies scoresheets,
 * but neither can *override*. This module is the override: correcting a score
 * that went in wrong, recording a no-show after the fact, and moving a fixture
 * to another court or time slot.
 *
 * Everything here is pure — no React, no Supabase, no `next/headers`, no
 * wall-clock reads — so it unit tests exhaustively and can be bundled into a
 * Client Component without tripping the `next/headers` build trap.
 *
 * Two rules it exists to protect:
 *
 *   1. **The three endings are not interchangeable.** A forfeit and a walkover
 *      normalise to `pointsToWin`-0 because nothing (or nothing meaningful)
 *      was played. A **retirement keeps the score actually played** and does
 *      not blame anyone in `forfeited_by_team_id` — a pair that stops with an
 *      injury has not forfeited, and on a club day people care about that
 *      distinction. These are the same semantics `src/lib/scoring.ts` writes
 *      from the courtside console, deliberately so.
 *
 *   2. **The winner is stored, never re-derived.** `winner_team_id` is
 *      authoritative. A retirement's scoreline cannot decide itself — the pair
 *      that stopped is frequently *ahead* — so nothing here reads a winner
 *      back off the score.
 *
 * Clash detection on reschedule is delegated wholesale to
 * `analyseSchedule()` in `@/lib/schedule-admin`, which is the same pass the
 * schedule builder runs. Restating a rule in a second place has been the most
 * common source of bugs in this project, so this module deliberately owns no
 * copy of it.
 */

import {
  analyseSchedule,
  type AdminConflict,
  type PlacementMap,
  type ScheduleCourt,
  type ScheduleSlot,
  type DutyOverride,
  type ScheduleTeam,
  type SchedulableMatch,
} from '@/lib/schedule-admin'
import type { MatchStage } from '@/lib/draw'
import type { MatchStatus, ScoresheetStatus } from '@/lib/supabase/types'

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** Which half of a fixture. Mirrors `ScoringSide` in `@/lib/scoring`. */
export type MatchSide = 'a' | 'b'

export const MATCH_SIDES: readonly MatchSide[] = ['a', 'b']

export function otherMatchSide(side: MatchSide): MatchSide {
  return side === 'a' ? 'b' : 'a'
}

/** A pair as the console needs it: enough to name it and to search it. */
export interface AdminMatchTeam {
  id: string | null
  name: string
  players: readonly string[]
}

/** One row of the admin table — a match plus everything needed to judge it. */
export interface AdminMatchRow {
  id: string
  divisionId: string
  divisionName: string
  stage: MatchStage
  round: number | null
  bracketKey: 'M1' | 'M2' | 'THIRD' | 'FINAL' | null
  courtId: string | null
  courtName: string | null
  slotId: string | null
  slotIndex: number | null
  slotLabel: string | null
  teamA: AdminMatchTeam
  teamB: AdminMatchTeam
  scoreA: number
  scoreB: number
  status: MatchStatus
  winnerTeamId: string | null
  forfeitedByTeamId: string | null
  forfeitReason: string | null
  /** From the match record — never hardcode 15 or 21. */
  pointsToWin: number
  deuce: boolean
  cap: number | null
  /** `null` when no scoresheet has been raised for this match yet. */
  scoresheetStatus: ScoresheetStatus | null
}

/**
 * Human labels for every `match_status`.
 *
 * `Record<MatchStatus, …>` rather than a hand-picked list, so adding a status
 * to the enum is a compile error here. `statusLabel()` in `@/lib/public-data`
 * covers the public statuses but excludes `'cancelled'`, which an admin can
 * set and therefore has to be able to read.
 */
export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  forfeited: 'Forfeited',
  walkover: 'Walkover',
  retired: 'Retired',
  cancelled: 'Cancelled',
}

/** Ordered for the status filter and the result picker. */
export const MATCH_STATUSES: readonly MatchStatus[] = [
  'scheduled',
  'in_progress',
  'completed',
  'forfeited',
  'walkover',
  'retired',
  'cancelled',
]

/**
 * Statuses an admin can *set* from this page.
 *
 * `'in_progress'` is missing on purpose: a match goes live because an umpire
 * started scoring it, not because an admin ticked a box. "Clear the result"
 * returns a match to `'scheduled'` instead.
 */
export const SETTABLE_MATCH_STATUSES = [
  'completed',
  'forfeited',
  'walkover',
  'retired',
  'cancelled',
  'scheduled',
] as const satisfies readonly MatchStatus[]

export type SettableMatchStatus = (typeof SETTABLE_MATCH_STATUSES)[number]

/** One-line explanation of what each result does to the score. */
export const MATCH_STATUS_BLURBS: Record<SettableMatchStatus, string> = {
  completed: 'Played out to the end. The score you enter is the score that stands.',
  forfeited: `Late or no-show. Normalises to a clean win — the loser's score is wiped.`,
  walkover: 'Withdrew before play started. Also normalises to a clean win.',
  retired: 'Stopped mid-game, usually an injury. Keeps the score actually played.',
  cancelled: 'Never happened and never will. Counts for nobody.',
  scheduled: 'Clears the result entirely and puts the match back on the timetable.',
}

/** Statuses that mean "this match has a result", from the shared enum. */
export function isDecidedStatus(status: MatchStatus): boolean {
  return (
    status === 'completed' ||
    status === 'forfeited' ||
    status === 'walkover' ||
    status === 'retired'
  )
}

/** Endings where the score is awarded rather than played. */
export function normalisesScore(status: SettableMatchStatus): boolean {
  return status === 'forfeited' || status === 'walkover'
}

/** Endings that need someone named as the pair at fault (or the pair that stopped). */
export function needsOffender(status: SettableMatchStatus): boolean {
  return status === 'forfeited' || status === 'walkover' || status === 'retired'
}

export function teamForSide(row: AdminMatchRow, side: MatchSide): AdminMatchTeam {
  return side === 'a' ? row.teamA : row.teamB
}

export function sideForTeamId(row: AdminMatchRow, teamId: string | null): MatchSide | null {
  if (!teamId) return null
  if (row.teamA.id === teamId) return 'a'
  if (row.teamB.id === teamId) return 'b'
  return null
}

/** "Court 3 · 1:00pm", or an honest gap when the fixture is not placed. */
export function whereAndWhen(row: AdminMatchRow): string {
  const where = row.courtName ?? 'No court'
  const when = row.slotLabel ?? 'no time slot'
  return `${where} · ${when}`
}

/** "Round 4" / "Semi-final (M1)" — how the fixture came to exist. */
export function roundLabel(row: AdminMatchRow): string {
  if (row.bracketKey) {
    const names: Record<NonNullable<AdminMatchRow['bracketKey']>, string> = {
      M1: 'Semi-final M1',
      M2: 'Semi-final M2',
      THIRD: 'Battle for 3rd',
      FINAL: 'Championship',
    }
    return names[row.bracketKey]
  }
  return row.round === null ? 'Round robin' : `Round ${row.round}`
}

// ---------------------------------------------------------------------------
// Filtering and search
// ---------------------------------------------------------------------------

export interface MatchFilters {
  search: string
  divisionId: string | 'all'
  stage: MatchStage | 'all'
  status: MatchStatus | 'all' | 'undecided'
}

export const EMPTY_MATCH_FILTERS: MatchFilters = {
  search: '',
  divisionId: 'all',
  stage: 'all',
  status: 'all',
}

/** Everything a search can match: both pairs, every player, court and slot. */
export function matchSearchText(row: AdminMatchRow): string {
  return [
    row.teamA.name,
    row.teamB.name,
    ...row.teamA.players,
    ...row.teamB.players,
    row.courtName ?? '',
    row.slotLabel ?? '',
    row.divisionName,
    roundLabel(row),
  ]
    .join(' ')
    .toLowerCase()
}

export function filterMatches(
  rows: readonly AdminMatchRow[],
  filters: MatchFilters,
): AdminMatchRow[] {
  const needle = filters.search.trim().toLowerCase()
  return rows.filter((row) => {
    if (filters.divisionId !== 'all' && row.divisionId !== filters.divisionId) return false
    if (filters.stage !== 'all' && row.stage !== filters.stage) return false
    if (filters.status === 'undecided') {
      if (isDecidedStatus(row.status)) return false
    } else if (filters.status !== 'all' && row.status !== filters.status) {
      return false
    }
    if (needle && !matchSearchText(row).includes(needle)) return false
    return true
  })
}

/** Running order: earliest slot, then court, then division. */
export function sortMatchRows(rows: readonly AdminMatchRow[]): AdminMatchRow[] {
  return [...rows].sort(
    (a, b) =>
      (a.slotIndex ?? Number.MAX_SAFE_INTEGER) - (b.slotIndex ?? Number.MAX_SAFE_INTEGER) ||
      (a.courtName ?? '').localeCompare(b.courtName ?? '', undefined, { numeric: true }) ||
      a.divisionName.localeCompare(b.divisionName),
  )
}

export interface MatchAdminStats {
  total: number
  decided: number
  live: number
  scheduled: number
  cancelled: number
  /** Decided matches whose scoresheet a tabulator has already verified. */
  verified: number
  unplaced: number
}

export function matchAdminStats(rows: readonly AdminMatchRow[]): MatchAdminStats {
  return {
    total: rows.length,
    decided: rows.filter((r) => isDecidedStatus(r.status)).length,
    live: rows.filter((r) => r.status === 'in_progress').length,
    scheduled: rows.filter((r) => r.status === 'scheduled').length,
    cancelled: rows.filter((r) => r.status === 'cancelled').length,
    verified: rows.filter((r) => r.scoresheetStatus === 'verified').length,
    unplaced: rows.filter((r) => r.courtId === null || r.slotId === null).length,
  }
}

// ---------------------------------------------------------------------------
// Setting a result
// ---------------------------------------------------------------------------

/** What the admin filled in. Scores are only consulted where they can matter. */
export interface ResultDraft {
  status: SettableMatchStatus
  scoreA: number
  scoreB: number
  /**
   * For `completed`, who won. For a forfeit/walkover/retirement this is
   * ignored — the offender determines the winner.
   */
  winner: MatchSide | null
  /** The pair at fault, or for a retirement the pair that stopped. */
  offender: MatchSide | null
  reason: string
}

/** The `matches` row update. Mirrors `MatchScorePatch` in `@/lib/scoring`. */
export interface MatchResultPatch {
  status: MatchStatus
  score_a: number
  score_b: number
  winner_team_id: string | null
  forfeited_by_team_id: string | null
  forfeit_reason: string | null
}

/** A sensible starting point for the dialog: whatever the match already says. */
export function draftFromRow(row: AdminMatchRow): ResultDraft {
  const offender = sideForTeamId(row, row.forfeitedByTeamId)
  const winner = sideForTeamId(row, row.winnerTeamId)
  const status: SettableMatchStatus = isDecidedStatus(row.status)
    ? (row.status as SettableMatchStatus)
    : 'completed'

  return {
    status,
    scoreA: row.scoreA,
    scoreB: row.scoreB,
    winner,
    // A retirement never blames anyone in `forfeited_by_team_id`, so recover
    // the pair that stopped from the winner instead.
    offender:
      offender ?? (row.status === 'retired' && winner ? otherMatchSide(winner) : null),
    reason: row.forfeitReason ?? '',
  }
}

function clampScore(value: number, row: AdminMatchRow): number {
  if (!Number.isFinite(value)) return 0
  const ceiling = row.cap ?? Math.max(row.pointsToWin * 2, row.pointsToWin)
  return Math.min(Math.max(Math.trunc(value), 0), ceiling)
}

/**
 * Turns a draft into the row update, applying the per-ending score rules.
 *
 * The winner is always written explicitly. For `completed` it is taken from
 * the draft and only *suggested* by the score; for the three early endings it
 * is whoever did not forfeit, withdraw or retire.
 */
export function resolveResult(row: AdminMatchRow, draft: ResultDraft): MatchResultPatch {
  const teamId = (side: MatchSide) => teamForSide(row, side).id
  const reason = draft.reason.trim() || null

  if (draft.status === 'scheduled') {
    return {
      status: 'scheduled',
      score_a: 0,
      score_b: 0,
      winner_team_id: null,
      forfeited_by_team_id: null,
      forfeit_reason: null,
    }
  }

  if (draft.status === 'cancelled') {
    return {
      status: 'cancelled',
      score_a: 0,
      score_b: 0,
      winner_team_id: null,
      forfeited_by_team_id: null,
      forfeit_reason: reason,
    }
  }

  if (draft.status === 'completed') {
    const scoreA = clampScore(draft.scoreA, row)
    const scoreB = clampScore(draft.scoreB, row)
    const winner = draft.winner ?? suggestWinner(scoreA, scoreB)
    return {
      status: 'completed',
      score_a: scoreA,
      score_b: scoreB,
      winner_team_id: winner ? teamId(winner) : null,
      forfeited_by_team_id: null,
      forfeit_reason: null,
    }
  }

  // Forfeit, walkover, retirement — the offender names itself, the winner is
  // the other pair, and only the score treatment differs.
  const offender = draft.offender
  const winner = offender ? otherMatchSide(offender) : null

  const normalised = normalisesScore(draft.status)
  const scoreA = normalised
    ? winner === 'a'
      ? row.pointsToWin
      : 0
    : clampScore(draft.scoreA, row)
  const scoreB = normalised
    ? winner === 'b'
      ? row.pointsToWin
      : 0
    : clampScore(draft.scoreB, row)

  return {
    status: draft.status,
    score_a: scoreA,
    score_b: scoreB,
    winner_team_id: winner ? teamId(winner) : null,
    // A retirement is not a forfeit. Nobody is blamed in
    // `forfeited_by_team_id`; the reason column carries the explanation.
    forfeited_by_team_id:
      draft.status === 'retired' || !offender ? null : teamId(offender),
    forfeit_reason: reason,
  }
}

/** The higher score, or `null` on a tie. Only ever a suggestion. */
export function suggestWinner(scoreA: number, scoreB: number): MatchSide | null {
  if (scoreA === scoreB) return null
  return scoreA > scoreB ? 'a' : 'b'
}

export interface ResultValidation {
  /** Blocks the save. */
  errors: string[]
  /** Worth saying out loud, but the admin may proceed. */
  warnings: string[]
  ok: boolean
}

export function validateResult(row: AdminMatchRow, draft: ResultDraft): ResultValidation {
  const errors: string[] = []
  const warnings: string[] = []

  if (draft.status !== 'scheduled' && draft.status !== 'cancelled') {
    if (!row.teamA.id || !row.teamB.id) {
      errors.push('Both pairs have to be decided before this match can have a result.')
    }
  }

  if (needsOffender(draft.status) && !draft.offender) {
    const noun = draft.status === 'retired' ? 'retired' : 'did not play'
    errors.push(`Say which pair ${noun}.`)
  }

  if (draft.status === 'completed') {
    const scoreA = clampScore(draft.scoreA, row)
    const scoreB = clampScore(draft.scoreB, row)
    if (scoreA === scoreB) {
      errors.push('A completed match cannot be a draw — badminton has no draws.')
    }
    const winner = draft.winner ?? suggestWinner(scoreA, scoreB)
    if (winner && scoreA !== scoreB) {
      const winningScore = winner === 'a' ? scoreA : scoreB
      const losingScore = winner === 'a' ? scoreB : scoreA
      if (winningScore < losingScore) {
        errors.push('The winner you picked has fewer points than the other pair.')
      }
      if (winningScore < row.pointsToWin) {
        warnings.push(
          `${teamForSide(row, winner).name} won on ${winningScore}, short of the ${row.pointsToWin} this match plays to. Record a retirement instead if they stopped early.`,
        )
      }
    }
    if (draft.scoreA !== scoreA || draft.scoreB !== scoreB) {
      warnings.push('A score was outside the range this match can produce and has been clamped.')
    }
  }

  if (draft.status === 'retired' && draft.scoreA === 0 && draft.scoreB === 0) {
    warnings.push('Nothing was played, so this may really be a walkover.')
  }

  if (needsOffender(draft.status) && !draft.reason.trim()) {
    warnings.push('No reason recorded. A line here saves an argument later.')
  }

  if (row.scoresheetStatus === 'verified' && draft.status !== row.status) {
    warnings.push(
      'The scoresheet for this match has already been verified. Changing the result changes the standings that decide the semi-finals.',
    )
  }

  return { errors, warnings, ok: errors.length === 0 }
}

/** True when saving this would overwrite a result a tabulator already signed off. */
export function overwritesVerifiedScoresheet(
  row: AdminMatchRow,
  patch: MatchResultPatch,
): boolean {
  if (row.scoresheetStatus !== 'verified') return false
  return (
    patch.status !== row.status ||
    patch.score_a !== row.scoreA ||
    patch.score_b !== row.scoreB ||
    patch.winner_team_id !== row.winnerTeamId
  )
}

export interface ChangeLine {
  label: string
  from: string
  to: string
  changed: boolean
}

function teamName(row: AdminMatchRow, teamId: string | null): string {
  if (!teamId) return '—'
  const side = sideForTeamId(row, teamId)
  return side ? teamForSide(row, side).name : 'Unknown pair'
}

/**
 * The "here is what this will do" table shown before anything is written.
 *
 * Nothing on this page saves without the admin first seeing this — an
 * override that silently rewrites a result is how standings quietly go wrong.
 */
export function describeResultChange(
  row: AdminMatchRow,
  patch: MatchResultPatch,
): ChangeLine[] {
  const line = (label: string, from: string, to: string): ChangeLine => ({
    label,
    from,
    to,
    changed: from !== to,
  })

  return [
    line('Status', MATCH_STATUS_LABELS[row.status], MATCH_STATUS_LABELS[patch.status]),
    line('Score', `${row.scoreA}–${row.scoreB}`, `${patch.score_a}–${patch.score_b}`),
    line('Winner', teamName(row, row.winnerTeamId), teamName(row, patch.winner_team_id)),
    line(
      'Forfeited by',
      teamName(row, row.forfeitedByTeamId),
      teamName(row, patch.forfeited_by_team_id),
    ),
    line('Reason', row.forfeitReason ?? '—', patch.forfeit_reason ?? '—'),
  ]
}

/** A one-sentence summary for the confirm button and the audit log. */
export function summariseResult(row: AdminMatchRow, patch: MatchResultPatch): string {
  const winner = teamName(row, patch.winner_team_id)
  switch (patch.status) {
    case 'scheduled':
      return 'Clears the result and puts the match back on the timetable.'
    case 'cancelled':
      return 'Marks the match cancelled. Neither pair gets a win.'
    case 'forfeited':
      return `${winner} win ${patch.score_a}–${patch.score_b} by forfeit.`
    case 'walkover':
      return `${winner} win ${patch.score_a}–${patch.score_b} by walkover.`
    case 'retired':
      return `${winner} win — opponents retired at ${patch.score_a}–${patch.score_b}, the score actually played.`
    default:
      return `${winner} win ${patch.score_a}–${patch.score_b}.`
  }
}

// ---------------------------------------------------------------------------
// Rescheduling
// ---------------------------------------------------------------------------

export interface RescheduleDraft {
  courtId: string | null
  slotId: string | null
}

export interface ReschedulePreview {
  /** Nothing would actually change. */
  unchanged: boolean
  /** Hard clashes the move would introduce. */
  blocking: AdminConflict[]
  /** Softer problems the move would introduce (rest gaps, roster churn). */
  warnings: AdminConflict[]
  /**
   * Conflicts that already exist and are not this move's fault. Shown so an
   * admin isn't blamed for a mess they inherited.
   */
  preExisting: number
  /** True when the target cell already holds another match. */
  occupiedBy: string | null
  from: string
  to: string
}

export interface RescheduleContext {
  match: AdminMatchRow
  draft: RescheduleDraft
  matches: readonly SchedulableMatch[]
  placements: PlacementMap
  courts: readonly ScheduleCourt[]
  slots: readonly ScheduleSlot[]
  teams: readonly ScheduleTeam[]
  /** Duty seats an admin has hand-assigned. A move can invalidate one. */
  overrides?: readonly DutyOverride[]
  minRestSlots?: number
}

function cellLabel(
  courtId: string | null,
  slotId: string | null,
  courts: readonly ScheduleCourt[],
  slots: readonly ScheduleSlot[],
): string {
  if (!courtId || !slotId) return 'Not scheduled'
  const court = courts.find((c) => c.id === courtId)
  const slot = slots.find((s) => s.id === slotId)
  return `${court?.name ?? 'Unknown court'} · ${slot?.label ?? 'unknown time'}`
}

/**
 * What moving one match would do, judged by the *same* validation pass the
 * schedule builder runs.
 *
 * The whole proposed layout is analysed, then conflicts are split by whether
 * they involve the match being moved. That is what catches the two clashes
 * that actually happen on the day: a pair playing twice in one slot, and a
 * player rostered to officiate a match they are playing in.
 */
export function previewReschedule(context: RescheduleContext): ReschedulePreview {
  const { match, draft, matches, placements, courts, slots, teams } = context

  const unchanged = draft.courtId === match.courtId && draft.slotId === match.slotId

  const next: Record<string, { courtId: string; slotId: string }> = { ...placements }
  if (draft.courtId && draft.slotId) {
    next[match.id] = { courtId: draft.courtId, slotId: draft.slotId }
  } else {
    delete next[match.id]
  }

  const analyse = (layout: PlacementMap) =>
    analyseSchedule({
      matches,
      placements: layout,
      courts,
      slots,
      teams,
      overrides: context.overrides,
      minRestSlots: context.minRestSlots,
    })

  const before = analyse(placements)
  const after = analyse(next)

  // Everything the move *introduces*, not merely everything wrong with the
  // day. Deliberately not filtered to conflicts naming this match: moving a
  // fixture re-derives the duty roster, so the clash it causes is frequently
  // reported against the match whose officials just became unavailable.
  const beforeKeys = new Set(before.conflicts.map(conflictKey))
  const introduced = after.conflicts.filter((c) => !beforeKeys.has(conflictKey(c)))

  const occupant = matches.find(
    (m) =>
      m.id !== match.id &&
      draft.courtId !== null &&
      draft.slotId !== null &&
      next[m.id]?.courtId === draft.courtId &&
      next[m.id]?.slotId === draft.slotId,
  )

  return {
    unchanged,
    blocking: introduced.filter((c) => c.tone === 'danger'),
    warnings: introduced.filter((c) => c.tone !== 'danger'),
    preExisting: before.conflicts.filter((c) => c.tone === 'danger').length,
    occupiedBy: occupant?.id ?? null,
    from: cellLabel(match.courtId, match.slotId, courts, slots),
    to: cellLabel(draft.courtId, draft.slotId, courts, slots),
  }
}

/** Identity for a conflict independent of its index-derived `id`. */
function conflictKey(conflict: AdminConflict): string {
  return `${conflict.type}::${conflict.detail}::${[...conflict.matchIds].sort().join(',')}`
}

/** The `matches` row update for a move. */
export interface ReschedulePatch {
  court_id: string | null
  time_slot_id: string | null
}

export function reschedulePatch(draft: RescheduleDraft): ReschedulePatch {
  return { court_id: draft.courtId, time_slot_id: draft.slotId }
}

/**
 * Whether a match should be moved at all.
 *
 * A match that has already been played keeps its cell in the record of the
 * day — moving it rewrites history and, worse, re-derives a duty roster that
 * real people already stood through.
 */
export function rescheduleWarnings(row: AdminMatchRow): string[] {
  const warnings: string[] = []
  if (row.status === 'in_progress') {
    warnings.push('This match is being played right now. Moving it will confuse the court.')
  }
  if (isDecidedStatus(row.status)) {
    warnings.push(
      'This match already has a result. Moving it changes the record of the day and the duty roster derived from it.',
    )
  }
  return warnings
}
