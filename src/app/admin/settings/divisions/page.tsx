import { requireAdmin } from '@/lib/auth'
import { DemoModeNotice } from '@/components/auth'
import { AdminDataErrorBanner } from '@/components/admin/AdminUI'
import { DivisionsEditor } from '@/components/settings'
import { loadSettingsPageData } from '../data'
import { saveDivisionsAction } from '../actions'

export default async function SettingsDivisionsPage() {
  // Redundant with the /admin layout guard, but kept so the requirement is
  // visible at the page itself. In demo mode `requireAdmin` resolves to the
  // stand-in organiser, so the console stays reviewable in CI.
  await requireAdmin('/admin/settings/divisions')
  const { settings, entryCounts, isDemo, error } = await loadSettingsPageData()

  return (
    <div className="space-y-5">
      {isDemo && <DemoModeNotice what="Saving divisions" />}
      {error && <AdminDataErrorBanner message={error} />}
      <DivisionsEditor
        initial={settings.divisions}
        entryCounts={entryCounts}
        save={saveDivisionsAction}
      />
    </div>
  )
}
