'use client'

/**
 * Supabase reads/writes for the registration flow.
 *
 * Kept out of `src/lib/registration.ts` on purpose: that file must stay pure
 * and unit-testable, so everything that touches the network lives here. Every
 * function is safe to call in demo mode (`isSupabaseConfigured()` false) —
 * they resolve to the bundled demo fixtures instead of throwing, so
 * `/register` renders (and can be reviewed end to end) without a database.
 *
 * RLS notes (see `supabase/schema.sql`):
 *   - `profiles` is readable only by its owner, so a partner handle can only
 *     be resolved to a `invitee_id` when the row happens to be visible;
 *     otherwise we fall back to `invitee_email`/an admin-readable note.
 *   - `registrations` are readable only by their owner, so live occupancy is
 *     derived from `teams` (readable for published divisions) instead.
 */

import { createClient } from '@/lib/supabase/client'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import type {
  DivisionRow,
  PartnerInviteRow,
  ProfileRow,
  RegistrationRow,
  RegistrationStatus,
  TournamentRow,
} from '@/lib/supabase/types'
import { getAllDemoBundles } from '@/lib/demo-data'
import {
  buildRegistrationNotes,
  buildTeamName,
  parsePartnerIdentifier,
  PLAYERS_PER_TEAM,
  type DivisionSummary,
  type RegistrationFormValues,
  type RegistrationIntent,
} from '@/lib/registration'

/**
 * Demo-mode divisions, derived from the shared demo dataset in
 * `@/lib/demo-data` rather than a parallel set of invented fixtures: the same
 * two divisions, and occupancy taken from the real number of demo pairs
 * (11 per division ⇒ 22 of 24 player slots filled).
 */
export const DEMO_REGISTRATION_DIVISIONS: DivisionSummary[] = getAllDemoBundles().map((bundle) => ({
  id: bundle.division.slug,
  name: bundle.division.name,
  gender: bundle.division.gender,
  maxTeams: 12,
  registeredPlayers: bundle.teams.length * PLAYERS_PER_TEAM,
}))

export interface RegistrationContext {
  configured: boolean
  /** `null` when signed out (or in demo mode). */
  userId: string | null
  userEmail: string | null
  profile: ProfileRow | null
  tournamentId: string | null
  divisions: DivisionSummary[]
  /** The signed-in player's existing entries, used to block double-registration. */
  myRegistrations: Pick<RegistrationRow, 'id' | 'division_id' | 'status'>[]
  /** Number of pending invites addressed to this player. */
  pendingInviteCount: number
}

/** Demo fixtures used whenever Supabase is not configured. */
const DEMO_PROFILE: ProfileRow = {
  id: 'demo-player',
  full_name: 'Holly Smasher',
  nickname: 'hollysmash',
  gender: 'female',
  phone: '0412 345 678',
  skill_level: 'intermediate',
  emergency_contact_name: 'Rudolph Reindeer',
  emergency_contact_phone: '0400 000 000',
  avatar_url: null,
  bio: null,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  email: 'holly.smasher@example.com',
}

export function demoRegistrationContext(): RegistrationContext {
  return {
    configured: false,
    userId: DEMO_PROFILE.id,
    userEmail: 'holly@example.com',
    profile: DEMO_PROFILE,
    tournamentId: 'demo-tournament',
    divisions: DEMO_REGISTRATION_DIVISIONS,
    myRegistrations: [],
    pendingInviteCount: 1,
  }
}

/**
 * Loads everything `/register` needs in one round trip batch: the player, the
 * published tournament, its divisions, live occupancy and the player's own
 * entries.
 */
export async function loadRegistrationContext(): Promise<RegistrationContext> {
  if (!isSupabaseConfigured()) return demoRegistrationContext()

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: tournamentData } = await supabase
    .from('tournaments')
    .select('*')
    .eq('is_published', true)
    .order('tournament_date', { ascending: true })
    .limit(1)
    .maybeSingle()
  const tournament = tournamentData as TournamentRow | null

  if (!tournament) {
    return {
      configured: true,
      userId: user?.id ?? null,
      userEmail: user?.email ?? null,
      profile: null,
      tournamentId: null,
      divisions: [],
      myRegistrations: [],
      pendingInviteCount: 0,
    }
  }

  const { data: divisionData } = await supabase
    .from('divisions')
    .select('*')
    .eq('tournament_id', tournament.id)
    .order('name', { ascending: true })
  const divisionRows = (divisionData ?? []) as DivisionRow[]

  // Occupancy: `registrations` is owner-only under RLS, but `teams` is
  // readable for published divisions — so confirmed pairs give us a
  // conservative, always-readable measure of how full a division is.
  const occupancy = await Promise.all(
    divisionRows.map(async (division) => {
      const { count } = await supabase
        .from('teams')
        .select('id', { count: 'exact', head: true })
        .eq('division_id', division.id)
      return (count ?? 0) * PLAYERS_PER_TEAM
    })
  )

  const divisions: DivisionSummary[] = divisionRows.map((division, index) => ({
    id: division.id,
    name: division.name,
    gender: division.gender,
    maxTeams: division.max_teams,
    registeredPlayers: occupancy[index] ?? 0,
  }))

  if (!user) {
    return {
      configured: true,
      userId: null,
      userEmail: null,
      profile: null,
      tournamentId: tournament.id,
      divisions,
      myRegistrations: [],
      pendingInviteCount: 0,
    }
  }

  const [{ data: profileData }, { data: registrationData }, { count: inviteCount }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('registrations').select('id, division_id, status').eq('player_id', user.id),
    supabase
      .from('partner_invites')
      .select('id', { count: 'exact', head: true })
      .eq('invitee_id', user.id)
      .eq('status', 'pending'),
  ])

  return {
    configured: true,
    userId: user.id,
    userEmail: user.email ?? null,
    profile: (profileData as ProfileRow | null) ?? null,
    tournamentId: tournament.id,
    divisions,
    myRegistrations: (registrationData ?? []) as Pick<RegistrationRow, 'id' | 'division_id' | 'status'>[],
    pendingInviteCount: inviteCount ?? 0,
  }
}

export interface SubmitRegistrationInput {
  context: RegistrationContext
  values: RegistrationFormValues
  status: RegistrationStatus
  intent: RegistrationIntent
}

export interface SubmitRegistrationResult {
  ok: boolean
  status: RegistrationStatus
  /** The division the entry was made in, so the confirmation screen can name it. */
  divisionId: string
  /** True when a `partner_invites` row was created. */
  invitedPartner: boolean
  /** True when the player joined the free-agent pool instead of inviting someone. */
  freeAgent: boolean
  /** Set when the write failed — already a friendly, festive message. */
  error?: string
}

/**
 * Persists the registration: profile details first (so the loot bag and the
 * emergency contact are always current), then the `registrations` row, then
 * the optional `partner_invites` row.
 */
export async function submitRegistration(input: SubmitRegistrationInput): Promise<SubmitRegistrationResult> {
  const { context, values, status, intent } = input

  if (!context.configured) {
    // Demo mode: pretend the write succeeded so the confirmation screen (and
    // its confetti) is reviewable without a Supabase project.
    return {
      ok: true,
      status,
      divisionId: values.divisionId,
      invitedPartner: values.partnerMode === 'partner',
      freeAgent: values.partnerMode === 'solo',
    }
  }

  if (!context.userId || !context.tournamentId) {
    return {
      ok: false,
      status,
      divisionId: values.divisionId,
      invitedPartner: false,
      freeAgent: false,
      error: 'Your session expired while you were filling this in. Sign in again and we’ll keep your spot warm.',
    }
  }

  const supabase = createClient()

  const profileUpdate: Partial<ProfileRow> & { id: string } = {
    id: context.userId,
    full_name: context.profile?.full_name?.trim() || 'Sunday Smasher',
    phone: values.phone.trim(),
    skill_level: values.skillLevel as ProfileRow['skill_level'],
    emergency_contact_name: values.emergencyContactName.trim(),
    emergency_contact_phone: values.emergencyContactPhone.trim(),
  }

  const { error: profileError } = await supabase.from('profiles').upsert(profileUpdate as never)
  if (profileError) {
    return {
      ok: false,
      status,
      divisionId: values.divisionId,
      invitedPartner: false,
      freeAgent: false,
      error: `We couldn’t save your player details: ${profileError.message}`,
    }
  }

  const notes = buildRegistrationNotes({
    partnerMode: values.partnerMode,
    partnerIdentifier: values.partnerIdentifier,
    dietaryNotes: values.dietaryNotes,
    codeOfConductAcceptedAt: new Date().toISOString(),
    intent,
  })

  const { data: inserted, error: registrationError } = await supabase
    .from('registrations')
    .insert({
      tournament_id: context.tournamentId,
      division_id: values.divisionId,
      player_id: context.userId,
      // Players may only ever write `pending` (RLS); a waitlist entry is
      // flagged in `notes` and moved to `waitlisted` by an admin.
      status: 'pending',
      notes,
    } as never)
    .select('id')
    .maybeSingle()

  if (registrationError) {
    const duplicate = registrationError.code === '23505'
    return {
      ok: false,
      status,
      divisionId: values.divisionId,
      invitedPartner: false,
      freeAgent: false,
      error: duplicate
        ? 'You’re already on the list for this division — one entry per player, even at Christmas 🎄'
        : `We couldn’t save your registration: ${registrationError.message}`,
    }
  }

  void inserted
  let invitedPartner = false

  if (values.partnerMode === 'partner') {
    const partner = parsePartnerIdentifier(values.partnerIdentifier)
    const inviteeId = partner.kind === 'handle' ? await resolveHandle(partner.handle) : null
    const inviteeEmail = partner.kind === 'email' ? partner.email : null

    if (inviteeId || inviteeEmail) {
      const { error: inviteError } = await supabase.from('partner_invites').insert({
        division_id: values.divisionId,
        inviter_id: context.userId,
        invitee_id: inviteeId,
        invitee_email: inviteeEmail,
        status: 'pending',
      } as never)
      invitedPartner = !inviteError
    }
  }

  return {
    ok: true,
    status,
    divisionId: values.divisionId,
    invitedPartner,
    freeAgent: values.partnerMode === 'solo',
  }
}

/**
 * Best-effort handle → user id lookup. `profiles` RLS hides other players'
 * rows from non-admins, so this usually returns `null` and the invite falls
 * back to an email/admin-matched invite. Documented in the flow's copy.
 */
async function resolveHandle(handle: string): Promise<string | null> {
  const supabase = createClient()
  const { data } = await supabase.from('profiles').select('id').ilike('nickname', handle).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

// ---------------------------------------------------------------------------
// Partner invites
// ---------------------------------------------------------------------------

export interface InviteView {
  id: string
  divisionId: string
  divisionName: string
  inviterName: string
  status: PartnerInviteRow['status']
  createdAt: string
  /** True when the signed-in player is the one who sent it. */
  outgoing: boolean
  /** For outgoing invites: who it was sent to. */
  sentTo: string | null
}

const DEMO_INVITES: InviteView[] = [
  {
    id: 'demo-invite-1',
    divisionId: 'womens_doubles',
    divisionName: "Women's Doubles",
    inviterName: 'Amy Chen',
    status: 'pending',
    createdAt: '2026-09-08T09:15:00.000Z',
    outgoing: false,
    sentTo: null,
  },
  {
    id: 'demo-invite-2',
    divisionId: 'womens_doubles',
    divisionName: "Women's Doubles",
    inviterName: 'You',
    status: 'pending',
    createdAt: '2026-09-07T21:02:00.000Z',
    outgoing: true,
    sentTo: 'cleo.manu@example.com',
  },
  {
    id: 'demo-invite-3',
    divisionId: 'womens_doubles',
    divisionName: "Women's Doubles",
    inviterName: 'Bree Walsh',
    status: 'declined',
    createdAt: '2026-09-06T18:40:00.000Z',
    outgoing: false,
    sentTo: null,
  },
]

export interface InvitesResult {
  configured: boolean
  signedIn: boolean
  invites: InviteView[]
}

export async function loadInvites(): Promise<InvitesResult> {
  if (!isSupabaseConfigured()) {
    return { configured: false, signedIn: true, invites: DEMO_INVITES }
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { configured: true, signedIn: false, invites: [] }

  const { data } = await supabase
    .from('partner_invites')
    .select('*')
    // `invitee_id` is guaranteed to be populated for anyone who has an
    // account: migration 0010 resolves it at insert time, and claims any
    // invite addressed to a new user's email the moment they sign up. Before
    // that, an invite sent to someone who had not yet registered was keyed
    // only by email and was therefore invisible to them forever.
    .or(`invitee_id.eq.${user.id},inviter_id.eq.${user.id}`)
    .order('created_at', { ascending: false })

  const rows = (data ?? []) as PartnerInviteRow[]
  const divisionIds = Array.from(new Set(rows.map((row) => row.division_id)))
  const divisionNames = new Map<string, string>()

  if (divisionIds.length > 0) {
    const { data: divisionData } = await supabase.from('divisions').select('id, name').in('id', divisionIds)
    for (const division of (divisionData ?? []) as Pick<DivisionRow, 'id' | 'name'>[]) {
      divisionNames.set(division.id, division.name)
    }
  }

  return {
    configured: true,
    signedIn: true,
    invites: rows.map((row) => ({
      id: row.id,
      divisionId: row.division_id,
      divisionName: divisionNames.get(row.division_id) ?? 'Your division',
      // Denormalised at insert (migration 0010). `profiles` is owner-only
      // under RLS, so without this the invitee is asked to partner up with
      // "a fellow smasher" — which nobody accepts.
      inviterName:
        row.inviter_id === user.id ? 'You' : (row.inviter_name?.trim() || 'A fellow smasher'),
      status: row.status,
      createdAt: row.created_at,
      outgoing: row.inviter_id === user.id,
      sentTo: row.invitee_email,
    })),
  }
}

export interface RespondToInviteResult {
  ok: boolean
  /** True when the `teams` + `team_members` rows were created. */
  teamCreated: boolean
  message: string
}

/**
 * Accepts or declines a pending invite. On acceptance we create the `teams`
 * row and both `team_members` rows so the pair exists in the draw.
 *
 * Team creation can legitimately fail under the current RLS policy (see the
 * note in the final report) — when it does, the invite is still recorded as
 * accepted and an admin finalises the pairing, so the player is never left
 * with a dead end.
 */
export async function respondToInvite(inviteId: string, accept: boolean): Promise<RespondToInviteResult> {
  if (!isSupabaseConfigured()) {
    return {
      ok: true,
      teamCreated: accept,
      message: accept
        ? 'Demo mode: in the real app you and your partner would now be a team 🎉'
        : 'Demo mode: the invite would be politely declined.',
    }
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, teamCreated: false, message: 'Your session expired — sign in and try again.' }
  }

  const { data: inviteData } = await supabase
    .from('partner_invites')
    .select('*')
    .eq('id', inviteId)
    .maybeSingle()
  const invite = inviteData as PartnerInviteRow | null

  if (!invite || invite.status !== 'pending') {
    return { ok: false, teamCreated: false, message: 'That invite has already been answered.' }
  }

  if (!accept) {
    const { error } = await supabase
      .from('partner_invites')
      .update({ status: 'declined', responded_at: new Date().toISOString() } as never)
      .eq('id', inviteId)
    return error
      ? { ok: false, teamCreated: false, message: `We couldn’t save that: ${error.message}` }
      : { ok: true, teamCreated: false, message: 'Declined — no hard feelings, there are plenty of shuttles in the tube.' }
  }

  // One RPC, not three separate writes. The previous version inserted the
  // team while the invite was still pending (denied — the teams policy
  // requires an already-accepted invite) and then inserted BOTH players in a
  // single statement (denied — a player may only insert themselves). Neither
  // error was checked, so the UI cheerfully reported "You're a pair!" while
  // no team and no members existed. `accept_partner_invite` (migration 0009)
  // verifies the caller is the invitee and does all three writes atomically.
  const { data: newTeamId, error } = await supabase.rpc('accept_partner_invite', {
    p_invite_id: inviteId,
    p_team_name: buildTeamName('Pair', 'TBC'),
  } as never)

  if (error) {
    return { ok: false, teamCreated: false, message: `We couldn’t save that: ${error.message}` }
  }

  const teamId = (newTeamId as string | null) ?? null
  if (!teamId) {
    return {
      ok: false,
      teamCreated: false,
      message: 'We couldn’t create your pair just then — give it another go.',
    }
  }

  return {
    ok: true,
    teamCreated: true,
    message: 'You’re a pair! Your team is off to the committee for approval 🎉',
  }
}
