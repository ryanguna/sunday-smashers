'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

export interface ScoreDigitsProps {
  value: number
  className?: string
  /** Accessible label for screen readers, e.g. "Tinsel Smashers score". */
  label: string
}

/**
 * A single huge score digit block that pops when its value changes — the
 * satisfying "point just landed" feedback for a courtside monitor. Disabled
 * under `prefers-reduced-motion` (just swaps the number, no animation).
 */
export function ScoreDigits({ value, className, label }: ScoreDigitsProps) {
  const [pop, setPop] = useState(false)
  const prevValue = useRef(value)

  useEffect(() => {
    if (prevValue.current === value) return
    prevValue.current = value
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return
    // Intentional: this effect exists specifically to fire the pop animation
    // in response to a score change (an external event), not to derive state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPop(true)
    const timeout = setTimeout(() => setPop(false), 420)
    return () => clearTimeout(timeout)
  }, [value])

  return (
    <span
      role="status"
      aria-label={`${label}: ${value}`}
      className={cn(
        'font-[family-name:var(--font-heading)] font-black tabular-nums leading-none transition-transform duration-300',
        pop && 'scale-110 text-[var(--color-brand-gold)]',
        className,
      )}
    >
      {value}
    </span>
  )
}
