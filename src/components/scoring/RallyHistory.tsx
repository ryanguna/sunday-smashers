'use client'

import { Button } from '@/components/ui'
import type { RallyHistoryRow, ScoringSide } from '@/lib/scoring'

export interface RallyHistoryProps {
  rows: readonly RallyHistoryRow[]
  teamAName: string
  teamBName: string
  /** Corrections are locked once the result has been declared. */
  editable: boolean
  onCorrect: (seq: number, side: ScoringSide) => void
  onRemove: (seq: number) => void
}

/**
 * The full rally log, newest first.
 *
 * Undo covers the mis-tap you notice immediately; this covers the one you
 * notice five rallies later. Every rally can be re-awarded to the other pair
 * or deleted outright, and the score after it is shown so the umpire can find
 * the exact point where the sheet and the screen diverged.
 */
export function RallyHistory({
  rows,
  teamAName,
  teamBName,
  editable,
  onCorrect,
  onRemove,
}: RallyHistoryProps) {
  if (rows.length === 0) {
    return (
      <p className="rounded-[var(--radius-md)] bg-[var(--color-frost-100)] px-4 py-6 text-center text-base text-[var(--color-ink-soft)]">
        No rallies recorded on this device yet.
      </p>
    )
  }

  return (
    <ol className="flex flex-col gap-2">
      {rows.map((row) => {
        const other = row.side === 'a' ? 'b' : 'a'
        const otherName = row.side === 'a' ? teamBName : teamAName
        return (
          <li
            key={row.seq}
            className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-brand-lilac-light)] bg-white px-3 py-2"
          >
            <span className="flex items-baseline gap-3">
              <span className="w-8 shrink-0 text-sm font-semibold text-[var(--color-ink-muted)]">
                #{row.seq}
              </span>
              <span className="font-[family-name:var(--font-heading)] text-lg font-bold tabular-nums text-[var(--color-plum)]">
                {row.scoreA}–{row.scoreB}
              </span>
              <span className="text-sm text-[var(--color-ink-soft)]">
                to {row.teamName}
                {row.latest ? ' · latest' : ''}
              </span>
            </span>
            {editable ? (
              <span className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => onCorrect(row.seq, other)}
                >
                  Give to {otherName}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => onRemove(row.seq)}>
                  Delete
                </Button>
              </span>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
