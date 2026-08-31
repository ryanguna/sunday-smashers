import { requireAdmin } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { DemoModeNotice } from '@/components/auth'
import { AdminDataErrorBanner } from '@/components/admin/AdminUI'
import { TournamentDetailsForm } from '@/components/settings'
import { loadSettingsPageData } from './data'
import { saveTournamentDetailsAction } from './actions'

export default async function SettingsDetailsPage() {
  // Demo mode has no auth system at all (and no real data to protect), so the
  // console stays reviewable in CI. The guard is live the moment Supabase is.
  if (isSupabaseConfigured()) await requireAdmin('/admin/settings')
  const { settings, isDemo, error } = await loadSettingsPageData()

  return (
    <div className="space-y-5">
      {isDemo && <DemoModeNotice what="Saving settings" />}
      {error && <AdminDataErrorBanner message={error} />}
      <TournamentDetailsForm
        initial={settings.details}
        save={saveTournamentDetailsAction}
        readOnly={false}
      />
    </div>
  )
}
