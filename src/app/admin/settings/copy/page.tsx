import { requireAdmin } from '@/lib/auth'
import { DemoModeNotice } from '@/components/auth'
import { SiteCopyEditor } from '@/components/settings'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { loadSiteCopy } from '@/lib/site-copy-server'
import { saveSiteCopyAction } from './actions'

/**
 * Signed-in only: never prerender. Without this the auth check runs at build
 * time (when there is no session) and the result is cached and served to
 * everyone.
 */
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Messages',
  description: 'The words the site says to players on the committee’s behalf.',
}

export default async function SettingsCopyPage() {
  await requireAdmin('/admin/settings/copy')
  const copy = await loadSiteCopy()

  return (
    <div className="space-y-5">
      {!isSupabaseConfigured() && <DemoModeNotice what="Editing site messages" />}
      <SiteCopyEditor initial={copy} save={saveSiteCopyAction} />
    </div>
  )
}
