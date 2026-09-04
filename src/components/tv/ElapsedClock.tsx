'use client'

import { useEffect, useState } from 'react'

export function format(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}

export interface ElapsedClockProps {
  /** Changes whenever the match being timed changes, to reset the clock. */
  matchKey: string
  /**
   * ISO timestamp of the first rally, when known. Without it the clock counts
   * from mount, which on an unattended monitor means every reconnect, poll
   * remount or browser refresh silently restarts the match at 0:00 — a clock
   * that lies is worse than no clock.
   */
  startedAt?: string | null
  className?: string
}

/**
 * Elapsed-time display for the current match.
 *
 * Counts from `startedAt` when the first rally's timestamp is known, so the
 * figure survives a reconnect or a refresh, and falls back to counting from
 * mount when it is not. Either way the first paint is 0:00 and the real value
 * arrives in an effect, so nothing time-based is hydrated from the server —
 * `Date.now()` during SSR is the classic hydration mismatch.
 */
export function ElapsedClock({ matchKey, startedAt, className }: ElapsedClockProps) {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const started = startedAt ? Date.parse(startedAt) : NaN
    const elapsed = () =>
      Number.isNaN(started) ? 0 : Math.max(0, Math.floor((Date.now() - started) / 1000))

    if (Number.isNaN(started)) {
      // Intentional: resets the on-screen clock when the live match changes;
      // client-only effect, never runs during SSR.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSeconds(0)
      const interval = setInterval(() => setSeconds((s) => s + 1), 1000)
      return () => clearInterval(interval)
    }

    setSeconds(elapsed())
    const interval = setInterval(() => setSeconds(elapsed()), 1000)
    return () => clearInterval(interval)
  }, [matchKey, startedAt])

  return (
    <span className={className} suppressHydrationWarning>
      {format(seconds)}
    </span>
  )
}
