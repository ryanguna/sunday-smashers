import { Badge } from '@/components/ui'
import { statusLabel, statusToBadgeStatus, teamDisplayName, type PublicMatch } from '@/lib/public-data'
import { cn } from '@/lib/cn'

const STAGE_LABEL: Record<PublicMatch['stage'], string> = {
  elims: 'Round Robin',
  semi: 'Semi-Final',
  third_place: 'Battle for 3rd',
  final: 'Championship',
}

export function stageLabel(stage: PublicMatch['stage']): string {
  return STAGE_LABEL[stage]
}

interface TeamRowProps {
  match: PublicMatch
  side: 'A' | 'B'
}

function TeamRow({ match, side }: TeamRowProps) {
  const team = side === 'A' ? match.teamA : match.teamB
  const source = side === 'A' ? match.sourceA : match.sourceB
  const score = side === 'A' ? match.scoreA : match.scoreB
  const otherScore = side === 'A' ? match.scoreB : match.scoreA
  const forfeited = match.forfeitedBy && team && match.forfeitedBy === team.id
  const isWinner = match.winnerTeamId != null && team != null && match.winnerTeamId === team.id
  const showScore = match.status === 'in_progress' || match.status === 'completed' || match.status === 'forfeited'

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-[var(--radius-md)] px-3 py-2',
        isWinner && 'bg-[var(--color-success-bg)]',
        forfeited && 'bg-[var(--color-danger-bg)]'
      )}
    >
      <div className="min-w-0">
        <p
          className={cn(
            'truncate text-sm font-bold text-[var(--color-plum)]',
            !team && 'italic text-[var(--color-ink-muted)]'
          )}
        >
          {teamDisplayName(team, source)}
          {forfeited && <span className="ml-1.5 text-xs font-semibold text-[var(--color-danger)]">forfeited</span>}
        </p>
        {team && (
          <p className="truncate text-xs text-[var(--color-ink-soft)]">
            {team.players.map((p) => p.name).join(' & ')}
          </p>
        )}
      </div>
      {showScore && (
        <span
          className={cn(
            'shrink-0 text-lg font-extrabold tabular-nums',
            isWinner ? 'text-[var(--color-success)]' : 'text-[var(--color-ink-muted)]',
            match.status === 'in_progress' && !isWinner && !otherScore && 'text-[var(--color-plum)]'
          )}
        >
          {score}
        </span>
      )}
    </div>
  )
}

export interface MatchCardProps {
  match: PublicMatch
  className?: string
  /** Show court/slot/duty info — off by default for compact bracket cards. */
  showDetails?: boolean
}

export function MatchCard({ match, className, showDetails = true }: MatchCardProps) {
  const isLive = match.status === 'in_progress'

  return (
    <div
      className={cn(
        'rounded-[var(--radius-lg)] bg-white p-3 shadow-[var(--shadow-soft)]',
        isLive && 'ring-2 ring-[var(--color-brand-pink)] ring-offset-2',
        className
      )}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 font-semibold text-[var(--color-ink-muted)]">
          <span>{stageLabel(match.stage)}</span>
          {match.court && (
            <>
              <span aria-hidden="true">&middot;</span>
              <span>{match.court}</span>
            </>
          )}
          {match.slotLabel && (
            <>
              <span aria-hidden="true">&middot;</span>
              <span>{match.slotLabel}</span>
            </>
          )}
        </div>
        <Badge status={statusToBadgeStatus(match.status)}>
          {isLive && <span className="h-1.5 w-1.5 animate-ping rounded-full bg-current" aria-hidden="true" />}
          {statusLabel(match.status)}
        </Badge>
      </div>

      <div className="flex flex-col gap-1">
        <TeamRow match={match} side="A" />
        <div className="flex items-center gap-2 px-3 text-[10px] font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">
          <span className="h-px flex-1 bg-black/5" aria-hidden="true" />
          vs
          <span className="h-px flex-1 bg-black/5" aria-hidden="true" />
        </div>
        <TeamRow match={match} side="B" />
      </div>

      {showDetails && (
        <p className="mt-2 text-[11px] text-[var(--color-ink-muted)]">
          First to {match.pointsToWin}{match.deuce ? '' : ', no deuce'}
        </p>
      )}

      {showDetails && (() => {
        const assigned = match.duties.filter((d) => d.playerName)
        if (assigned.length === 0) return null
        return (
          <div className="mt-2 flex flex-wrap gap-1.5 border-t border-black/5 pt-2">
            {assigned.map((duty, i) => (
              <span
                key={`${duty.role}-${i}`}
                className="rounded-[var(--radius-pill)] bg-[var(--color-brand-lilac-light)]/50 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-brand-lilac-dark)]"
              >
                {duty.role === 'umpire_scorer' && 'Umpire/Scorer: '}
                {duty.role === 'scoresheet' && 'Scoresheet: '}
                {duty.role === 'line_judge' && 'Line: '}
                {duty.playerName}
              </span>
            ))}
          </div>
        )
      })()}
    </div>
  )
}
