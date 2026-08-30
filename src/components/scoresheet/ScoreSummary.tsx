import { Badge } from '@/components/ui'
import { ShuttlecockIcon } from '@/components/icons'
import { rulesSummary, scoreForSide, type MatchScoringConfig, type ScoreboardState } from '@/lib/scoring'
import type { EndingPresentation } from '@/lib/scoresheet'
import { cn } from '@/lib/cn'

export interface ScoreSummaryProps {
  board: ScoreboardState
  config: MatchScoringConfig
  ending: EndingPresentation
  /** Compact, ink-friendly rendering for the printed sheet. */
  print?: boolean
  className?: string
}

const TONE_CLASSES: Record<EndingPresentation['tone'], string> = {
  ok: 'border-[var(--color-brand-mint-dark)] bg-[var(--color-success-bg)]',
  warn: 'border-[var(--color-warn)] bg-[var(--color-warn-bg)]',
  danger: 'border-[var(--color-danger)] bg-[var(--color-danger-bg)]',
}

/**
 * What the signers are actually agreeing to: the final score, the rules the
 * match was played under (read from the match record — never assumed to be 15
 * or 21), and an unambiguous statement of *how* it ended.
 *
 * The three not-played-out endings are spelled out rather than badged, because
 * "forfeit" and "retired" mean different things to the pair being described
 * and the difference has to survive being read quickly on a phone.
 */
export function ScoreSummary({ board, config, ending, print = false, className }: ScoreSummaryProps) {
  const winnerSide = board.winner
  const scores: { side: 'a' | 'b'; name: string; players: string[]; score: number }[] = [
    {
      side: 'a',
      name: config.teamA.name,
      players: config.teamA.players.map((p) => p.name),
      score: scoreForSide(board, 'a'),
    },
    {
      side: 'b',
      name: config.teamB.name,
      players: config.teamB.players.map((p) => p.name),
      score: scoreForSide(board, 'b'),
    },
  ]

  return (
    <section
      className={cn(
        'rounded-[var(--radius-lg)] border-2 border-[var(--color-brand-lilac-light)] bg-white',
        print ? 'p-3' : 'p-4 sm:p-5',
        className,
      )}
      aria-labelledby="sheet-result-heading"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id="sheet-result-heading"
          className={cn(
            'font-[family-name:var(--font-heading)] font-extrabold',
            print ? 'text-lg' : 'text-xl',
          )}
          style={{ color: 'var(--color-plum)' }}
        >
          Final score
        </h2>
        <p className="text-sm font-semibold text-[var(--color-ink-muted)]">
          {rulesSummary(board)} · {board.totalPoints} rallies played
        </p>
      </div>

      <dl className="mt-3 flex flex-col gap-2">
        {scores.map((row) => {
          const won = winnerSide === row.side
          return (
            <div
              key={row.side}
              className={cn(
                'flex items-center justify-between gap-3 rounded-[var(--radius-md)] px-3 py-2',
                won
                  ? 'bg-[var(--color-brand-mint-light)] ring-2 ring-[var(--color-brand-mint-dark)]'
                  : 'bg-[var(--color-frost-100)]',
              )}
            >
              <dt className="min-w-0">
                <span
                  className="flex items-center gap-1.5 font-[family-name:var(--font-heading)] text-base font-extrabold"
                  style={{ color: 'var(--color-plum)' }}
                >
                  {won ? <ShuttlecockIcon size={16} aria-hidden="true" /> : null}
                  <span className="truncate">{row.name}</span>
                </span>
                <span className="block text-sm text-[var(--color-ink-soft)]">
                  {row.players.length > 0 ? row.players.join(' & ') : 'Pair to be confirmed'}
                </span>
              </dt>
              <dd
                className={cn(
                  'shrink-0 font-[family-name:var(--font-heading)] font-extrabold tabular-nums',
                  print ? 'text-3xl' : 'text-4xl',
                )}
                style={{ color: won ? 'var(--color-brand-mint-dark)' : 'var(--color-ink-muted)' }}
              >
                {row.score}
                <span className="sr-only">
                  {' '}
                  points to {row.name}
                  {won ? ' — winners' : ''}
                </span>
              </dd>
            </div>
          )
        })}
      </dl>

      <div className={cn('mt-3 rounded-[var(--radius-md)] border-2 px-3 py-2', TONE_CLASSES[ending.tone])}>
        <p className="flex flex-wrap items-center gap-2">
          <Badge status={ending.kind ? 'forfeit' : 'final'}>{ending.label}</Badge>
          <span
            className="font-[family-name:var(--font-heading)] text-base font-extrabold"
            style={{ color: 'var(--color-plum)' }}
          >
            {ending.headline}
          </span>
        </p>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{ending.scoreNote}</p>
        {ending.reason ? (
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            <span className="font-semibold">Reason recorded:</span> {ending.reason}
          </p>
        ) : null}
      </div>
    </section>
  )
}
