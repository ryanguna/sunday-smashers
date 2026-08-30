'use server'

import { revalidatePath } from 'next/cache'

import { isAdmin, getCurrentUser } from '@/lib/auth'
import type { AuditEntry } from '@/lib/admin'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import {
  TEAM_SIZE,
  normaliseTeamName,
  planDissolve,
  planPairing,
  planSeedAssignment,
  suggestPairings,
  teamAuditEntry,
  teamDisplayName,
  type AdminTeam,
  type TeamPlayer,
} from '@/lib/teams-admin'

import { getTeamsAdminData } from './data'

/**
 * Write endpoints for the teams bench.
 *
 * Every action re-checks `isAdmin()` server-side: the layout guard only stops
 * people *navigating* here, but a Server Action is a public POST endpoint and
 * has to defend itself. RLS is the final backstop.
 *
 * Each action re-derives its plan from freshly loaded server data rather than
 * trusting the client's copy, so a stale tab cannot pair someone who was
 * paired thirty seconds ago in another window.
 */

export interface TeamActionResult {
  ok: boolean
  message: string
  /** True when nothing was written because Supabase isn't configured. */
  demo?: boolean
}

const DEMO_RESULT: TeamActionResult = {
  ok: false,
  demo: true,
  message: 'Demo mode — no database is connected, so nothing was saved.',
}

async function writeAudit(entries: AuditEntry[]): Promise<void> {
  if (entries.length === 0) return
  try {
    const supabase = await createClient()
    const actor = await getCurrentUser()
    await supabase.from('audit_log').insert(
      entries.map((entry) => ({
        actor_id: actor?.id ?? null,
        action: entry.action,
        entity_type: entry.entity_type,
        entity_id: entry.entity_id,
        metadata: entry.metadata,
      }))
    )
  } catch {
    // Audit logging must never block the operational change it describes.
  }
}

function revalidateTeams() {
  revalidatePath('/admin')
  revalidatePath('/admin/teams')
  revalidatePath('/admin/registrations')
  revalidatePath('/admin/draw')
}

async function guard(): Promise<TeamActionResult | null> {
  if (!isSupabaseConfigured()) return DEMO_RESULT
  if (!(await isAdmin())) {
    return { ok: false, message: 'Only admins can change teams.' }
  }
  return null
}

function findPlayer(pool: readonly TeamPlayer[], playerId: string): TeamPlayer | undefined {
  return pool.find((person) => person.playerId === playerId)
}

function findTeam(teams: readonly AdminTeam[], teamId: string): AdminTeam | undefined {
  return teams.find((team) => team.id === teamId)
}

/** Pairs two free agents into a brand new team. */
export async function createTeamAction(input: {
  playerIds: [string, string]
  name?: string | null
}): Promise<TeamActionResult> {
  const blocked = await guard()
  if (blocked) return blocked

  const { freeAgents, divisions } = await getTeamsAdminData()
  const [firstId, secondId] = input.playerIds
  const first = findPlayer(freeAgents, firstId)
  const second = findPlayer(freeAgents, secondId)
  if (!first || !second) {
    return { ok: false, message: 'One of those players is no longer a free agent. Reload the page.' }
  }

  const plan = planPairing(first, second, divisions)
  if (!plan.ok) return { ok: false, message: plan.message }

  const name = normaliseTeamName(input.name ?? '')
  const supabase = await createClient()

  const { data: created, error: teamError } = await supabase
    .from('teams')
    .insert({ division_id: plan.value.divisionId, name, is_confirmed: false })
    .select('id')
    .maybeSingle()

  if (teamError || !created) {
    return { ok: false, message: `Could not create the team: ${teamError?.message ?? 'unknown error'}` }
  }

  const teamId = created.id
  const { error: memberError } = await supabase.from('team_members').insert([
    { team_id: teamId, player_id: first.playerId, registration_id: first.registrationId },
    { team_id: teamId, player_id: second.playerId, registration_id: second.registrationId },
  ])

  if (memberError) {
    // Don't leave a childless team behind if the members failed to attach.
    await supabase.from('teams').delete().eq('id', teamId)
    return { ok: false, message: `Could not add the players: ${memberError.message}` }
  }

  await writeAudit([
    teamAuditEntry('team.created', teamId, {
      division: plan.value.divisionId,
      name: name ?? plan.value.suggestedName,
      players: `${first.name}, ${second.name}`,
      player_ids: `${first.playerId}, ${second.playerId}`,
    }),
  ])

  revalidateTeams()
  return {
    ok: true,
    message: `${name ?? plan.value.suggestedName} are a team! 🎄`,
  }
}

/** Breaks a team apart, returning both players to the free-agent pool. */
export async function dissolveTeamAction(input: {
  teamId: string
  force?: boolean
}): Promise<TeamActionResult> {
  const blocked = await guard()
  if (blocked) return blocked

  const { teams } = await getTeamsAdminData()
  const team = findTeam(teams, input.teamId)
  if (!team) return { ok: false, message: 'That team no longer exists. Reload the page.' }

  const plan = planDissolve(team, { force: input.force })
  if (!plan.ok) return { ok: false, message: plan.message }

  const supabase = await createClient()
  // `team_members` cascades on team delete, so one statement is enough.
  const { error } = await supabase.from('teams').delete().eq('id', team.id)
  if (error) return { ok: false, message: `Could not dissolve the team: ${error.message}` }

  await writeAudit([
    teamAuditEntry('team.dissolved', team.id, {
      division: team.divisionId,
      name: teamDisplayName(team),
      players: plan.value.freed.map((p) => p.name).join(', '),
      was_confirmed: team.isConfirmed,
      seed: team.seed,
    }),
  ])

  revalidateTeams()
  const freed = plan.value.freed.length
  return {
    ok: true,
    message: `${teamDisplayName(team)} dissolved — ${freed.toString()} player${freed === 1 ? '' : 's'} back in the pool.`,
  }
}

/** Renames a team, or clears the name back to the members' names. */
export async function renameTeamAction(input: {
  teamId: string
  name: string
}): Promise<TeamActionResult> {
  const blocked = await guard()
  if (blocked) return blocked

  const { teams } = await getTeamsAdminData()
  const team = findTeam(teams, input.teamId)
  if (!team) return { ok: false, message: 'That team no longer exists. Reload the page.' }

  const name = normaliseTeamName(input.name)
  const supabase = await createClient()
  const { error } = await supabase.from('teams').update({ name }).eq('id', team.id)
  if (error) return { ok: false, message: `Could not rename the team: ${error.message}` }

  await writeAudit([
    teamAuditEntry('team.renamed', team.id, { from: team.name, to: name }),
  ])

  revalidateTeams()
  return {
    ok: true,
    message: name ? `Renamed to ${name}. 🎁` : 'Name cleared — falling back to the players’ names.',
  }
}

/** Assigns or clears a seed, refusing duplicates and out-of-range values. */
export async function setTeamSeedAction(input: {
  teamId: string
  seed: number | null
}): Promise<TeamActionResult> {
  const blocked = await guard()
  if (blocked) return blocked

  const { teams, divisions } = await getTeamsAdminData()
  const team = findTeam(teams, input.teamId)
  if (!team) return { ok: false, message: 'That team no longer exists. Reload the page.' }

  const plan = planSeedAssignment(team, input.seed, teams, divisions)
  if (!plan.ok) return { ok: false, message: plan.message }

  const supabase = await createClient()
  const { error } = await supabase.from('teams').update({ seed: plan.value }).eq('id', team.id)
  if (error) return { ok: false, message: `Could not save the seed: ${error.message}` }

  await writeAudit([
    teamAuditEntry('team.seeded', team.id, {
      name: teamDisplayName(team),
      from: team.seed,
      to: plan.value,
    }),
  ])

  revalidateTeams()
  return {
    ok: true,
    message: plan.value === null ? 'Seed cleared.' : `Seeded ${plan.value.toString()}. 🌟`,
  }
}

/**
 * Applies the suggested pairings for a division in one go.
 *
 * Re-plans server-side from scratch: the client's suggestion is only a hint,
 * never the instruction.
 */
export async function autoPairDivisionAction(input: {
  divisionId: string
}): Promise<TeamActionResult> {
  const blocked = await guard()
  if (blocked) return blocked

  const { freeAgents, divisions } = await getTeamsAdminData()
  const division = divisions.find((d) => d.id === input.divisionId)
  if (!division) return { ok: false, message: 'That division no longer exists.' }

  const pairs = suggestPairings(
    freeAgents.filter((p) => p.divisionId === division.id),
    [division]
  )
  if (pairs.length === 0) {
    return { ok: false, message: `No complete pairs available in ${division.name} yet.` }
  }

  const supabase = await createClient()
  const entries: AuditEntry[] = []
  let created = 0

  for (const [a, b] of pairs) {
    const { data: team, error } = await supabase
      .from('teams')
      .insert({ division_id: division.id, name: null, is_confirmed: false })
      .select('id')
      .maybeSingle()
    if (error || !team) continue

    const { error: memberError } = await supabase.from('team_members').insert([
      { team_id: team.id, player_id: a.playerId, registration_id: a.registrationId },
      { team_id: team.id, player_id: b.playerId, registration_id: b.registrationId },
    ])
    if (memberError) {
      await supabase.from('teams').delete().eq('id', team.id)
      continue
    }

    created += 1
    entries.push(
      teamAuditEntry('team.created', team.id, {
        division: division.id,
        name: `${a.name} & ${b.name}`,
        players: `${a.name}, ${b.name}`,
        player_ids: `${a.playerId}, ${b.playerId}`,
        auto: true,
      })
    )
  }

  await writeAudit(entries)
  revalidateTeams()

  if (created === 0) {
    return { ok: false, message: 'Nothing could be paired — check the validation warnings.' }
  }
  const leftover = pairs.length * TEAM_SIZE
  return {
    ok: true,
    message: `Paired ${created.toString()} team${created === 1 ? '' : 's'} from ${leftover.toString()} free agents. 🎉`,
  }
}
