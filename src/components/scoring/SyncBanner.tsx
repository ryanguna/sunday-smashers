'use client'

import { cn } from '@/lib/cn'
import { Button } from '@/components/ui'
import type { SyncBannerView } from '@/lib/scoring'

const toneClasses: Record<SyncBannerView['tone'], string> = {
  ok: 'bg-[var(--color-success-bg)] text-[var(--color-success)] border-[var(--color-success)]',
  busy: 'bg-[var(--color-info-bg)] text-[var(--color-info)] border-[var(--color-info)]',
  warn: 'bg-[var(--color-warn-bg)] text-[var(--color-warn)] border-[var(--color-warn)]',
  danger: 'bg-[var(--color-danger-bg)] text-[var(--color-danger)] border-[var(--color-danger)]',
  info: 'bg-[var(--color-info-bg)] text-[var(--color-info)] border-[var(--color-info)]',
}

export interface SyncBannerProps {
  view: SyncBannerView
  onRetry: () => void
  retrying?: boolean
}

/**
 * The connection state, stated plainly and never dismissible.
 *
 * A silently failed save is the worst outcome this feature has, so the banner
 * always says how many points are not yet on the scoreboard and always
 * reassures that they are safe on the phone. It is an `aria-live="assertive"`
 * region because losing the score is worth interrupting for.
 */
export function SyncBanner({ view, onRetry, retrying = false }: SyncBannerProps) {
  const urgent = view.tone === 'danger' || view.tone === 'warn'

  return (
    <div
      role="status"
      aria-live={urgent ? 'assertive' : 'polite'}
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border-2 px-4 py-3',
        toneClasses[view.tone],
      )}
    >
      <p className="text-sm font-semibold">
        <span className="font-[family-name:var(--font-heading)] text-base font-extrabold">
          {view.title}
        </span>{' '}
        <span className="font-normal text-[var(--color-ink-soft)]">{view.detail}</span>
      </p>
      {view.retryable ? (
        <Button type="button" size="sm" variant="secondary" onClick={onRetry} loading={retrying}>
          Retry now
        </Button>
      ) : null}
    </div>
  )
}
