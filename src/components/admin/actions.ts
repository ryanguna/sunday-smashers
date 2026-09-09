'use server'

import { revalidatePath } from 'next/cache'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, isAdmin } from '@/lib/auth'
import type { PaymentRow, RegistrationStatus } from '@/lib/supabase/types'
import { withDemoHint } from '@/lib/demo-mode'
import {
  clampPaidAmount,
  derivePaymentStatus,
  PAYMENT_METHODS,
  REGISTRATION_STATUSES,
  reviewStampFor,
  sumPaidCents,
  type AuditEntry,
  type PaymentMethod,
} from '@/lib/admin'

/**
 * Server Actions behind the admin console's write buttons.
 *
 * Every action re-checks `isAdmin()` server-side — the layout guard stops
 * people *navigating* to the console, but an action is a public POST
 * endpoint and must defend itself. RLS is the final backstop (`payments`
 * and `registrations` both require `public.is_admin()` for writes), but we
 * fail fast here so the UI gets a readable message instead of a policy
 * violation.
 *
 * In demo mode every action is a no-op that reports back honestly, so the
 * console stays clickable without a database.
 */

export interface ActionResult {
  ok: boolean
  message: string
  /** True when nothing was written because Supabase isn't configured. */
  demo?: boolean
}

const DEMO_RESULT: ActionResult = {
  ok: false,
  demo: true,
  message: withDemoHint('Demo mode — no database is connected, so nothing was saved.'),
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

/**
 * Audit write that is allowed to fail the operation.
 *
 * `writeAudit` deliberately swallows errors, on the grounds that a missing log
 * line should never stop a score being corrected. Deletes invert that: the
 * audit row is the *only* surviving record that a payment was ever taken, so
 * losing it silently is worse than refusing to delete. Callers write the entry
 * first and stop if it does not land.
 */
async function writeAuditOrFail(entries: AuditEntry[]): Promise<string | null> {
  if (entries.length === 0) return null
  const supabase = await createClient()
  const actor = await getCurrentUser()
  const { error } = await supabase.from('audit_log').insert(
    entries.map((entry) => ({
      actor_id: actor?.id ?? null,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      metadata: entry.metadata,
    }))
  )
  return error ? error.message : null
}

function revalidateAdmin() {
  revalidatePath('/admin')
  revalidatePath('/admin/registrations')
  revalidatePath('/admin/payments')
}

function isRegistrationStatus(value: string): value is RegistrationStatus {
  return (REGISTRATION_STATUSES as readonly string[]).includes(value)
}

function isPaymentMethod(value: string): value is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(value)
}

/**
 * Approve / waitlist / reject one or more registrations, and log each
 * change to `audit_log`.
 */
export async function updateRegistrationStatusAction(
  registrationIds: string[],
  nextStatus: string
): Promise<ActionResult> {
  if (!isRegistrationStatus(nextStatus)) {
    return { ok: false, message: `"${nextStatus}" is not a valid registration status.` }
  }
  if (registrationIds.length === 0) {
    return { ok: false, message: 'Select at least one registration first.' }
  }
  if (!isSupabaseConfigured()) return DEMO_RESULT
  if (!(await isAdmin())) {
    return { ok: false, message: 'Only admins can change registration statuses.' }
  }

  const supabase = await createClient()
  const actor = await getCurrentUser()

  const { data: before } = await supabase
    .from('registrations')
    .select('id, status, player_id, division_id')
    .in('id', registrationIds)

  const { error } = await supabase
    .from('registrations')
    .update({
      status: nextStatus,
      // Cleared when going back to pending: that is undoing the review, not
      // performing one.
      ...reviewStampFor(nextStatus, actor?.id ?? null),
    })
    .in('id', registrationIds)

  if (error) return { ok: false, message: `Could not update: ${error.message}` }

  await writeAudit(
    registrationIds.map((id) => {
      const previous = (before ?? []).find(
        (row) => (row as { id: string }).id === id
      ) as { status?: RegistrationStatus } | undefined
      return {
        action: `registration.${nextStatus}`,
        entity_type: 'registration',
        entity_id: id,
        metadata: { from: previous?.status ?? null, to: nextStatus },
      }
    })
  )

  revalidateAdmin()
  const count = registrationIds.length
  return {
    ok: true,
    message: `${count} registration${count === 1 ? '' : 's'} moved to ${nextStatus}. 🎄`,
  }
}

export interface PaymentUpdateInput {
  registrationId: string
  /** Existing `payments.id`, or `null` to create the row on first save. */
  paymentId: string | null
  amountCents: number
  amountPaidCents: number
  method: string | null
  reference: string | null
}

/** Records or amends a payment, deriving the status from the amounts. */
export async function updatePaymentAction(input: PaymentUpdateInput): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return DEMO_RESULT
  if (!(await isAdmin())) {
    return { ok: false, message: 'Only admins can record payments.' }
  }

  const amountCents = Math.max(0, Math.round(input.amountCents))
  const amountPaidCents = clampPaidAmount(input.amountPaidCents, amountCents)
  const status = derivePaymentStatus(amountPaidCents, amountCents)
  const method = input.method && isPaymentMethod(input.method) ? input.method : null
  const reference = input.reference?.trim() ? input.reference.trim() : null

  const supabase = await createClient()
  const actor = await getCurrentUser()

  type PreviousPayment = Pick<PaymentRow, 'status' | 'amount_paid_cents'>
  let previous: PreviousPayment | null = null
  if (input.paymentId) {
    const { data } = await supabase
      .from('payments')
      .select('status, amount_paid_cents')
      .eq('id', input.paymentId)
      .maybeSingle()
    previous = (data ?? null) as PreviousPayment | null
  }

  const payload = {
    registration_id: input.registrationId,
    amount_cents: amountCents,
    amount_paid_cents: amountPaidCents,
    status,
    method,
    reference,
    recorded_by: actor?.id ?? null,
  }

  // Upsert on the registration, not a bare insert. `uq_payments_registration`
  // (migration 0013) allows one payment record per entry; without the
  // `onConflict` the second admin to save would simply get a constraint
  // error, and before that constraint existed they silently created a second
  // row that double-counted the money in the reconciliation totals.
  const { data: saved, error } = input.paymentId
    ? await supabase.from('payments').update(payload).eq('id', input.paymentId).select('id').maybeSingle()
    : await supabase
        .from('payments')
        .upsert(payload, { onConflict: 'registration_id' })
        .select('id')
        .maybeSingle()

  if (error) return { ok: false, message: `Could not save the payment: ${error.message}` }

  await writeAudit([
    {
      action: `payment.${status}`,
      entity_type: 'payment',
      entity_id: (saved as { id?: string } | null)?.id ?? input.paymentId,
      metadata: {
        registration_id: input.registrationId,
        from_status: previous?.status ?? null,
        to_status: status,
        from_paid_cents: previous?.amount_paid_cents ?? null,
        to_paid_cents: amountPaidCents,
        method,
        reference,
      },
    },
  ])

  revalidateAdmin()
  return { ok: true, message: `Payment saved — marked ${status}. 🎁` }
}

/**
 * Permanently deletes tournament entries.
 *
 * Rejecting is the normal way to turn somebody away — it keeps the record of
 * the decision. This is for duplicates, test rows and genuine mistakes, and it
 * has to do two things the database will not do for us:
 *
 * 1. **Clear team membership first.** `team_members.registration_id` is
 *    `on delete set null`, so deleting the entry alone leaves the player sitting
 *    on a team with no entry behind it — and the draw builds from teams, so they
 *    would still be dealt into fixtures. Removing the membership row is part of
 *    deleting the entry, not a follow-up chore for the organiser.
 * 2. **Record the money before it cascades.** `payments.registration_id` is
 *    `on delete cascade`, so any recorded payment is destroyed with no trace.
 *    The audit entry is therefore written *first* and is allowed to abort the
 *    delete: a committee reconciling cash at the end of the day needs to find
 *    what was taken and from whom, and after the cascade nothing else knows.
 */
export async function deleteRegistrationsAction(
  registrationIds: string[]
): Promise<ActionResult> {
  if (registrationIds.length === 0) {
    return { ok: false, message: 'Select at least one registration first.' }
  }
  if (!isSupabaseConfigured()) return DEMO_RESULT
  if (!(await isAdmin())) {
    return { ok: false, message: 'Only admins can delete registrations.' }
  }

  const supabase = await createClient()

  // Read the whole picture before any of it is destroyed: after the delete
  // there is nothing left to describe in the audit log.
  const { data: before } = await supabase
    .from('registrations')
    .select('id, status, player_id, division_id, payments(amount_cents, amount_paid_cents)')
    .in('id', registrationIds)

  const found = (before ?? []) as unknown as Array<{
    id: string
    status: RegistrationStatus
    player_id: string
    division_id: string
    payments: unknown
  }>

  if (found.length === 0) {
    return { ok: false, message: 'Those registrations have already been deleted.' }
  }

  // Written first, and allowed to stop the delete. Once the rows are gone this
  // is the only place the amount paid still exists.
  const auditError = await writeAuditOrFail(
    found.map((row) => ({
      action: 'registration.deleted',
      entity_type: 'registration',
      entity_id: row.id,
      metadata: {
        status: row.status,
        player_id: row.player_id,
        division_id: row.division_id,
        amount_paid_cents: sumPaidCents(row.payments),
      },
    }))
  )
  if (auditError) {
    return {
      ok: false,
      message: `Could not record the deletion in the audit log, so nothing was deleted: ${auditError}`,
    }
  }

  const { error: membershipError } = await supabase
    .from('team_members')
    .delete()
    .in('registration_id', registrationIds)

  if (membershipError) {
    return {
      ok: false,
      message: `Could not take them off their team, so nothing was deleted: ${membershipError.message}`,
    }
  }

  const { error } = await supabase.from('registrations').delete().in('id', registrationIds)
  if (error) return { ok: false, message: `Could not delete: ${error.message}` }

  revalidateAdmin()
  const count = found.length
  return {
    ok: true,
    message: `${count} registration${count === 1 ? '' : 's'} deleted. Their accounts are untouched, so they can enter again.`,
  }
}
