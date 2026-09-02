import { Card, CardBody, Countdown, GradientText } from '@/components/ui'
import {
  BaubleIcon,
  GiftIcon,
  MedalIcon,
  ShuttlecockIcon,
  SnowflakeIcon,
  TrophyIcon,
} from '@/components/icons'
import { cn } from '@/lib/cn'
import { revealDelay, type RevealStatus } from '@/lib/awards'

const TEASERS: { icon: React.ReactNode; title: string; blurb: string; tone: string }[] = [
  {
    icon: <TrophyIcon size={24} />,
    title: 'Trophies',
    blurb: 'One champion trophy per division, engraved and waiting.',
    tone: 'bg-[image:var(--gradient-gold)] text-[var(--color-plum)]',
  },
  {
    icon: <MedalIcon size={24} />,
    title: 'Medals',
    blurb: 'Gold, silver and bronze for every pair on the podium.',
    tone: 'bg-[var(--color-brand-lilac)] text-[var(--color-plum)]',
  },
  {
    icon: <GiftIcon size={24} />,
    title: 'Cash prizes',
    blurb: 'Champions, runners-up and the Battle for 3rd all get paid.',
    tone: 'bg-[var(--color-brand-mint-dark)] text-white',
  },
  {
    icon: <BaubleIcon size={24} />,
    title: 'Special gongs',
    blurb: 'MVP, Most Improved, Sportsmanship and Best Christmas Outfit.',
    tone: 'bg-[var(--color-brand-pink)] text-[var(--color-plum)]',
  },
]

export interface AwardsPendingProps {
  status: RevealStatus
  /** ISO timestamp the countdown runs to. Omit to hide the countdown. */
  countdownTarget?: string | null
  className?: string
}

/**
 * The tasteful "nobody has been crowned yet" state for `/awards`. An empty
 * page on a celebration route would be a let-down, so this shows what is on
 * the presentation table instead.
 */
export function AwardsPending({ status, countdownTarget, className }: AwardsPendingProps) {
  return (
    <div className={cn('space-y-8', className)}>
      <Card variant="frosted" className="relative overflow-hidden text-center">
        <SnowflakeIcon
          size={90}
          className="animate-drift pointer-events-none absolute -right-4 -top-6 text-[var(--color-brand-sky-light)] [animation-duration:9s]"
          aria-hidden="true"
        />
        <CardBody className="relative flex flex-col items-center gap-3 py-6">
          <span
            className="animate-bob flex h-16 w-16 items-center justify-center rounded-full bg-[image:var(--gradient-gold)] text-[var(--color-plum)] [animation-duration:4s]"
            aria-hidden="true"
          >
            <TrophyIcon size={32} />
          </span>
          <h3 className="text-2xl font-extrabold sm:text-3xl" style={{ color: 'var(--color-plum)' }}>
            <GradientText>{status.heading}</GradientText>
          </h3>
          <p className="max-w-xl text-[var(--color-ink-soft)]">{status.blurb}</p>
          {countdownTarget && status.state === 'countdown' && (
            <Countdown target={countdownTarget} className="mt-2" />
          )}
          <p className="mt-1 flex items-center gap-2 text-sm text-[var(--color-ink-muted)]">
            <ShuttlecockIcon size={16} aria-hidden="true" />
            Winners appear here the moment the committee publishes them.
          </p>
        </CardBody>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TEASERS.map((teaser, index) => (
          <Card
            key={teaser.title}
            variant="frosted"
            className="animate-pop-in hover-lift h-full text-center"
            style={{ animationDelay: revealDelay(index, 0.1) }}
          >
            <CardBody className="flex flex-col items-center gap-2">
              <span
                className={cn('flex h-12 w-12 items-center justify-center rounded-full', teaser.tone)}
                aria-hidden="true"
              >
                {teaser.icon}
              </span>
              <p
                className="font-[family-name:var(--font-heading)] text-lg font-extrabold"
                style={{ color: 'var(--color-plum)' }}
              >
                {teaser.title}
              </p>
              <p className="text-sm text-[var(--color-ink-soft)]">{teaser.blurb}</p>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  )
}
