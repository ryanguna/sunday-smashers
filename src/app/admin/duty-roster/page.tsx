import type { Metadata } from 'next'

import { requireAdmin } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { AdminDemoBanner, AdminPageHeader } from '@/components/admin/AdminUI'
import { Button } from '@/components/ui'
import { RacketIcon } from '@/components/icons'
import { DutyRosterConsole } from '@/components/schedule/DutyRosterConsole'
import { getScheduleWorkbenchData } from '../schedule/data'

export const metadata: Metadata = {
  title: 'Duty roster',
  robots: { index: false, follow: false },
}

/**
 * Who officiates what. Derived straight from the schedule using the rule in
 * the draft sheet — the players of the next match on a court run the current
 * one — with manual reassignment for the gaps.
 */
export default async function AdminDutyRosterPage() {
  if (isSupabaseConfigured()) {
    await requireAdmin('/admin/duty-roster')
  }

  const { matches, courts, slots, teams, savedPlacements, manualDuties, isDemo } =
    await getScheduleWorkbenchData()

  return (
    <>
      <AdminPageHeader
        eyebrow="Four elves per match"
        title="Duty roster"
        description="Umpire/Scorer, Scoresheet and two line judges for every match — taken from the players of the next match up on that court. Nobody ever officiates their own game."
        actions={
          <Button href="/admin/schedule" variant="secondary" size="sm">
            <RacketIcon size={16} aria-hidden="true" />
            Schedule builder
          </Button>
        }
      />
      {isDemo && <AdminDemoBanner />}
      <DutyRosterConsole
        matches={matches}
        courts={courts}
        slots={slots}
        teams={teams}
        savedPlacements={savedPlacements}
        manualDuties={manualDuties}
        isDemo={isDemo}
      />
    </>
  )
}
