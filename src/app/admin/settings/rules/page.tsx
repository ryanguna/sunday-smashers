import { requireAdmin } from '@/lib/auth'
import { DemoModeNotice } from '@/components/auth'
import { AdminDataErrorBanner, NoTournamentBanner } from '@/components/admin/AdminUI'
import { RulesEditor, RulesPublishCard } from '@/components/settings'
import { loadSiteCopy } from '@/lib/site-copy-server'
import { loadSettingsPageData } from '../data'
import { saveRulesAction } from '../actions'
import { setRulesPublishedAction } from '../copy/actions'

/**
 * Signed-in only: never prerender. Without this the auth check runs at build
 * time (when there is no session) and the result is cached and served to
 * everyone. Most pages here are dynamic anyway because they read cookie-bound
 * data, but that is incidental — this states it.
 */
export const dynamic = 'force-dynamic'

export default async function SettingsRulesPage() {
  // Redundant with the /admin layout guard, but kept so the requirement is
  // visible at the page itself. In demo mode `requireAdmin` resolves to the
  // stand-in organiser, so the console stays reviewable in CI.
  await requireAdmin('/admin/settings/rules')
  const { settings, entryCounts, drawState, isDemo, error, tournamentId } = await loadSettingsPageData()
  const copy = await loadSiteCopy()

  return (
    <div className="space-y-5">
      {isDemo && <DemoModeNotice what="Saving rules" />}
      {!isDemo && !tournamentId && <NoTournamentBanner />}
      {error && <AdminDataErrorBanner message={error} />}
      <RulesPublishCard published={copy.rulesAreFinal} publish={setRulesPublishedAction} />
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
