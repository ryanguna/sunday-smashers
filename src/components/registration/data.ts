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
 *   - `registrations` are readable only by their owner, so live occupancy is
 *     derived from `teams` (readable for published divisions) instead.
 */

import { createClient } from '@/lib/supabase/client'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import type {
  DivisionRow,
  ProfileRow,
  RegistrationRow,
  RegistrationStatus,
  TournamentRow,
} from '@/lib/supabase/types'
import { getAllDemoBundles } from '@/lib/demo-data'
import {
  buildRegistrationNotes,
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
    }
  }

  const { data: divisionData } = await supabase
    .from('divisions')
    .select('*')
    .eq('tournament_id', tournament.id)
    .order('name', { ascending: true })
  const divisionRows = (divisionData ?? []) as DivisionRow[]

  // Occupancy: `registrations` is owner-only under RLS, so this used to count
  // `teams` instead — but a team row only exists once a partner *accepts* an
  // invite, so through pre-registration it is approximately zero and every
  // division reads as empty. `division_occupancy` (migration 0015) publishes
  // the entry count itself, aggregates only, readable by anyone.
  const { data: occupancyRows } = await supabase
    .from('division_occupancy')
    .select('division_id, registered_players')
  const occupancyByDivision = new Map(
    ((occupancyRows ?? []) as { division_id: string; registered_players: number }[]).map((row) => [
      row.division_id,
      row.registered_players,
    ]),
  )

  const divisions: DivisionSummary[] = divisionRows.map((division) => ({
    id: division.id,
    name: division.name,
    gender: division.gender,
    maxTeams: division.max_teams,
    registeredPlayers: occupancyByDivision.get(division.id) ?? 0,
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
    }
  }

  const [{ data: profileData }, { data: registrationData }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('registrations').select('id, division_id, status').eq('player_id', user.id),
  ])

  return {
    configured: true,
    userId: user.id,
    userEmail: user.email ?? null,
    profile: (profileData as ProfileRow | null) ?? null,
    tournamentId: tournament.id,
    divisions,
    myRegistrations: (registrationData ?? []) as Pick<RegistrationRow, 'id' | 'division_id' | 'status'>[],
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
  /** Always true: the committee pairs every entry. */
  freeAgent: boolean
  /** Set when the write failed — already a friendly, festive message. */
  error?: string
}

/**
 * Persists the registration: profile details first (so the emergency contact
 * is always current), then the `registrations` row. There is no invite row —
 * the committee pairs every entry itself.
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
      freeAgent: true,
    }
  }

  if (!context.userId || !context.tournamentId) {
    return {
      ok: false,
      status,
      divisionId: values.divisionId,
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
      freeAgent: false,
      error: `We couldn’t save your player details: ${profileError.message}`,
    }
  }

  const notes = buildRegistrationNotes({
    nominatedPartner: values.nominatedPartner,
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
      // Migration 0014 lets a player write 'waitlisted' as well as 'pending'.
      // Clamp rather than trust: `status` arrives from the client, and the two
      // values are the only ones RLS will accept anyway — this makes the
      // rejection a validation, not a database error the player has to read.
      status: status === 'waitlisted' ? 'waitlisted' : 'pending',
      notes,
    } as never)
    .select('id')
    .maybeSingle()

  if (registrationError) {
    const duplicate = registrationError.code === '23505'
    // 23514 is `enforce_registration_window` (migration 0016) refusing an entry
    // outside the window. Its messages are written for players, so pass them
    // through rather than burying them under a generic prefix.
    const outsideWindow = registrationError.code === '23514'
    return {
      ok: false,
      status,
      divisionId: values.divisionId,
      freeAgent: false,
      error: duplicate
        ? 'You’re already on the list for this division — one entry per player, even at Christmas 🎄'
        : outsideWindow
          ? registrationError.message
          : `We couldn’t save your registration: ${registrationError.message}`,
    }
  }

  void inserted

  // No invite is sent, and nothing waits on a second player. A nominated
  // partner is recorded in the notes for the committee to act on; the pair
  // itself is built on `/admin/teams`.

  return {
    ok: true,
    status,
    divisionId: values.divisionId,
    freeAgent: true,
  }
}
