import { Card, CardBody } from '@/components/ui'
import { HollyIcon } from '@/components/icons'
import { cn } from '@/lib/cn'
import { dutyRoleLabel, stageLabel, type PlayerDuty } from '@/lib/dashboard'
import { teamDisplayName } from '@/lib/public-data'

export interface ProfileDutiesProps {
  duties: readonly PlayerDuty[]
  className?: string
}

/**
 * Officiating contributions. Deliberately mint/dashed like the dashboard's
 * duty card so "matches I ran" never reads as "matches I played".
 */
export function ProfileDuties({ duties, className }: ProfileDutiesProps) {
  const matchCount = new Set(duties.map((d) => d.match.id)).size

  return (
    <Card
      variant="frosted"
      className={cn(
        'relative overflow-hidden border-[3px] border-dashed border-[var(--color-brand-mint-dark)]',
        className,
      )}
    >
      <HollyIcon
        size={130}
        className="pointer-events-none absolute -right-6 -bottom-8 text-[var(--color-brand-mint-dark)]/15"
        aria-hidden="true"
      />
      <CardBody className="relative p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--color-brand-mint-dark)] px-3 py-1 text-xs font-extrabold tracking-wide text-white uppercase">
            <span aria-hidden="true">🔔</span> On duty
          </span>
          <span className="ml-auto text-xs font-extrabold tracking-wide text-[var(--color-ink-muted)] uppercase">
            {matchCount} match{matchCount === 1 ? '' : 'es'}
          </span>
        </div>

        <h2 className="mt-3 text-lg font-extrabold" style={{ color: 'var(--color-plum)' }}>
          Duty roster contributions
        </h2>

        {duties.length === 0 ? (
          <p className="mt-2 text-sm font-semibold text-[var(--color-ink-soft)]">
            No officiating duties rostered yet. Players run the matches either side of their own, so
            an assignment usually lands once the schedule is published. 🧝
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm font-semibold text-[var(--color-ink-soft)]">
              Umpiring, scorekeeping and line calls given back to the tournament.
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {duties.map((duty, i) => (
                <li
                  key={`${duty.match.id}-${duty.role}-${i}`}
                  className="rounded-[var(--radius-lg)] bg-white/90 px-3.5 py-2.5 shadow-[var(--shadow-soft)]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-[var(--radius-pill)] bg-[var(--color-brand-mint-light)] px-2.5 py-0.5 text-[0.7rem] font-extrabold text-[var(--color-brand-mint-dark)] uppercase">
                      {dutyRoleLabel(duty.role)}
                    </span>
                    <span className="text-xs font-semibold text-[var(--color-ink-muted)]">
                      {stageLabel(duty.match.stage)}
                      {duty.match.court ? ` · ${duty.match.court}` : ''}
                      {duty.match.slotLabel ? ` · ${duty.match.slotLabel}` : ''}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-bold text-[var(--color-plum)]">
                    {teamDisplayName(duty.match.teamA, duty.match.sourceA)}{' '}
                    <span className="font-semibold text-[var(--color-ink-muted)]">v</span>{' '}
                    {teamDisplayName(duty.match.teamB, duty.match.sourceB)}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardBody>
    </Card>
  )
}
