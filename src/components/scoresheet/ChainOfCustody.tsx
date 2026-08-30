import type { ChainStep, ChainStepState } from '@/lib/scoresheet'
import { cn } from '@/lib/cn'

export interface ChainOfCustodyProps {
  steps: readonly ChainStep[]
  className?: string
}

const MARKER: Record<ChainStepState, { symbol: string; classes: string; label: string }> = {
  done: {
    symbol: '✓',
    classes: 'bg-[var(--color-brand-mint-dark)] text-white',
    label: 'Done',
  },
  current: {
    symbol: '●',
    classes: 'bg-[var(--color-brand-pink-dark)] text-white',
    label: 'Happening now',
  },
  todo: {
    symbol: '○',
    classes: 'bg-[var(--color-frost-200)] text-[var(--color-ink-muted)]',
    label: 'Still to do',
  },
  blocked: {
    symbol: '!',
    classes: 'bg-[var(--color-danger)] text-white',
    label: 'Blocked',
  },
}

/**
 * The four links in the chain of custody, in order, with the one holding
 * everything up called out.
 *
 * This is the whole point of a signed scoresheet rendered as a picture: at a
 * glance you can see whether a result is somebody's word, both pairs' word, or
 * a checked record — and if it is stuck, which step it is stuck on.
 */
export function ChainOfCustody({ steps, className }: ChainOfCustodyProps) {
  return (
    <ol className={cn('flex flex-col gap-0', className)}>
      {steps.map((step, index) => {
        const marker = MARKER[step.state]
        const last = index === steps.length - 1
        return (
          <li key={step.key} className="flex gap-3">
            <span className="flex flex-col items-center" aria-hidden="true">
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                  marker.classes,
                )}
              >
                {marker.symbol}
              </span>
              {last ? null : (
                <span
                  className={cn(
                    'w-0.5 flex-1',
                    step.state === 'done'
                      ? 'bg-[var(--color-brand-mint-dark)]'
                      : 'bg-[var(--color-frost-200)]',
                  )}
                />
              )}
            </span>
            <span className={cn('min-w-0 pb-4', last && 'pb-0')}>
              <span
                className="block font-[family-name:var(--font-heading)] text-base font-extrabold"
                style={{ color: 'var(--color-plum)' }}
              >
                {step.label}
                <span className="sr-only"> — {marker.label}</span>
              </span>
              <span className="block text-sm text-[var(--color-ink-soft)]">{step.detail}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
