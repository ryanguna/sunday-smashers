import { requireAdmin } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { DemoModeNotice } from '@/components/auth'
import { PrizesEditor } from '@/components/settings'
import { loadSettingsPageData } from '../data'
import { savePrizesAction } from '../actions'

export default async function SettingsPrizesPage() {
  // Demo mode has no auth system at all (and no real data to protect), so the
  // console stays reviewable in CI. The guard is live the moment Supabase is.
  if (isSupabaseConfigured()) await requireAdmin('/admin/settings/prizes')
  const { settings, entryCounts, isDemo } = await loadSettingsPageData()

  const playerCount = settings.divisions
    .filter((division) => division.enabled)
    .reduce((total, division) => total + (entryCounts[division.id] ?? 0) * 2, 0)

  return (
    <div className="space-y-5">
      {isDemo && <DemoModeNotice what="Saving prizes" />}
      <PrizesEditor
        initial={settings.prizes}
        divisions={settings.divisions}
        playerCount={playerCount}
        save={savePrizesAction}
      />
    </div>
  )
}
