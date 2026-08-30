import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export type CardVariant = 'default' | 'frosted' | 'candy-stripe' | 'outline'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
  /** Adds a subtle hover lift + shadow, useful for clickable/interactive cards. */
  interactive?: boolean
}

const variantClasses: Record<CardVariant, string> = {
  default: 'bg-white shadow-[var(--shadow-soft)]',
  frosted: 'bg-frost-glass shadow-[var(--shadow-soft)] border border-white/60',
  'candy-stripe': 'bg-white border-candy-stripe shadow-[var(--shadow-soft)]',
  outline: 'bg-white/60 border-2 border-[var(--color-brand-lilac-light)]',
}

export function Card({ variant = 'default', interactive = false, className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-lg)] p-5',
        variantClasses[variant],
        interactive && 'hover-lift cursor-pointer',
        className
      )}
      {...rest}
    />
  )
}

export function CardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mb-3 flex items-center justify-between gap-3', className)}
      {...rest}
    />
  )
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('text-[var(--color-ink-soft)]', className)} {...rest} />
}

export function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mt-4 flex items-center gap-2 border-t border-black/5 pt-3', className)}
      {...rest}
    />
  )
}
