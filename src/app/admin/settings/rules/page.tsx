import { requireAdmin } from '@/lib/auth'
import { DemoModeNotice } from '@/components/auth'
import { AdminDataErrorBanner } from '@/components/admin/AdminUI'
import { RulesEditor } from '@/components/settings'
import { loadSettingsPageData } from '../data'
import { saveRulesAction } from '../actions'

export default async function SettingsRulesPage() {
  // Redundant with the /admin layout guard, but kept so the requirement is
  // visible at the page itself. In demo mode `requireAdmin` resolves to the
  // stand-in organiser, so the console stays reviewable in CI.
  await requireAdmin('/admin/settings/rules')
  const { settings, entryCounts, drawState, isDemo, error } = await loadSettingsPageData()

  return (
    <div className="space-y-5">
      {isDemo && <DemoModeNotice what="Saving rules" />}
      {error && <AdminDataErrorBanner message={error} />}
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
