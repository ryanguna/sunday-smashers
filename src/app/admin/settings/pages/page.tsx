import { requireAdmin } from '@/lib/auth'
import { DemoModeNotice } from '@/components/auth'
import { PageVisibilityEditor } from '@/components/settings'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { loadSitePageVisibility } from '@/lib/site-pages-server'
import { saveSitePageVisibilityAction } from './actions'

/**
 * Signed-in only: never prerender. Without this the auth check runs at build
 * time (when there is no session) and the result is cached and served to
 * everyone. Most pages here are dynamic anyway because they read cookie-bound
 * data, but that is incidental — this states it.
 */
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Pages',
  description: 'Choose which parts of the site are visible to players right now.',
}

export default async function SettingsPagesPage() {
  // Redundant with the /admin layout guard, but kept so the requirement is
  // visible at the page itself.
  await requireAdmin('/admin/settings/pages')
  const visibility = await loadSitePageVisibility()

  return (
    <div className="space-y-5">
      {!isSupabaseConfigured() && <DemoModeNotice what="Showing and hiding pages" />}
      <PageVisibilityEditor initial={visibility} save={saveSitePageVisibilityAction} />
    </div>
  )
}
