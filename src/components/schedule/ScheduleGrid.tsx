'use client'

import { cn } from '@/lib/cn'
import { SnowflakeIcon } from '@/components/icons'
import type { ScheduleCourt, SchedulableMatch, TimelineRow } from '@/lib/schedule-admin'
import { MatchSides, StageIcon, matchAria } from './MatchChip'

/**
 * The courts × time slots board.
 *
 * Every cell is a real `<button>`, so the whole grid is keyboard operable
 * with no drag-and-drop required: pick a match up (Enter/Space), then
 * activate the cell you want it in. Occupied cells swap. That is the
 * accessible fallback *and* the primary interaction — on a phone at the
 * side of a court, tap-tap beats drag every time.
 */

export interface ScheduleGridProps {
  rows: TimelineRow[]
  courts: ScheduleCourt[]
  teamNames: Record<string, string>
  selectedMatchId: string | null
  errorMatchIds: string[]
  dimmedMatchIds: string[]
  onCellActivate: (courtId: string, slotId: string, match: SchedulableMatch | null) => void
}

export function ScheduleGrid({
  rows,
  courts,
  teamNames,
  selectedMatchId,
  errorMatchIds,
  dimmedMatchIds,
  onCellActivate,
}: ScheduleGridProps) {
  const errors = new Set(errorMatchIds)
  const dimmed = new Set(dimmedMatchIds)
  const picking = Boolean(selectedMatchId)

  return (
    <div className="min-w-0 overflow-x-auto rounded-[var(--radius-lg)] bg-frost-glass p-2 shadow-[var(--shadow-soft)]">
      <table className="w-full min-w-[46rem] border-separate border-spacing-1">
        <caption className="sr-only">
          Match schedule by court and time slot. Choose a match to pick it up, then choose a cell to
          move it there.
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 w-20 rounded-[var(--radius-md)] bg-[var(--color-frost-100)] px-2 py-2 text-left text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[var(--color-ink-muted)]"
            >
              Time
            </th>
            {courts.map((court) => (
              <th
                key={court.id}
                scope="col"
                className="rounded-[var(--radius-md)] bg-[image:var(--gradient-mint-sky)] px-2 py-2 text-center text-sm font-extrabold text-white font-[family-name:var(--font-heading)]"
              >
                {court.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.slot.id}>
              <th
                scope="row"
                className="sticky left-0 z-10 rounded-[var(--radius-md)] bg-[var(--color-frost-100)] px-2 py-2 text-left align-middle text-xs font-bold text-[var(--color-plum)]"
              >
                <span className="flex items-center gap-1">
                  <SnowflakeIcon
                    size={12}
                    aria-hidden="true"
                    className="shrink-0 text-[var(--color-brand-lilac-dark)]"
                  />
                  {row.slot.label}
                </span>
              </th>
              {row.cells.map((cell) => {
                const match = cell.match
                const isSelected = match != null && match.id === selectedMatchId
                const hasError = (match != null && errors.has(match.id)) || cell.doubleBooked
                const isDimmed = match != null && dimmed.has(match.id)

                return (
                  <td key={cell.courtId} className="p-0 align-top">
                    <button
                      type="button"
                      onClick={() => onCellActivate(cell.courtId, cell.slotId, match)}
                      aria-pressed={isSelected}
                      className={cn(
                        'h-full w-full min-h-[3.6rem] rounded-[var(--radius-md)] px-2 py-1.5 text-left text-[0.72rem] leading-tight transition-colors',
                        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-lilac-dark)]',
                        match
                          ? 'bg-white text-[var(--color-ink)] shadow-[var(--shadow-soft)] hover:bg-[var(--color-brand-lilac-light)]/50'
                          : 'border border-dashed border-[var(--color-brand-lilac-light)] bg-white/40 text-[var(--color-ink-muted)] hover:bg-[var(--color-brand-mint-light)]/50',
                        isSelected &&
                          'bg-[image:var(--gradient-candy)] text-[var(--color-plum)] shadow-[var(--shadow-glow-pink)]',
                        hasError && !isSelected && 'ring-2 ring-[var(--color-danger)]',
                        isDimmed && 'opacity-40',
                        picking && !match && 'border-solid border-[var(--color-brand-mint-dark)]',
                      )}
                      aria-label={
                        match
                          ? `${matchAria(match, teamNames)} on ${cell.courtName} at ${cell.slotLabel}. ${
                              isSelected ? 'Picked up.' : 'Choose to pick up or swap.'
                            }`
                          : `Empty: ${cell.courtName} at ${cell.slotLabel}${
                              picking ? '. Choose to move the picked-up match here.' : ''
                            }`
                      }
                    >
                      {match ? (
                        <span className="flex items-start gap-1">
                          <span className="mt-0.5 shrink-0 opacity-70">
                            <StageIcon stage={match.stage} size={12} />
                          </span>
                          <MatchSides match={match} teamNames={teamNames} className="min-w-0" />
                        </span>
                      ) : (
                        <span className="flex h-full items-center justify-center text-[0.68rem] font-semibold">
                          {picking ? 'Drop here' : '—'}
                        </span>
                      )}
                      {cell.doubleBooked && (
                        <span className="mt-1 block text-[0.65rem] font-bold text-[var(--color-danger)]">
                          Double-booked!
                        </span>
                      )}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
