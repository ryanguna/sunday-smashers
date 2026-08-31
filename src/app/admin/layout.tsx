import type { Metadata } from 'next'
import { requireAdminOrDemo } from '@/lib/auth'
import { AdminShell } from '@/components/admin/AdminShell'

export const metadata: Metadata = {
  title: 'Admin console',
  description: 'Sunday Smashers tournament administration.',
  robots: { index: false, follow: false },
}

/**
 * Never prerender the admin console.
 *
 * Without this, demo mode makes these pages statically renderable — the guard
 * below touches no cookies, so Next happily bakes them to HTML at build time.
 * On Vercel that HTML is then served straight from the CDN with no server code
 * running at all, which means no guard runs on any request, ever. Fourteen
 * admin routes were being emitted that way, including `/admin` itself and the
 * whole of `/admin/settings`.
 *
 * A configured build renders them dynamically anyway (the auth check reads
 * cookies), so this costs nothing in production and closes the hole in the one
 * state where it is open.
 */
export const dynamic = 'force-dynamic'

/**
 * Guards the ENTIRE `/admin` tree. Every admin route inherits this layout,
 * so no admin page needs its own guard (they may still add one — it is
 * cheap and `requireAdmin` is memoised per request by Supabase's client).
 *
 * Demo mode: when no Supabase env vars are present there is no auth system
 * at all — `requireAdmin()` would bounce everyone to `/login`, making the
 * console impossible to review in CI or the preview deploy. Since there is
 * also no real data to protect in that state, we skip the redirect and
 * render the bundled sample data behind a prominent "demo mode" banner.
 * The guard is fully active the moment Supabase is configured.
 *
 * The one case that is *not* a demo is a production deployment missing its
 * environment variables, which would otherwise serve this console to the
 * public. `requireAdminOrDemo` sends that case to `/setup` instead.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const demo = await requireAdminOrDemo('/admin')

  return <AdminShell demo={demo}>{children}</AdminShell>
}
