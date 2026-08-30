import Link from 'next/link'

import { Badge, Card, CardBody } from '@/components/ui'
import { dutyRoleLabel, pointsToWinLabel, stageLabel } from '@/lib/dashboard'
import type { ScoringAssignment } from '@/lib/scoring'

export interface ScoringMatchListProps {
  assignments: readonly ScoringAssignment[]
  /** Live duties get a bigger, unmissable card. */
  emphasise?: boolean
}

const STATE_BADGE = {
  live: { status: 'live' as const, label: 'On court now' },
  up_next: { status: 'pending' as const, label: 'You are next' },
  upcoming: { status: 'info' as const, label: 'Later today' },
  done: { status: 'final' as const, label: 'Finished' },
}

/**
 * The duty list on `/scoring`. Deliberately plain: one big link per match,
 * the court first because that is what the umpire is walking towards.
 */
export function ScoringMatchList({ assignments, emphasise = false }: ScoringMatchListProps) {
  return (
    <ul className="flex flex-col gap-3">
      {assignments.map((assignment) => {
        const { match } = assignment
        const badge = STATE_BADGE[assignment.state]
        const teams = `${match.teamA?.name ?? match.sourceA ?? 'TBC'} v ${match.teamB?.name ?? match.sourceB ?? 'TBC'}`
        return (
          <li key={match.id}>
            <Card className={emphasise ? 'border-2 border-[var(--color-brand-pink-dark)]' : ''}>
              <CardBody>
                <Link
                  href={`/scoring/${encodeURIComponent(match.id)}`}
                  className="flex flex-col gap-2 rounded-[var(--radius-md)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-plum)]"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge status={badge.status}>{badge.label}</Badge>
                    <span className="text-sm font-semibold text-[var(--color-ink-muted)]">
                      {match.court ?? 'Court TBC'} · {match.slotLabel ?? 'Time TBC'}
                    </span>
                    {assignment.clash ? (
                      <Badge status="unpaid">Clash — you play this slot</Badge>
                    ) : null}
                  </span>

                  <span
                    className={`block font-[family-name:var(--font-heading)] font-extrabold leading-tight ${
                      emphasise ? 'text-2xl' : 'text-xl'
                    }`}
                    style={{ color: 'var(--color-plum)' }}
                  >
                    {teams}
                  </span>

                  <span className="block text-sm text-[var(--color-ink-soft)]">
                    {stageLabel(match.stage)} · {pointsToWinLabel(match)} ·{' '}
                    {assignment.roles.map(dutyRoleLabel).join(' & ')}
                    {assignment.canScore ? '' : ' · read-only'}
                  </span>
                </Link>
              </CardBody>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}
