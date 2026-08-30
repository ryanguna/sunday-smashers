'use client'

import { useEffect, useState } from 'react'
import { Confetti } from '@/components/ui'

export interface CelebrationProps {
  /** Fire the burst once on mount. */
  active: boolean
  /** How long the confetti keeps falling, in ms. */
  durationMs?: number
}

/**
 * A one-shot confetti burst for a win or a podium finish. Mounted client
 * side only and automatically disabled under `prefers-reduced-motion` by
 * the shared `Confetti` component.
 */
export function Celebration({ active, durationMs = 6000 }: CelebrationProps) {
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!active) return
    // Intentional: the burst is a client-only, post-mount visual effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRunning(true)
    const timer = setTimeout(() => setRunning(false), durationMs)
    return () => clearTimeout(timer)
  }, [active, durationMs])

  return <Confetti active={running} count={56} />
}
