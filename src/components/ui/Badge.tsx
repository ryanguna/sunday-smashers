import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export type BadgeStatus =
  | 'pending'
  | 'approved'
  | 'paid'
  | 'unpaid'
  | 'live'
  | 'final'
  | 'forfeit'
  | 'info'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status?: BadgeStatus
}

const statusClasses: Record<BadgeStatus, string> = {
  pending: 'bg-[var(--color-warn-bg)] text-[var(--color-warn)]',
  approved: 'bg-[var(--color-success-bg)] text-[var(--color-success)]',
  paid: 'bg-[var(--color-success-bg)] text-[var(--color-success)]',
  unpaid: 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]',
  live: 'bg-[var(--color-brand-pink-light)] text-[var(--color-brand-pink-dark)]',
  final: 'bg-[var(--color-brand-lilac-light)] text-[var(--color-brand-lilac-dark)]',
  forfeit: 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]',
  info: 'bg-[var(--color-info-bg)] text-[var(--color-info)]',
}

const statusDot: Record<BadgeStatus, string> = {
  pending: 'bg-[var(--color-warn)]',
  approved: 'bg-[var(--color-success)]',
  paid: 'bg-[var(--color-success)]',
  unpaid: 'bg-[var(--color-danger)]',
  live: 'bg-[var(--color-brand-pink-dark)] animate-pulse',
  final: 'bg-[var(--color-brand-lilac-dark)]',
  forfeit: 'bg-[var(--color-danger)]',
  info: 'bg-[var(--color-info)]',
}

export function Badge({ status = 'info', className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-3 py-1 text-sm font-semibold font-[family-name:var(--font-heading)]',
        statusClasses[status],
        className
      )}
      {...rest}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', statusDot[status])} aria-hidden="true" />
      {children}
    </span>
  )
}
