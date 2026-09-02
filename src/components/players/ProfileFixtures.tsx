import { Card, CardBody, EmptyState } from '@/components/ui'
import { ShuttlecockIcon } from '@/components/icons'
import { MatchCard } from '@/components/results'
import { cn } from '@/lib/cn'
import { stageLabel, type PlayerFixture } from '@/lib/dashboard'

export interface ProfileFixturesProps {
  fixtures: readonly PlayerFixture[]
  /** Whose fixtures these are — used in the festive empty state copy. */
  pairName: string
  className?: string
}

const OUTCOME_LABEL: Record<PlayerFixture['outcome'], string> = {
  upcoming: 'To play',
  live: 'Playing now',
  win: 'Won',
  loss: 'Lost',
  forfeit_win: 'Won by forfeit',
  forfeit_loss: 'Forfeited',
}

const OUTCOME_CLASS: Record<PlayerFixture['outcome'], string> = {
  upcoming: 'bg-[var(--color-info-bg)] text-[var(--color-info)]',
  live: 'bg-[var(--color-brand-pink-light)] text-[var(--color-brand-pink-dark)]',
  win: 'bg-[var(--color-success-bg)] text-[var(--color-success)]',
  loss: 'bg-[var(--color-frost-200)] text-[var(--color-ink-muted)]',
  forfeit_win: 'bg-[var(--color-success-bg)] text-[var(--color-success)]',
  forfeit_loss: 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]',
}

/** Every match this pair plays, in playing order, with the result. */
export function ProfileFixtures({ fixtures, pairName, className }: ProfileFixturesProps) {
  const wins = fixtures.filter((f) => f.outcome === 'win' || f.outcome === 'forfeit_win').length

  return (
    <Card variant="frosted" className={cn(className)}>
      <CardBody className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[image:var(--gradient-candy)] text-[var(--color-plum)]"
          >
            <ShuttlecockIcon size={16} />
          </span>
          <h2 className="text-lg font-extrabold" style={{ color: 'var(--color-plum)' }}>
            Every match
          </h2>
          <span className="ml-auto text-xs font-extrabold tracking-wide text-[var(--color-ink-muted)] uppercase">
            {fixtures.length} fixture{fixtures.length === 1 ? '' : 's'} · {wins} won
          </span>
        </div>

        {fixtures.length === 0 ? (
          <EmptyState
            className="mt-4"
            title="No fixtures yet — the shuttles are still warming up 🎄"
            description={`${pairName} will appear here the moment the committee publishes the draw.`}
          />
        ) : (
          <ol className="mt-4 grid gap-3 lg:grid-cols-2">
            {fixtures.map((fixture) => (
              <li key={fixture.match.id}>
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'rounded-[var(--radius-pill)] px-2.5 py-0.5 text-[0.7rem] font-extrabold uppercase',
                      OUTCOME_CLASS[fixture.outcome],
                    )}
                  >
                    {OUTCOME_LABEL[fixture.outcome]}
                  </span>
                  <span className="text-xs font-semibold text-[var(--color-ink-muted)]">
                    {stageLabel(fixture.match.stage)} · v {fixture.opponentName}
                  </span>
                  {(fixture.outcome === 'win' || fixture.outcome === 'loss') && (
                    <span className="text-xs font-extrabold text-[var(--color-plum)] tabular-nums">
                      {fixture.yourScore}–{fixture.theirScore}
                    </span>
                  )}
                </div>
                <MatchCard match={fixture.match} showDetails={false} />
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  )
}
