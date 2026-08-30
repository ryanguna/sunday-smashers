import { cache } from 'react'

import { createClient } from '@/lib/supabase/server'
import type { MatchRow, ScoresheetRow, ScoresheetStatus } from '@/lib/supabase/types'
import { getAllDemoBundles } from '@/lib/demo-data'
import type {
  DutyOverride,
  PlacementMap,
  ScheduleCourt,
  ScheduleSlot,
  ScheduleTeam,
  SchedulableMatch,
} from '@/lib/schedule-admin'
import { sortMatchRows, type AdminMatchRow, type AdminMatchTeam } from '@/lib/match-admin'
import { getScheduleWorkbenchData } from '../schedule/data'

/**
 * Server-only loader for `/admin/matches`.
 *
 * The skeleton of the day — fixtures, courts, time slots, pairs and their
 * players — is taken wholesale from `getScheduleWorkbenchData()`, the same
 * `cache()`d loader the schedule builder and duty roster use. That matters
 * for more than tidiness: the reschedule preview hands those exact structures
 * to `analyseSchedule()`, so the clash rail here and the clash rail there are
 * looking at one identical picture. Forking a second view of the schedule is
 * precisely how two consoles start disagreeing about the same day.
 *
 * What the workbench does *not* carry is the result: scores, winner, forfeit
 * columns and how far a scoresheet has got. Those are loaded here and merged
 * on top.
 *
 * PRIVACY: player *names* only, exactly as the workbench provides them.
 */

export interface MatchAdminData {
  rows: AdminMatchRow[]
  /** Everything `previewReschedule()` needs, straight from the workbench. */
  matches: SchedulableMatch[]
  courts: ScheduleCourt[]
  slots: ScheduleSlot[]
  teams: ScheduleTeam[]
  placements: PlacementMap
  overrides: DutyOverride[]
  divisions: { id: string; name: string }[]
  isDemo: boolean
}

/** The per-match result detail the schedule workbench has no reason to carry. */
interface ResultDetail {
  scoreA: number
  scoreB: number
  winnerTeamId: string | null
  forfeitedByTeamId: string | null
  forfeitReason: string | null
  pointsToWin: number
  deuce: boolean
  cap: number | null
  scoresheetStatus: ScoresheetStatus | null
}

const FALLBACK_DETAIL: ResultDetail = {
  scoreA: 0,
  scoreB: 0,
  winnerTeamId: null,
  forfeitedByTeamId: null,
  forfeitReason: null,
  pointsToWin: 15,
  deuce: false,
  cap: null,
  scoresheetStatus: null,
}

function teamView(team: ScheduleTeam | undefined, placeholder: string | null): AdminMatchTeam {
  if (!team) return { id: null, name: placeholder ?? 'To be decided', players: [] }
  return { id: team.id, name: team.name, players: team.players.map((p) => p.name) }
}

/** Merges the schedule skeleton with the result detail into table rows. */
function toRows(
  matches: readonly SchedulableMatch[],
  courts: readonly ScheduleCourt[],
  slots: readonly ScheduleSlot[],
  teams: readonly ScheduleTeam[],
  details: ReadonlyMap<string, ResultDetail>,
): AdminMatchRow[] {
  const courtById = new Map(courts.map((c) => [c.id, c]))
  const slotById = new Map(slots.map((s) => [s.id, s]))
  const teamById = new Map(teams.map((t) => [t.id, t]))

  return sortMatchRows(
    matches.map((match) => {
      const detail = details.get(match.id) ?? FALLBACK_DETAIL
      const court = match.courtId ? (courtById.get(match.courtId) ?? null) : null
      const slot = match.slotId ? (slotById.get(match.slotId) ?? null) : null

      return {
        id: match.id,
        divisionId: match.divisionId,
        divisionName: match.divisionName,
        stage: match.stage,
        round: match.round,
        bracketKey: match.bracketKey,
        courtId: match.courtId,
        courtName: court?.name ?? null,
        slotId: match.slotId,
        slotIndex: slot?.index ?? null,
        slotLabel: slot?.label ?? null,
        teamA: teamView(match.teamAId ? teamById.get(match.teamAId) : undefined, match.sourceA),
        teamB: teamView(match.teamBId ? teamById.get(match.teamBId) : undefined, match.sourceB),
        status: match.status,
        ...detail,
      }
    }),
  )
}

// ---------------------------------------------------------------------------
// Demo mode
// ---------------------------------------------------------------------------

/**
 * Demo result detail, keyed by the same match ids the workbench emits.
 *
 * The bundled tournament has no scoresheets, so a *completed* round-robin
 * match is treated as verified — that is the state a tabulator would have
 * left it in, and it means the "this overwrites a verified scoresheet"
 * warning is reviewable with no database connected.
 */
function demoDetails(): Map<string, ResultDetail> {
  const details = new Map<string, ResultDetail>()
  for (const bundle of getAllDemoBundles()) {
    for (const match of bundle.matches) {
      details.set(match.id, {
        scoreA: match.scoreA,
        scoreB: match.scoreB,
        winnerTeamId: match.winnerTeamId,
        forfeitedByTeamId: match.forfeitedBy,
        forfeitReason: match.forfeitedBy ? 'Did not arrive in time' : null,
        pointsToWin: match.pointsToWin,
        deuce: match.deuce,
        cap: null,
        scoresheetStatus:
          match.status === 'completed' && match.stage === 'elims' ? 'verified' : null,
      })
    }
  }
  return details
}

// ---------------------------------------------------------------------------
// Live data
// ---------------------------------------------------------------------------

type MatchDetailColumns = Pick<
  MatchRow,
  | 'id'
  | 'score_a'
  | 'score_b'
  | 'winner_team_id'
  | 'forfeited_by_team_id'
  | 'forfeit_reason'
  | 'points_to_win'
  | 'deuce_enabled'
  | 'cap'
>

type SheetColumns = Pick<ScoresheetRow, 'match_id' | 'status' | 'updated_at'>

async function liveDetails(): Promise<Map<string, ResultDetail> | null> {
  try {
    const supabase = await createClient()
    const [{ data: matchRows }, { data: sheetRows }] = await Promise.all([
      supabase
        .from('matches')
        .select(
          'id, score_a, score_b, winner_team_id, forfeited_by_team_id, forfeit_reason, points_to_win, deuce_enabled, cap',
        ),
      supabase.from('scoresheets').select('match_id, status, updated_at'),
    ])

    if (!matchRows) return null

    // A match can carry more than one scoresheet over its life (a disputed
    // sheet replaced by a corrected one). The most recently touched row is
    // the one whose state matters.
    const sheetByMatch = new Map<string, SheetColumns>()
    for (const sheet of (sheetRows ?? []) as SheetColumns[]) {
      const existing = sheetByMatch.get(sheet.match_id)
      if (!existing || existing.updated_at < sheet.updated_at) {
        sheetByMatch.set(sheet.match_id, sheet)
      }
    }

    const details = new Map<string, ResultDetail>()
    for (const row of matchRows as MatchDetailColumns[]) {
      details.set(row.id, {
        scoreA: row.score_a,
        scoreB: row.score_b,
        winnerTeamId: row.winner_team_id,
        forfeitedByTeamId: row.forfeited_by_team_id,
        forfeitReason: row.forfeit_reason,
        pointsToWin: row.points_to_win,
        deuce: row.deuce_enabled,
        cap: row.cap,
        scoresheetStatus: sheetByMatch.get(row.id)?.status ?? null,
      })
    }
    return details
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------

/**
 * Loads the match management console.
 *
 * Any failure loading the result detail degrades to the demo detail rather
 * than an error page — an admin who cannot see the table cannot fix the thing
 * they came here to fix, and the workbench itself has the same fallback.
 */
export const getMatchAdminData = cache(async function getMatchAdminData(): Promise<MatchAdminData> {
  const workbench = await getScheduleWorkbenchData()

  const details = workbench.isDemo ? demoDetails() : ((await liveDetails()) ?? demoDetails())

  const divisions = [
    ...new Map(workbench.matches.map((m) => [m.divisionId, m.divisionName])).entries(),
  ]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    rows: toRows(workbench.matches, workbench.courts, workbench.slots, workbench.teams, details),
    matches: workbench.matches,
    courts: workbench.courts,
    slots: workbench.slots,
    teams: workbench.teams,
    placements: workbench.savedPlacements,
    overrides: workbench.manualDuties,
    divisions,
    isDemo: workbench.isDemo,
  }
})
