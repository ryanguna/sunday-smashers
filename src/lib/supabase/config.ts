/**
 * Shared Supabase configuration + "demo mode" detection.
 *
 * Sunday Smashers must render every page even when Supabase credentials are
 * absent (e.g. `npm run build` and the CI Playwright run have no env vars
 * set). Every other Supabase helper in this directory funnels through here
 * so there is exactly one place that decides whether the app is "configured"
 * or running in demo mode, and none of them throw at import time.
 */

/** Resolved (possibly empty-string) values — never `undefined`. */
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

/**
 * True when both `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
 * are present and non-empty.
 *
 * Pages/components should check this before rendering data that depends on a
 * real Supabase connection, and render demo/placeholder content otherwise.
 */
export function isSupabaseConfigured(): boolean {
  return supabaseUrl.length > 0 && supabaseAnonKey.length > 0
}
