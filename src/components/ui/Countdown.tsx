'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'

export interface CountdownProps {
  /** ISO date string or Date for the target moment. */
  target: string | Date
  className?: string
  /** Called once the countdown reaches zero. */
  onComplete?: () => void
}

interface TimeParts {
  days: number
  hours: number
  minutes: number
  seconds: number
  done: boolean
}

function getTimeParts(target: string | Date): TimeParts {
  const targetMs = new Date(target).getTime()
  const diff = Math.max(0, targetMs - Date.now())
  const done = diff <= 0
  const totalSeconds = Math.floor(diff / 1000)
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    done,
  }
}

const UNITS: Array<{ key: keyof Omit<TimeParts, 'done'>; label: string }> = [
  { key: 'days', label: 'Days' },
  { key: 'hours', label: 'Hours' },
  { key: 'minutes', label: 'Mins' },
  { key: 'seconds', label: 'Secs' },
]

/**
 * Reusable countdown to a target date. Renders a stable "--" placeholder
 * on the server and during the first client render, then swaps in the
 * live value after mount — avoiding any server/client markup mismatch.
 */
export function Countdown({ target, className, onComplete }: CountdownProps) {
  const [mounted, setMounted] = useState(false)
  const [parts, setParts] = useState<TimeParts | null>(null)

  useEffect(() => {
    // Intentional: this effect exists specifically to compute the
    // client-only, time-dependent value after mount (hydration-safe).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
    setParts(getTimeParts(target))
    const interval = setInterval(() => {
      const next = getTimeParts(target)
      setParts(next)
      if (next.done) {
        clearInterval(interval)
        onComplete?.()
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [target, onComplete])

  return (
    <div
      className={cn('grid grid-flow-col gap-3 sm:gap-4', className)}
      role="timer"
      aria-live="polite"
      aria-atomic="true"
      aria-label={mounted && parts ? undefined : 'Countdown loading'}
    >
      {UNITS.map(({ key, label }) => (
        <div
          key={key}
          className="flex min-w-[3.5rem] flex-col items-center rounded-[var(--radius-md)] bg-white px-3 py-2.5 shadow-[var(--shadow-soft)] sm:min-w-[4.5rem] sm:px-4 sm:py-3"
        >
          <span className="font-[family-name:var(--font-heading)] text-2xl font-extrabold text-[var(--color-plum)] tabular-nums sm:text-4xl">
            {mounted && parts ? String(parts[key]).padStart(2, '0') : '--'}
          </span>
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)] sm:text-sm">
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}
