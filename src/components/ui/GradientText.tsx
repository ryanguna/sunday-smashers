import type { ElementType, HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export interface GradientTextProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType
  /** Adds a slow shimmer sweep across the gradient. */
  shimmer?: boolean
}

/**
 * The poster's rainbow gradient headline treatment (candy pink → lilac → sky).
 *
 * Uses `--gradient-candy-text`, not `--gradient-candy`. The pastel sweep is
 * designed to be a *background* with navy type on top; clipped to letterforms
 * on the page wash it lands around 1.8:1. The `-text` variant runs the same
 * hues through the AA-tuned dark ramp, so it still reads as the brand rainbow
 * while staying legible. axe cannot flag the difference — it skips elements
 * with a transparent colour — so this must not be "simplified" back.
 */
export function GradientText({
  as: Component = 'span',
  shimmer = false,
  className,
  ...rest
}: GradientTextProps) {
  return (
    <Component
      className={cn(
        'bg-[image:var(--gradient-candy-text)] bg-clip-text text-transparent font-[family-name:var(--font-heading)] font-extrabold',
        shimmer && 'animate-shimmer',
        className
      )}
      {...rest}
    />
  )
}
