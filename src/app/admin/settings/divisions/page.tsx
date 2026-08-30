import { requireAdmin } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { DemoModeNotice } from '@/components/auth'
import { DivisionsEditor } from '@/components/settings'
import { loadSettingsPageData } from '../data'
import { saveDivisionsAction } from '../actions'

export default async function SettingsDivisionsPage() {
  // Demo mode has no auth system at all (and no real data to protect), so the
  // console stays reviewable in CI. The guard is live the moment Supabase is.
  if (isSupabaseConfigured()) await requireAdmin('/admin/settings/divisions')
  const { settings, entryCounts, isDemo } = await loadSettingsPageData()

  return (
    <div className="space-y-5">
      {isDemo && <DemoModeNotice what="Saving divisions" />}
      <DivisionsEditor
        initial={settings.divisions}
        entryCounts={entryCounts}
        save={saveDivisionsAction}
      />
    </div>
  )
}
