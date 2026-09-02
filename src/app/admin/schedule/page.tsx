import type { Metadata } from 'next'

import { requireAdmin } from '@/lib/auth'
import {
  AdminDataErrorBanner,
  AdminDemoBanner,
  AdminEmptyState,
  AdminPageHeader,
} from '@/components/admin/AdminUI'
import { Button } from '@/components/ui'
import { ShuttlecockIcon } from '@/components/icons'
import { ScheduleBuilder } from '@/components/schedule/ScheduleBuilder'
import { getScheduleWorkbenchData } from './data'

/**
 * Signed-in only: never prerender. Without this the auth check runs at build
 * time (when there is no session) and the result is cached and served to
 * everyone. Most pages here are dynamic anyway because they read cookie-bound
 * data, but that is incidental — this states it.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Schedule',
  robots: { index: false, follow: false },
}

/**
 * The schedule builder: every published fixture gets a court and a time slot.
 *
 * Guarded with `requireAdmin()` in its own right rather than leaning on the
 * `/admin` layout — this page can move a match that is already being played.
 * In demo mode `requireAdmin` resolves to the stand-in organiser rather than
 * redirecting, so CI can still render it with sample data.
 */
export default async function AdminSchedulePage() {
  await requireAdmin('/admin/schedule')

  const { matches, courts, slots, teams, savedPlacements, isDemo, error } =
    await getScheduleWorkbenchData()

  return (
    <>
      <AdminPageHeader
        eyebrow="Ho ho ho, here's the running order"
        title="Schedule"
        description="Lay the rounds out across the courts, watch the clash rail, then publish. Late arrival is a forfeit, so the running order has to be honest."
        actions={
          <Button href="/admin/duty-roster" variant="secondary" size="sm">
            <ShuttlecockIcon size={16} aria-hidden="true" />
            Duty roster
          </Button>
        }
      />
      {isDemo && <AdminDemoBanner />}
      {error && <AdminDataErrorBanner message={error} />}
      {matches.length === 0 ? (
        <AdminEmptyState
          title="No fixtures to lay out yet"
          description="The grid fills up the moment a draw is published. Generate the round robin first, then come back and give every match a court and a time."
          href="/admin/draw"
          linkLabel="Publish a draw"
        />
      ) : (
      <ScheduleBuilder
        matches={matches}
        courts={courts}
        slots={slots}
        teams={teams}
        savedPlacements={savedPlacements}
        isDemo={isDemo}
      />
      )}
    </>
  )
}
