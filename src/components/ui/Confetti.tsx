'use client'

import { useEffect, useState } from 'react'

export interface ConfettiProps {
  /** Whether the burst is currently active/visible. */
  active: boolean
  /** Number of pieces. Defaults to 40. */
  count?: number
  className?: string
}

const COLORS = [
  'var(--color-brand-pink)',
  'var(--color-brand-lilac)',
  'var(--color-brand-mint)',
  'var(--color-brand-sky)',
  'var(--color-brand-gold)',
]

function seededValue(index: number, salt: number) {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

/**
 * Lightweight celebration burst for wins/awards. Pure CSS animation
 * (no JS rAF loop) and fully disabled under prefers-reduced-motion.
 */
export function Confetti({ active, count = 40, className }: ConfettiProps) {
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    // Intentional: syncing initial reduced-motion state from the platform
    // media query API on mount (client-only, hydration-safe).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReducedMotion(query.matches)
    const listener = (event: MediaQueryListEvent) => setReducedMotion(event.matches)
    query.addEventListener('change', listener)
    return () => query.removeEventListener('change', listener)
  }, [])

  if (!active || reducedMotion) return null

  const pieces = Array.from({ length: count }, (_, i) => ({
    left: `${(seededValue(i, 1) * 100).toFixed(2)}%`,
    color: COLORS[i % COLORS.length],
    duration: 1.6 + seededValue(i, 2) * 1.2,
    delay: seededValue(i, 3) * 0.4,
    drift: `${(seededValue(i, 4) * 160 - 80).toFixed(0)}px`,
    rotate: Math.round(seededValue(i, 5) * 360),
    size: 6 + Math.round(seededValue(i, 6) * 6),
  }))

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 z-[90] overflow-hidden ${className ?? ''}`}
    >
      {pieces.map((piece, i) => (
        <span
          key={i}
          className="animate-confetti absolute top-0 rounded-sm"
          style={{
            left: piece.left,
            width: piece.size,
            height: piece.size * 0.4,
            backgroundColor: piece.color,
            animationDuration: `${piece.duration}s`,
            animationDelay: `${piece.delay}s`,
            transform: `rotate(${piece.rotate}deg)`,
            // Consumed by the ss-confetti-fall keyframes for horizontal drift.
            ['--ss-confetti-x' as string]: piece.drift,
          }}
        />
      ))}
    </div>
  )
}
