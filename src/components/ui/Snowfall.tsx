import { SnowflakeIcon, ShuttlecockIcon } from '@/components/icons'

/**
 * Ambient decorative background layer: soft falling snowflakes plus a few
 * drifting shuttlecocks. Deterministic pseudo-random placement (no
 * Math.random at render time) keeps server/client markup identical and
 * avoids hydration mismatches. Pure CSS animations — no JS rAF loop.
 * Fully inert to pointer/assistive tech and disabled under reduced motion.
 */

const SNOWFLAKE_COUNT = 18
const SHUTTLECOCK_COUNT = 4

function seededValue(index: number, salt: number) {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

const snowflakes = Array.from({ length: SNOWFLAKE_COUNT }, (_, i) => ({
  left: `${(seededValue(i, 1) * 100).toFixed(2)}%`,
  size: 10 + Math.round(seededValue(i, 2) * 14),
  duration: 12 + seededValue(i, 3) * 14,
  delay: -(seededValue(i, 4) * 20),
  opacity: 0.25 + seededValue(i, 5) * 0.45,
}))

const shuttlecocks = Array.from({ length: SHUTTLECOCK_COUNT }, (_, i) => ({
  left: `${(8 + seededValue(i, 6) * 84).toFixed(2)}%`,
  size: 22 + Math.round(seededValue(i, 7) * 10),
  duration: 22 + seededValue(i, 8) * 16,
  delay: -(seededValue(i, 9) * 24),
  opacity: 0.2 + seededValue(i, 10) * 0.25,
}))

export function Snowfall({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 z-0 overflow-hidden ${className ?? ''}`}
    >
      {snowflakes.map((flake, i) => (
        <SnowflakeIcon
          key={`snow-${i}`}
          size={flake.size}
          className="absolute top-0 text-white animate-snowfall"
          style={{
            left: flake.left,
            opacity: flake.opacity,
            animationDuration: `${flake.duration}s`,
            animationDelay: `${flake.delay}s`,
          }}
        />
      ))}
      {shuttlecocks.map((bird, i) => (
        <ShuttlecockIcon
          key={`bird-${i}`}
          size={bird.size}
          className="absolute top-0 text-[var(--color-brand-pink)] animate-snowfall"
          style={{
            left: bird.left,
            opacity: bird.opacity,
            animationDuration: `${bird.duration}s`,
            animationDelay: `${bird.delay}s`,
          }}
        />
      ))}
    </div>
  )
}
