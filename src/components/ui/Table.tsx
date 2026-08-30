import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/**
 * Responsive table primitives for standings / schedules.
 * On small screens each row becomes a stacked card; column headers are
 * repeated per-cell via `data-label` so nothing is lost visually or for
 * assistive tech (the real <th> scope is preserved for screen readers).
 */

export function Table({ className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-[var(--radius-lg)] bg-white shadow-[var(--shadow-soft)]">
      <table className={cn('ss-table w-full border-collapse text-left', className)} {...rest} />
    </div>
  )
}

export function TableHead({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        'hidden bg-[var(--color-brand-lilac-light)]/50 text-sm uppercase tracking-wide text-[var(--color-ink-muted)] sm:table-header-group',
        className
      )}
      {...rest}
    />
  )
}

export function TableBody({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-black/5', className)} {...rest} />
}

export function TableRow({ className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        'block rounded-[var(--radius-md)] p-3 sm:table-row sm:rounded-none sm:p-0 sm:hover:bg-[var(--color-brand-mint-light)]/30',
        className
      )}
      {...rest}
    />
  )
}

export function TableHeaderCell({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('px-4 py-3 font-semibold', className)} scope="col" {...rest} />
}

export interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  /** Label shown before the value on mobile stacked layout. */
  label?: string
}

export function TableCell({ className, label, children, ...rest }: TableCellProps) {
  return (
    <td
      className={cn(
        'flex items-center justify-between gap-3 px-1 py-1.5 sm:table-cell sm:px-4 sm:py-3',
        className
      )}
      data-label={label}
      {...rest}
    >
      {label && (
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)] sm:hidden">
          {label}
        </span>
      )}
      <span className="text-right sm:text-left">{children}</span>
    </td>
  )
}
