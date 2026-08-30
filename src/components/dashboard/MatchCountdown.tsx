'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import { formatCountdown } from '@/lib/dashboard'

export interface MatchCountdownProps {
  /** Milliseconds until the match starts, resolved on the server. */
  initialMsUntil: number
  /** Larger treatment for the "your next match" hero. */
  size?: 'sm' | 'lg'
  className?: string
}

/**
 * Ticking "you're on in 22 min" countdown.
 *
 * The server resolves the clock (never `Date.now()` inside a component) and
 * passes the remaining milliseconds in; after mount this ticks down from
 * that value using elapsed time, so the first client render matches the
 * server HTML exactly and there is no hydration mismatch.
 */
export function MatchCountdown({ initialMsUntil, size = 'lg', className }: MatchCountdownProps) {
  const [msUntil, setMsUntil] = useState(initialMsUntil)

  useEffect(() => {
    const mountedAt = performance.now()
    const id = setInterval(() => {
      setMsUntil(initialMsUntil - (performance.now() - mountedAt))
    }, 1000)
    return () => clearInterval(id)
  }, [initialMsUntil])

  const view = formatCountdown(msUntil)

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-[var(--radius-pill)] font-[family-name:var(--font-heading)] font-extrabold tabular-nums',
        size === 'lg' ? 'px-4 py-2 text-xl sm:text-2xl' : 'px-3 py-1 text-sm',
        view.urgent
          ? 'bg-[var(--color-danger)] text-white'
          : 'bg-white/90 text-[var(--color-plum)] shadow-[var(--shadow-soft)]',
        className,
      )}
      aria-live="polite"
    >
      <span aria-hidden="true">{view.urgent ? '⏰' : '⏳'}</span>
      {view.started ? (view.msUntil > -60_000 ? 'On court now' : `Started ${view.text}`) : `In ${view.text}`}
    </span>
  )
}
