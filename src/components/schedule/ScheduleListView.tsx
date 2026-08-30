'use client'

import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui'
import type {
  PlacementMap,
  SchedulableMatch,
  ScheduleCourt,
  ScheduleSlot,
} from '@/lib/schedule-admin'
import { MatchStatusBadge, StagePill } from './MatchChip'
import { matchLabel } from '@/lib/schedule-admin'

/**
 * The per-division list. Two plain `<select>`s per match are the guaranteed
 * keyboard-and-screen-reader path to placing a fixture — no pointer, no
 * pick-up mode, no cleverness.
 */

export function ScheduleListView({
  matches,
  placements,
  courts,
  slots,
  teamNames,
  errorMatchIds,
  partials = {},
  onPlace,
}: {
  matches: SchedulableMatch[]
  placements: PlacementMap
  courts: ScheduleCourt[]
  slots: ScheduleSlot[]
  teamNames: Record<string, string>
  errorMatchIds: string[]
  /** Half-made court/slot choices, kept so a select doesn't snap back. */
  partials?: Record<string, { courtId: string | null; slotId: string | null }>
  onPlace: (matchId: string, courtId: string | null, slotId: string | null) => void
}) {
  const errors = new Set(errorMatchIds)

  if (matches.length === 0) {
    return (
      <p className="rounded-[var(--radius-md)] bg-white/70 p-5 text-center text-sm font-semibold text-[var(--color-ink-muted)]">
        No matches in this division yet — publish a draw first. 🎄
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {matches.map((match) => {
        const placement = placements[match.id]
        const partial = partials[match.id]
        const courtValue = placement?.courtId ?? partial?.courtId ?? ''
        const slotValue = placement?.slotId ?? partial?.slotId ?? ''
        const hasError = errors.has(match.id)
        return (
          <li
            key={match.id}
            className={cn(
              'rounded-[var(--radius-md)] bg-white p-3 shadow-[var(--shadow-soft)]',
              hasError && 'ring-2 ring-[var(--color-danger)]',
              !placement && 'border border-dashed border-[var(--color-brand-pink-dark)]',
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <StagePill match={match} />
              {match.round != null && (
                <span className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[var(--color-ink-muted)]">
                  Round {match.round}
                </span>
              )}
              <MatchStatusBadge match={match} />
              {!placement && <Badge status="pending">Unplaced</Badge>}
            </div>

            <p className="mt-1.5 text-sm font-bold text-[var(--color-plum)]">
              {matchLabel(match, teamNames)}
            </p>

            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[0.65rem] font-bold uppercase tracking-[0.1em] text-[var(--color-ink-muted)]">
                  Court
                </span>
                <select
                  value={courtValue}
                  onChange={(event) => onPlace(match.id, event.target.value || null, slotValue || null)}
                  className="w-full rounded-[var(--radius-pill)] border border-[var(--color-brand-lilac-light)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--color-plum)]"
                >
                  <option value="">— none —</option>
                  {courts.map((court) => (
                    <option key={court.id} value={court.id}>
                      {court.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-[0.65rem] font-bold uppercase tracking-[0.1em] text-[var(--color-ink-muted)]">
                  Time slot
                </span>
                <select
                  value={slotValue}
                  onChange={(event) => onPlace(match.id, courtValue || null, event.target.value || null)}
                  className="w-full rounded-[var(--radius-pill)] border border-[var(--color-brand-lilac-light)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--color-plum)]"
                >
                  <option value="">— none —</option>
                  {slots.map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {slot.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
