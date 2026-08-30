import { cache } from 'react'

import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import type {
  AuditLogRow,
  DivisionRow,
  MatchRow,
  PaymentRow,
  ProfileRow,
  RegistrationRow,
  TeamMemberRow,
  TeamRow,
} from '@/lib/supabase/types'
import { QUALIFYING_PLACES, type PlayedMatch, type StageRules } from '@/lib/draw'
import { divisionSettingsFromRow, toStageRules } from '@/lib/settings'
import type { DrawTeamEntry, ExistingMatchSummary, ManualTiebreak } from '@/lib/draw-admin'
import { getAllDemoBundles, type DemoDivisionBundle } from '@/lib/demo-data'

/**
 * Server-only data loader for the draw workbench.
 *
 * Everything the two `/admin/draw` routes need arrives in one shape so the
 * client components stay pure and serialisable. Falls back to the bundled
 * demo fixtures whenever Supabase is not configured (CI, `npm run build`
 * with no env vars, the preview deploy) so the console always renders.
 *
 * PRIVACY: player names only — no phone numbers, emails or emergency
 * contacts. Still admin-only; both routes sit behind `requireAdmin()`.
 */

export const TIEBREAK_AUDIT_ACTION = 'draw.tiebreak_resolved'

export interface DrawDivisionData {
  id: string
  name: string
  gender: string
  elimsRules: StageRules
  finalsRules: StageRules
  qualifyingPlaces: number
  teams: DrawTeamEntry[]
  /** Registrations still awaiting a decision in this division. */
  pendingRegistrations: number
  /** Approved players with no partner yet. */
  unpairedPlayers: number
  /** Round robin fixtures already published. */
  publishedElims: ExistingMatchSummary[]
  /** Knockout fixtures already published. */
  publishedKnockout: ExistingMatchSummary[]
  /** Decided round robin results, ready for `computeStandings`. */
  playedElims: PlayedMatch[]
  /** Decided knockout results, keyed by bracket slot. */
  knockoutResults: Partial<Record<'M1' | 'M2' | 'THIRD' | 'FINAL', PlayedMatch>>
  /** Manual tiebreak calls previously recorded by an admin. */
  manualTiebreaks: ManualTiebreak[]
}

export interface DrawWorkbenchData {
  divisions: DrawDivisionData[]
  isDemo: boolean
  /** True when a tournament settings module supplied the stage rules. */
  rulesFromSettings: boolean
}

// ---------------------------------------------------------------------------
// Demo mode
// ---------------------------------------------------------------------------

/**
 * Demo divisions deliberately sit in two different states so every path in
 * the workbench is reviewable without a database:
 *   - Men's Doubles   — draw published and fully played (the destructive
 *     republish guard rails, standings inspector and final placings).
 *   - Women's Doubles — nothing published yet (the clean generate →
 *     preview → publish flow, plus an unpaid-entry warning).
 */
const DEMO_UNDRAWN_DIVISION = 'womens_doubles'

function demoDivision(bundle: DemoDivisionBundle): DrawDivisionData {
  const undrawn = bundle.division.slug === DEMO_UNDRAWN_DIVISION

  const teams: DrawTeamEntry[] = bundle.teams.map((team, index) => ({
    id: team.id,
    name: team.name,
    players: team.players.map((player) => player.name),
    seed: team.seed,
    approved: true,
    // One demo pair is deliberately left unpaid so the warning rail shows.
    paid: !(undrawn && index === bundle.teams.length - 1),
  }))

  const decided = (status: string) => status === 'completed' || status === 'forfeited'
  const elims = undrawn ? [] : bundle.matches.filter((match) => match.stage === 'elims')
  const knockout = undrawn ? [] : bundle.matches.filter((match) => match.stage !== 'elims')

  const knockoutResults: DrawDivisionData['knockoutResults'] = {}
  for (const match of knockout) {
    if (!match.bracketKey || !match.teamA || !match.teamB || !decided(match.status)) continue
    knockoutResults[match.bracketKey] = {
      teamA: match.teamA,
      teamB: match.teamB,
      pointsA: match.scoreA,
      pointsB: match.scoreB,
      forfeitedBy: match.forfeitedBy,
    }
  }

  return {
    id: bundle.division.slug,
    name: bundle.division.name,
    gender: bundle.division.gender,
    elimsRules: bundle.division.elimsRules,
    finalsRules: bundle.division.finalsRules,
    qualifyingPlaces: QUALIFYING_PLACES,
    teams,
    pendingRegistrations: undrawn ? 2 : 0,
    unpairedPlayers: undrawn ? 1 : 0,
    publishedElims: elims.map((match) => ({
      id: match.id,
      stage: match.stage,
      hasResult: decided(match.status),
    })),
    publishedKnockout: knockout.map((match) => ({
      id: match.id,
      stage: match.stage,
      hasResult: decided(match.status),
    })),
    playedElims: elims
      .filter((match) => match.teamA && match.teamB && decided(match.status))
      .map((match) => ({
        teamA: match.teamA!,
        teamB: match.teamB!,
        pointsA: match.scoreA,
        pointsB: match.scoreB,
        forfeitedBy: match.forfeitedBy,
      })),
    knockoutResults,
    manualTiebreaks: [],
  }
}

function demoData(): DrawWorkbenchData {
  return {
    divisions: getAllDemoBundles().map(demoDivision),
    isDemo: true,
    rulesFromSettings: false,
  }
}

// ---------------------------------------------------------------------------
// Live data
// ---------------------------------------------------------------------------

/**
 * Stage rules come from the tournament settings module (`src/lib/settings.ts`,
 * owned by the settings agent) so the draw always plays by whatever the
 * committee configured — never a hard-coded 15/21. The per-division
 * third-place/final overrides live in the settings *extras* blob, which is
 * that agent's private storage; the draw only needs elims + the knockout
 * rule set, both of which are real `divisions` columns.
 */
function divisionRules(division: DivisionRow): {
  elims: StageRules
  finals: StageRules
  qualifyingPlaces: number
} {
  const settings = divisionSettingsFromRow(division)
  return {
    elims: toStageRules(settings.rules.stages.elims),
    finals: toStageRules(settings.rules.stages.semi),
    qualifyingPlaces: settings.rules.qualifyingPlaces || QUALIFYING_PLACES,
  }
}

function isDecided(status: MatchRow['status']): boolean {
  return status === 'completed' || status === 'forfeited' || status === 'walkover'
}

function toPlayed(row: MatchRow): PlayedMatch | null {
  if (!row.team_a_id || !row.team_b_id || !isDecided(row.status)) return null
  return {
    teamA: row.team_a_id,
    teamB: row.team_b_id,
    pointsA: row.score_a,
    pointsB: row.score_b,
    forfeitedBy: row.forfeited_by_team_id ?? null,
  }
}

/** Latest manual tiebreak call per tied group — newest row wins. */
function manualTiebreaksFor(rows: readonly AuditLogRow[], divisionId: string): ManualTiebreak[] {
  const seen = new Set<string>()
  const decisions: ManualTiebreak[] = []

  for (const row of rows) {
    if (row.action !== TIEBREAK_AUDIT_ACTION) continue
    if (row.entity_id !== divisionId) continue
    const metadata = (row.metadata ?? {}) as { team_ids?: unknown; note?: unknown }
    const teamIds = Array.isArray(metadata.team_ids)
      ? metadata.team_ids.filter((id): id is string => typeof id === 'string')
      : []
    if (teamIds.length < 2) continue

    const key = [...teamIds].sort().join('|')
    if (seen.has(key)) continue
    seen.add(key)
    decisions.push({
      teamIds,
      note: typeof metadata.note === 'string' ? metadata.note : undefined,
    })
  }

  return decisions
}

/**
 * Loads every division with its entries, published fixtures and results.
 * Any failure falls back to the demo fixtures — an admin staring at a blank
 * draw page on tournament morning is worse than an obviously-labelled
 * sample.
 */
export const getDrawWorkbenchData = cache(
  async function getDrawWorkbenchData(): Promise<DrawWorkbenchData> {
    if (!isSupabaseConfigured()) return demoData()

    try {
      const supabase = await createClient()
      const [
        { data: divisionRows },
        { data: teamRows },
        { data: memberRows },
        { data: profileRows },
        { data: registrationRows },
        { data: paymentRows },
        { data: matchRows },
        { data: auditRows },
      ] = await Promise.all([
        supabase.from('divisions').select('*'),
        supabase.from('teams').select('*'),
        supabase.from('team_members').select('*'),
        supabase.from('profiles').select('id, full_name'),
        supabase.from('registrations').select('*'),
        supabase.from('payments').select('*'),
        supabase.from('matches').select('*'),
        supabase
          .from('audit_log')
          .select('*')
          .eq('action', TIEBREAK_AUDIT_ACTION)
          .order('created_at', { ascending: false })
          .limit(200),
      ])

      const divisions = (divisionRows ?? []) as DivisionRow[]
      if (divisions.length === 0) return demoData()

      const teams = (teamRows ?? []) as TeamRow[]
      const members = (memberRows ?? []) as TeamMemberRow[]
      const profiles = (profileRows ?? []) as Pick<ProfileRow, 'id' | 'full_name'>[]
      const registrations = (registrationRows ?? []) as RegistrationRow[]
      const payments = (paymentRows ?? []) as PaymentRow[]
      const matches = (matchRows ?? []) as MatchRow[]
      const audit = (auditRows ?? []) as AuditLogRow[]

      const nameById = new Map(profiles.map((p) => [p.id, p.full_name]))
      const paymentByRegistration = new Map(payments.map((p) => [p.registration_id, p]))
      const membersByTeam = new Map<string, TeamMemberRow[]>()
      for (const member of members) {
        membersByTeam.set(member.team_id, [...(membersByTeam.get(member.team_id) ?? []), member])
      }

      const pairedPlayers = new Set(members.map((member) => member.player_id))

      return {
        isDemo: false,
        rulesFromSettings: true,
        divisions: divisions.map((division) => {
          const rules = divisionRules(division)
          const divisionRegistrations = registrations.filter((r) => r.division_id === division.id)
          const registrationByPlayer = new Map(divisionRegistrations.map((r) => [r.player_id, r]))

          const divisionTeams = teams
            .filter((team) => team.division_id === division.id)
            .map<DrawTeamEntry>((team) => {
              const teamMembers = membersByTeam.get(team.id) ?? []
              const playerNames = teamMembers.map(
                (member) => nameById.get(member.player_id) ?? 'Unknown player'
              )
              const teamRegistrations = teamMembers
                .map((member) => registrationByPlayer.get(member.player_id))
                .filter((row): row is RegistrationRow => row != null)

              const approved =
                teamMembers.length === 2 &&
                teamRegistrations.length === teamMembers.length &&
                teamRegistrations.every((row) => row.status === 'approved')

              const paid =
                teamRegistrations.length > 0 &&
                teamRegistrations.every(
                  (row) => paymentByRegistration.get(row.id)?.status === 'paid'
                )

              return {
                id: team.id,
                name: team.name ?? (playerNames.join(' & ') || 'Unnamed pair'),
                players: playerNames,
                seed: team.seed,
                approved,
                paid,
              }
            })

          const divisionMatches = matches.filter((match) => match.division_id === division.id)
          const elims = divisionMatches.filter((match) => match.stage === 'elims')
          const knockout = divisionMatches.filter((match) => match.stage !== 'elims')

          const knockoutResults: DrawDivisionData['knockoutResults'] = {}
          for (const match of knockout) {
            const played = toPlayed(match)
            if (match.bracket_key && played) knockoutResults[match.bracket_key] = played
          }

          return {
            id: division.id,
            name: division.name,
            gender: division.gender,
            elimsRules: rules.elims,
            finalsRules: rules.finals,
            qualifyingPlaces: rules.qualifyingPlaces,
            teams: divisionTeams,
            pendingRegistrations: divisionRegistrations.filter((r) => r.status === 'pending').length,
            unpairedPlayers: divisionRegistrations.filter(
              (r) => r.status === 'approved' && !pairedPlayers.has(r.player_id)
            ).length,
            publishedElims: elims.map((match) => ({
              id: match.id,
              stage: match.stage,
              hasResult: isDecided(match.status),
            })),
            publishedKnockout: knockout.map((match) => ({
              id: match.id,
              stage: match.stage,
              hasResult: isDecided(match.status),
            })),
            playedElims: elims
              .map(toPlayed)
              .filter((played): played is PlayedMatch => played != null),
            knockoutResults,
            manualTiebreaks: manualTiebreaksFor(audit, division.id),
          }
        }),
      }
    } catch {
      return demoData()
    }
  }
)
