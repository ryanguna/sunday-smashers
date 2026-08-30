import { Card, CardBody } from '@/components/ui'
import { cn } from '@/lib/cn'
import type { PlayerProfile } from '@/lib/player-profile'

export interface ProfileRecordProps {
  profile: PlayerProfile
  className?: string
}

interface FigureProps {
  label: string
  value: string
  tone?: 'good' | 'bad' | 'neutral'
  className?: string
}

function Figure({ label, value, tone = 'neutral', className }: FigureProps) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-lg)] bg-white/90 px-3 py-3 text-center shadow-[var(--shadow-soft)]',
        className,
      )}
    >
      <p className="text-[0.65rem] font-extrabold tracking-widest text-[var(--color-ink-muted)] uppercase">
        {label}
      </p>
      <p
        className={cn(
          'font-[family-name:var(--font-heading)] text-3xl font-extrabold tabular-nums',
          tone === 'good' && 'text-[var(--color-success)]',
          tone === 'bad' && 'text-[var(--color-danger)]',
          tone === 'neutral' && 'text-[var(--color-plum)]',
        )}
      >
        {value}
      </p>
    </div>
  )
}

/** The hard numbers: W–L, points for/against and point difference. */
export function ProfileRecord({ profile, className }: ProfileRecordProps) {
  const { record, standing } = profile
  const diff = record.pointDiff > 0 ? `+${record.pointDiff}` : `${record.pointDiff}`

  return (
    <Card variant="frosted" className={cn(className)}>
      <CardBody className="flex flex-col gap-3 p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-lg font-extrabold" style={{ color: 'var(--color-plum)' }}>
            Round robin record
          </h2>
          <span className="text-xs font-extrabold tracking-wide text-[var(--color-ink-muted)] uppercase">
            {record.played} game{record.played === 1 ? '' : 's'} played
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          <Figure label="Won" value={String(record.wins)} tone="good" />
          <Figure label="Lost" value={String(record.losses)} tone="bad" />
          <Figure label="Points for" value={String(record.pointsFor)} />
          <Figure label="Points against" value={String(record.pointsAgainst)} />
          <Figure
            label="Difference"
            value={diff}
            tone={record.pointDiff > 0 ? 'good' : record.pointDiff < 0 ? 'bad' : 'neutral'}
            className="col-span-2 lg:col-span-1"
          />
        </div>

        <p
          className={cn(
            'rounded-[var(--radius-lg)] px-4 py-2.5 text-sm font-semibold',
            standing.rank == null
              ? 'bg-white/80 text-[var(--color-ink-soft)]'
              : standing.inTopFour
                ? 'bg-[var(--color-success-bg)] text-[var(--color-success)]'
                : 'bg-[var(--color-warn-bg)] text-[var(--color-warn)]',
          )}
        >
          {standing.rank == null
            ? 'No round-robin games on the board yet — this table fills up the moment the first shuttle drops. 🎄'
            : standing.inTopFour
              ? `Sitting ${ordinal(standing.rank)} of ${standing.totalPairs} pairs — inside the top four and into the semi-finals. 🎁`
              : `Sitting ${ordinal(standing.rank)} of ${standing.totalPairs} pairs. The top four go through to the semis.`}
        </p>
      </CardBody>
    </Card>
  )
}

function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}
