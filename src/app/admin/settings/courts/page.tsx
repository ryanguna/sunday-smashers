import { requireAdmin } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { DemoModeNotice } from '@/components/auth'
import { AdminDataErrorBanner } from '@/components/admin/AdminUI'
import { CourtsAndSlotsEditor } from '@/components/settings'
import { loadSettingsPageData } from '../data'
import { saveCourtsAndSlotsAction } from '../actions'

export default async function SettingsCourtsPage() {
  // Demo mode has no auth system at all (and no real data to protect), so the
  // console stays reviewable in CI. The guard is live the moment Supabase is.
  if (isSupabaseConfigured()) await requireAdmin('/admin/settings/courts')
  const { settings, isDemo, error } = await loadSettingsPageData()

  return (
    <div className="space-y-5">
      {isDemo && <DemoModeNotice what="Saving courts and time slots" />}
      {error && <AdminDataErrorBanner message={error} />}
      <CourtsAndSlotsEditor
        initialCourts={settings.courts}
        initialSlots={settings.timeSlots}
        tournamentDate={settings.details.tournamentDate}
        save={saveCourtsAndSlotsAction}
      />
    </div>
  )
}
