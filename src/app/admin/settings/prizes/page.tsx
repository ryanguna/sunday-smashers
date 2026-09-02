import { requireAdmin } from '@/lib/auth'
import { DemoModeNotice } from '@/components/auth'
import { AdminDataErrorBanner } from '@/components/admin/AdminUI'
import { PrizesEditor } from '@/components/settings'
import { loadSettingsPageData } from '../data'
import { savePrizesAction } from '../actions'

/**
 * Signed-in only: never prerender. Without this the auth check runs at build
 * time (when there is no session) and the result is cached and served to
 * everyone. Most pages here are dynamic anyway because they read cookie-bound
 * data, but that is incidental — this states it.
 */
export const dynamic = 'force-dynamic'

export default async function SettingsPrizesPage() {
  // Redundant with the /admin layout guard, but kept so the requirement is
  // visible at the page itself. In demo mode `requireAdmin` resolves to the
  // stand-in organiser, so the console stays reviewable in CI.
  await requireAdmin('/admin/settings/prizes')
  const { settings, entryCounts, isDemo, error } = await loadSettingsPageData()

  const playerCount = settings.divisions
    .filter((division) => division.enabled)
    .reduce((total, division) => total + (entryCounts[division.id] ?? 0) * 2, 0)

  return (
    <div className="space-y-5">
      {isDemo && <DemoModeNotice what="Saving prizes" />}
      {error && <AdminDataErrorBanner message={error} />}
      <PrizesEditor
        initial={settings.prizes}
        divisions={settings.divisions}
        playerCount={playerCount}
        save={savePrizesAction}
      />
    </div>
  )
}
