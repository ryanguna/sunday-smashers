/**
 * Single source of truth for the site's public identity.
 *
 * `layout.tsx` (metadata), `robots.ts` and `sitemap.ts` all need to agree on the
 * canonical origin and on which routes are public. Declaring them once and
 * deriving keeps a new page from silently missing the sitemap, or a private
 * console from leaking into it.
 */

/**
 * Canonical origin. Overridable per environment so preview deploys don't
 * advertise the production URL; falls back to the production domain.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://sunday-smashers.vercel.app'

/** Routes anyone can see, and which therefore belong in the sitemap. */
export const PUBLIC_ROUTES = [
  '/',
  '/rules',
  '/schedule',
  '/standings',
  '/bracket',
  '/live',
  '/players',
  '/awards',
  '/gallery',
  '/announcements',
  '/register',
  '/login',
  '/signup',
] as const

/**
 * Routes behind a role guard. These must never be indexed: they are useless to
 * a crawler (they redirect to login) and they advertise the admin surface.
 * Kept in sync with the protected prefixes in `src/proxy.ts`.
 */
export const PRIVATE_ROUTE_PREFIXES = [
  '/admin',
  '/dashboard',
  '/scoring',
  '/scoresheets',
  '/tabulator',
  '/onboarding',
  '/auth',
  '/forgot-password',
] as const

/**
 * The courtside display. Public, but pointless in search results and it
 * auto-refreshes forever, so keep crawlers off it.
 */
export const UNINDEXED_PUBLIC_PREFIXES = ['/tv'] as const

/** Rough priority hint: the front page first, then the pages players actually use. */
export function routePriority(route: string): number {
  if (route === '/') return 1
  if (route === '/register' || route === '/rules') return 0.9
  if (route === '/schedule' || route === '/standings' || route === '/live') return 0.8
  return 0.6
}
