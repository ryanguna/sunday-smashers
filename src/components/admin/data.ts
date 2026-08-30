import { cache } from 'react'

import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import type {
  DivisionRow,
  PartnerInviteRow,
  PaymentRow,
  ProfileRow,
  RegistrationRow,
  TeamMemberRow,
  TeamRow,
} from '@/lib/supabase/types'
import {
  DEFAULT_ENTRY_FEE_CENTS,
  derivePaymentStatus,
  type AdminDivision,
  type AdminPartnerInvite,
  type AdminRegistration,
  type PaymentMethod,
} from '@/lib/admin'
import { DEMO_ADMIN_DIVISIONS, DEMO_ADMIN_INVITES, DEMO_ADMIN_REGISTRATIONS } from './demo'

/**
 * The ONLY data source the admin pages read from. Wrapped in React's
 * `cache()` so a page and its layout share a single round trip.
 * Every function falls back
 * to the demo fixtures when Supabase isn't configured (or a query fails), so
 * the console renders in CI and in the no-env-var preview deploy.
 *
 * PRIVACY: this module returns admin-only PII (phone, emergency contact).
 * It is `server-only` and must only be called from a route already behind
 * `requireAdmin()`. Never re-export these shapes to a public page.
 *
 * KNOWN GAP: player email lives in `auth.users`, which the anon key cannot
 * read. `email` is therefore `null` against a real database until a
 * `profiles.email` column or an admin RPC exists — see the report notes.
 */

export interface AdminConsoleData {
  divisions: AdminDivision[]
  registrations: AdminRegistration[]
  pendingInvites: AdminPartnerInvite[]
  /** True when the data above is the bundled demo set rather than live rows. */
  isDemo: boolean
}

function demoData(): AdminConsoleData {
  return {
    divisions: DEMO_ADMIN_DIVISIONS,
    registrations: DEMO_ADMIN_REGISTRATIONS,
    pendingInvites: DEMO_ADMIN_INVITES,
    isDemo: true,
  }
}

function isPaymentMethod(value: string | null): value is PaymentMethod {
  return value === 'cash' || value === 'bank_transfer' || value === 'card' || value === 'other'
}

/**
 * Loads everything the admin console needs in one pass. Returns the demo
 * fixtures on any failure — an admin staring at a blank page mid-tournament
 * is strictly worse than an obviously-labelled demo dataset.
 */
export const getAdminConsoleData = cache(async function getAdminConsoleData(): Promise<AdminConsoleData> {
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
      { data: inviteRows },
    ] = await Promise.all([
      supabase.from('divisions').select('*'),
      supabase.from('registrations').select('*'),
      supabase.from('profiles').select('*'),
      supabase.from('teams').select('*'),
      supabase.from('team_members').select('*'),
      supabase.from('payments').select('*'),
      supabase.from('partner_invites').select('*').eq('status', 'pending'),
    ])

    const divisions = (divisionRows ?? []) as DivisionRow[]
    const registrations = (registrationRows ?? []) as RegistrationRow[]
    if (divisions.length === 0 || registrations.length === 0) return demoData()

    const profiles = (profileRows ?? []) as ProfileRow[]
    const teams = (teamRows ?? []) as TeamRow[]
    const teamMembers = (teamMemberRows ?? []) as TeamMemberRow[]
    const payments = (paymentRows ?? []) as PaymentRow[]
    const invites = (inviteRows ?? []) as PartnerInviteRow[]

    const divisionById = new Map(divisions.map((d) => [d.id, d]))
    const profileById = new Map(profiles.map((p) => [p.id, p]))
    const teamById = new Map(teams.map((t) => [t.id, t]))
    const paymentByRegistration = new Map(payments.map((p) => [p.registration_id, p]))

    const teamIdByPlayer = new Map<string, string>()
    const playersByTeam = new Map<string, string[]>()
    for (const member of teamMembers) {
      teamIdByPlayer.set(member.player_id, member.team_id)
      playersByTeam.set(member.team_id, [...(playersByTeam.get(member.team_id) ?? []), member.player_id])
    }

    const nameOf = (id: string) => profileById.get(id)?.full_name ?? 'Unknown player'

    const adminRegistrations: AdminRegistration[] = registrations.map((row) => {
      const profile = profileById.get(row.player_id)
      const teamId = teamIdByPlayer.get(row.player_id) ?? null
      const team = teamId ? teamById.get(teamId) : undefined
      const partnerId = teamId
        ? (playersByTeam.get(teamId) ?? []).find((id) => id !== row.player_id)
        : undefined
      const payment = paymentByRegistration.get(row.id)
      const amountCents = payment?.amount_cents ?? DEFAULT_ENTRY_FEE_CENTS
      const amountPaidCents = payment?.amount_paid_cents ?? 0

      return {
        id: row.id,
        playerId: row.player_id,
        playerName: profile?.full_name ?? 'Unknown player',
        nickname: profile?.nickname ?? null,
        email: null,
        phone: profile?.phone ?? null,
        emergencyContactName: profile?.emergency_contact_name ?? null,
        emergencyContactPhone: profile?.emergency_contact_phone ?? null,
        shirtSize: profile?.shirt_size ?? null,
        skillLevel: profile?.skill_level ?? null,
        divisionId: row.division_id,
        divisionName: divisionById.get(row.division_id)?.name ?? 'Unknown division',
        status: row.status,
        teamId,
        teamName: team?.name ?? (partnerId ? `${nameOf(row.player_id)} & ${nameOf(partnerId)}` : null),
        partnerName: partnerId ? nameOf(partnerId) : null,
        notes: row.notes,
        createdAt: row.created_at,
        payment: {
          id: payment?.id ?? null,
          amountCents,
          amountPaidCents,
          status: payment?.status ?? derivePaymentStatus(amountPaidCents, amountCents),
          method: isPaymentMethod(payment?.method ?? null) ? (payment!.method as PaymentMethod) : null,
          reference: payment?.reference ?? null,
        },
      }
    })

    const pendingInvites: AdminPartnerInvite[] = invites.map((invite) => ({
      id: invite.id,
      divisionName: divisionById.get(invite.division_id)?.name ?? 'Unknown division',
      inviterName: nameOf(invite.inviter_id),
      inviteeLabel: invite.invitee_id ? nameOf(invite.invitee_id) : (invite.invitee_email ?? 'Unknown invitee'),
      createdAt: invite.created_at,
    }))

    return {
      divisions: divisions.map((d) => ({
        id: d.id,
        name: d.name,
        gender: d.gender,
        maxTeams: d.max_teams,
      })),
      registrations: adminRegistrations.sort((a, b) => a.playerName.localeCompare(b.playerName)),
      pendingInvites,
      isDemo: false,
    }
  } catch {
    return demoData()
  }
})
