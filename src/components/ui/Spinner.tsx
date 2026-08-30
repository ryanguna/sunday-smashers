import { cn } from '@/lib/cn'

export interface SpinnerProps {
  size?: number
  className?: string
  label?: string
}

export function Spinner({ size = 24, className, label = 'Loading' }: SpinnerProps) {
  return (
    <svg
      className={cn('animate-spin text-[var(--color-brand-lilac-dark)]', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label={label}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export interface SkeletonProps {
  className?: string
}

/** Shimmering placeholder block for loading content. */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-shimmer rounded-[var(--radius-md)] bg-[linear-gradient(90deg,var(--color-brand-lilac-light)_25%,var(--color-frost-100)_37%,var(--color-brand-lilac-light)_63%)]',
        className
      )}
    />
  )
}
