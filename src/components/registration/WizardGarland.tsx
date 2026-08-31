'use client'

import { BaubleIcon, SparkleIcon } from '@/components/icons'
import { cn } from '@/lib/cn'
import { isStepReachable, type WizardStep } from '@/lib/registration-wizard'

export interface WizardGarlandProps {
  steps: WizardStep[]
  currentIndex: number
  /** Step ids the player has answered — these light up. */
  completedIds: Set<string>
  percent: number
  /** High-water mark of steps the player has actually been shown. */
  furthestIndex: number
  /** Jump to another question. Only offered for steps already visited. */
  onJump: (index: number) => void
}

/**
 * The progress indicator: a string of baubles that light up as the player
 * answers. This is the piece doing the gamifying — a plain "Step 3 of 9" bar
 * tells you how much work is left, whereas watching the garland fill makes
 * finishing feel like the point.
 *
 * Only *answered* steps light up, so the garland reflects real progress rather
 * than how far the player has clicked. Answered steps stay lit when they step
 * backwards to change something.
 *
 * The baubles are decorative; the accessible progress information is carried
 * by the `progressbar` below them and the live region in the wizard itself, so
 * a screen-reader user is never asked to interpret ornaments.
 */
export function WizardGarland({
  steps,
  currentIndex,
  completedIds,
  percent,
  furthestIndex,
  onJump,
}: WizardGarlandProps) {
  return (
    <div className="mb-5">
      <ol className="mb-3 flex items-end justify-between gap-1" role="list">
        {steps.map((step, index) => {
          const done = completedIds.has(step.id)
          const current = index === currentIndex
          // Somewhere they've actually been — not merely somewhere that looks
          // answered, which every profile-prefilled step does from the start.
          const reachable = isStepReachable(index, currentIndex, furthestIndex)
          const Tag = reachable && !current ? 'button' : 'div'

          return (
            <li key={step.id} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <Tag
                {...(Tag === 'button'
                  ? {
                      type: 'button' as const,
                      onClick: () => onJump(index),
                      'aria-label': `${index < currentIndex ? 'Go back to' : 'Go forward to'}: ${step.question}`,
                    }
                  : {})}
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-300',
                  Tag === 'button' && 'cursor-pointer hover:scale-110',
                  current
                    ? 'scale-110 bg-[image:var(--gradient-gold)] text-[var(--color-plum)] shadow-[var(--shadow-glow-gold)] ring-2 ring-[var(--color-brand-gold)]'
                    : done
                      ? 'bg-[image:var(--gradient-mint-sky)] text-white shadow-[var(--shadow-glow-mint)]'
                      : 'bg-[var(--color-brand-lilac-light)] text-[var(--color-brand-lilac-dark)]'
                )}
              >
                {done && !current ? (
                  <SparkleIcon size={17} aria-hidden="true" />
                ) : (
                  <BaubleIcon size={17} aria-hidden="true" />
                )}
              </Tag>
              <span
                className={cn(
                  'hidden w-full truncate text-center text-[11px] font-semibold sm:block',
                  current
                    ? 'text-[var(--color-plum)]'
                    : done
                      ? 'text-[var(--color-brand-mint-dark)]'
                      : 'text-[var(--color-ink-soft)]/60'
                )}
              >
                {step.badge}
              </span>
            </li>
          )
        })}
      </ol>

      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Registration progress"
        className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-brand-lilac-light)]"
      >
        <div
          className="h-full rounded-full bg-[image:var(--gradient-mint-sky)] transition-[width] duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
