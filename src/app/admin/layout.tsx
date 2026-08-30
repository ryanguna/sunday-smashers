import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { AdminShell } from '@/components/admin/AdminShell'

export const metadata: Metadata = {
  title: 'Admin console',
  description: 'Sunday Smashers tournament administration.',
  robots: { index: false, follow: false },
}

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
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const demo = !isSupabaseConfigured()
  if (!demo) {
    await requireAdmin('/admin')
  }

  return <AdminShell demo={demo}>{children}</AdminShell>
}
