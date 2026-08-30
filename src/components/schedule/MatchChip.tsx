import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui'
import { MedalIcon, RacketIcon, ShuttlecockIcon, TrophyIcon } from '@/components/icons'
import {
  matchLabel,
  sideLabel,
  stageLabel,
  type SchedulableMatch,
} from '@/lib/schedule-admin'

/**
 * The match "chip" reused by the grid, the bench and the duty roster — one
 * place to decide how a fixture reads at a glance.
 */

const stageTone: Record<SchedulableMatch['stage'], string> = {
  elims: 'bg-[var(--color-brand-sky-light)] text-[var(--color-brand-sky-dark)]',
  semi: 'bg-[var(--color-brand-lilac-light)] text-[var(--color-brand-lilac-dark)]',
  third_place: 'bg-[var(--color-brand-mint-light)] text-[var(--color-brand-mint-dark)]',
  final: 'bg-[var(--color-brand-gold-light)] text-[var(--color-brand-gold-dark)]',
}

export function StageIcon({ stage, size = 14 }: { stage: SchedulableMatch['stage']; size?: number }) {
  if (stage === 'final') return <TrophyIcon size={size} aria-hidden="true" />
  if (stage === 'third_place') return <MedalIcon size={size} aria-hidden="true" />
  if (stage === 'semi') return <RacketIcon size={size} aria-hidden="true" />
  return <ShuttlecockIcon size={size} aria-hidden="true" />
}

export function StagePill({ match }: { match: SchedulableMatch }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.08em]',
        stageTone[match.stage],
      )}
    >
      <StageIcon stage={match.stage} size={12} />
      {stageLabel(match)}
    </span>
  )
}

export function MatchStatusBadge({ match }: { match: SchedulableMatch }) {
  if (match.status === 'in_progress') return <Badge status="live">Live</Badge>
  if (match.status === 'forfeited') return <Badge status="forfeit">Forfeit</Badge>
  if (match.status === 'retired') return <Badge status="final">Retired</Badge>
  if (match.status === 'completed' || match.status === 'walkover')
    return <Badge status="final">Played</Badge>
  return null
}

export function MatchSides({
  match,
  teamNames,
  className,
}: {
  match: SchedulableMatch
  teamNames: Record<string, string>
  className?: string
}) {
  return (
    <span className={cn('block min-w-0', className)}>
      <span className="block truncate font-semibold">
        {sideLabel(match.teamAId, match.sourceA, teamNames)}
      </span>
      <span className="block text-[0.68rem] font-bold uppercase tracking-[0.1em] opacity-60">v</span>
      <span className="block truncate font-semibold">
        {sideLabel(match.teamBId, match.sourceB, teamNames)}
      </span>
    </span>
  )
}

export function matchAria(match: SchedulableMatch, teamNames: Record<string, string>): string {
  return `${stageLabel(match)}: ${matchLabel(match, teamNames)}`
}
