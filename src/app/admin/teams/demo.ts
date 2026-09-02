/**
 * Demo fixtures for the teams bench.
 *
 * Derived from the *same* `DEMO_ADMIN_REGISTRATIONS` the rest of the admin
 * console uses, so the dashboard's "6 free agents" and this page's pairing
 * queue can never disagree. Seeds come from the public demo bundles so the
 * teams here match `/standings`.
 */

import { DEMO_ADMIN_DIVISIONS, DEMO_ADMIN_REGISTRATIONS } from '@/components/admin/demo'
import type { AdminDivision, AdminRegistration } from '@/lib/admin'
import { getAllDemoBundles } from '@/lib/demo-data'
import {
  sortFreeAgents,
  sortTeams,
  type AdminTeam,
  type PlayerGender,
  type TeamPlayer,
} from '@/lib/teams-admin'

/**
 * The demo profiles don't carry a gender column, so we infer it from the
 * division the player entered. That keeps the demo internally consistent
 * (nobody is flagged for a mismatch that isn't really there); the genuine
 * mismatch rules are covered by the unit tests instead.
 */
function genderForDivision(divisionId: string): PlayerGender {
  const division = DEMO_ADMIN_DIVISIONS.find((d) => d.id === divisionId)
  if (division?.gender === 'mens') return 'male'
  if (division?.gender === 'womens') return 'female'
  return null
}

function toTeamPlayer(row: AdminRegistration): TeamPlayer {
  return {
    registrationId: row.id,
    playerId: row.playerId,
    name: row.playerName,
    nickname: row.nickname,
    gender: genderForDivision(row.divisionId),
    divisionId: row.divisionId,
    divisionName: row.divisionName,
    status: row.status,
    paymentStatus: row.payment.status,
    skillLevel: row.skillLevel,
    teamId: row.teamId,
    createdAt: row.createdAt,
  }
}

function demoSeeds(): Map<string, number> {
  const seeds = new Map<string, number>()
  for (const bundle of getAllDemoBundles()) {
    for (const team of bundle.teams) seeds.set(team.id, team.seed)
  }
  return seeds
}

function buildDemoTeams(): AdminTeam[] {
  const seeds = demoSeeds()
  const byTeam = new Map<string, TeamPlayer[]>()
  const nameByTeam = new Map<string, string | null>()

  for (const row of DEMO_ADMIN_REGISTRATIONS) {
    if (!row.teamId) continue
    byTeam.set(row.teamId, [...(byTeam.get(row.teamId) ?? []), toTeamPlayer(row)])
    nameByTeam.set(row.teamId, row.teamName)
  }

  const teams: AdminTeam[] = []
  for (const [teamId, members] of byTeam) {
    const first = members[0]
    teams.push({
      id: teamId,
      divisionId: first.divisionId,
      divisionName: first.divisionName,
      name: nameByTeam.get(teamId) ?? null,
      seed: seeds.get(teamId) ?? null,
      // The two lowest-ranked demo pairs are still waiting on their own
      // confirmation, which gives the "confirmed teams are protected" path
      // something to demonstrate.
      isConfirmed: (seeds.get(teamId) ?? 99) <= 9,
      members,
    })
  }
  return sortTeams(teams)
}

export const DEMO_TEAM_DIVISIONS: AdminDivision[] = DEMO_ADMIN_DIVISIONS

export const DEMO_TEAMS: AdminTeam[] = buildDemoTeams()

export const DEMO_FREE_AGENTS: TeamPlayer[] = sortFreeAgents(
  DEMO_ADMIN_REGISTRATIONS.filter((row) => !row.teamId && row.status !== 'rejected').map(
    toTeamPlayer
  )
)
