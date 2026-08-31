'use server'

import { revalidatePath } from 'next/cache'

import { getCurrentUser } from '@/lib/auth'
import {
  parseEntryFeeCents,
  setupFormErrors,
  slugify,
  type SetupFormValues,
  type SetupStatus,
} from '@/lib/setup'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'

/**
 * Server Actions for `/setup` — the first-run path that takes an empty
 * Supabase project to a usable admin console.
 *
 * Both actions are deliberately *self-guarding at the database layer*:
 * `claim_first_admin()` refuses once any admin exists (it takes an exclusive
 * lock, so two simultaneous taps cannot both win), and inserting a tournament
 * is gated by the `tournaments` RLS policy, which only admins satisfy.
 * Nothing here depends on the UI having hidden a button.
 */

export interface SetupActionResult {
  ok: boolean
  message: string
  /** Field-keyed problems, so the form can point at the offending input. */
  issues?: { path: string; message: string }[]
}

/** Reads the two facts that decide which setup step to show. */
export async function readSetupStatus(): Promise<SetupStatus> {
  if (!isSupabaseConfigured()) {
    // Demo mode has no database. Report that honestly so /setup explains what
    // is missing, rather than claiming an organiser and tournament exist.
    return { isConfigured: false, hasAdmin: false, hasTournament: false, isSignedIn: false }
  }

  const supabase = await createClient()
  const user = await getCurrentUser()

  const [adminResult, tournamentResult] = await Promise.all([
    supabase.rpc('admin_exists'),
    supabase.from('tournaments').select('id', { count: 'exact', head: true }),
  ])

  return {
    isConfigured: true,
    hasAdmin: adminResult.data === true,
    // `count` is null when the read is refused. Treat "cannot tell" as "none
    // yet" so setup stays reachable rather than locking the committee out.
    hasTournament: (tournamentResult.count ?? 0) > 0,
    isSignedIn: user !== null,
  }
}

/** Takes the first organiser seat (audit blocker B3). */
export async function claimFirstAdminAction(): Promise<SetupActionResult> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      message: 'There is no database connected yet, so there are no keys to hand over.',
    }
  }

  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) {
    return { ok: false, message: 'Sign in first — the keys go to whoever is signed in.' }
  }

  const { error } = await supabase.rpc('claim_first_admin')
  if (error) {
    return { ok: false, message: error.message }
  }

  revalidatePath('/setup')
  revalidatePath('/admin')
  return { ok: true, message: 'You are now an organiser. The admin console is open to you.' }
}

/**
 * Creates the one tournament row the entire site hangs off (audit blocker
 * B1). Until this row existed, every admin settings save silently wrote
 * nothing while reporting success.
 */
export async function createTournamentAction(
  values: SetupFormValues,
): Promise<SetupActionResult & { slug?: string }> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      message: 'There is no database connected yet, so there is nothing to save to.',
    }
  }

  const errors = setupFormErrors(values)
  if (errors.length > 0) {
    return {
      ok: false,
      message: 'Some answers need another look before we can save.',
      issues: errors.map(({ path, message }) => ({ path, message })),
    }
  }

  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) {
    return { ok: false, message: 'Sign in first.' }
  }

  const slug = slugify(values.slug) || slugify(values.name)
  const { data, error } = await supabase
    .from('tournaments')
    .insert({
      name: values.name.trim(),
      slug,
      tournament_date: new Date(values.tournamentDate).toISOString().slice(0, 10),
      registration_opens_at: new Date(values.registrationOpensAt).toISOString(),
      registration_closes_at: new Date(values.registrationClosesAt).toISOString(),
      doors_open_at: values.doorsOpenAt.trim() ? new Date(values.doorsOpenAt).toISOString() : null,
      venue_name: values.venueName.trim() || null,
      venue_address: values.venueAddress.trim() || null,
      description: values.description.trim() || null,
      entry_fee_cents: parseEntryFeeCents(values.entryFee),
      payment_instructions: values.paymentInstructions.trim() || null,
      contact_name: values.contactName.trim() || null,
      contact_email: values.contactEmail.trim() || null,
      contact_phone: values.contactPhone.trim() || null,
      // Deliberately NOT published and NOT open. Setup creates the tournament;
      // deciding the world can see it is a separate, conscious act in
      // Settings, so a half-configured event never leaks onto the public site.
      status: 'draft',
      is_published: false,
      is_registration_open: false,
    })
    .select('id, slug')
    .single()

  if (error) {
    if (error.code === '23505') {
      return {
        ok: false,
        message: 'A tournament already uses that web address — pick another.',
        issues: [{ path: 'slug', message: 'This link is already taken.' }],
      }
    }
    return { ok: false, message: error.message }
  }

  // Best-effort: a failed audit write must not undo a successful setup.
  try {
    await supabase.from('audit_log').insert({
      actor_id: user.id,
      action: 'tournament.create',
      entity_type: 'tournaments',
      entity_id: data.id,
      metadata: { summary: `Created "${values.name.trim()}" during first-run setup.`, slug },
    })
  } catch {
    // ignored on purpose
  }

  revalidatePath('/setup')
  revalidatePath('/admin')
  revalidatePath('/')
  return {
    ok: true,
    message: 'Tournament created. Next stop: divisions, courts and time slots.',
    slug: data.slug,
  }
}
