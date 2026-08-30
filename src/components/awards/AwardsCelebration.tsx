'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Confetti } from '@/components/ui'

export interface AwardsCelebrationProps {
  /** Fire the burst. Pass `false` before the winners are published. */
  active: boolean
  /** How long the burst lasts, in ms. */
  durationMs?: number
  pieces?: number
  children?: ReactNode
}

/**
 * Fires a confetti burst once the podium is on screen, then stops so the
 * page settles down. `Confetti` itself renders nothing under
 * `prefers-reduced-motion`, so there is no motion to opt out of here.
 *
 * Client-only on purpose: `active` starts `false` on the server AND on the
 * first client render, so the markup matches and the burst is started by an
 * effect rather than by a hydration-time difference.
 */
export function AwardsCelebration({
  active,
  durationMs = 7000,
  pieces = 60,
  children,
}: AwardsCelebrationProps) {
  const [burst, setBurst] = useState(false)

  useEffect(() => {
    if (!active) return
    const start = window.setTimeout(() => setBurst(true), 150)
    const stop = window.setTimeout(() => setBurst(false), durationMs)
    return () => {
      window.clearTimeout(start)
      window.clearTimeout(stop)
    }
  }, [active, durationMs])

  return (
    <>
      <Confetti active={burst} count={pieces} />
      {children}
    </>
  )
}
