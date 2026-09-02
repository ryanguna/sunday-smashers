import type { Metadata } from 'next'

import { requireAdmin } from '@/lib/auth'
import {
  AdminDataErrorBanner,
  AdminDemoBanner,
  AdminEmptyState,
  AdminPageHeader,
} from '@/components/admin/AdminUI'
import { Button } from '@/components/ui'
import { RacketIcon } from '@/components/icons'
import { DutyRosterConsole } from '@/components/schedule/DutyRosterConsole'
import { getScheduleWorkbenchData } from '../schedule/data'

/**
 * Signed-in only: never prerender. Without this the auth check runs at build
 * time (when there is no session) and the result is cached and served to
 * everyone. Most pages here are dynamic anyway because they read cookie-bound
 * data, but that is incidental — this states it.
 */
export const dynamic = 'force-dynamic'

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
  await requireAdmin('/admin/duty-roster')

  const { matches, courts, slots, teams, savedPlacements, manualDuties, isDemo, error } =
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
      {error && <AdminDataErrorBanner message={error} />}
      {matches.length === 0 ? (
        <AdminEmptyState
          title="No matches to staff yet"
          description="Duty seats are worked out from the running order, so publish the draw and put the fixtures on courts first. The roster then fills itself in."
          href="/admin/schedule"
          linkLabel="Build the schedule"
        />
      ) : (
      <DutyRosterConsole
        matches={matches}
        courts={courts}
        slots={slots}
        teams={teams}
        savedPlacements={savedPlacements}
        manualDuties={manualDuties}
        isDemo={isDemo}
      />
      )}
    </>
  )
}
