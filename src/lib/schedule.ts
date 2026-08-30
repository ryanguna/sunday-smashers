/**
 * Court scheduling and duty-roster engine for the Sunday Smashers
 * Christmas Mini Tournament.
 *
 * Draft rules (v1, from the admin team — configurable, not final):
 *   Courts       : matches are played across a small number of courts, one
 *                  match per court per time slot.
 *   Duty roster  : "Next match up players will be designated as the
 *                  Umpire/Scorer, Scoresheet person, 2 Line person" — i.e.
 *                  the officials for a match are drawn from the players of
 *                  the *following* match on the *same* court.
 *   Scoresheets  : provided per court, signed by players after each game.
 *   Forfeit      : late or no-show is an automatic forfeit (handled by
 *                  `draw.ts`; this module only lays out *when and where*
 *                  matches happen and *who* officiates them).
 *
 * This module is the pure scheduling/roster counterpart to `draw.ts`: no
 * database access, no React, no wall-clock reads — every date, slot and
 * random source is passed in by the caller so results are reproducible.
 */

import type { Fixture, MatchStage, TeamId } from './draw'

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

/** A physical court, e.g. "Court 1". */
export type Court = string

/** A division being contested, e.g. "mens_doubles" or "womens_doubles". */
export type Division = string

/** An individual player, as distinct from a `TeamId` (a doubles pair). */
export type PlayerId = string

/**
 * A time slot in the running order of the day. `index` is the only value the
 * algorithms use (smaller = earlier); `label` is purely informational
 * (e.g. "9:00am") so the UI can render a human-readable schedule.
 */
export interface TimeSlot {
  index: number
  label?: string
}

/** A fixture waiting to be placed on a court, tagged with its division/stage. */
export interface FixtureToSchedule {
  fixture: Fixture
  division: Division
  stage: MatchStage
}

/** A fixture that has been placed on a specific court and time slot. */
export interface ScheduledMatch {
  /** Stable identifier derived from court + slot — see `matchId`. */
  id: string
  fixture: Fixture
  division: Division
  stage: MatchStage
  court: Court
  slot: TimeSlot
}

/** Deterministic identifier for a scheduled match: unique per court+slot. */
export function matchId(match: Pick<ScheduledMatch, 'court' | 'slot'>): string {
  return `${match.court}#${match.slot.index}`
}

/**
 * Maps each pair (`TeamId`) to its individual players. Doubles pairs have two
 * players; entries with fewer than two are tolerated (e.g. a player yet to be
 * confirmed) and simply yield fewer duty candidates.
 */
export type TeamRoster = ReadonlyMap<TeamId, readonly PlayerId[]>

/**
 * The three duty roles quoted in the draft rules. There are two line-judge
 * assignments per match (the rules say "2 Line person"), so a match can have
 * up to four `DutyAssignment` rows: one `umpire_scorer`, one `scoresheet`,
 * two `line_judge`.
 */
export type DutyRole = 'umpire_scorer' | 'scoresheet' | 'line_judge'

export type DutySource =
  /** Drawn from the players of the next match on the same court (the rule as written). */
  | 'derived'
  /** Last match on a court has no "next match" on that court — sourced from
   * the next chronological match on a different court instead. */
  | 'fallback'
  /** Supplied by an admin via `manualOverrides`, always wins. */
  | 'manual'
  /** No eligible player could be found — needs a manual admin assignment. */
  | 'unassigned'

export interface DutyAssignment {
  matchId: string
  role: DutyRole
  /** Empty string when `source` is `'unassigned'`. */
  player: PlayerId
  source: DutySource
}

export type ConflictSeverity = 'error' | 'warning' | 'info'

export type ConflictType =
  | 'pair_double_booked'
  | 'court_double_booked'
  | 'insufficient_rest'
  | 'unassigned_fixture'
  | 'officiating_while_playing'
  | 'no_officials_assigned'
  | 'partial_officials_assigned'
  | 'fallback_officials_used'

/** A problem found in a schedule or duty roster, suitable for showing an admin. */
export interface ScheduleConflict {
  type: ConflictType
  severity: ConflictSeverity
  message: string
  matchIds?: string[]
  teamId?: TeamId
  playerId?: PlayerId
  court?: Court
  slot?: number
}

// ---------------------------------------------------------------------------
// Court assignment
// ---------------------------------------------------------------------------

export interface AssignToCourtsOptions {
  /**
   * Minimum number of *free* slots required between two matches of the same
   * pair. `0` allows back-to-back matches; the default of `1` requires at
   * least one empty slot in between. When no cell satisfies this the match
   * is still placed (never left unscheduled purely for rest) and a
   * `insufficient_rest` conflict is reported instead.
   */
  minRestSlots?: number
  /**
   * Optional seeded random source in `[0, 1)`, e.g. `mulberry32(seed)`. When
   * supplied, fixtures are shuffled deterministically before packing so the
   * same seed always reproduces the same schedule. When omitted, fixtures
   * are packed in the order given — also fully deterministic.
   */
  rng?: () => number
}

export interface AssignToCourtsResult {
  schedule: ScheduledMatch[]
  /** Fixtures that could not be placed because every cell was exhausted. */
  unscheduled: FixtureToSchedule[]
  conflicts: ScheduleConflict[]
}

/**
 * Lays fixtures out across courts and time slots.
 *
 * Fixtures are packed in order (optionally pre-shuffled by a seeded `rng`)
 * using a first-fit strategy: for each fixture we scan slots earliest-first,
 * then courts in the order given, and take the first cell where
 *   1. the cell (court, slot) is not already occupied, and
 *   2. neither pair in the fixture is already playing in that slot.
 * Among cells satisfying both of those, we prefer one that also respects
 * `minRestSlots` for both pairs; if none exists we fall back to the first
 * structurally-valid cell and record an `insufficient_rest` conflict rather
 * than silently producing a bad draw. If a fixture cannot be placed at all
 * (every cell is either occupied or a clash) it is reported in `unscheduled`
 * along with an `unassigned_fixture` conflict describing the shortfall.
 *
 * Packing fixtures round-by-round (as `generateRoundRobin` naturally
 * produces, since a round's fixtures never share a pair) combined with the
 * rest requirement is what spreads a given pair's matches across the day
 * rather than clustering them into consecutive slots.
 */
export function assignToCourts(
  fixtures: readonly FixtureToSchedule[],
  courts: readonly Court[],
  slots: readonly TimeSlot[],
  options: AssignToCourtsOptions = {},
): AssignToCourtsResult {
  const minRestSlots = options.minRestSlots ?? 1
  const conflicts: ScheduleConflict[] = []
  const schedule: ScheduledMatch[] = []
  const unscheduled: FixtureToSchedule[] = []

  if (courts.length === 0 || slots.length === 0) {
    for (const f of fixtures) unscheduled.push(f)
    if (fixtures.length > 0) {
      conflicts.push({
        type: 'unassigned_fixture',
        severity: 'error',
        message: `No courts or time slots supplied — ${fixtures.length} fixture(s) could not be scheduled.`,
      })
    }
    return { schedule, unscheduled, conflicts }
  }

  const orderedSlots = [...slots].sort((a, b) => a.index - b.index)
  const orderedFixtures = options.rng
    ? shuffle([...fixtures], options.rng)
    : [...fixtures]

  const occupied = new Set<string>() // `${court}#${slotIndex}`
  const slotParticipants = new Map<number, Set<TeamId>>() // slotIndex -> teams playing
  const assignedSlotsByTeam = new Map<TeamId, number[]>()

  const cellKey = (court: Court, slotIndex: number) => `${court}#${slotIndex}`

  for (const item of orderedFixtures) {
    const { teamA, teamB } = item.fixture

    let bestRestSatisfying: { court: Court; slot: TimeSlot } | null = null
    let bestAny: { court: Court; slot: TimeSlot } | null = null

    outer: for (const slot of orderedSlots) {
      const participants = slotParticipants.get(slot.index)
      if (participants?.has(teamA) || participants?.has(teamB)) continue

      for (const court of courts) {
        if (occupied.has(cellKey(court, slot.index))) continue

        if (!bestAny) bestAny = { court, slot }

        const restA = restBetween(assignedSlotsByTeam.get(teamA), slot.index)
        const restB = restBetween(assignedSlotsByTeam.get(teamB), slot.index)
        if (restA >= minRestSlots && restB >= minRestSlots) {
          bestRestSatisfying = { court, slot }
          break outer
        }
      }
    }

    const chosen = bestRestSatisfying ?? bestAny
    if (!chosen) {
      unscheduled.push(item)
      continue
    }

    if (!bestRestSatisfying) {
      conflicts.push({
        type: 'insufficient_rest',
        severity: 'warning',
        message: `${teamA} v ${teamB} could not be given ${minRestSlots} rest slot(s) before/after their other match — scheduled back-to-back on ${chosen.court} at slot ${chosen.slot.index}.`,
        teamId: teamA,
        court: chosen.court,
        slot: chosen.slot.index,
      })
    }

    const match: ScheduledMatch = {
      id: matchId(chosen),
      fixture: item.fixture,
      division: item.division,
      stage: item.stage,
      court: chosen.court,
      slot: chosen.slot,
    }
    schedule.push(match)

    occupied.add(cellKey(chosen.court, chosen.slot.index))
    const participants = slotParticipants.get(chosen.slot.index) ?? new Set<TeamId>()
    participants.add(teamA)
    participants.add(teamB)
    slotParticipants.set(chosen.slot.index, participants)
    for (const team of [teamA, teamB]) {
      const list = assignedSlotsByTeam.get(team) ?? []
      list.push(chosen.slot.index)
      assignedSlotsByTeam.set(team, list)
    }
  }

  if (unscheduled.length > 0) {
    conflicts.push({
      type: 'unassigned_fixture',
      severity: 'error',
      message: `${unscheduled.length} fixture(s) did not fit in ${courts.length} court(s) x ${slots.length} slot(s) — add more courts or slots.`,
    })
  }

  return { schedule, unscheduled, conflicts }
}

/**
 * Fewest free slots between a candidate slot and any of a team's already
 * assigned slots (checked in both directions, since a candidate can land
 * between two existing matches as well as after the most recent one).
 */
function restBetween(existingSlots: readonly number[] | undefined, candidateSlotIndex: number): number {
  if (!existingSlots || existingSlots.length === 0) return Number.POSITIVE_INFINITY
  let min = Number.POSITIVE_INFINITY
  for (const existing of existingSlots) {
    min = Math.min(min, Math.abs(candidateSlotIndex - existing) - 1)
  }
  return min
}

/** Deterministic Fisher-Yates shuffle driven by an injected RNG. */
function shuffle<T>(items: T[], rng: () => number): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * A tiny seeded PRNG (mulberry32) for callers that want reproducible
 * shuffling without pulling in a dependency. Not required — any `() =>
 * number` in `[0, 1)` works as `options.rng`.
 */
export function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------
// Duty roster
// ---------------------------------------------------------------------------

/**
 * Ordered so the first eligible candidates fill the "more senior" roles
 * first. Two `line_judge` entries reflect the draft rules' "2 Line person".
 */
const ROLE_ORDER: DutyRole[] = ['umpire_scorer', 'scoresheet', 'line_judge', 'line_judge']

export interface DeriveDutyRosterOptions {
  /**
   * Admin overrides layered on top of the derived roster. All derived
   * assignments for a given `(matchId, role)` are replaced by the override
   * entries provided for that pair — so to override both line judges, supply
   * two override entries with `role: 'line_judge'`.
   */
  manualOverrides?: readonly DutyAssignment[]
}

export interface DutyRosterResult {
  assignments: DutyAssignment[]
  /** Total duties assigned to each player across the day (derived + manual, excluding unassigned). */
  dutyCountsByPlayer: Map<PlayerId, number>
  conflicts: ScheduleConflict[]
}

/**
 * Builds the duty roster: for every match, the Umpire/Scorer, Scoresheet
 * person and two Line persons are drawn from the players of the *next*
 * match on the *same* court, per the admin team's draft rule.
 *
 * Invariant enforced throughout: a player is never rostered to officiate a
 * match happening in a slot where that player is also playing (in any
 * division, on any court). This matters because a player can belong to more
 * than one pair (e.g. mixed squads across divisions); the "next match on
 * this court" players are almost always free during the earlier match's
 * slot, but we still verify it explicitly rather than assuming it.
 *
 * Fallback for the last match on each court: there is no "next match" on
 * that court, so we look at the next chronological match across *all*
 * courts (earliest slot, then lowest court name) and draw officials from it
 * instead (`source: 'fallback'`), flagging an `info`-level conflict so
 * admins can see where the rule had to bend. If even that is not possible
 * (e.g. it is the very last match of the day on every court) the roles are
 * left `unassigned` with an `error`-level conflict for manual admin
 * assignment — the draft rules give no fallback for this case, so we do not
 * invent one.
 */
export function deriveDutyRoster(
  schedule: readonly ScheduledMatch[],
  teamRoster: TeamRoster,
  options: DeriveDutyRosterOptions = {},
): DutyRosterResult {
  const conflicts: ScheduleConflict[] = []
  const assignments: DutyAssignment[] = []

  const byCourt = new Map<Court, ScheduledMatch[]>()
  for (const match of schedule) {
    const list = byCourt.get(match.court) ?? []
    list.push(match)
    byCourt.set(match.court, list)
  }
  for (const list of byCourt.values()) list.sort((a, b) => a.slot.index - b.slot.index)

  const allBySlot = [...schedule].sort((a, b) => {
    if (a.slot.index !== b.slot.index) return a.slot.index - b.slot.index
    return a.court.localeCompare(b.court)
  })

  // slotIndex -> players who are playing (any pair) in that slot.
  const playersInSlot = new Map<number, Set<PlayerId>>()
  for (const match of schedule) {
    const set = playersInSlot.get(match.slot.index) ?? new Set<PlayerId>()
    for (const player of playersOf(match.fixture.teamA, teamRoster)) set.add(player)
    for (const player of playersOf(match.fixture.teamB, teamRoster)) set.add(player)
    playersInSlot.set(match.slot.index, set)
  }

  // slotIndex -> players already given an officiating duty in that slot
  // (guards against the same player officiating two concurrent matches,
  // which can only arise through the cross-court fallback).
  const officiatingInSlot = new Map<number, Set<PlayerId>>()

  for (const [court, matches] of byCourt) {
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i]
      const nextOnCourt = matches[i + 1]

      let source: ScheduledMatch | undefined = nextOnCourt
      let sourceKind: DutySource = 'derived'

      if (!source) {
        source = nextChronologicalMatch(allBySlot, match)
        sourceKind = 'fallback'
        if (source) {
          conflicts.push({
            type: 'fallback_officials_used',
            severity: 'info',
            message: `${court} slot ${match.slot.index}: last match on this court — officials drawn from ${source.court} slot ${source.slot.index} instead of the next match on ${court}.`,
            matchIds: [match.id],
            court,
            slot: match.slot.index,
          })
        }
      }

      const candidates = source
        ? dedupe([
            ...playersOf(source.fixture.teamA, teamRoster),
            ...playersOf(source.fixture.teamB, teamRoster),
          ])
        : []

      const playing = playersInSlot.get(match.slot.index) ?? new Set<PlayerId>()
      const busyOfficiating = officiatingInSlot.get(match.slot.index) ?? new Set<PlayerId>()

      const eligible = candidates.filter((p) => !playing.has(p) && !busyOfficiating.has(p))
      const rejected = candidates.filter((p) => playing.has(p))
      if (rejected.length > 0) {
        conflicts.push({
          type: 'officiating_while_playing',
          severity: 'warning',
          message: `${court} slot ${match.slot.index}: ${rejected.join(', ')} also playing this slot — excluded from officiating and left for manual assignment.`,
          matchIds: [match.id],
          court,
          slot: match.slot.index,
        })
      }

      const filled: PlayerId[] = eligible.slice(0, ROLE_ORDER.length)
      for (let r = 0; r < ROLE_ORDER.length; r++) {
        const role = ROLE_ORDER[r]
        const player = filled[r]
        if (player) {
          assignments.push({ matchId: match.id, role, player, source: sourceKind })
          const set = officiatingInSlot.get(match.slot.index) ?? new Set<PlayerId>()
          set.add(player)
          officiatingInSlot.set(match.slot.index, set)
        } else {
          assignments.push({ matchId: match.id, role, player: '', source: 'unassigned' })
        }
      }

      const filledCount = filled.length
      if (filledCount === 0) {
        conflicts.push({
          type: 'no_officials_assigned',
          severity: 'error',
          message: `${court} slot ${match.slot.index}: no officials could be derived — needs manual admin assignment.`,
          matchIds: [match.id],
          court,
          slot: match.slot.index,
        })
      } else if (filledCount < ROLE_ORDER.length) {
        conflicts.push({
          type: 'partial_officials_assigned',
          severity: 'warning',
          message: `${court} slot ${match.slot.index}: only ${filledCount}/${ROLE_ORDER.length} officiating roles could be filled.`,
          matchIds: [match.id],
          court,
          slot: match.slot.index,
        })
      }
    }
  }

  const withOverrides = applyManualOverrides(assignments, options.manualOverrides ?? [])

  const dutyCountsByPlayer = new Map<PlayerId, number>()
  for (const a of withOverrides) {
    if (!a.player) continue
    dutyCountsByPlayer.set(a.player, (dutyCountsByPlayer.get(a.player) ?? 0) + 1)
  }

  return { assignments: withOverrides, dutyCountsByPlayer, conflicts }
}

function playersOf(team: TeamId, roster: TeamRoster): readonly PlayerId[] {
  return roster.get(team) ?? []
}

function dedupe<T>(items: readonly T[]): T[] {
  return [...new Set(items)]
}

/** Earliest match, across all courts, strictly after `match`'s slot. */
function nextChronologicalMatch(
  allBySlot: readonly ScheduledMatch[],
  match: ScheduledMatch,
): ScheduledMatch | undefined {
  return allBySlot.find(
    (m) => m.slot.index > match.slot.index && m.id !== match.id,
  )
}

function applyManualOverrides(
  derived: readonly DutyAssignment[],
  overrides: readonly DutyAssignment[],
): DutyAssignment[] {
  if (overrides.length === 0) return [...derived]

  const overriddenPairs = new Set(overrides.map((o) => `${o.matchId}::${o.role}`))
  const kept = derived.filter((a) => !overriddenPairs.has(`${a.matchId}::${a.role}`))
  const applied = overrides.map((o) => ({ ...o, source: 'manual' as const }))
  return [...kept, ...applied]
}

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

export interface DetectConflictsOptions {
  /** Enables player-level "officiating while playing" re-verification. */
  teamRoster?: TeamRoster
  minRestSlots?: number
}

/**
 * Independent validation pass over a (possibly hand-edited) schedule and
 * duty roster. Re-derives structural problems from scratch rather than
 * trusting the conflicts already recorded by `assignToCourts`/
 * `deriveDutyRoster`, so it stays correct even after an admin manually moves
 * a match or edits the roster in the UI.
 */
export function detectConflicts(
  schedule: readonly ScheduledMatch[],
  dutyRoster: DutyRosterResult,
  options: DetectConflictsOptions = {},
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = []
  const minRestSlots = options.minRestSlots ?? 1

  // Court double-booked: two matches on the same court in the same slot.
  const byCourtSlot = new Map<string, ScheduledMatch[]>()
  for (const match of schedule) {
    const key = `${match.court}#${match.slot.index}`
    const list = byCourtSlot.get(key) ?? []
    list.push(match)
    byCourtSlot.set(key, list)
  }
  for (const [key, list] of byCourtSlot) {
    if (list.length > 1) {
      const [court, slot] = key.split('#')
      conflicts.push({
        type: 'court_double_booked',
        severity: 'error',
        message: `${court} has ${list.length} matches scheduled in slot ${slot}.`,
        matchIds: list.map((m) => m.id),
        court,
        slot: Number(slot),
      })
    }
  }

  // Pair double-booked: same pair playing in two matches in the same slot.
  const slotTeamMatches = new Map<string, ScheduledMatch[]>()
  for (const match of schedule) {
    for (const team of [match.fixture.teamA, match.fixture.teamB]) {
      const key = `${match.slot.index}::${team}`
      const list = slotTeamMatches.get(key) ?? []
      list.push(match)
      slotTeamMatches.set(key, list)
    }
  }
  for (const [key, list] of slotTeamMatches) {
    if (list.length > 1) {
      const [slot, team] = key.split('::')
      conflicts.push({
        type: 'pair_double_booked',
        severity: 'error',
        message: `${team} is scheduled in ${list.length} matches during slot ${slot}.`,
        matchIds: list.map((m) => m.id),
        teamId: team,
        slot: Number(slot),
      })
    }
  }

  // Insufficient rest: same pair's matches too close together.
  const matchesByTeam = new Map<TeamId, ScheduledMatch[]>()
  for (const match of schedule) {
    for (const team of [match.fixture.teamA, match.fixture.teamB]) {
      const list = matchesByTeam.get(team) ?? []
      list.push(match)
      matchesByTeam.set(team, list)
    }
  }
  for (const [team, matches] of matchesByTeam) {
    const sorted = [...matches].sort((a, b) => a.slot.index - b.slot.index)
    for (let i = 0; i < sorted.length - 1; i++) {
      const rest = sorted[i + 1].slot.index - sorted[i].slot.index - 1
      if (rest < minRestSlots) {
        conflicts.push({
          type: 'insufficient_rest',
          severity: 'warning',
          message: `${team} has only ${Math.max(rest, 0)} rest slot(s) between slot ${sorted[i].slot.index} and slot ${sorted[i + 1].slot.index}.`,
          matchIds: [sorted[i].id, sorted[i + 1].id],
          teamId: team,
        })
      }
    }
  }

  // Fixtures with no officials at all.
  const byMatch = new Map<string, DutyAssignment[]>()
  for (const a of dutyRoster.assignments) {
    const list = byMatch.get(a.matchId) ?? []
    list.push(a)
    byMatch.set(a.matchId, list)
  }
  for (const match of schedule) {
    const assigned = (byMatch.get(match.id) ?? []).filter((a) => a.player)
    if (assigned.length === 0) {
      conflicts.push({
        type: 'no_officials_assigned',
        severity: 'error',
        message: `${match.court} slot ${match.slot.index}: no officials assigned.`,
        matchIds: [match.id],
        court: match.court,
        slot: match.slot.index,
      })
    }
  }

  // Player-level officiating-while-playing re-check, when a roster is given.
  if (options.teamRoster) {
    const roster = options.teamRoster
    const playersInSlot = new Map<number, Set<PlayerId>>()
    for (const match of schedule) {
      const set = playersInSlot.get(match.slot.index) ?? new Set<PlayerId>()
      for (const p of playersOf(match.fixture.teamA, roster)) set.add(p)
      for (const p of playersOf(match.fixture.teamB, roster)) set.add(p)
      playersInSlot.set(match.slot.index, set)
    }
    const matchById = new Map(schedule.map((m) => [m.id, m]))
    for (const a of dutyRoster.assignments) {
      if (!a.player) continue
      const match = matchById.get(a.matchId)
      if (!match) continue
      if (playersInSlot.get(match.slot.index)?.has(a.player)) {
        conflicts.push({
          type: 'officiating_while_playing',
          severity: 'error',
          message: `${a.player} is rostered as ${a.role} for ${match.court} slot ${match.slot.index} while also playing that slot.`,
          matchIds: [match.id],
          playerId: a.player,
          court: match.court,
          slot: match.slot.index,
        })
      }
    }
  }

  return conflicts
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/** All duty assignments for one player, in no particular order (join with a schedule by `matchId` for slot/court context). */
export function dutiesForPlayer(
  dutyRoster: DutyRosterResult,
  playerId: PlayerId,
): DutyAssignment[] {
  return dutyRoster.assignments.filter((a) => a.player === playerId)
}

/** All matches a pair plays, ordered earliest-first. */
export function matchesForTeam(
  schedule: readonly ScheduledMatch[],
  teamId: TeamId,
): ScheduledMatch[] {
  return schedule
    .filter((m) => m.fixture.teamA === teamId || m.fixture.teamB === teamId)
    .sort((a, b) => a.slot.index - b.slot.index)
}
