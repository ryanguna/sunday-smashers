import { cache } from 'react'

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
import { loadLiveOrDemo, rowsOrThrow } from '@/lib/demo-mode'
import { DEMO_ADMIN_DIVISIONS, DEMO_ADMIN_INVITES, DEMO_ADMIN_REGISTRATIONS } from './demo'

/**
 * The ONLY data source the admin pages read from. Wrapped in React's
 * `cache()` so a page and its layout share a single round trip.
 * The bundled demo fixtures are returned only when Supabase isn't configured
 * (CI, `npm run build` with no env vars, the preview deploy) — see
 * `@/lib/demo-mode` for the one rule. A configured-but-empty project returns
 * genuinely empty lists, and a failed query surfaces `error`.
 *
 * PRIVACY: this module returns admin-only PII (phone, emergency contact).
 * It is `server-only` and must only be called from a route already behind
 * `requireAdmin()`. Never re-export these shapes to a public page.
 *
 * KNOWN GAP: player email lives in `auth.users`, which the anon key cannot
 * read. `email` is therefore `null` against a real database until a
 * `profiles.email` column or an admin RPC exists — see the report notes.
 */

interface AdminConsoleRows {
  divisions: AdminDivision[]
  registrations: AdminRegistration[]
  pendingInvites: AdminPartnerInvite[]
}

export interface AdminConsoleData extends AdminConsoleRows {
  /** True when the data above is the bundled demo set rather than live rows. */
  isDemo: boolean
  /** Set when a live query failed; the lists above are empty in that case. */
  error: string | null
}

function demoRows(): AdminConsoleRows {
  return {
    divisions: DEMO_ADMIN_DIVISIONS,
    registrations: DEMO_ADMIN_REGISTRATIONS,
    pendingInvites: DEMO_ADMIN_INVITES,
  }
}

function emptyRows(): AdminConsoleRows {
  return { divisions: [], registrations: [], pendingInvites: [] }
}

function isPaymentMethod(value: string | null): value is PaymentMethod {
  return value === 'cash' || value === 'bank_transfer' || value === 'card' || value === 'other'
}

/**
 * Loads everything the admin console needs in one pass. Zero registrations on
 * a real project is a real answer — the pages render their empty states, and
 * a query failure arrives as `error` rather than as invented rows.
 */
export const getAdminConsoleData = cache(async function getAdminConsoleData(): Promise<AdminConsoleData> {
  const { data, isDemo, error } = await loadLiveOrDemo<AdminConsoleRows>({
    demo: demoRows,
    empty: emptyRows,
    live: loadLive,
  })
  return { ...data, isDemo, error }
})

async function loadLive(): Promise<AdminConsoleRows> {
  const supabase = await createClient()
  const [
    divisionResult,
    registrationResult,
    profileResult,
    teamResult,
    teamMemberResult,
    paymentResult,
    inviteResult,
  ] = await Promise.all([
    supabase.from('divisions').select('*'),
    supabase.from('registrations').select('*'),
    supabase.from('profiles').select('*'),
    supabase.from('teams').select('*'),
    supabase.from('team_members').select('*'),
    supabase.from('payments').select('*'),
    supabase.from('partner_invites').select('*').eq('status', 'pending'),
  ])

  const divisions = rowsOrThrow(divisionResult) as DivisionRow[]
  const registrations = rowsOrThrow(registrationResult) as RegistrationRow[]
  const profiles = rowsOrThrow(profileResult) as ProfileRow[]
  const teams = rowsOrThrow(teamResult) as TeamRow[]
  const teamMembers = rowsOrThrow(teamMemberResult) as TeamMemberRow[]
  const payments = rowsOrThrow(paymentResult) as PaymentRow[]
  const invites = rowsOrThrow(inviteResult) as PartnerInviteRow[]

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
  }
}
