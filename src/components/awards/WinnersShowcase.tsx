import Link from 'next/link'
import { Badge, Card, CardBody, GradientText } from '@/components/ui'
import { HollyIcon, ShuttlecockIcon, SparkleIcon, TrophyIcon } from '@/components/icons'
import { cn } from '@/lib/cn'
import {
  divisionAwardState,
  divisionHasContent,
  recipientLabel,
  revealDelay,
  type AwardDefinition,
  type AwardsDivisionView,
} from '@/lib/awards'
import { AwardCard } from './AwardCard'
import { DivisionPending } from './DivisionPending'
import { PodiumStage } from './PodiumStage'

/**
 * THE reusable winners surface.
 *
 * Embed it anywhere winners should appear — the public `/awards` page, the
 * landing page, the courtside TV view. It is a Server Component with no
 * state, no data fetching and no client JS: hand it the already-built
 * `AwardsDivisionView[]` (from `buildDivisionViews()` in `@/lib/awards`)
 * and it renders.
 *
 * Variants:
 *   `full`    — podium + 4th place + every discretionary award (the /awards page)
 *   `compact` — champions only, one line per division (landing page strip)
 *   `tv`      — big type, no chrome, for the courtside screen
 */

export type WinnersShowcaseVariant = 'full' | 'compact' | 'tv'

export interface WinnersShowcaseProps {
  divisions: readonly AwardsDivisionView[]
  variant?: WinnersShowcaseVariant
  definitions?: readonly AwardDefinition[]
  /** Shown when nothing has been published yet. */
  emptyState?: React.ReactNode
  /** Adds a "See all the winners" link (compact/tv only). */
  href?: string
  className?: string
}

export function WinnersShowcase({
  divisions,
  variant = 'full',
  definitions,
  emptyState,
  href = '/awards',
  className,
}: WinnersShowcaseProps) {
  // Every division that exists is rendered. Only a page with nothing
  // anywhere falls back to the empty state: "this division has no awards
  // yet" and "this division does not exist" are different things, and
  // conflating them is what made an unfinished division vanish.
  if (!divisions.some(divisionHasContent)) return <>{emptyState ?? null}</>

  if (variant === 'compact') {
    return (
      <div className={cn('grid gap-3 sm:grid-cols-2', className)}>
        {divisions.map((division, index) => {
          const champion = division.podium.find((spot) => spot.placing === 1)
          return (
            <Card
              key={division.divisionSlug}
              variant="frosted"
              className="animate-pop-in hover-lift"
              style={{ animationDelay: revealDelay(index, 0.12) }}
            >
              <CardBody className="flex items-center gap-3">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[image:var(--gradient-gold)] text-white"
                  aria-hidden="true"
                >
                  <TrophyIcon size={22} />
                </span>
                <div className="min-w-0">
                  <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
                    {division.divisionName} champions
                  </p>
                  <p
                    className="truncate font-[family-name:var(--font-heading)] text-lg font-extrabold"
                    style={{ color: 'var(--color-plum)' }}
                  >
                    {champion?.teamName ?? 'To be crowned'}
                  </p>
                  {champion && champion.playerNames.length > 0 && (
                    <p className="truncate text-sm text-[var(--color-ink-soft)]">
                      {champion.playerNames.join(' & ')}
                    </p>
                  )}
                </div>
              </CardBody>
            </Card>
          )
        })}
        {href && (
          <p className="sm:col-span-2">
            <Link
              href={href}
              className="font-[family-name:var(--font-heading)] font-bold text-[var(--color-brand-pink-dark)] underline underline-offset-4"
            >
              See every winner and gong →
            </Link>
          </p>
        )}
      </div>
    )
  }

  if (variant === 'tv') {
    return (
      <div className={cn('grid gap-6 lg:grid-cols-2', className)}>
        {divisions.map((division) => {
          const champion = division.podium.find((spot) => spot.placing === 1)
          const runnerUp = division.podium.find((spot) => spot.placing === 2)
          const third = division.podium.find((spot) => spot.placing === 3)
          return (
            <div
              key={division.divisionSlug}
              className="rounded-[var(--radius-lg)] bg-white/85 p-6 shadow-[var(--shadow-soft)]"
            >
              <p className="font-[family-name:var(--font-script)] text-2xl text-[var(--color-brand-pink-dark)]">
                {division.divisionName}
              </p>
              <p
                className="mt-1 font-[family-name:var(--font-heading)] text-4xl font-extrabold leading-tight"
                style={{ color: 'var(--color-plum)' }}
              >
                {champion?.teamName ?? 'To be crowned'}
              </p>
              <p className="mt-1 text-lg text-[var(--color-ink-soft)]">
                {champion?.playerNames.join(' & ')}
              </p>
              <dl className="mt-4 space-y-1 text-lg text-[var(--color-ink-soft)]">
                {runnerUp && (
                  <div className="flex justify-between gap-4">
                    <dt>2nd</dt>
                    <dd className="font-bold">{runnerUp.teamName}</dd>
                  </div>
                )}
                {third && (
                  <div className="flex justify-between gap-4">
                    <dt>3rd</dt>
                    <dd className="font-bold">{third.teamName}</dd>
                  </div>
                )}
              </dl>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className={cn('space-y-14', className)}>
      {divisions.map((division) => (
        <section key={division.divisionSlug} aria-labelledby={`winners-${division.divisionSlug}`}>
          <div className="mb-6 flex flex-wrap items-center justify-center gap-2 text-center">
            <HollyIcon size={22} className="text-[var(--color-brand-holly)]" aria-hidden="true" />
            <h3
              id={`winners-${division.divisionSlug}`}
              className="text-2xl font-extrabold sm:text-3xl"
              style={{ color: 'var(--color-plum)' }}
            >
              <GradientText>{division.divisionName}</GradientText>
            </h3>
            <ShuttlecockIcon
              size={22}
              className="text-[var(--color-brand-lilac-dark)]"
              aria-hidden="true"
            />
          </div>

          {divisionAwardState(division) === 'pending' ? (
            <DivisionPending division={division} />
          ) : (
            division.podium.length > 0 && <PodiumStage spots={division.podium} />
          )}

          {division.fourth && (
            <p className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm text-[var(--color-ink-soft)]">
              <Badge status="info">4th place</Badge>
              <span className="font-bold" style={{ color: 'var(--color-plum)' }}>
                {recipientLabel(division.fourth.recipient)}
              </span>
              <span>— a top-four finish and a semi-final to be proud of.</span>
            </p>
          )}

          {division.specials.length > 0 && (
            <div className="mt-8">
              <p className="mb-3 flex items-center justify-center gap-2 text-center font-[family-name:var(--font-script)] text-xl text-[var(--color-brand-pink-dark)]">
                <SparkleIcon size={18} aria-hidden="true" />
                Special gongs
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {division.specials.map((record, index) => (
                  <AwardCard
                    key={`${record.divisionSlug}-${record.key}`}
                    record={record}
                    definitions={definitions}
                    index={index}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
