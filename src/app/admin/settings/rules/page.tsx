import { requireAdmin } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { DemoModeNotice } from '@/components/auth'
import { RulesEditor } from '@/components/settings'
import { loadSettingsPageData } from '../data'
import { saveRulesAction } from '../actions'

export default async function SettingsRulesPage() {
  // Demo mode has no auth system at all (and no real data to protect), so the
  // console stays reviewable in CI. The guard is live the moment Supabase is.
  if (isSupabaseConfigured()) await requireAdmin('/admin/settings/rules')
  const { settings, entryCounts, drawState, isDemo } = await loadSettingsPageData()

  return (
    <div className="space-y-5">
      {isDemo && <DemoModeNotice what="Saving rules" />}
      <RulesEditor
        initial={settings.divisions}
        entryCounts={entryCounts}
        courtCount={settings.courts.length}
        drawState={drawState}
        save={saveRulesAction}
      />
    </div>
  )
}
