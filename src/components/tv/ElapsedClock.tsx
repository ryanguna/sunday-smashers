'use client'

import { useEffect, useState } from 'react'

function format(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export interface ElapsedClockProps {
  /** Changes whenever the match being timed changes, to reset the clock. */
  matchKey: string
  className?: string
}

/**
 * Elapsed-time display for the current match. Deliberately does not read
 * any server-provided "started at" timestamp for its tick source — it just
 * counts up from first client mount for the current `matchKey`, so there is
 * nothing time-based to hydrate from the server (avoids SSR/CSR mismatches
 * from `Date.now()`).
 */
export function ElapsedClock({ matchKey, className }: ElapsedClockProps) {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    // Intentional: resets the on-screen clock when the live match changes;
    // client-only effect, never runs during SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeconds(0)
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(interval)
  }, [matchKey])

  return (
    <span className={className} suppressHydrationWarning>
      {format(seconds)}
    </span>
  )
}
