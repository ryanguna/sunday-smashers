/**
 * What gets destroyed when an organiser deletes a registration or a person.
 *
 * Deleting is the one admin action with no undo, and in this schema it reaches
 * further than the row you clicked. Both surfaces therefore ask this module
 * what is about to disappear, show that to the organiser, and only then write.
 *
 * The two operations are deliberately different shapes:
 *
 * - Deleting a **registration** removes a tournament entry. The person keeps
 *   their account and can enter again.
 * - Deleting a **person** removes the account itself, and every entry, payment,
 *   role and duty attached to it.
 *
 * Neither is the normal path. Rejecting a registration is how you turn somebody
 * away while keeping the record of it; delete is for duplicates, test rows and
 * genuine mistakes. The copy here says so, because an organiser reaching for
 * delete when they meant reject has no way back.
 */

import type { AdminRegistration } from './admin'
import { ROLE_LABELS, type ManagedUser } from './settings'
import { formatCents } from './settings'

/** A single consequence of a delete, phrased for a confirmation dialog. */
export interface DeletionEffect {
  /** Short label, e.g. `Payments`. */
  label: string
  /** What happens to it, e.g. `$50.00 recorded — the record is deleted too`. */
  detail: string
  /**
   * True when this effect destroys information that exists nowhere else and
   * the organiser is likely to want back (money, results). Rendered louder.
   */
  severe?: boolean
}

export interface DeletionPlan {
  allowed: boolean
  /** Why it cannot proceed. Only when `allowed` is false. */
  blockedReason?: string
  /** Headline, e.g. `Delete 2 registrations?`. */
  title: string
  /** What the organiser must type to confirm. */
  confirmWord: string
  effects: DeletionEffect[]
}

/**
 * The word an organiser types to confirm. A plain "Are you sure?" is clicked
 * through on reflex; typing a name forces you to look at *which* record you
 * picked, which is the mistake actually worth catching here.
 */
export const CONFIRM_WORD = 'DELETE'

// ---------------------------------------------------------------------------
// Registrations
// ---------------------------------------------------------------------------

/**
 * Describes deleting one or more tournament entries.
 *
 * Two consequences are not obvious from the table and are surfaced explicitly:
 *
 * 1. `payments.registration_id` is `on delete cascade`, so a recorded payment
 *    vanishes with the entry and the reconciliation total silently drops. If
 *    money has been taken, that is money the committee now has no record of
 *    having received.
 * 2. `team_members.registration_id` is `on delete set null`, so the player
 *    stays on their team with a dangling reference. Left alone that puts a
 *    player with no entry into the draw, which is why
 *    `deleteRegistrationsAction` clears the membership rows itself.
 */
export function planRegistrationDeletion(rows: readonly AdminRegistration[]): DeletionPlan {
  const count = rows.length
  const title =
    count === 1
      ? `Delete ${rows[0]?.playerName ?? 'this'}\u2019s entry?`
      : `Delete ${count} entries?`

  if (count === 0) {
    return {
      allowed: false,
      blockedReason: 'Select at least one registration first.',
      title: 'Nothing selected',
      confirmWord: CONFIRM_WORD,
      effects: [],
    }
  }

  const effects: DeletionEffect[] = [
    {
      label: count === 1 ? 'The entry' : 'The entries',
      detail:
        count === 1
          ? `${rows[0]?.playerName} is removed from ${rows[0]?.divisionName}. Their account stays, so they can enter again.`
          : `${count} players are removed from their divisions. Their accounts stay, so they can enter again.`,
    },
  ]

  const paidCents = rows.reduce((total, row) => total + row.payment.amountPaidCents, 0)
  if (paidCents > 0) {
    const who = rows.filter((row) => row.payment.amountPaidCents > 0)
    effects.push({
      label: 'Payments',
      severe: true,
      detail: `${formatCents(paidCents)} recorded against ${
        who.length === 1 ? who[0]?.playerName : `${who.length} of these players`
      } is deleted with the entry, and the reconciliation total drops by that much. Refund it first, or write the amount down now.`,
    })
  }

  const teamed = rows.filter((row) => row.teamId)
  if (teamed.length > 0) {
    effects.push({
      label: 'Teams',
      detail:
        teamed.length === 1
          ? `${teamed[0]?.playerName} is taken off ${teamed[0]?.teamName ?? 'their team'}, leaving their partner needing a new one.`
          : `${teamed.length} players are taken off their teams, leaving their partners needing new ones.`,
    })
  }

  const decided = rows.filter((row) => row.status !== 'pending')
  if (decided.length > 0) {
    effects.push({
      label: 'Already reviewed',
      detail:
        decided.length === 1
          ? `This entry is ${decided[0]?.status}. If you only want to turn them away, reject it instead \u2014 that keeps the record.`
          : `${decided.length} of these have already been reviewed. If you only want to turn people away, reject them instead \u2014 that keeps the record.`,
    })
  }

  return { allowed: true, title, confirmWord: CONFIRM_WORD, effects }
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

/**
 * Describes deleting a person's whole account.
 *
 * Blocked in two cases, both of which would leave the tournament unrunnable or
 * the organiser locked out of their own console:
 *
 * - **Yourself.** You would be signed out mid-session with no way back in.
 * - **The last admin.** Nobody could approve a registration or publish a draw
 *   again. This mirrors the same rule in `analyseRoleChange`, because deleting
 *   the last admin and revoking the last admin role have the same end state.
 */
export function analysePersonDeletion(input: {
  actorUserId: string
  targetUserId: string
  users: readonly ManagedUser[]
  /** Entries belonging to this person, so the dialog can name what goes. */
  registrations?: readonly AdminRegistration[]
}): DeletionPlan {
  const { actorUserId, targetUserId, users, registrations = [] } = input
  const target = users.find((user) => user.id === targetUserId)

  if (!target) {
    return {
      allowed: false,
      blockedReason: 'That person no longer exists.',
      title: 'Nothing to delete',
      confirmWord: CONFIRM_WORD,
      effects: [],
    }
  }

  const title = `Delete ${target.fullName}\u2019s account?`

  if (actorUserId === targetUserId) {
    return {
      allowed: false,
      blockedReason:
        'This is your own account. Deleting it would sign you out of the console with no way back in \u2014 ask another admin to do it.',
      title,
      confirmWord: CONFIRM_WORD,
      effects: [],
    }
  }

  if (target.roles.includes('admin')) {
    const admins = users.filter((user) => user.roles.includes('admin'))
    if (admins.length <= 1) {
      return {
        allowed: false,
        blockedReason:
          'This is the last admin. Make somebody else an admin first, or nobody can run the tournament.',
        title,
        confirmWord: CONFIRM_WORD,
        effects: [],
      }
    }
  }

  const mine = registrations.filter((row) => row.playerId === targetUserId)
  const effects: DeletionEffect[] = [
    {
      label: 'The account',
      detail: `${target.fullName} can no longer sign in, and their profile disappears from the players list. This cannot be undone \u2014 they would have to sign up again from scratch.`,
      severe: true,
    },
  ]

  if (mine.length > 0) {
    effects.push({
      label: mine.length === 1 ? 'Their entry' : 'Their entries',
      detail: `${mine.map((row) => row.divisionName).join(', ')} \u2014 deleted, along with their place on any team.`,
    })
    const paidCents = mine.reduce((total, row) => total + row.payment.amountPaidCents, 0)
    if (paidCents > 0) {
      effects.push({
        label: 'Payments',
        severe: true,
        detail: `${formatCents(paidCents)} recorded against them is deleted, and the reconciliation total drops by that much. Refund it first, or write the amount down now.`,
      })
    }
  }

  if (target.roles.length > 0) {
    effects.push({
      label: 'Roles',
      detail: `${target.roles.map((role) => ROLE_LABELS[role]).join(', ')} \u2014 given up. Anything they signed off stays, credited to a deleted user.`,
    })
  }

  return { allowed: true, title, confirmWord: CONFIRM_WORD, effects }
}
