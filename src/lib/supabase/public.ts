import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from './config'

/**
 * A Supabase client for **public, anonymous, cacheable** reads.
 *
 * ## Why this exists alongside `server.ts`
 *
 * `createClient()` in `server.ts` wires Supabase up to the request's cookies so
 * it can act as the signed-in player. Reading cookies is what makes a Next.js
 * route *dynamic*: the moment a page touches them it can no longer be
 * prerendered or cached, and every navigation pays for a fresh server render.
 *
 * That cost was being paid by pages that never needed a session at all. The
 * landing page and the rules page only read the published tournament row and
 * the committee's page-visibility switches — both world-readable — yet both
 * routes were dynamic purely because the loader reached for the cookie client.
 * Navigating between them took 1.3–2.4 seconds.
 *
 * This client has no cookie jar, so a caller can wrap it in `unstable_cache`
 * and let a whole route go static. It can only ever see what an anonymous
 * visitor can see, which is exactly the point: **never use it to read anything
 * a signed-out stranger shouldn't have.** RLS is still enforced — this is the
 * `anon` role, not a service key — so the worst a mistake here can do is fail
 * to find a row.
 */
export function createPublicClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null
  return createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      // No session to persist and no token to refresh: this client is
      // constructed per call inside a cached function, and a background
      // refresh timer there would leak.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
