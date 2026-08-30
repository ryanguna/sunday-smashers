import type { Metadata } from 'next'
import { SectionHeading, Snowfall } from '@/components/ui'
import { getDivisions, getLiveMatches } from '@/lib/public-data'
import { LiveScores } from './LiveScores'

export const metadata: Metadata = {
  title: 'Live Scores',
  description: 'Live scores from the courts at the Sunday Smashers Christmas Mini Tournament.',
}

export const dynamic = 'force-dynamic'

export default async function LivePage() {
  const [matches, divisions] = await Promise.all([getLiveMatches(), getDivisions()])
  const divisionNames = Object.fromEntries(divisions.map((d) => [d.slug, d.name]))

  return (
    <main className="relative overflow-hidden pb-20">
      <Snowfall />

      <section className="relative z-10 mx-auto max-w-5xl px-4 pt-14 pb-8 sm:px-6">
        <SectionHeading
          eyebrow="Live"
          title="Live Scores"
          description="In-progress matches update automatically — no need to refresh."
        />
      </section>

      <section aria-label="Live matches" className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6">
        <LiveScores initial={matches} divisionNames={divisionNames} />
      </section>
    </main>
  )
}
