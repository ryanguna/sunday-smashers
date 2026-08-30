import { cn } from '@/lib/cn'
import type { TvConnectionStatus } from '@/lib/tv/types'

const CONFIG: Record<TvConnectionStatus, { label: string; dot: string }> = {
  demo: { label: 'Demo', dot: 'bg-[var(--color-brand-sky)]' },
  connecting: { label: 'Connecting', dot: 'bg-[var(--color-brand-gold)] animate-pulse' },
  live: { label: 'Live', dot: 'bg-[var(--color-brand-mint)] animate-pulse' },
  reconnecting: { label: 'Reconnecting', dot: 'bg-[var(--color-brand-gold)] animate-pulse' },
  polling: { label: 'Polling', dot: 'bg-[var(--color-brand-lilac)]' },
}

/**
 * A small, unobtrusive connection status indicator for an unattended
 * courtside display — never a modal or anything requiring interaction.
 */
export function ConnectionIndicator({ status }: { status: TvConnectionStatus }) {
  const { label, dot } = CONFIG[status]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-black/25 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-frost/70"
      title={`Data connection: ${label}`}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dot)} aria-hidden="true" />
      {label}
    </span>
  )
}
