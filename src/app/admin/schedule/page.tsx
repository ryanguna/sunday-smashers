import type { Metadata } from 'next'

import { requireAdmin } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { AdminDemoBanner, AdminPageHeader } from '@/components/admin/AdminUI'
import { Button } from '@/components/ui'
import { ShuttlecockIcon } from '@/components/icons'
import { ScheduleBuilder } from '@/components/schedule/ScheduleBuilder'
import { getScheduleWorkbenchData } from './data'

export const metadata: Metadata = {
  title: 'Schedule',
  robots: { index: false, follow: false },
}

/**
 * The schedule builder: every published fixture gets a court and a time slot.
 *
 * Guarded with `requireAdmin()` in its own right rather than leaning on the
 * `/admin` layout — this page can move a match that is already being played.
 * Demo mode (no Supabase env vars) skips the redirect exactly as the layout
 * does, so CI can render it with sample data.
 */
export default async function AdminSchedulePage() {
  if (isSupabaseConfigured()) {
    await requireAdmin('/admin/schedule')
  }

  const { matches, courts, slots, teams, savedPlacements, isDemo } =
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
      <ScheduleBuilder
        matches={matches}
        courts={courts}
        slots={slots}
        teams={teams}
        savedPlacements={savedPlacements}
        isDemo={isDemo}
      />
    </>
  )
}
