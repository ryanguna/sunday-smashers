import { cache } from 'react'

import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import type {
  CourtRow,
  DivisionRow,
  DutyAssignmentRow,
  MatchRow,
  ProfileRow,
  TeamMemberRow,
  TeamRow,
  TimeSlotRow,
  TournamentRow,
} from '@/lib/supabase/types'
import { DECIDED_MATCH_STATUSES } from '@/lib/supabase/types'
import { getAllDemoBundles, type DemoDivisionBundle } from '@/lib/demo-data'
import {
  placementsFromMatches,
  type DutyOverride,
  type PlacementMap,
  type ScheduleCourt,
  type ScheduleMatchStatus,
  type ScheduleSlot,
  type ScheduleTeam,
  type SchedulableMatch,
} from '@/lib/schedule-admin'

/**
 * Server-only loader shared by `/admin/schedule` and `/admin/duty-roster`.
 *
 * Both consoles need exactly the same picture of the day — published
 * fixtures, courts, time slots, pairs and their players — so they share one
 * set of round trips. Falls back to the bundled demo tournament whenever
 * Supabase is not configured (CI, `npm run build` with no env vars) so the
 * builder is fully reviewable without a database.
 *
 * PRIVACY: player *names* only. No emails, phone numbers or emergency
 * contacts ever reach the client, even though both routes are admin-only.
 */

export const SCHEDULE_AUDIT_ACTION = 'schedule.published'
export const DUTY_AUDIT_ACTION = 'duty_roster.published'

export interface ScheduleWorkbenchData {
  matches: SchedulableMatch[]
  courts: ScheduleCourt[]
  slots: ScheduleSlot[]
  teams: ScheduleTeam[]
  /** Placements already saved on the match rows. */
  savedPlacements: PlacementMap
  /** Duty seats an admin has hand-assigned (no `source_match_id`). */
  manualDuties: DutyOverride[]
  isDemo: boolean
}

// ---------------------------------------------------------------------------
// Demo mode
// ---------------------------------------------------------------------------

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

const demoCourtId = (name: string) => `demo-court-${slugify(name)}`
const demoSlotId = (index: number) => `demo-slot-${index}`

function demoData(): ScheduleWorkbenchData {
  const bundles: DemoDivisionBundle[] = getAllDemoBundles()

  const courtNames = new Set<string>()
  const slotLabels = new Map<number, string>()
  const matches: SchedulableMatch[] = []
  const teams: ScheduleTeam[] = []

  for (const bundle of bundles) {
    for (const team of bundle.teams) {
      teams.push({
        id: team.id,
        divisionId: bundle.division.slug,
        name: team.name,
        players: team.players.map((player) => ({ id: player.id, name: player.name })),
      })
    }

    const elims = bundle.matches.filter((match) => match.stage === 'elims')
    for (const match of bundle.matches) {
      courtNames.add(match.court)
      slotLabels.set(match.slotIndex, match.slotLabel)
      matches.push({
        id: match.id,
        divisionId: bundle.division.slug,
        divisionName: bundle.division.name,
        stage: match.stage,
        // Demo fixtures don't carry their round, so reconstruct a plausible
        // one from the running order purely for display.
        round: match.stage === 'elims' ? Math.floor(elims.indexOf(match) / 3) + 1 : null,
        bracketKey: match.bracketKey ?? null,
        teamAId: match.teamA,
        teamBId: match.teamB,
        sourceA: match.sourceA,
        sourceB: match.sourceB,
        courtId: demoCourtId(match.court),
        slotId: demoSlotId(match.slotIndex),
        status: match.status as ScheduleMatchStatus,
        hasResult:
          match.status === 'in_progress' ||
          (DECIDED_MATCH_STATUSES as readonly string[]).includes(match.status),
      })
    }
  }

  const courts: ScheduleCourt[] = [...courtNames]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name, index) => ({ id: demoCourtId(name), name, sortOrder: index }))

  const slots: ScheduleSlot[] = [...slotLabels.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, label]) => ({ id: demoSlotId(index), index, label }))

  return {
    matches,
    courts,
    slots,
    teams,
    savedPlacements: placementsFromMatches(matches),
    manualDuties: [],
    isDemo: true,
  }
}

// ---------------------------------------------------------------------------
// Live data
// ---------------------------------------------------------------------------

function slotLabelFor(row: TimeSlotRow, index: number): string {
  if (row.label) return row.label
  const parsed = new Date(row.starts_at)
  if (Number.isNaN(parsed.getTime())) return `Slot ${index + 1}`
  return parsed.toLocaleTimeString('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Australia/Sydney',
  })
}

function hasResult(row: MatchRow): boolean {
  return (
    row.status === 'completed' ||
    row.status === 'forfeited' ||
    row.status === 'walkover' ||
    row.status === 'in_progress' ||
    row.score_a > 0 ||
    row.score_b > 0
  )
}

const BRACKET_SOURCES: Record<'M1' | 'M2' | 'THIRD' | 'FINAL', [string, string]> = {
  M1: ['Rank 1', 'Rank 4'],
  M2: ['Rank 2', 'Rank 3'],
  THIRD: ['Loser of M1', 'Loser of M2'],
  FINAL: ['Winner of M1', 'Winner of M2'],
}

function toSchedulableMatch(row: MatchRow, divisionName: string): SchedulableMatch {
  const sources = row.bracket_key ? BRACKET_SOURCES[row.bracket_key] : null
  return {
    id: row.id,
    divisionId: row.division_id,
    divisionName,
    stage: row.stage,
    round: row.round,
    bracketKey: row.bracket_key,
    teamAId: row.team_a_id,
    teamBId: row.team_b_id,
    sourceA: row.team_a_id ? null : (sources?.[0] ?? null),
    sourceB: row.team_b_id ? null : (sources?.[1] ?? null),
    courtId: row.court_id,
    slotId: row.time_slot_id,
    status: row.status as ScheduleMatchStatus,
    hasResult: hasResult(row),
  }
}

/** Manual seats, indexed per (match, role) in insertion order. */
function toManualOverrides(rows: readonly DutyAssignmentRow[]): DutyOverride[] {
  const seen = new Map<string, number>()
  return [...rows]
    .filter((row) => row.source_match_id === null)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .map((row) => {
      const key = `${row.match_id}::${row.duty_role}`
      const index = seen.get(key) ?? 0
      seen.set(key, index + 1)
      return { matchId: row.match_id, role: row.duty_role, index, playerId: row.player_id }
    })
}

async function loadLive(): Promise<ScheduleWorkbenchData | null> {
  try {
    const supabase = await createClient()

    const { data: tournamentRows } = await supabase
      .from('tournaments')
      .select('*')
      .order('tournament_date', { ascending: true })
      .limit(1)
    const tournament = (tournamentRows as TournamentRow[] | null)?.[0]
    if (!tournament) return null

    const [
      { data: courtRows },
      { data: slotRows },
      { data: divisionRows },
      { data: teamRows },
      { data: memberRows },
      { data: profileRows },
      { data: matchRows },
      { data: dutyRows },
    ] = await Promise.all([
      supabase.from('courts').select('*').eq('tournament_id', tournament.id).order('sort_order'),
      supabase.from('time_slots').select('*').eq('tournament_id', tournament.id).order('starts_at'),
      supabase.from('divisions').select('*').eq('tournament_id', tournament.id),
      supabase.from('teams').select('*'),
      supabase.from('team_members').select('*'),
      supabase.from('profiles').select('id, full_name'),
      supabase.from('matches').select('*'),
      supabase.from('duty_assignments').select('*'),
    ])

    const divisions = (divisionRows ?? []) as DivisionRow[]
    const divisionIds = new Set(divisions.map((d) => d.id))
    const divisionName = new Map(divisions.map((d) => [d.id, d.name]))

    const matches = ((matchRows ?? []) as MatchRow[])
      .filter((row) => divisionIds.has(row.division_id))
      .map((row) => toSchedulableMatch(row, divisionName.get(row.division_id) ?? 'Division'))

    if (matches.length === 0) return null

    const nameById = new Map(
      ((profileRows ?? []) as Pick<ProfileRow, 'id' | 'full_name'>[]).map((p) => [
        p.id,
        p.full_name,
      ]),
    )
    const membersByTeam = new Map<string, TeamMemberRow[]>()
    for (const member of (memberRows ?? []) as TeamMemberRow[]) {
      membersByTeam.set(member.team_id, [...(membersByTeam.get(member.team_id) ?? []), member])
    }

    const teams: ScheduleTeam[] = ((teamRows ?? []) as TeamRow[])
      .filter((team) => divisionIds.has(team.division_id))
      .map((team) => {
        const members = membersByTeam.get(team.id) ?? []
        const players = members.map((member) => ({
          id: member.player_id,
          name: nameById.get(member.player_id) ?? 'Unknown player',
        }))
        return {
          id: team.id,
          divisionId: team.division_id,
          name: team.name ?? (players.map((p) => p.name).join(' & ') || 'Unnamed pair'),
          players,
        }
      })

    const courts: ScheduleCourt[] = ((courtRows ?? []) as CourtRow[]).map((row, index) => ({
      id: row.id,
      name: row.name,
      sortOrder: row.sort_order ?? index,
    }))

    const slots: ScheduleSlot[] = ((slotRows ?? []) as TimeSlotRow[]).map((row, index) => ({
      id: row.id,
      index,
      label: slotLabelFor(row, index),
    }))

    return {
      matches,
      courts,
      slots,
      teams,
      savedPlacements: placementsFromMatches(matches),
      manualDuties: toManualOverrides((dutyRows ?? []) as DutyAssignmentRow[]),
      isDemo: false,
    }
  } catch {
    return null
  }
}

/**
 * Loads the schedule workbench. Any failure (no tournament, no published
 * draw, an RLS surprise) falls back to the demo tournament rather than
 * leaving an admin staring at an empty grid on tournament morning.
 */
export const getScheduleWorkbenchData = cache(
  async function getScheduleWorkbenchData(): Promise<ScheduleWorkbenchData> {
    if (!isSupabaseConfigured()) return demoData()
    return (await loadLive()) ?? demoData()
  },
)

/** Uncached read used by the write actions for their own server-side re-check. */
export async function loadScheduleContext(): Promise<ScheduleWorkbenchData | null> {
  if (!isSupabaseConfigured()) return null
  return loadLive()
}
