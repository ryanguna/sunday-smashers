import type { RallyHistoryRow } from '@/lib/scoring'
import { rallySourceNote, type RallySource } from '@/lib/scoresheet'
import { cn } from '@/lib/cn'

export interface RallyLogProps {
  /** Newest first, straight from `rallyHistory()`. */
  rows: readonly RallyHistoryRow[]
  source: RallySource
  teamAName: string
  teamBName: string
  /** Print renders every rally; the screen view can be capped. */
  print?: boolean
  className?: string
}

/**
 * The rally-by-rally record.
 *
 * Rendered oldest-first here — the opposite of the scoring console — because a
 * scoresheet is read as a narrative of the game, not as a stack of recent
 * taps, and because that is the order the paper sheet it replaces is filled
 * in. The score after every rally is shown so a pair querying the result can
 * point at the exact rally where they think it went wrong.
 */
export function RallyLog({ rows, source, teamAName, teamBName, print = false, className }: RallyLogProps) {
  const note = rallySourceNote(source)
  const ordered = [...rows].reverse()

  return (
    <section className={cn('flex flex-col gap-3', className)} aria-labelledby="rally-log-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id="rally-log-heading"
          className={cn(
            'font-[family-name:var(--font-heading)] font-extrabold',
            print ? 'text-lg' : 'text-xl',
          )}
          style={{ color: 'var(--color-plum)' }}
        >
          Rally by rally
        </h2>
        <p className="text-sm font-semibold text-[var(--color-ink-muted)]">
          {ordered.length} {ordered.length === 1 ? 'rally' : 'rallies'} · {note.label}
        </p>
      </div>

      <p
        className={cn(
          'rounded-[var(--radius-md)] px-3 py-2 text-sm',
          note.advisory
            ? 'border-2 border-[var(--color-warn)] bg-[var(--color-warn-bg)] text-[var(--color-ink-soft)]'
            : 'bg-[var(--color-frost-100)] text-[var(--color-ink-soft)]',
        )}
      >
        {note.blurb}
      </p>

      {ordered.length === 0 ? null : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">
              Every rally in order, with the score after it and which pair won it.
            </caption>
            <thead>
              <tr className="border-b-2 border-[var(--color-brand-lilac-light)]">
                <th scope="col" className="w-12 py-1.5 pr-2 font-semibold text-[var(--color-ink-muted)]">
                  #
                </th>
                <th scope="col" className="py-1.5 pr-2 font-semibold text-[var(--color-ink-muted)]">
                  Rally to
                </th>
                <th scope="col" className="py-1.5 pr-2 font-semibold text-[var(--color-ink-muted)]">
                  Served by
                </th>
                <th
                  scope="col"
                  className="w-24 py-1.5 text-right font-semibold text-[var(--color-ink-muted)]"
                >
                  Score
                </th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((row) => (
                <tr
                  key={row.seq}
                  className="border-b border-[var(--color-brand-lilac-light)]/60 last:border-b-0"
                >
                  <td className="py-1.5 pr-2 tabular-nums text-[var(--color-ink-muted)]">{row.seq}</td>
                  <td className="py-1.5 pr-2 font-semibold text-[var(--color-ink)]">{row.teamName}</td>
                  <td className="py-1.5 pr-2 text-[var(--color-ink-soft)]">
                    {row.servedBy === 'a' ? teamAName : teamBName}
                  </td>
                  <td className="py-1.5 text-right font-[family-name:var(--font-heading)] font-bold tabular-nums text-[var(--color-plum)]">
                    {row.scoreA}–{row.scoreB}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
