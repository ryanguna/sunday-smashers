'use client'

import { useEffect, useState } from 'react'

export interface RotatingPanelProps {
  slides: React.ReactNode[]
  /** Milliseconds per slide. Defaults to 12s. */
  intervalMs?: number
  /** Set false (e.g. from a `?rotate=0` debug query param) to freeze rotation. */
  autoRotate?: boolean
  className?: string
}

/**
 * Cycles through side-panel slides (up next, standings, bracket,
 * announcements, sponsor) on a smooth fade. Pausable for debugging via the
 * `autoRotate` prop — wire that to a query param at the call site.
 */
export function RotatingPanel({ slides, intervalMs = 12_000, autoRotate = true, className }: RotatingPanelProps) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (!autoRotate || slides.length <= 1) return
    const interval = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length)
    }, intervalMs)
    return () => clearInterval(interval)
  }, [autoRotate, intervalMs, slides.length])

  // Clamp in case the slide count shrinks between renders.
  const safeIndex = Math.min(index, Math.max(slides.length - 1, 0))

  return (
    <div className={className}>
      <div key={safeIndex} className="animate-fade-in h-full">
        {slides[safeIndex]}
      </div>
      {slides.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5" aria-hidden="true">
          {slides.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-[var(--radius-pill)] transition-all ${
                i === safeIndex ? 'w-5 bg-[var(--color-brand-gold)]' : 'w-1.5 bg-white/25'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
