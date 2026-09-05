/**
 * Who gets to see the rest of the app.
 *
 * Pre-registration is an application, not an enrolment: anyone can create an
 * account and submit an entry, and the committee then approves, waitlists or
 * declines it. Until that decision lands, showing a player their dashboard,
 * the scoring console and the tabulator inbox promises them a place they may
 * not get — so an entry that is not yet approved sees a single page telling
 * them where they stand, and nothing else.
 *
 * The decision itself is a pure function so it can be unit tested without a
 * database or a session. `requireApprovedPlayer` in
 * `src/lib/registration-gate-server.ts` is the thin part that fetches the
 * inputs and acts on the outcome.
 */

import type { RegistrationStatus } from '@/lib/supabase/types'

/** What the viewer should be shown. */
export type RegistrationGateOutcome = 'allow' | 'pending' | 'waitlisted' | 'declined'

export interface RegistrationGateInput {
  /** The viewer's registration status, or `null` when they have not entered. */
  status: RegistrationStatus | null
  /**
   * True for anyone holding a role beyond `player` — admins, tabulators and
   * duty officials. Committee members are frequently players too, and an
   * organiser whose own entry is still pending must not be locked out of the
   * console they need in order to approve it.
   */
  isStaff: boolean
}

/**
 * Resolves what a signed-in viewer should see.
 *
 * Note that "has not registered at all" resolves to `allow`, not `pending`.
 * Someone who has an account but no entry is mid-signup, and the dashboard
 * already has a panel that walks them into the entry form; bouncing them to a
 * status page about an entry they never made would be a dead end.
 */
export function resolveRegistrationGate({ status, isStaff }: RegistrationGateInput): RegistrationGateOutcome {
  if (isStaff) return 'allow'
  switch (status) {
    case 'approved':
      return 'allow'
    case 'waitlisted':
      return 'waitlisted'
    case 'rejected':
      return 'declined'
    case 'pending':
      return 'pending'
    default:
      return 'allow'
  }
}

/** Route the gate sends a not-yet-approved player to. */
export const REGISTRATION_STATUS_PATH = '/status'

/**
 * Reduces every entry a player holds to the one the gate should judge them on.
 *
 * Entries are per division and a player may hold several, so "their status" is
 * not a single value. An approval anywhere outranks everything: being told you
 * are in one draw and then locked out of the app because a second application
 * is still being read would be absurd, and worse, it would strand a player
 * mid-event on a spot they had already paid for.
 *
 * Below that the caller's ordering decides — pass rows newest-first and a
 * player who was declined and re-entered reads as `pending`, which is the
 * honest answer.
 */
export function bestRegistrationStatus(
  statuses: readonly RegistrationStatus[],
): RegistrationStatus | null {
  if (statuses.length === 0) return null
  if (statuses.includes('approved')) return 'approved'
  return statuses[0]
}

/**
 * Routes under the gate: everything a player only has a use for once they are
 * actually in the tournament. The public site (schedule, standings, live
 * scores, `/tv`) stays open to everyone, including declined entrants — it is
 * public information and hiding it would be pointless as well as unkind.
 */
export const GATED_PREFIXES = ['/dashboard', '/scoresheets', '/scoring', '/tabulator'] as const
