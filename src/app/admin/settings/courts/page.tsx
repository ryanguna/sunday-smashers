import { requireAdmin } from '@/lib/auth'
import { DemoModeNotice } from '@/components/auth'
import { AdminDataErrorBanner } from '@/components/admin/AdminUI'
import { CourtsAndSlotsEditor } from '@/components/settings'
import { loadSettingsPageData } from '../data'
import { saveCourtsAndSlotsAction } from '../actions'

export default async function SettingsCourtsPage() {
  // Redundant with the /admin layout guard, but kept so the requirement is
  // visible at the page itself. In demo mode `requireAdmin` resolves to the
  // stand-in organiser, so the console stays reviewable in CI.
  await requireAdmin('/admin/settings/courts')
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
