import type { Metadata } from 'next'

import { EmptyState, SectionHeading, Snowfall } from '@/components/ui'
import { ShuttlecockIcon } from '@/components/icons'
import { DemoNotice } from '@/components/players/DemoNotice'
import { ScoringMatchList } from '@/components/scoring'
import { requireApprovedPlayer } from '@/lib/registration-gate-server'
import { isSupabaseConfigured } from '@/lib/supabase/config'

import { loadScoringList } from './data'

export const metadata: Metadata = {
  title: 'Scoring',
  description: 'Score the matches you are on duty for.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/**
 * The umpire's home screen: every match this person is rostered to officiate.
 *
 * Guarded, but `requireAuth` resolves to a stand-in organiser in demo mode,
 * so this page renders the sample duty roster instead of bouncing to a login
 * page that cannot work without Supabase.
 */
export default async function ScoringPage() {
  await requireApprovedPlayer('/scoring')

  const { demo, player, groups } = await loadScoringList()
  const total = groups.live.length + groups.upcoming.length + groups.done.length

  return (
    <main className="relative mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Snowfall />

      <header className="mb-6 flex flex-col gap-2">
        <h1
          className="font-[family-name:var(--font-script)] text-4xl"
          style={{ color: 'var(--color-plum)' }}
        >
          Scoring
        </h1>
        <p className="text-lg text-[var(--color-ink-soft)]">
          {player.name ? `${player.name}, here` : 'Here'} are the matches you are on duty for. Tap
          one when you get to the court.
        </p>
        {demo || !isSupabaseConfigured() ? <DemoNotice className="self-start" /> : null}
      </header>

      {total === 0 ? (
        <EmptyState
          icon={<ShuttlecockIcon size={30} />}
          title="No duties on your sheet yet"
          description="Once the organisers publish the duty roster your umpiring and scoresheet slots will appear here, ready to score."
        />
      ) : (
        <div className="flex flex-col gap-8">
          {groups.live.length > 0 ? (
            <section>
              <SectionHeading title="On court now" />
              <div className="mt-3">
                <ScoringMatchList assignments={groups.live} emphasise />
              </div>
            </section>
          ) : null}

          {groups.upcoming.length > 0 ? (
            <section>
              <SectionHeading title="Still to come" />
              <div className="mt-3">
                <ScoringMatchList assignments={groups.upcoming} />
              </div>
            </section>
          ) : null}

          {groups.done.length > 0 ? (
            <section>
              <SectionHeading title="Done and dusted" />
              <div className="mt-3">
                <ScoringMatchList assignments={groups.done} />
              </div>
            </section>
          ) : null}
        </div>
      )}
    </main>
  )
}
