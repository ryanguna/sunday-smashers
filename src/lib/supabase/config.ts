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

/**
 * Vercel's own name for the deployment environment: `production`, `preview`,
 * `development`, or empty when not running on Vercel at all.
 */
export const deploymentEnvironment = process.env.VERCEL_ENV ?? ''

/**
 * True when a **public production deployment** is missing its Supabase
 * credentials.
 *
 * Demo mode is a feature everywhere else: it lets `npm run build` and the CI
 * Playwright run work with no env vars, and it lets a new contributor browse
 * the whole app before they have a database. To make that possible the auth
 * helpers hand out a stand-in organiser, because bouncing to a login form
 * that cannot work would make the admin console, scoring and tabulator
 * unreachable in exactly the mode designed to need no setup.
 *
 * On the production deployment that trade is wrong. Demo mode there does not
 * mean "someone is exploring", it means "the environment variables were never
 * finished" — and the consequence is an admin console, with Approve buttons,
 * served to anyone who guesses `/admin`. The data behind it is fictional, so
 * nothing leaks, but a visitor cannot know that, and neither can the
 * committee.
 *
 * Preview deployments are deliberately excluded: this project leaves their
 * Supabase variables unset on purpose so pull-request previews stay browsable
 * without being able to touch the real tournament.
 */
export function isUnconfiguredProductionDeployment(): boolean {
  return deploymentEnvironment === 'production' && !isSupabaseConfigured()
}
