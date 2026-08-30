'use client'

import { cn } from '@/lib/cn'
import { BaubleIcon, HollyIcon, SparkleIcon } from '@/components/icons'
import type { AdminConflict, ConflictTone } from '@/lib/schedule-admin'

/**
 * The always-visible conflict rail. Hard conflicts (a pair in two places, a
 * double-booked court, someone playing and officiating at once) are never
 * collapsed away — an admin re-jigging the schedule mid-tournament has to
 * see them without hunting.
 */

const toneClasses: Record<ConflictTone, string> = {
  danger: 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]',
  warn: 'bg-[var(--color-warn-bg)] text-[var(--color-warn)]',
  info: 'bg-[var(--color-info-bg)] text-[var(--color-info)]',
}

const toneIcon: Record<ConflictTone, typeof HollyIcon> = {
  danger: BaubleIcon,
  warn: HollyIcon,
  info: SparkleIcon,
}

/**
 * The engine speaks in ids and slot indexes. Admins do not — swap them for
 * pair names, player names and clock times before anything reaches the page.
 */
function humanise(
  text: string,
  names: Record<string, string>,
  slotLabels: Record<number, string>,
): string {
  let out = text
  for (const id of Object.keys(names).sort((a, b) => b.length - a.length)) {
    out = out.split(id).join(names[id])
  }
  return out.replace(/slot (\d+)/g, (whole, index: string) => slotLabels[Number(index)] ?? whole)
}

export function ConflictRail({
  conflicts,
  emptyMessage = 'Not a single clash. The schedule is as neat as a wrapped present. 🎁',
  onFocusMatch,
  names = {},
  slotLabels = {},
  max = 12,
}: {
  conflicts: AdminConflict[]
  emptyMessage?: string
  onFocusMatch?: (matchId: string) => void
  /** Team and player id → display name, for readable messages. */
  names?: Record<string, string>
  /** Slot index → clock label. */
  slotLabels?: Record<number, string>
  max?: number
}) {
  if (conflicts.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] bg-[var(--color-success-bg)] p-3.5 text-sm font-semibold text-[var(--color-success)]">
        <SparkleIcon size={16} className="mr-1.5 inline align-[-3px]" aria-hidden="true" />
        {emptyMessage}
      </div>
    )
  }

  const shown = conflicts.slice(0, max)

  return (
    <ul className="flex flex-col gap-2" aria-live="polite">
      {shown.map((conflict) => {
        const Icon = toneIcon[conflict.tone]
        return (
          <li
            key={conflict.id}
            className={cn('rounded-[var(--radius-md)] p-3', toneClasses[conflict.tone])}
          >
            <p className="flex items-center gap-1.5 font-[family-name:var(--font-heading)] text-sm font-bold">
              <Icon size={15} aria-hidden="true" className="shrink-0" />
              {conflict.title}
            </p>
            <p className="mt-0.5 text-[0.8rem] opacity-90">
              {humanise(conflict.detail, names, slotLabels)}
            </p>
            {onFocusMatch && conflict.matchIds.length > 0 && (
              <button
                type="button"
                onClick={() => onFocusMatch(conflict.matchIds[0])}
                className="mt-1.5 text-xs font-bold underline underline-offset-2"
              >
                Show me the match →
              </button>
            )}
          </li>
        )
      })}
      {conflicts.length > shown.length && (
        <li className="rounded-[var(--radius-md)] bg-white/70 p-2.5 text-center text-xs font-semibold text-[var(--color-ink-muted)]">
          + {conflicts.length - shown.length} more of the same kind
        </li>
      )}
    </ul>
  )
}
