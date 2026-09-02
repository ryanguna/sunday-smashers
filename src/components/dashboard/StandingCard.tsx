import Link from 'next/link'
import { Card, CardBody } from '@/components/ui'
import { MedalIcon, TrophyIcon } from '@/components/icons'
import { cn } from '@/lib/cn'
import { TOP_FOUR_CUT, type CutView, type PlayerRecord, type Podium } from '@/lib/dashboard'

export interface StandingCardProps {
  record: PlayerRecord
  cut: CutView | null
  podium: Podium
  className?: string
}

const PODIUM_COPY: Record<Exclude<Podium, null>, string> = {
  champion: 'Champions! 🏆 Merry Christmas indeed.',
  runner_up: 'Runners-up — a silver-medal Christmas. 🥈',
  third: 'Third place — you won the Battle for 3rd! 🥉',
  fourth: 'Fourth place — a semi-finalist finish to be proud of.',
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-[var(--radius-lg)] bg-white/85 px-3 py-2 text-center">
      <p className="text-[0.65rem] font-extrabold tracking-widest text-[var(--color-ink-muted)] uppercase">
        {label}
      </p>
      <p
        className={cn(
          'font-[family-name:var(--font-heading)] text-2xl font-extrabold tabular-nums',
          tone === 'good' && 'text-[var(--color-success)]',
          tone === 'bad' && 'text-[var(--color-danger)]',
          !tone && 'text-[var(--color-plum)]',
        )}
      >
        {value}
      </p>
    </div>
  )
}

/** W–L, point difference, current rank and the distance to the top-4 cut. */
export function StandingCard({ record, cut, podium, className }: StandingCardProps) {
  const diff = record.pointDiff > 0 ? `+${record.pointDiff}` : `${record.pointDiff}`

  return (
    <Card
      variant="frosted"
      className={cn('h-full border-2', cut?.inCut ? 'border-[var(--color-brand-mint-dark)]' : 'border-transparent', className)}
    >
      <CardBody className="flex h-full flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[image:var(--gradient-gold)] text-white">
            <MedalIcon size={16} />
          </span>
          <h3 className="text-base font-extrabold" style={{ color: 'var(--color-plum)' }}>
            Your round robin
          </h3>
          {cut && (
            <span
              className={cn(
                'ml-auto rounded-[var(--radius-pill)] px-3 py-1 text-xs font-extrabold uppercase',
                cut.inCut
                  ? 'bg-[var(--color-success-bg)] text-[var(--color-success)]'
                  : 'bg-[var(--color-warn-bg)] text-[var(--color-warn)]',
              )}
            >
              Rank {cut.rank} of the division
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat label="Wins" value={String(record.wins)} tone="good" />
          <Stat label="Losses" value={String(record.losses)} tone="bad" />
          <Stat label="Point diff" value={diff} />
        </div>

        {podium ? (
          <p className="flex items-center gap-2 rounded-[var(--radius-lg)] bg-[image:var(--gradient-gold)] px-3 py-2 text-sm font-extrabold text-white">
            <TrophyIcon size={18} aria-hidden="true" />
            {PODIUM_COPY[podium]}
          </p>
        ) : cut ? (
          <p
            className={cn(
              'rounded-[var(--radius-lg)] px-3 py-2 text-sm font-semibold',
              cut.inCut
                ? 'bg-[var(--color-success-bg)] text-[var(--color-success)]'
                : 'bg-[var(--color-warn-bg)] text-[var(--color-warn)]',
            )}
          >
            {cut.message}
          </p>
        ) : (
          <p className="rounded-[var(--radius-lg)] bg-white/80 px-3 py-2 text-sm text-[var(--color-ink-soft)]">
            Play your first round-robin game and your record will appear here.
          </p>
        )}

        <p className="text-xs font-semibold text-[var(--color-ink-muted)]">
          Top {TOP_FOUR_CUT} pairs go through to the semis. Ranking is by wins, ties broken head-to-head.
        </p>

        <Link
          href="/standings"
          className="mt-auto text-sm font-extrabold text-[var(--color-brand-lilac-dark)] inline-flex min-h-[24px] items-center underline-offset-4 hover:underline"
        >
          See the full standings →
        </Link>
      </CardBody>
    </Card>
  )
}
