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
import type { RegistrationStatus } from '@/lib/supabase/types'
import {
  REGISTRATION_STATUS_PATH,
  resolveRegistrationGate,
  type RegistrationGateOutcome,
} from '@/lib/registration-gate'

/**
 * The signed-in viewer's entry status, or `null` when they have not entered.
 *
 * Reads the most recent entry: a player who was declined for one division and
 * then re-entered another should be judged on the entry they made last, not on
 * whichever row the database happened to return first.
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
    .limit(1)
  // Fail open on a read error. A Supabase blip must not lock an approved
  // player out of their own dashboard mid-event; the pages behind the gate
  // carry their own auth guard, so the worst case here is a pending player
  // seeing an empty dashboard for the length of the outage.
  if (error) return null
  const row = (data ?? [])[0] as { status: RegistrationStatus } | undefined
  return row?.status ?? null
}

/** The gate outcome for the signed-in viewer, without redirecting. */
export async function viewerGateOutcome(): Promise<RegistrationGateOutcome> {
  if (!isSupabaseConfigured()) return 'allow'
  const [status, roles] = await Promise.all([loadViewerRegistrationStatus(), getUserRoles()])
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
