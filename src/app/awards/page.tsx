import type { Metadata } from 'next'
import Link from 'next/link'
import { Badge, Card, CardBody, GradientText, SectionHeading, Snowfall } from '@/components/ui'
import { GiftIcon, ShuttlecockIcon, SparkleIcon, TrophyIcon } from '@/components/icons'
import { AwardsCelebration, AwardsPending, WinnersShowcase } from '@/components/awards'
import { hasAnyWinners, revealStatus } from '@/lib/awards'
import { TOURNAMENT_DATE, TOURNAMENT_DATE_LABEL } from '@/lib/tournament'
import { getPublicAwards } from './data'

export const metadata: Metadata = {
  title: 'Awards',
  description:
    'Champions, runners-up, medals and the MVP gongs from the Sunday Smashers Christmas Mini Tournament.',
}

// Reads live award rows — never prerender a stale podium.
export const dynamic = 'force-dynamic'

export default async function AwardsPage() {
  const { views, publishedCount, isDemo } = await getPublicAwards()

  // The clock is resolved here, in the server component, and handed to the
  // pure helper — never read inside a rendered component.
  const status = revealStatus({
    now: new Date(),
    tournamentDate: TOURNAMENT_DATE,
    tournamentDateLabel: TOURNAMENT_DATE_LABEL,
    publishedCount,
  })

  const showWinners = hasAnyWinners(views)

  return (
    <main className="relative overflow-hidden pb-24">
      <Snowfall />
      <AwardsCelebration active={status.celebrate} />

      <section className="relative z-10 mx-auto max-w-5xl px-4 pb-8 pt-14 sm:px-6">
        <SectionHeading
          eyebrow="Roll of honour"
          title={<GradientText shimmer>Awards &amp; MVPs</GradientText>}
          description={status.blurb}
        />

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Badge status={showWinners ? 'final' : 'pending'}>
            {showWinners ? 'Winners published' : 'Not yet crowned'}
          </Badge>
          <Badge status="info">
            <TrophyIcon size={14} aria-hidden="true" />
            Trophies &amp; medals
          </Badge>
          <Badge status="info">
            <GiftIcon size={14} aria-hidden="true" />
            Cash prizes
          </Badge>
          {isDemo && <Badge status="pending">Demo data</Badge>}
        </div>
      </section>

      <section
        aria-label={showWinners ? 'Division winners' : 'Awards still to be presented'}
        className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6"
      >
        {showWinners ? (
          <WinnersShowcase divisions={views} variant="full" />
        ) : (
          <AwardsPending status={status} countdownTarget={TOURNAMENT_DATE} />
        )}
      </section>

      <section className="relative z-10 mx-auto mt-14 max-w-3xl px-4 sm:px-6">
        <Card variant="candy-stripe" className="text-center">
          <CardBody className="flex flex-col items-center gap-2">
            <SparkleIcon
              size={26}
              className="animate-twinkle text-[var(--color-brand-gold-dark)] [animation-duration:3s]"
              aria-hidden="true"
            />
            <p
              className="font-[family-name:var(--font-heading)] text-xl font-extrabold"
              style={{ color: 'var(--color-plum)' }}
            >
              How the podium is decided
            </p>
            <p className="max-w-xl text-sm text-[var(--color-ink-soft)]">
              A single round robin (first to 15, no deuce) ranks every pair by wins. The top four go
              to the semis — Rank 1 v Rank 4 and Rank 2 v Rank 3, first to 21. The semi losers play
              the Battle for 3rd; the winners play the Championship.
            </p>
            <p className="mt-1 flex flex-wrap items-center justify-center gap-3 text-sm font-bold">
              <Link
                href="/bracket"
                className="text-[var(--color-brand-pink-dark)] underline underline-offset-4"
              >
                See the bracket
              </Link>
              <span aria-hidden="true" className="text-[var(--color-ink-muted)]">
                ·
              </span>
              <Link
                href="/standings"
                className="text-[var(--color-brand-pink-dark)] underline underline-offset-4"
              >
                Full standings
              </Link>
              <span aria-hidden="true" className="text-[var(--color-ink-muted)]">
                ·
              </span>
              <Link
                href="/rules"
                className="text-[var(--color-brand-pink-dark)] underline underline-offset-4"
              >
                The rules
              </Link>
            </p>
            <p className="mt-2 flex items-center gap-2 text-xs text-[var(--color-ink-muted)]">
              <ShuttlecockIcon size={14} aria-hidden="true" />
              {TOURNAMENT_DATE_LABEL}
            </p>
          </CardBody>
        </Card>
      </section>
    </main>
  )
}
