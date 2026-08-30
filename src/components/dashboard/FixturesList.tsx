import { Card, CardBody, EmptyState } from '@/components/ui'
import Link from 'next/link'
import { ShuttlecockIcon } from '@/components/icons'
import { MatchCard } from '@/components/results/MatchCard'
import { cn } from '@/lib/cn'
import {
  dutyRoleLabel,
  scoringConsoleHref,
  stageLabel,
  type PlayerDuty,
  type PlayerFixture,
} from '@/lib/dashboard'

export interface FixturesListProps {
  fixtures: PlayerFixture[]
  duties: PlayerDuty[]
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

/** Every match this player plays, with the result and their score first. */
export function FixturesList({ fixtures, duties, className }: FixturesListProps) {
  const dutyByMatchId = new Map(duties.map((d) => [d.match.id, d]))
  const remaining = fixtures.filter((f) => f.outcome === 'upcoming' || f.outcome === 'live')
  const played = fixtures.filter((f) => f.outcome !== 'upcoming' && f.outcome !== 'live')

  const renderFixture = (fixture: PlayerFixture) => {
    const duty = dutyByMatchId.get(fixture.match.id)
    return (
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
          {duty && (
            <span className="rounded-[var(--radius-pill)] bg-[var(--color-brand-mint-light)] px-2.5 py-0.5 text-[0.7rem] font-extrabold text-[var(--color-brand-mint-dark)]">
              Duty: {dutyRoleLabel(duty.role)}
            </span>
          )}
        </div>
        <MatchCard match={fixture.match} />
      </li>
    )
  }

  return (
    <Card variant="frosted" className={cn(className)}>
      <CardBody className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[image:var(--gradient-candy)] text-white">
            <ShuttlecockIcon size={16} />
          </span>
          <h2 className="text-lg font-extrabold" style={{ color: 'var(--color-plum)' }}>
            Your fixtures
          </h2>
          <span className="ml-auto text-xs font-extrabold tracking-wide text-[var(--color-ink-muted)] uppercase">
            {fixtures.length} match{fixtures.length === 1 ? '' : 'es'} · {duties.length} dut
            {duties.length === 1 ? 'y' : 'ies'}
          </span>
        </div>

        {fixtures.length === 0 ? (
          <EmptyState
            className="mt-4"
            title="Your fixtures are still in Santa's sack"
            description="Every pair plays every other pair once. As soon as the committee publishes the draw, your whole day appears here — court by court."
          />
        ) : (
          <>
            {remaining.length > 0 && (
              <ul className="mt-4 space-y-3">{remaining.map(renderFixture)}</ul>
            )}
            {played.length > 0 && (
              <details className="group mt-4" open={remaining.length === 0}>
                <summary className="cursor-pointer list-none rounded-[var(--radius-lg)] bg-white/80 px-4 py-2.5 text-sm font-extrabold text-[var(--color-plum)] select-none">
                  <span className="inline-flex w-full items-center justify-between gap-2">
                    <span>
                      Results so far ({played.length}) 🎁
                    </span>
                    <span className="text-xs font-semibold text-[var(--color-ink-muted)] group-open:hidden">
                      Tap to open
                    </span>
                    <span className="hidden text-xs font-semibold text-[var(--color-ink-muted)] group-open:inline">
                      Tap to close
                    </span>
                  </span>
                </summary>
                <ul className="mt-3 space-y-3">{played.map(renderFixture)}</ul>
              </details>
            )}
          </>
        )}
      </CardBody>
    </Card>
  )
}

export interface DutiesListProps {
  duties: PlayerDuty[]
  className?: string
}

/** The player's full officiating roster, so nothing sneaks up on them. */
export function DutiesList({ duties, className }: DutiesListProps) {
  return (
    <Card variant="frosted" className={cn(className)}>
      <CardBody className="p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[image:var(--gradient-mint-sky)] text-white">
            <span aria-hidden="true">🔔</span>
          </span>
          <h2 className="text-lg font-extrabold" style={{ color: 'var(--color-plum)' }}>
            Your duty roster
          </h2>
        </div>

        {duties.length === 0 ? (
          <p className="mt-3 rounded-[var(--radius-lg)] bg-white/80 px-4 py-3 text-sm text-[var(--color-ink-soft)]">
            No officiating duties assigned yet. The pair playing next always officiates the current match, so
            check back once the draw is out. 🎄
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {duties.map((duty, index) => {
              const consoleHref = scoringConsoleHref(duty)
              return (
              <li
                key={`${duty.match.id}-${duty.role}-${index}`}
                className={cn(
                  'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--color-brand-mint-dark)]/40 bg-white/85 px-3 py-2.5',
                  duty.clash && 'border-[var(--color-danger)] bg-[var(--color-danger-bg)]',
                )}
              >
                <span className="font-[family-name:var(--font-heading)] text-sm font-extrabold text-[var(--color-brand-mint-dark)]">
                  {dutyRoleLabel(duty.role)}
                </span>
                <span className="text-sm font-semibold text-[var(--color-plum)]">
                  {duty.match.court ?? 'Court TBC'} · {duty.match.slotLabel ?? 'Time TBC'}
                </span>
                <span className="text-xs text-[var(--color-ink-muted)]">
                  {duty.match.teamA?.name ?? duty.match.sourceA ?? 'TBC'} v{' '}
                  {duty.match.teamB?.name ?? duty.match.sourceB ?? 'TBC'}
                </span>
                {consoleHref && (
                  <Link
                    href={consoleHref}
                    className="ml-auto rounded-[var(--radius-pill)] bg-[var(--color-brand-mint-dark)] px-3 py-1 text-xs font-extrabold text-white hover:opacity-90"
                  >
                    Open the scoring console →
                  </Link>
                )}
                {duty.clash && (
                  <span className="w-full text-xs font-extrabold text-[var(--color-danger)]">
                    Clashes with one of your matches — tell the desk!
                  </span>
                )}
              </li>
              )
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}
