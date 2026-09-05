/**
 * The service-role Supabase client.
 *
 * ## Why this exists at all
 *
 * There is no SMTP server behind this tournament (see `docs/GO-LIVE.md`), so
 * `/forgot-password` tells a locked-out player to ask an organiser — and until
 * now there was nothing on the admin side that could actually help them.
 * Changing another user's password is an Auth Admin operation, and Supabase
 * only exposes it to the service role, so it cannot be done with the
 * cookie-bound client every other page uses.
 *
 * ## Why it is quarantined in its own file
 *
 * This key bypasses **every** row-level security policy in the database. The
 * rules for touching it:
 *
 * - Server-only. It is read from `SUPABASE_SERVICE_ROLE_KEY`, deliberately
 *   *not* `NEXT_PUBLIC_`-prefixed, so it can never reach a browser bundle.
 * - Every caller must have already established that the actor is an admin.
 *   The key grants no authorisation of its own — it removes all of it.
 * - Use it only for operations the anon/authenticated client genuinely
 *   cannot perform. Reading data is not one of them.
 *
 * Returns `null` rather than throwing when the key is absent, because that is
 * the normal state in demo mode, in CI and on any deployment where the
 * committee has not added the variable. Callers report that as a setup step
 * the operator can act on, instead of a crash.
 */

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseUrl } from './config'

/**
 * Read on every call rather than once at module load.
 *
 * Module scope is evaluated during `next build`, which runs without this
 * variable set in CI — capturing the empty string there would leave the reset
 * button permanently disabled at runtime even though Vercel supplies the key.
 */
function serviceRoleKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
}

/** True when a service-role key is configured and admin operations are possible. */
export function isServiceRoleConfigured(): boolean {
  return supabaseUrl.length > 0 && serviceRoleKey().length > 0
}

/**
 * What to tell an operator when it is missing. Names the variable and where it
 * comes from, because "not configured" on its own is not actionable.
 */
export const SERVICE_ROLE_SETUP_HINT =
  'Password resets need the SUPABASE_SERVICE_ROLE_KEY environment variable. ' +
  'Copy it from Supabase → Project Settings → API → service_role, add it in ' +
  'Vercel → Settings → Environment Variables, and redeploy.'

/**
 * A service-role client, or `null` when the key is not configured.
 *
 * No session is persisted and no token is refreshed: this client is built per
 * call inside a Server Action and thrown away.
 */
export function createAdminClient(): SupabaseClient | null {
  if (!isServiceRoleConfigured()) return null
  return createSupabaseClient(supabaseUrl, serviceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
