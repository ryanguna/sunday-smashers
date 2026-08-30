'use client'

import { useEffect, useState } from 'react'

/**
 * A once-per-second match clock.
 *
 * The first value comes from the server so the server render and the first
 * client render agree exactly — the component itself never calls `Date.now()`
 * during render, which would be impure and trip `react-hooks/purity`. The
 * clock only ticks while the match is actually running, so a finished match
 * freezes at its final time and idle consoles do no work.
 */
export function useMatchClock(serverNow: number, running: boolean): number {
  const [now, setNow] = useState(serverNow)

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [running])

  return now
}
