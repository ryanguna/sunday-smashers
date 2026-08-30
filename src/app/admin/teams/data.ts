import { cache } from 'react'

import { DEFAULT_ENTRY_FEE_CENTS, derivePaymentStatus, type AdminDivision } from '@/lib/admin'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import type {
  DivisionRow,
  PaymentRow,
  ProfileRow,
  RegistrationRow,
  TeamMemberRow,
  TeamRow,
} from '@/lib/supabase/types'
import { sortFreeAgents, sortTeams, type AdminTeam, type TeamPlayer, type TeamsAdminData } from '@/lib/teams-admin'

import { DEMO_FREE_AGENTS, DEMO_TEAM_DIVISIONS, DEMO_TEAMS } from './demo'

/**
 * Server-only loader for `/admin/teams`.
 *
 * SERVER ONLY: this imports `@/lib/supabase/server`, which reaches for
 * `next/headers`. Importing it from a `'use client'` component breaks the
 * production build. Client components take the data as props instead.
 *
 * PRIVACY: unlike the registrations loader this deliberately returns *no*
 * phone or emergency-contact fields — pairing decisions don't need them, and
 * the resulting shape is handed straight to a client component.
 */

function demoData(): TeamsAdminData {
  return {
    divisions: DEMO_TEAM_DIVISIONS,
    teams: DEMO_TEAMS,
    freeAgents: DEMO_FREE_AGENTS,
    isDemo: true,
  }
}

export const getTeamsAdminData = cache(async function getTeamsAdminData(): Promise<TeamsAdminData> {
  if (!isSupabaseConfigured()) return demoData()

  try {
    const supabase = await createClient()
    const [
      { data: divisionRows },
      { data: registrationRows },
      { data: profileRows },
      { data: teamRows },
      { data: teamMemberRows },
      { data: paymentRows },
    ] = await Promise.all([
      supabase.from('divisions').select('*'),
      supabase.from('registrations').select('*'),
      supabase.from('profiles').select('*'),
      supabase.from('teams').select('*'),
      supabase.from('team_members').select('*'),
      supabase.from('payments').select('*'),
    ])

    const divisionList: DivisionRow[] = divisionRows ?? []
    const registrations: RegistrationRow[] = registrationRows ?? []
    if (divisionList.length === 0 || registrations.length === 0) return demoData()

    const profiles: ProfileRow[] = profileRows ?? []
    const teamList: TeamRow[] = teamRows ?? []
    const memberList: TeamMemberRow[] = teamMemberRows ?? []
    const payments: PaymentRow[] = paymentRows ?? []

    const divisions: AdminDivision[] = divisionList.map((d) => ({
      id: d.id,
      name: d.name,
      gender: d.gender,
      maxTeams: d.max_teams,
    }))
    const divisionById = new Map(divisions.map((d) => [d.id, d]))
    const profileById = new Map(profiles.map((p) => [p.id, p]))
    const paymentByRegistration = new Map(payments.map((p) => [p.registration_id, p]))

    const teamIdByPlayer = new Map<string, string>()
    for (const member of memberList) teamIdByPlayer.set(member.player_id, member.team_id)

    // One registration per player per division; index by player so team
    // members resolve to their entry (and therefore their payment).
    const playerToTeamPlayer = new Map<string, TeamPlayer>()
    for (const row of registrations) {
      const profile = profileById.get(row.player_id)
      const payment = paymentByRegistration.get(row.id)
      const amountCents = payment?.amount_cents ?? DEFAULT_ENTRY_FEE_CENTS
      const amountPaidCents = payment?.amount_paid_cents ?? 0
      playerToTeamPlayer.set(row.player_id, {
        registrationId: row.id,
        playerId: row.player_id,
        name: profile?.full_name ?? 'Unknown player',
        nickname: profile?.nickname ?? null,
        gender: profile?.gender ?? null,
        divisionId: row.division_id,
        divisionName: divisionById.get(row.division_id)?.name ?? 'Unknown division',
        status: row.status,
        paymentStatus: payment?.status ?? derivePaymentStatus(amountPaidCents, amountCents),
        shirtSize: profile?.shirt_size ?? null,
        skillLevel: profile?.skill_level ?? null,
        teamId: teamIdByPlayer.get(row.player_id) ?? null,
        createdAt: row.created_at,
      })
    }

    const membersByTeam = new Map<string, TeamPlayer[]>()
    for (const member of memberList) {
      const person = playerToTeamPlayer.get(member.player_id)
      if (!person) continue
      membersByTeam.set(member.team_id, [...(membersByTeam.get(member.team_id) ?? []), person])
    }

    const teams: AdminTeam[] = teamList.map((row) => ({
      id: row.id,
      divisionId: row.division_id,
      divisionName: divisionById.get(row.division_id)?.name ?? 'Unknown division',
      name: row.name,
      seed: row.seed,
      isConfirmed: row.is_confirmed,
      members: membersByTeam.get(row.id) ?? [],
    }))

    const freeAgents = [...playerToTeamPlayer.values()].filter(
      (person) => person.teamId === null && person.status !== 'rejected'
    )

    return {
      divisions,
      teams: sortTeams(teams),
      freeAgents: sortFreeAgents(freeAgents),
      isDemo: false,
    }
  } catch {
    // An admin staring at a blank page mid-tournament is strictly worse than
    // an obviously-labelled demo dataset.
    return demoData()
  }
})
