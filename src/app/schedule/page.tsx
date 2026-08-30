import type { Metadata } from 'next'
import { SectionHeading, Snowfall } from '@/components/ui'
import { getDivisions, getSchedule } from '@/lib/public-data'
import { ScheduleBrowser } from './ScheduleBrowser'

export const metadata: Metadata = {
  title: 'Schedule',
  description:
    'The full match timetable for the Sunday Smashers Christmas Mini Tournament — by court and time slot, with the duty roster for each match.',
}

export const dynamic = 'force-dynamic'

export default async function SchedulePage() {
  const [matches, divisions] = await Promise.all([getSchedule(), getDivisions()])

  return (
    <main className="relative overflow-hidden pb-20">
      <Snowfall />

      <section className="relative z-10 mx-auto max-w-6xl px-4 pt-14 pb-8 sm:px-6">
        <SectionHeading
          eyebrow="Schedule"
          title="Match Timetable"
          level={1}
          description="Grouped by court and time slot. The players of the next match on each court officiate — umpire/scorer, scoresheet, and two line judges. Late arrivals or no-shows forfeit automatically."
        />
      </section>

      <section aria-label="Full match schedule" className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6">
        <ScheduleBrowser matches={matches} divisions={divisions} />
      </section>
    </main>
  )
}
