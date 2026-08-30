/**
 * Admin-side scheduling helpers: everything the `/admin/schedule` builder and
 * the `/admin/duty-roster` console need that is *not* already solved by the
 * engine in `src/lib/schedule.ts`.
 *
 * The engine owns the hard problems — first-fit court packing, the
 * "next match up officiates" derivation, and the structural conflict pass.
 * This module is the adapter between that engine and the database/UI:
 *
 *   - `matches` rows reference a `court_id` / `time_slot_id`; the engine
 *     speaks court *names* and slot *indexes*. `toScheduledMatches()` bridges
 *     the two and keeps the real match id as `ScheduledMatch.id` so duty rows
 *     can be written straight back to `duty_assignments`.
 *   - knockout fixtures can have undecided teams; they are given a
 *     placeholder team id so they still occupy a court, and simply yield no
 *     duty candidates.
 *   - the engine's `manualOverrides` replaces *every* entry for a
 *     `(matchId, role)` pair, which would wipe line judge 2 when an admin
 *     edits line judge 1. So overrides are applied here, per role *slot*,
 *     after derivation — and the result is fed back through the engine's
 *     `detectConflicts()` for validation.
 *
 * Client-safe on purpose: no React, no Supabase, no `next/headers`, no
 * wall-clock reads. Server-only loading lives in the route folders.
 */

import type { MatchStage, TeamId } from './draw'
import {
  assignToCourts,
  deriveDutyRoster,
  detectConflicts,
  type Court,
  type DutyAssignment,
  type DutyRole,
  type DutySource,
  type FixtureToSchedule,
  type ScheduleConflict,
  type ScheduledMatch,
  type TeamRoster,
  type TimeSlot,
} from './schedule'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RosterPlayer {
  id: string
  name: string
}

export interface ScheduleTeam {
  id: TeamId
  divisionId: string
  name: string
  players: RosterPlayer[]
}

export interface ScheduleCourt {
  id: string
  name: string
  sortOrder: number
}

export interface ScheduleSlot {
  id: string
  /** Running order of the day — smaller is earlier. */
  index: number
  label: string
}

export type ScheduleMatchStatus =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'forfeited'
  | 'walkover'

/** A published fixture waiting to be given a court and a time slot. */
export interface SchedulableMatch {
  id: string
  divisionId: string
  divisionName: string
  stage: MatchStage
  round: number | null
  bracketKey: 'M1' | 'M2' | 'THIRD' | 'FINAL' | null
  teamAId: TeamId | null
  teamBId: TeamId | null
  /** Placeholder shown when a knockout team isn't decided yet ("Winner of M1"). */
  sourceA: string | null
  sourceB: string | null
  courtId: string | null
  slotId: string | null
  status: ScheduleMatchStatus
  /** True once a score, forfeit or winner has been recorded. */
  hasResult: boolean
}

export interface Placement {
  courtId: string
  slotId: string
}

/** Working state of the builder: match id → where it currently sits. */
export type PlacementMap = Readonly<Record<string, Placement>>

/** A single admin edit to the derived duty roster. */
export interface DutyOverride {
  matchId: string
  role: DutyRole
  /** 0 for single-holder roles; 0 or 1 for the two line judges. */
  index: number
  /** Empty string clears the slot back to "needs a volunteer". */
  playerId: string
}

export interface DutySlot {
  matchId: string
  role: DutyRole
  index: number
  label: string
  playerId: string
  playerName: string
  source: DutySource
  /** The match whose players supplied this official, when derived. */
  sourceMatchId: string | null
}

export interface DutyMatchView {
  match: SchedulableMatch
  courtId: string
  courtName: string
  slotId: string
  slotIndex: number
  slotLabel: string
  slots: DutySlot[]
  /** True when not a single role could be filled — needs a volunteer. */
  needsVolunteers: boolean
  filledCount: number
}

export interface DutyRosterView {
  matches: DutyMatchView[]
  conflicts: ScheduleConflict[]
  dutyCountsByPlayer: Record<string, number>
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The four duty seats per match, in the order the draft rules list them. */
export const DUTY_SEATS: readonly { role: DutyRole; index: number; label: string; blurb: string }[] =
  [
    {
      role: 'umpire_scorer',
      index: 0,
      label: 'Umpire / Scorer',
      blurb: 'Calls the match and keeps the running score.',
    },
    {
      role: 'scoresheet',
      index: 0,
      label: 'Scoresheet',
      blurb: 'Fills the sheet, gets it signed, hands it to the Tabulator.',
    },
    { role: 'line_judge', index: 0, label: 'Line judge 1', blurb: 'Calls in or out. No shrugging.' },
    { role: 'line_judge', index: 1, label: 'Line judge 2', blurb: 'The other pair of eyes.' },
  ]

export const DUTY_ROLE_LABELS: Record<DutyRole, string> = {
  umpire_scorer: 'Umpire / Scorer',
  scoresheet: 'Scoresheet',
  line_judge: 'Line judge',
}

export const DUTY_SOURCE_LABELS: Record<DutySource, string> = {
  derived: 'Next match up',
  fallback: 'Borrowed from another court',
  manual: 'Assigned by an admin',
  unassigned: 'Needs a volunteer',
}

export const STAGE_LABELS: Record<MatchStage, string> = {
  elims: 'Round robin',
  semi: 'Semi final',
  third_place: 'Battle for 3rd',
  final: 'Championship',
}

const STAGE_ORDER: Record<MatchStage, number> = {
  elims: 0,
  semi: 1,
  third_place: 2,
  final: 3,
}

/** Team id stand-in for a knockout slot that has no team yet. */
const TBD_PREFIX = 'tbd::'

export function isPlaceholderTeamId(teamId: TeamId): boolean {
  return teamId.startsWith(TBD_PREFIX)
}

// ---------------------------------------------------------------------------
// Placement basics
// ---------------------------------------------------------------------------

/** Reads the placements already saved on the match rows. */
export function placementsFromMatches(matches: readonly SchedulableMatch[]): PlacementMap {
  const map: Record<string, Placement> = {}
  for (const match of matches) {
    if (match.courtId && match.slotId) {
      map[match.id] = { courtId: match.courtId, slotId: match.slotId }
    }
  }
  return map
}

export function isPlaced(placements: PlacementMap, matchId: string): boolean {
  return Boolean(placements[matchId])
}

export function unplacedMatches(
  matches: readonly SchedulableMatch[],
  placements: PlacementMap,
): SchedulableMatch[] {
  return matches.filter((match) => !placements[match.id])
}

/** Puts a match on a cell, evicting whatever else was sitting there. */
export function placeMatch(
  placements: PlacementMap,
  matchId: string,
  placement: Placement | null,
): PlacementMap {
  const next: Record<string, Placement> = {}
  for (const [id, value] of Object.entries(placements)) {
    if (id === matchId) continue
    next[id] = value
  }
  if (placement) next[matchId] = placement
  return next
}

/**
 * Swaps two matches' cells (or moves one into an empty cell) — the keyboard
 * equivalent of dragging a card onto an occupied square.
 */
export function swapMatches(
  placements: PlacementMap,
  matchIdA: string,
  matchIdB: string,
): PlacementMap {
  const a = placements[matchIdA]
  const b = placements[matchIdB]
  const next: Record<string, Placement> = { ...placements }
  if (a) next[matchIdB] = a
  else delete next[matchIdB]
  if (b) next[matchIdA] = b
  else delete next[matchIdA]
  return next
}

/** The match currently sitting on a given court + slot, if any. */
export function matchAtCell(
  matches: readonly SchedulableMatch[],
  placements: PlacementMap,
  courtId: string,
  slotId: string,
): SchedulableMatch | null {
  for (const match of matches) {
    const placement = placements[match.id]
    if (placement && placement.courtId === courtId && placement.slotId === slotId) return match
  }
  return null
}

export function sortMatches(matches: readonly SchedulableMatch[]): SchedulableMatch[] {
  return [...matches].sort((a, b) => {
    if (a.divisionId !== b.divisionId) return a.divisionId.localeCompare(b.divisionId)
    if (STAGE_ORDER[a.stage] !== STAGE_ORDER[b.stage]) return STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage]
    return (a.round ?? 0) - (b.round ?? 0) || a.id.localeCompare(b.id)
  })
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export function teamNameMap(teams: readonly ScheduleTeam[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const team of teams) map[team.id] = team.name
  return map
}

export function playerNameMap(teams: readonly ScheduleTeam[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const team of teams) for (const player of team.players) map[player.id] = player.name
  return map
}

export function sideLabel(
  teamId: TeamId | null,
  source: string | null,
  names: Record<string, string>,
): string {
  if (teamId) return names[teamId] ?? teamId
  return source ?? 'To be decided'
}

export function matchLabel(match: SchedulableMatch, names: Record<string, string>): string {
  return `${sideLabel(match.teamAId, match.sourceA, names)} v ${sideLabel(match.teamBId, match.sourceB, names)}`
}

export function stageLabel(match: SchedulableMatch): string {
  if (match.stage === 'elims') return `Round robin${match.round != null ? ` · R${match.round}` : ''}`
  return STAGE_LABELS[match.stage]
}

// ---------------------------------------------------------------------------
// Engine adapters
// ---------------------------------------------------------------------------

function teamKey(match: SchedulableMatch, side: 'A' | 'B'): TeamId {
  const id = side === 'A' ? match.teamAId : match.teamBId
  return id ?? `${TBD_PREFIX}${match.id}::${side}`
}

export function teamRosterFrom(teams: readonly ScheduleTeam[]): TeamRoster {
  return new Map(teams.map((team) => [team.id, team.players.map((p) => p.id)]))
}

/**
 * Projects placed matches onto the engine's `ScheduledMatch` shape, using the
 * *real* match id so anything derived from it (duty rows especially) can be
 * persisted without a second lookup table.
 */
export function toScheduledMatches(
  matches: readonly SchedulableMatch[],
  placements: PlacementMap,
  courts: readonly ScheduleCourt[],
  slots: readonly ScheduleSlot[],
): ScheduledMatch[] {
  const courtById = new Map(courts.map((c) => [c.id, c]))
  const slotById = new Map(slots.map((s) => [s.id, s]))

  const result: ScheduledMatch[] = []
  for (const match of matches) {
    const placement = placements[match.id]
    if (!placement) continue
    const court = courtById.get(placement.courtId)
    const slot = slotById.get(placement.slotId)
    if (!court || !slot) continue
    result.push({
      id: match.id,
      fixture: { round: match.round ?? 0, teamA: teamKey(match, 'A'), teamB: teamKey(match, 'B') },
      division: match.divisionId,
      stage: match.stage,
      court: court.name,
      slot: { index: slot.index, label: slot.label },
    })
  }
  return result.sort(
    (a, b) => a.slot.index - b.slot.index || a.court.localeCompare(b.court),
  )
}

// ---------------------------------------------------------------------------
// Auto-schedule
// ---------------------------------------------------------------------------

export interface AutoScheduleOptions {
  /** Free slots required between a pair's matches. Defaults to 1. */
  minRestSlots?: number
  /** Deterministic shuffle source, e.g. `mulberry32(seed)`. */
  rng?: () => number
  /**
   * Matches that keep their current cell (e.g. anything already played).
   * Their courts/slots are removed from the pool before packing the rest.
   */
  lockedMatchIds?: readonly string[]
}

export interface AutoScheduleResult {
  placements: PlacementMap
  /** Ids of matches that did not fit anywhere. */
  unscheduled: string[]
  conflicts: ScheduleConflict[]
}

/**
 * One-click layout. Fixtures are handed to the engine in round order — the
 * disjoint rounds `generateRoundRobin` produces are exactly what lets a whole
 * round run concurrently across the courts — and the engine's first-fit
 * packer does the rest.
 *
 * Locked matches (typically anything with a result already recorded) keep
 * their cell: the engine is only offered the cells they do not occupy.
 */
export function autoSchedule(
  matches: readonly SchedulableMatch[],
  courts: readonly ScheduleCourt[],
  slots: readonly ScheduleSlot[],
  existing: PlacementMap = {},
  options: AutoScheduleOptions = {},
): AutoScheduleResult {
  const locked = new Set(options.lockedMatchIds ?? [])
  const lockedPlacements: Record<string, Placement> = {}
  const takenCells = new Set<string>()
  for (const match of matches) {
    if (!locked.has(match.id)) continue
    const placement = existing[match.id]
    if (!placement) continue
    lockedPlacements[match.id] = placement
    takenCells.add(`${placement.courtId}#${placement.slotId}`)
  }

  const courtByName = new Map(courts.map((c) => [c.name, c]))
  const slotByIndex = new Map(slots.map((s) => [s.index, s]))

  const orderedCourts = [...courts].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  const orderedSlots = [...slots].sort((a, b) => a.index - b.index)

  // Fixtures the engine may place, tagged so results map back to match ids.
  const toPlace = sortMatches(matches.filter((m) => !locked.has(m.id)))
  const matchIdByFixture = new Map<object, string>()
  const items: FixtureToSchedule[] = toPlace.map((match) => {
    const fixture = {
      round: match.round ?? STAGE_ORDER[match.stage] + 1000,
      teamA: teamKey(match, 'A'),
      teamB: teamKey(match, 'B'),
    }
    matchIdByFixture.set(fixture, match.id)
    return { fixture, division: match.divisionId, stage: match.stage }
  })

  const engineCourts: Court[] = orderedCourts.map((c) => c.name)
  const engineSlots: TimeSlot[] = orderedSlots.map((s) => ({ index: s.index, label: s.label }))

  const result = assignToCourts(items, engineCourts, engineSlots, {
    minRestSlots: options.minRestSlots,
    rng: options.rng,
  })

  const placements: Record<string, Placement> = { ...lockedPlacements }
  const unscheduled: string[] = []
  const conflicts: ScheduleConflict[] = [...result.conflicts]

  // Teams already committed to a slot index (locked matches included), so the
  // repair pass below never creates a clash the engine would have avoided.
  const teamsBySlotIndex = new Map<number, Set<TeamId>>()
  const slotIndexById = new Map(slots.map((s) => [s.id, s.index]))
  const claimSlot = (slotIndex: number, match: SchedulableMatch) => {
    const set = teamsBySlotIndex.get(slotIndex) ?? new Set<TeamId>()
    set.add(teamKey(match, 'A'))
    set.add(teamKey(match, 'B'))
    teamsBySlotIndex.set(slotIndex, set)
  }
  const matchById = new Map(matches.map((m) => [m.id, m]))
  for (const [matchId, placement] of Object.entries(lockedPlacements)) {
    const slotIndex = slotIndexById.get(placement.slotId)
    const match = matchById.get(matchId)
    if (slotIndex != null && match) claimSlot(slotIndex, match)
  }

  const deferred: string[] = []

  for (const scheduled of result.schedule) {
    const matchId = matchIdByFixture.get(scheduled.fixture)
    const court = courtByName.get(scheduled.court)
    const slot = slotByIndex.get(scheduled.slot.index)
    const match = matchId ? matchById.get(matchId) : undefined
    if (!matchId || !court || !slot || !match) continue
    if (takenCells.has(`${court.id}#${slot.id}`)) {
      // The engine does not know about locked cells, so it can land on one.
      deferred.push(matchId)
      continue
    }
    takenCells.add(`${court.id}#${slot.id}`)
    claimSlot(slot.index, match)
    placements[matchId] = { courtId: court.id, slotId: slot.id }
  }

  // Repair pass: first free cell where neither pair is already committed.
  for (const matchId of deferred) {
    const match = matchById.get(matchId)
    if (!match) continue
    let placed = false
    for (const slot of orderedSlots) {
      const busy = teamsBySlotIndex.get(slot.index)
      if (busy?.has(teamKey(match, 'A')) || busy?.has(teamKey(match, 'B'))) continue
      for (const court of orderedCourts) {
        if (takenCells.has(`${court.id}#${slot.id}`)) continue
        takenCells.add(`${court.id}#${slot.id}`)
        claimSlot(slot.index, match)
        placements[matchId] = { courtId: court.id, slotId: slot.id }
        placed = true
        break
      }
      if (placed) break
    }
    if (!placed) unscheduled.push(matchId)
  }

  for (const leftover of result.unscheduled) {
    const matchId = matchIdByFixture.get(leftover.fixture)
    if (matchId) unscheduled.push(matchId)
  }

  if (unscheduled.length > 0 && !conflicts.some((c) => c.type === 'unassigned_fixture')) {
    conflicts.push({
      type: 'unassigned_fixture',
      severity: 'error',
      message: `${unscheduled.length} match(es) could not be placed — add more courts or time slots.`,
    })
  }

  return { placements, unscheduled, conflicts }
}

// ---------------------------------------------------------------------------
// Timeline grid
// ---------------------------------------------------------------------------

export interface TimelineCell {
  courtId: string
  courtName: string
  slotId: string
  slotIndex: number
  slotLabel: string
  match: SchedulableMatch | null
  /** True when more than one match claims this exact cell. */
  doubleBooked: boolean
}

export interface TimelineRow {
  slot: ScheduleSlot
  cells: TimelineCell[]
}

/** Courts × time slots, ready to render as a grid. */
export function buildTimeline(
  matches: readonly SchedulableMatch[],
  placements: PlacementMap,
  courts: readonly ScheduleCourt[],
  slots: readonly ScheduleSlot[],
): TimelineRow[] {
  const byCell = new Map<string, SchedulableMatch[]>()
  for (const match of matches) {
    const placement = placements[match.id]
    if (!placement) continue
    const key = `${placement.courtId}#${placement.slotId}`
    byCell.set(key, [...(byCell.get(key) ?? []), match])
  }

  const orderedCourts = [...courts].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))

  return [...slots]
    .sort((a, b) => a.index - b.index)
    .map((slot) => ({
      slot,
      cells: orderedCourts.map((court) => {
        const occupants = byCell.get(`${court.id}#${slot.id}`) ?? []
        return {
          courtId: court.id,
          courtName: court.name,
          slotId: slot.id,
          slotIndex: slot.index,
          slotLabel: slot.label,
          match: occupants[0] ?? null,
          doubleBooked: occupants.length > 1,
        }
      }),
    }))
}

// ---------------------------------------------------------------------------
// Rest gaps
// ---------------------------------------------------------------------------

export interface RestGapRow {
  teamId: TeamId
  teamName: string
  slotIndexes: number[]
  /** Smallest number of free slots between two of this pair's matches. */
  minGap: number
  tight: boolean
}

/**
 * Per-pair rest analysis for the builder's sidebar: how many free slots each
 * pair gets between matches. `minGap` is `Infinity` for a pair with one
 * match, reported as `-1` so the value stays JSON-serialisable.
 */
export function restGaps(
  matches: readonly SchedulableMatch[],
  placements: PlacementMap,
  slots: readonly ScheduleSlot[],
  teams: readonly ScheduleTeam[],
  minRestSlots = 1,
): RestGapRow[] {
  const slotById = new Map(slots.map((s) => [s.id, s]))
  const names = teamNameMap(teams)
  const byTeam = new Map<TeamId, number[]>()

  for (const match of matches) {
    const placement = placements[match.id]
    const slot = placement ? slotById.get(placement.slotId) : undefined
    if (!slot) continue
    for (const teamId of [match.teamAId, match.teamBId]) {
      if (!teamId) continue
      byTeam.set(teamId, [...(byTeam.get(teamId) ?? []), slot.index])
    }
  }

  const rows: RestGapRow[] = []
  for (const [teamId, indexes] of byTeam) {
    const sorted = [...indexes].sort((a, b) => a - b)
    let minGap = -1
    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = sorted[i + 1] - sorted[i] - 1
      minGap = minGap === -1 ? gap : Math.min(minGap, gap)
    }
    rows.push({
      teamId,
      teamName: names[teamId] ?? teamId,
      slotIndexes: sorted,
      minGap,
      tight: minGap !== -1 && minGap < minRestSlots,
    })
  }

  return rows.sort((a, b) => {
    const aGap = a.minGap === -1 ? Number.POSITIVE_INFINITY : a.minGap
    const bGap = b.minGap === -1 ? Number.POSITIVE_INFINITY : b.minGap
    return aGap - bGap || a.teamName.localeCompare(b.teamName)
  })
}

// ---------------------------------------------------------------------------
// Duty roster
// ---------------------------------------------------------------------------

function seatKey(matchId: string, role: DutyRole, index: number): string {
  return `${matchId}::${role}::${index}`
}

/**
 * Derives the roster with the engine, then layers admin overrides on per
 * *seat* (see the module note — the engine's own override mechanism replaces
 * every seat of a role, which would blow away line judge 2).
 */
export function buildDutyRoster(input: {
  matches: readonly SchedulableMatch[]
  placements: PlacementMap
  courts: readonly ScheduleCourt[]
  slots: readonly ScheduleSlot[]
  teams: readonly ScheduleTeam[]
  overrides?: readonly DutyOverride[]
}): DutyRosterView {
  const { matches, placements, courts, slots, teams } = input
  const scheduled = toScheduledMatches(matches, placements, courts, slots)
  const roster = teamRosterFrom(teams)
  const derived = deriveDutyRoster(scheduled, roster)
  const names = playerNameMap(teams)

  const matchById = new Map(matches.map((m) => [m.id, m]))
  const courtByName = new Map(courts.map((c) => [c.name, c]))
  const slotByIndex = new Map(slots.map((s) => [s.index, s]))

  // Which match supplied each derived official, so `source_match_id` can be
  // written back exactly as the schema documents it.
  const sourceMatchIdByMatch = new Map<string, string>()
  const byCourt = new Map<string, ScheduledMatch[]>()
  for (const match of scheduled) {
    byCourt.set(match.court, [...(byCourt.get(match.court) ?? []), match])
  }
  for (const list of byCourt.values()) {
    list.sort((a, b) => a.slot.index - b.slot.index)
    for (let i = 0; i < list.length - 1; i++) {
      sourceMatchIdByMatch.set(list[i].id, list[i + 1].id)
    }
  }
  const chronological = [...scheduled]
  for (const match of scheduled) {
    if (sourceMatchIdByMatch.has(match.id)) continue
    const next = chronological.find((m) => m.slot.index > match.slot.index && m.id !== match.id)
    if (next) sourceMatchIdByMatch.set(match.id, next.id)
  }

  // Engine assignments, bucketed into seats in ROLE_ORDER order.
  const seatValues = new Map<string, DutyAssignment>()
  const seenPerRole = new Map<string, number>()
  for (const assignment of derived.assignments) {
    const roleKey = `${assignment.matchId}::${assignment.role}`
    const index = seenPerRole.get(roleKey) ?? 0
    seenPerRole.set(roleKey, index + 1)
    seatValues.set(seatKey(assignment.matchId, assignment.role, index), assignment)
  }

  const overrideBySeat = new Map<string, DutyOverride>()
  for (const override of input.overrides ?? []) {
    overrideBySeat.set(seatKey(override.matchId, override.role, override.index), override)
  }

  const views: DutyMatchView[] = []
  const flat: DutyAssignment[] = []

  for (const scheduledMatch of scheduled) {
    const match = matchById.get(scheduledMatch.id)
    const court = courtByName.get(scheduledMatch.court)
    const slot = slotByIndex.get(scheduledMatch.slot.index)
    if (!match || !court || !slot) continue

    const sourceMatchId = sourceMatchIdByMatch.get(scheduledMatch.id) ?? null
    const dutySlots: DutySlot[] = DUTY_SEATS.map((seat) => {
      const key = seatKey(scheduledMatch.id, seat.role, seat.index)
      const override = overrideBySeat.get(key)
      const engineValue = seatValues.get(key)

      const playerId = override ? override.playerId : (engineValue?.player ?? '')
      const source: DutySource = override
        ? playerId
          ? 'manual'
          : 'unassigned'
        : (engineValue?.source ?? 'unassigned')

      if (playerId) {
        flat.push({ matchId: scheduledMatch.id, role: seat.role, player: playerId, source })
      }

      return {
        matchId: scheduledMatch.id,
        role: seat.role,
        index: seat.index,
        label: seat.label,
        playerId,
        playerName: playerId ? (names[playerId] ?? playerId) : '',
        source,
        sourceMatchId: source === 'derived' || source === 'fallback' ? sourceMatchId : null,
      }
    })

    const filledCount = dutySlots.filter((s) => s.playerId).length
    views.push({
      match,
      courtId: court.id,
      courtName: court.name,
      slotId: slot.id,
      slotIndex: slot.index,
      slotLabel: slot.label,
      slots: dutySlots,
      filledCount,
      needsVolunteers: filledCount === 0,
    })
  }

  const dutyCountsByPlayer: Record<string, number> = {}
  for (const assignment of flat) {
    dutyCountsByPlayer[assignment.player] = (dutyCountsByPlayer[assignment.player] ?? 0) + 1
  }

  const conflicts = detectConflicts(
    scheduled,
    { assignments: flat, dutyCountsByPlayer: new Map(), conflicts: [] },
    { teamRoster: roster },
  )

  // Keep the engine's derivation notes (fallback courts, partially filled
  // matches) — `detectConflicts` deliberately does not re-derive those.
  const extra = derived.conflicts.filter(
    (c) => c.type === 'fallback_officials_used' || c.type === 'partial_officials_assigned',
  )
  const stillRelevant = extra.filter((c) => {
    const id = c.matchIds?.[0]
    if (!id) return true
    const view = views.find((v) => v.match.id === id)
    if (!view) return false
    if (c.type === 'partial_officials_assigned') return view.filledCount < DUTY_SEATS.length
    return view.slots.some((s) => s.source === 'fallback')
  })

  return { matches: views, conflicts: [...conflicts, ...stillRelevant], dutyCountsByPlayer }
}

// ---------------------------------------------------------------------------
// Duty validation — the invariant that matters most
// ---------------------------------------------------------------------------

export interface DutyEligibility {
  allowed: boolean
  /** Festive, human explanation shown to the admin. */
  reason: string
}

/**
 * The hard rule: **nobody officiates a match they are playing in**, and
 * nobody officiates while they are on court somewhere else in that same slot.
 * Clearing a seat (empty `playerId`) is always allowed.
 */
export function canAssignOfficial(input: {
  matchId: string
  playerId: string
  matches: readonly SchedulableMatch[]
  placements: PlacementMap
  courts: readonly ScheduleCourt[]
  slots: readonly ScheduleSlot[]
  teams: readonly ScheduleTeam[]
}): DutyEligibility {
  const { matchId, playerId, matches, placements, courts, slots, teams } = input
  if (!playerId) return { allowed: true, reason: 'Leaves this seat open for a volunteer.' }

  const target = matches.find((m) => m.id === matchId)
  if (!target) return { allowed: false, reason: 'That match is not on the schedule any more.' }

  const teamOfPlayer = new Map<string, ScheduleTeam>()
  for (const team of teams) for (const player of team.players) teamOfPlayer.set(player.id, team)
  const team = teamOfPlayer.get(playerId)

  if (team && (target.teamAId === team.id || target.teamBId === team.id)) {
    return {
      allowed: false,
      reason: `${playerNameMap(teams)[playerId] ?? 'That player'} is playing in this match — nobody umpires their own game, not even Santa. 🎅`,
    }
  }

  const placement = placements[matchId]
  const slotById = new Map(slots.map((s) => [s.id, s]))
  const slotIndex = placement ? slotById.get(placement.slotId)?.index : undefined
  if (slotIndex == null) {
    return { allowed: true, reason: 'This match has no time slot yet, so there is nothing to clash with.' }
  }

  const courtById = new Map(courts.map((c) => [c.id, c]))
  for (const other of matches) {
    if (other.id === matchId) continue
    const otherPlacement = placements[other.id]
    if (!otherPlacement) continue
    if (slotById.get(otherPlacement.slotId)?.index !== slotIndex) continue
    if (!team) continue
    if (other.teamAId === team.id || other.teamBId === team.id) {
      const courtName = courtById.get(otherPlacement.courtId)?.name ?? 'another court'
      return {
        allowed: false,
        reason: `They are on ${courtName} at the same time — one shuttlecock each, please. 🏸`,
      }
    }
  }

  return { allowed: true, reason: 'Free this slot — good to go.' }
}

export interface OfficialOption {
  playerId: string
  playerName: string
  teamName: string
  disabled: boolean
  reason: string
  /** True when this player comes from the next match up on the same court. */
  nextUp: boolean
}

/**
 * Every player, marked up with whether they may take a seat on this match.
 * The next-match-up players float to the top — they are the rule as written.
 */
export function eligibleOfficials(input: {
  matchId: string
  matches: readonly SchedulableMatch[]
  placements: PlacementMap
  courts: readonly ScheduleCourt[]
  slots: readonly ScheduleSlot[]
  teams: readonly ScheduleTeam[]
}): OfficialOption[] {
  const { matchId, matches, placements, courts, slots, teams } = input
  const scheduled = toScheduledMatches(matches, placements, courts, slots)
  const target = scheduled.find((m) => m.id === matchId)

  const nextUpTeams = new Set<TeamId>()
  if (target) {
    const sameCourt = scheduled
      .filter((m) => m.court === target.court && m.slot.index > target.slot.index)
      .sort((a, b) => a.slot.index - b.slot.index)[0]
    if (sameCourt) {
      nextUpTeams.add(sameCourt.fixture.teamA)
      nextUpTeams.add(sameCourt.fixture.teamB)
    }
  }

  const options: OfficialOption[] = []
  for (const team of teams) {
    for (const player of team.players) {
      const verdict = canAssignOfficial({ ...input, playerId: player.id })
      options.push({
        playerId: player.id,
        playerName: player.name,
        teamName: team.name,
        disabled: !verdict.allowed,
        reason: verdict.reason,
        nextUp: nextUpTeams.has(team.id),
      })
    }
  }

  return options.sort((a, b) => {
    if (a.disabled !== b.disabled) return a.disabled ? 1 : -1
    if (a.nextUp !== b.nextUp) return a.nextUp ? -1 : 1
    return a.playerName.localeCompare(b.playerName)
  })
}

/** Matches where not a single official could be found — need a volunteer. */
export function matchesNeedingVolunteers(view: DutyRosterView): DutyMatchView[] {
  return view.matches.filter((m) => m.needsVolunteers)
}

/** Matches with at least one empty seat. */
export function matchesWithEmptySeats(view: DutyRosterView): DutyMatchView[] {
  return view.matches.filter((m) => m.filledCount < DUTY_SEATS.length)
}

export interface PlayerDutyRow {
  playerId: string
  playerName: string
  duties: {
    matchId: string
    courtName: string
    slotLabel: string
    slotIndex: number
    role: DutyRole
    roleLabel: string
  }[]
}

/** "Your duties" summary, one row per player who has been given a seat. */
export function dutiesByPlayer(view: DutyRosterView): PlayerDutyRow[] {
  const byPlayer = new Map<string, PlayerDutyRow>()
  for (const match of view.matches) {
    for (const slot of match.slots) {
      if (!slot.playerId) continue
      const row = byPlayer.get(slot.playerId) ?? {
        playerId: slot.playerId,
        playerName: slot.playerName,
        duties: [],
      }
      row.duties.push({
        matchId: match.match.id,
        courtName: match.courtName,
        slotLabel: match.slotLabel,
        slotIndex: match.slotIndex,
        role: slot.role,
        roleLabel: slot.label,
      })
      byPlayer.set(slot.playerId, row)
    }
  }
  for (const row of byPlayer.values()) {
    row.duties.sort((a, b) => a.slotIndex - b.slotIndex || a.courtName.localeCompare(b.courtName))
  }
  return [...byPlayer.values()].sort((a, b) => a.playerName.localeCompare(b.playerName))
}

export interface CourtSheet {
  courtId: string
  courtName: string
  matches: DutyMatchView[]
}

/** Per-court running order — the sheet an admin tapes to the net post. */
export function printableCourtSheets(view: DutyRosterView): CourtSheet[] {
  const byCourt = new Map<string, CourtSheet>()
  for (const match of view.matches) {
    const sheet = byCourt.get(match.courtId) ?? {
      courtId: match.courtId,
      courtName: match.courtName,
      matches: [],
    }
    sheet.matches.push(match)
    byCourt.set(match.courtId, sheet)
  }
  for (const sheet of byCourt.values()) sheet.matches.sort((a, b) => a.slotIndex - b.slotIndex)
  return [...byCourt.values()].sort((a, b) => a.courtName.localeCompare(b.courtName))
}

/** `duty_assignments` insert payloads for the whole roster. */
export interface DutyAssignmentInsert {
  match_id: string
  player_id: string
  duty_role: DutyRole
  source_match_id: string | null
}

export function dutyRosterInserts(view: DutyRosterView): DutyAssignmentInsert[] {
  const rows: DutyAssignmentInsert[] = []
  const seen = new Set<string>()
  for (const match of view.matches) {
    for (const slot of match.slots) {
      if (!slot.playerId) continue
      // The schema's unique (match_id, player_id, duty_role) means the same
      // person cannot hold the same role twice on one match — skip rather
      // than let the whole insert fail.
      const key = `${match.match.id}::${slot.playerId}::${slot.role}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({
        match_id: match.match.id,
        player_id: slot.playerId,
        duty_role: slot.role,
        source_match_id: slot.sourceMatchId,
      })
    }
  }
  return rows
}

// ---------------------------------------------------------------------------
// Schedule analysis
// ---------------------------------------------------------------------------

export type ConflictTone = 'danger' | 'warn' | 'info'

export interface AdminConflict {
  id: string
  type: ScheduleConflict['type']
  tone: ConflictTone
  title: string
  detail: string
  matchIds: string[]
}

const CONFLICT_TITLES: Record<ScheduleConflict['type'], string> = {
  pair_double_booked: 'A pair is in two places at once',
  court_double_booked: 'A court is double-booked',
  insufficient_rest: 'No breather between matches',
  unassigned_fixture: 'Matches with nowhere to play',
  officiating_while_playing: 'Someone is playing and officiating at once',
  no_officials_assigned: 'Nobody free to officiate',
  partial_officials_assigned: 'Not every duty seat is filled',
  fallback_officials_used: 'Officials borrowed from another court',
}

/**
 * `no_officials_assigned` is reported as an *error* by the engine, but the
 * last match on a court legitimately has no "next match up" to draw from —
 * that is a roster gap for an admin to fill with a volunteer, not a broken
 * schedule. It is softened to a warning here so it can never deadlock the
 * publish button, and the duty roster page surfaces it in its own rail.
 */
function tone(conflict: ScheduleConflict): ConflictTone {
  if (conflict.type === 'no_officials_assigned') return 'warn'
  if (conflict.severity === 'error') return 'danger'
  if (conflict.severity === 'warning') return 'warn'
  return 'info'
}

export function describeConflict(conflict: ScheduleConflict, index: number): AdminConflict {
  return {
    id: `${conflict.type}-${index}`,
    type: conflict.type,
    tone: tone(conflict),
    title: CONFLICT_TITLES[conflict.type],
    detail: conflict.message,
    matchIds: conflict.matchIds ?? [],
  }
}

export interface ScheduleAnalysis {
  conflicts: AdminConflict[]
  errorCount: number
  warningCount: number
  infoCount: number
  placedCount: number
  unplacedCount: number
  /** No hard conflicts and nothing left unplaced. */
  clean: boolean
  matchIdsWithErrors: string[]
}

/**
 * The full validation pass behind the builder's conflict rail. Runs the
 * engine's `detectConflicts()` over the *current* (possibly hand-edited)
 * layout together with the roster that layout would produce, so
 * "playing and officiating at once" is caught while the admin is still
 * dragging things around.
 */
export function analyseSchedule(input: {
  matches: readonly SchedulableMatch[]
  placements: PlacementMap
  courts: readonly ScheduleCourt[]
  slots: readonly ScheduleSlot[]
  teams: readonly ScheduleTeam[]
  overrides?: readonly DutyOverride[]
  minRestSlots?: number
}): ScheduleAnalysis {
  const { matches, placements, courts, slots, teams, minRestSlots = 1 } = input
  const scheduled = toScheduledMatches(matches, placements, courts, slots)
  const roster = teamRosterFrom(teams)

  const dutyView = buildDutyRoster({
    matches,
    placements,
    courts,
    slots,
    teams,
    overrides: input.overrides,
  })
  const flat: DutyAssignment[] = dutyView.matches.flatMap((m) =>
    m.slots
      .filter((s) => s.playerId)
      .map((s) => ({ matchId: m.match.id, role: s.role, player: s.playerId, source: s.source })),
  )

  const raw = detectConflicts(
    scheduled,
    { assignments: flat, dutyCountsByPlayer: new Map(), conflicts: [] },
    { teamRoster: roster, minRestSlots },
  )

  const unplaced = unplacedMatches(matches, placements)
  if (unplaced.length > 0) {
    raw.push({
      type: 'unassigned_fixture',
      severity: 'error',
      message: `${unplaced.length} match${unplaced.length === 1 ? ' has' : 'es have'} no court or time slot yet.`,
      matchIds: unplaced.map((m) => m.id),
    })
  }

  const conflicts = raw.map(describeConflict)
  const matchIdsWithErrors = [
    ...new Set(conflicts.filter((c) => c.tone === 'danger').flatMap((c) => c.matchIds)),
  ]

  const errorCount = conflicts.filter((c) => c.tone === 'danger').length
  const warningCount = conflicts.filter((c) => c.tone === 'warn').length

  return {
    conflicts,
    errorCount,
    warningCount,
    infoCount: conflicts.filter((c) => c.tone === 'info').length,
    placedCount: scheduled.length,
    unplacedCount: unplaced.length,
    clean: errorCount === 0 && unplaced.length === 0,
    matchIdsWithErrors,
  }
}

// ---------------------------------------------------------------------------
// Publish safety
// ---------------------------------------------------------------------------

export interface SchedulePublishSafety {
  movedCount: number
  /** Matches with a recorded result whose court/slot would change. */
  movedWithResults: string[]
  destructive: boolean
  requiresOverride: boolean
  canPublish: boolean
  level: ConflictTone
  headline: string
  detail: string
}

export interface SchedulePublishOptions {
  /** The admin ticked "publish anyway" for outstanding hard conflicts. */
  overrideConflicts?: boolean
  /** The admin accepted that played matches will be moved. */
  confirmMoveResults?: boolean
}

/**
 * Gates the publish button. Two independent hazards:
 *   1. unresolved hard conflicts — needs an explicit override;
 *   2. re-shuffling matches that already have a result — needs a separate,
 *      louder confirmation, because a played match moving court confuses
 *      everyone holding a printed schedule.
 */
export function schedulePublishSafety(
  matches: readonly SchedulableMatch[],
  placements: PlacementMap,
  analysis: ScheduleAnalysis,
  options: SchedulePublishOptions = {},
): SchedulePublishSafety {
  const moved: string[] = []
  const movedWithResults: string[] = []

  for (const match of matches) {
    const next = placements[match.id]
    const changed = (next?.courtId ?? null) !== match.courtId || (next?.slotId ?? null) !== match.slotId
    if (!changed) continue
    moved.push(match.id)
    if (match.hasResult) movedWithResults.push(match.id)
  }

  const destructive = movedWithResults.length > 0
  const requiresOverride = analysis.errorCount > 0 || analysis.unplacedCount > 0
  const overrideOk = !requiresOverride || Boolean(options.overrideConflicts)
  const resultsOk = !destructive || Boolean(options.confirmMoveResults)

  let headline = 'Ready to publish'
  let detail = `${moved.length} match${moved.length === 1 ? '' : 'es'} will change court or time slot.`
  let level: ConflictTone = 'info'

  if (destructive) {
    level = 'danger'
    headline = `${movedWithResults.length} played match${movedWithResults.length === 1 ? '' : 'es'} would move`
    detail =
      'Those matches already have a result. Moving them rewrites a schedule people have already played to — only do this if you are certain.'
  } else if (requiresOverride) {
    level = 'danger'
    headline = `${analysis.errorCount + (analysis.unplacedCount > 0 ? 1 : 0)} unresolved problem${analysis.errorCount === 1 && analysis.unplacedCount === 0 ? '' : 's'}`
    detail =
      'Hard conflicts are still on the board. Fix them, or tick the override to publish anyway and sort it out courtside.'
  } else if (moved.length === 0) {
    headline = 'Nothing to publish'
    detail = 'The saved schedule already matches what is on screen.'
  }

  return {
    movedCount: moved.length,
    movedWithResults,
    destructive,
    requiresOverride,
    canPublish: overrideOk && resultsOk && moved.length > 0,
    level,
    headline,
    detail,
  }
}

/** `matches` update payloads for the placements that actually changed. */
export interface SchedulePatch {
  id: string
  court_id: string | null
  time_slot_id: string | null
}

export function schedulePatches(
  matches: readonly SchedulableMatch[],
  placements: PlacementMap,
): SchedulePatch[] {
  const patches: SchedulePatch[] = []
  for (const match of matches) {
    const next = placements[match.id] ?? null
    const courtId = next?.courtId ?? null
    const slotId = next?.slotId ?? null
    if (courtId === match.courtId && slotId === match.slotId) continue
    patches.push({ id: match.id, court_id: courtId, time_slot_id: slotId })
  }
  return patches
}

// ---------------------------------------------------------------------------
// Headline stats
// ---------------------------------------------------------------------------

export interface ScheduleStats {
  total: number
  placed: number
  unplaced: number
  courts: number
  slots: number
  /** Slots between the first and last placed match, inclusive. */
  slotsUsed: number
  divisions: { divisionId: string; divisionName: string; total: number; placed: number }[]
}

export function scheduleStats(
  matches: readonly SchedulableMatch[],
  placements: PlacementMap,
  courts: readonly ScheduleCourt[],
  slots: readonly ScheduleSlot[],
): ScheduleStats {
  const slotById = new Map(slots.map((s) => [s.id, s]))
  const used: number[] = []
  const byDivision = new Map<string, { divisionId: string; divisionName: string; total: number; placed: number }>()

  for (const match of matches) {
    const entry = byDivision.get(match.divisionId) ?? {
      divisionId: match.divisionId,
      divisionName: match.divisionName,
      total: 0,
      placed: 0,
    }
    entry.total += 1
    const placement = placements[match.id]
    if (placement) {
      entry.placed += 1
      const slot = slotById.get(placement.slotId)
      if (slot) used.push(slot.index)
    }
    byDivision.set(match.divisionId, entry)
  }

  const placed = matches.filter((m) => placements[m.id]).length
  return {
    total: matches.length,
    placed,
    unplaced: matches.length - placed,
    courts: courts.length,
    slots: slots.length,
    slotsUsed: used.length > 0 ? Math.max(...used) - Math.min(...used) + 1 : 0,
    divisions: [...byDivision.values()].sort((a, b) => a.divisionName.localeCompare(b.divisionName)),
  }
}
