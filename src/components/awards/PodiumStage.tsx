import { MedalIcon, ShuttlecockIcon, SparkleIcon, TrophyIcon } from '@/components/icons'
import { cn } from '@/lib/cn'
import { podiumLayoutOrder, revealDelay, type PodiumSpot, type PodiumTone } from '@/lib/awards'

/**
 * The podium. Pure CSS reveal (`animate-pop-in`, which `globals.css`
 * disables under `prefers-reduced-motion`), staggered bronze → silver →
 * gold like a real ceremony.
 *
 * HYDRATION: every inline style value is a pre-formatted *string* with its
 * unit (see `revealDelay` and the `.toFixed(0)` heights below). React
 * serialises raw numeric style values at a different precision on the server
 * than in the browser, and a staggered reveal is exactly where that bites.
 */

const toneStyles: Record<PodiumTone, { plinth: string; badge: string; ring: string; label: string }> = {
  gold: {
    plinth: 'bg-[image:var(--gradient-gold)]',
    badge: 'bg-[image:var(--gradient-gold)] text-white',
    ring: 'ring-[var(--color-brand-gold)]',
    label: 'text-[var(--color-brand-gold-dark)]',
  },
  silver: {
    plinth: 'bg-[image:linear-gradient(120deg,var(--color-brand-lilac),var(--color-brand-sky))]',
    badge: 'bg-[var(--color-brand-lilac)] text-white',
    ring: 'ring-[var(--color-brand-lilac)]',
    label: 'text-[var(--color-brand-lilac-dark)]',
  },
  bronze: {
    plinth: 'bg-[image:linear-gradient(120deg,var(--color-brand-mint),var(--color-brand-pink))]',
    badge: 'bg-[var(--color-brand-mint-dark)] text-white',
    ring: 'ring-[var(--color-brand-mint)]',
    label: 'text-[var(--color-brand-mint-dark)]',
  },
}

const PLINTH_MAX_PX = 150

function PodiumCard({ spot, delay, orderClass }: { spot: PodiumSpot; delay: string; orderClass: string }) {
  const tone = toneStyles[spot.tone]
  const isChampion = spot.placing === 1

  return (
    <div
      className={cn('animate-pop-in flex w-full flex-col items-center', orderClass)}
      style={{ animationDelay: delay }}
    >
      <div
        className={cn(
          'relative w-full max-w-[19rem] rounded-[var(--radius-lg)] bg-white/85 px-4 pb-4 pt-8 text-center shadow-[var(--shadow-soft)] ring-2',
          tone.ring,
          isChampion && 'shadow-[var(--shadow-glow-pink)]'
        )}
      >
        <span
          className={cn(
            'absolute -top-6 left-1/2 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full shadow-[var(--shadow-soft)]',
            tone.badge
          )}
          aria-hidden="true"
        >
          {isChampion ? <TrophyIcon size={26} /> : <MedalIcon size={24} />}
        </span>

        {isChampion && (
          <SparkleIcon
            size={18}
            className="animate-twinkle absolute right-3 top-3 text-[var(--color-brand-gold-dark)] [animation-duration:2.6s]"
            aria-hidden="true"
          />
        )}

        <p
          className={cn(
            'text-[0.7rem] font-bold uppercase tracking-[0.16em]',
            tone.label
          )}
        >
          {spot.label}
        </p>
        <p
          className="mt-1 font-[family-name:var(--font-heading)] text-xl font-extrabold leading-tight sm:text-2xl"
          style={{ color: 'var(--color-plum)' }}
        >
          {spot.teamName ?? 'To be decided'}
        </p>
        {spot.playerNames.length > 0 && (
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            {spot.playerNames.join(' & ')}
          </p>
        )}
        {spot.citation && (
          <p className="mt-2 rounded-[var(--radius-md)] bg-[var(--color-frost-100)] px-3 py-2 text-sm italic text-[var(--color-ink-soft)]">
            &ldquo;{spot.citation}&rdquo;
          </p>
        )}
      </div>

      {/* The plinth itself — decorative, hidden on small screens. */}
      <div
        className={cn(
          'hidden w-full max-w-[19rem] items-center justify-center rounded-t-[var(--radius-md)] sm:mt-3 sm:flex',
          tone.plinth
        )}
        style={{ height: `${(spot.height * PLINTH_MAX_PX).toFixed(0)}px` }}
        aria-hidden="true"
      >
        <span className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-white/90 drop-shadow">
          {spot.placing}
        </span>
      </div>
    </div>
  )
}

export interface PodiumStageProps {
  spots: readonly PodiumSpot[]
  className?: string
}

export function PodiumStage({ spots, className }: PodiumStageProps) {
  if (spots.length === 0) return null
  // Desktop shows the classic 2-1-3 arrangement; stacked on a phone the
  // champion has to come first, so the visual order is a CSS concern only.
  const laidOut = podiumLayoutOrder(spots)
  const orderClasses = ['sm:order-1', 'sm:order-2', 'sm:order-3']

  return (
    <div className={cn('relative', className)}>
      <div className="grid items-end gap-6 sm:grid-cols-3 sm:gap-4">
        {[...spots]
          .sort((a, b) => a.placing - b.placing)
          .map((spot) => (
            <PodiumCard
              key={spot.placing}
              spot={spot}
              delay={revealDelay(spot.revealIndex)}
              orderClass={
                orderClasses[laidOut.findIndex((entry) => entry.placing === spot.placing)] ?? ''
              }
            />
          ))}
      </div>
      <div
        className="mt-0 hidden h-2 rounded-b-[var(--radius-md)] bg-[image:var(--gradient-festive-border)] sm:block"
        aria-hidden="true"
      />
      <p className="mt-3 flex items-center justify-center gap-2 text-sm text-[var(--color-ink-muted)]">
        <ShuttlecockIcon size={16} aria-hidden="true" />
        Crowned at the Sunday Smashers Christmas Mini Tournament
      </p>
    </div>
  )
}
