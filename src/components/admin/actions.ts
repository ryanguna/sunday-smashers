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
      reviewed_by: actor?.id ?? null,
      reviewed_at: new Date().toISOString(),
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

  const { data: saved, error } = input.paymentId
    ? await supabase.from('payments').update(payload).eq('id', input.paymentId).select('id').maybeSingle()
    : await supabase.from('payments').insert(payload).select('id').maybeSingle()

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
