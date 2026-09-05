/**
 * The server half of the approval gate: fetches the viewer's entry status and
 * acts on the decision from `resolveRegistrationGate`.
 *
 * Split from `./registration-gate` so the decision stays unit-testable — this
 * file pulls in `next/headers` via the Supabase server client and cannot be
 * imported from a Client Component.
 */

import { redirect } from 'next/navigation'
import { getCurrentUser, getUserRoles, requireAuth } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import type { RegistrationStatus, UserRole } from '@/lib/supabase/types'
import {
  bestRegistrationStatus,
  REGISTRATION_STATUS_PATH,
  resolveRegistrationGate,
  type RegistrationGateOutcome,
} from '@/lib/registration-gate'

/**
 * The signed-in viewer's entry status, or `null` when they have not entered.
 *
 * A player can hold **more than one** entry: the duplicate check and the
 * database constraint are both per division (`unique (division_id,
 * player_id)`), so entering a second draw creates a second row. Judging on the
 * newest row alone would mean an approved player who enters another division
 * is instantly bounced out of the dashboard, scoring console and scoresheets
 * they were already approved for — including mid-event, on a spot they paid
 * for. So the *best* status wins: one approval is enough to be in.
 *
 * Below approval the newest row decides, which keeps the sensible reading of
 * "declined once, re-entered, now pending".
 */
export async function loadViewerRegistrationStatus(): Promise<RegistrationStatus | null> {
  if (!isSupabaseConfigured()) return null
  const user = await getCurrentUser()
  if (!user) return null
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('registrations')
    .select('status, created_at')
    .eq('player_id', user.id)
    .order('created_at', { ascending: false })
  // Fail open on a read error. A Supabase blip must not lock an approved
  // player out of their own dashboard mid-event; the pages behind the gate
  // carry their own auth guard, so the worst case here is a pending player
  // seeing an empty dashboard for the length of the outage.
  if (error) return null
  const rows = (data ?? []) as { status: RegistrationStatus }[]
  return bestRegistrationStatus(rows.map((row) => row.status))
}

/** The gate outcome for the signed-in viewer, without redirecting. */
export async function viewerGateOutcome(): Promise<RegistrationGateOutcome> {
  if (!isSupabaseConfigured()) return 'allow'

  // `getUserRoles` throws on a read failure by design — it fails closed so a
  // Supabase blip cannot silently grant a console. That is right for a
  // permission check and wrong here: this gate is a promise-keeping guard,
  // not a security boundary (everything behind it is protected by RLS in its
  // own right), so a blip must not turn an approved player's dashboard into
  // an error page mid-event. Treat an unreadable role list as "not staff" and
  // let the status decide.
  const [status, roles] = await Promise.all([
    loadViewerRegistrationStatus(),
    getUserRoles().catch(() => [] as UserRole[]),
  ])
  return resolveRegistrationGate({
    status,
    isStaff: roles.some((role) => role !== 'player'),
  })
}

/**
 * Requires a signed-in viewer whose entry has been approved.
 *
 * Anyone still pending, waitlisted or declined is sent to
 * `REGISTRATION_STATUS_PATH`, which tells them where they stand in the
 * committee's own words. In demo mode this is a plain `requireAuth`.
 */
export async function requireApprovedPlayer(currentPath: string): Promise<void> {
  await requireAuth(currentPath)
  if (!isSupabaseConfigured()) return
  if ((await viewerGateOutcome()) !== 'allow') redirect(REGISTRATION_STATUS_PATH)
}
