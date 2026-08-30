import type { ElementType, HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export interface GradientTextProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType
  /** Adds a slow shimmer sweep across the gradient. */
  shimmer?: boolean
}

/**
 * The poster's rainbow gradient headline treatment (candy pink → lilac → sky).
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
        'bg-[image:var(--gradient-candy)] bg-clip-text text-transparent font-[family-name:var(--font-heading)] font-extrabold',
        shimmer && 'animate-shimmer',
        className
      )}
      {...rest}
    />
  )
}
