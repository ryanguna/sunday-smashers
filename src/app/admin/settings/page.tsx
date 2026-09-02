import { requireAdmin } from '@/lib/auth'
import { DemoModeNotice } from '@/components/auth'
import { AdminDataErrorBanner, NoTournamentBanner } from '@/components/admin/AdminUI'
import { GoLiveCard, TournamentDetailsForm } from '@/components/settings'
import { loadSettingsPageData } from './data'
import { saveLiveStatusAction, saveTournamentDetailsAction } from './actions'

/**
 * Signed-in only: never prerender. Without this the auth check runs at build
 * time (when there is no session) and the result is cached and served to
 * everyone. Most pages here are dynamic anyway because they read cookie-bound
 * data, but that is incidental — this states it.
 */
export const dynamic = 'force-dynamic'

export default async function SettingsDetailsPage() {
  // Redundant with the /admin layout guard, but kept so the requirement is
  // visible at the page itself. In demo mode `requireAdmin` resolves to the
  // stand-in organiser, so the console stays reviewable in CI.
  await requireAdmin('/admin/settings')
  const { settings, liveStatus, isDemo, error, tournamentId } = await loadSettingsPageData()

  return (
    <div className="space-y-5">
      {isDemo && <DemoModeNotice what="Saving settings" />}
      {!isDemo && !tournamentId && <NoTournamentBanner />}
      {error && <AdminDataErrorBanner message={error} />}
      <GoLiveCard initial={liveStatus} save={saveLiveStatusAction} readOnly={false} />
      <TournamentDetailsForm
        initial={settings.details}
        save={saveTournamentDetailsAction}
        readOnly={false}
      />
    </div>
  )
}
