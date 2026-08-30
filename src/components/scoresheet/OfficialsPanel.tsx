import type { PublicDutyAssignment } from '@/lib/public-data'
import { DUTY_ROLE_LABELS } from '@/lib/schedule-admin'
import { cn } from '@/lib/cn'

export interface OfficialsPanelProps {
  officials: readonly PublicDutyAssignment[]
  print?: boolean
  className?: string
}

const ROLE_ORDER: PublicDutyAssignment['role'][] = ['umpire_scorer', 'scoresheet', 'line_judge']

/**
 * Who officiated. On a signed sheet this is not decoration: the rules say the
 * calls of the umpire and line persons are final, so a query about a call has
 * to be able to name the person who made it.
 */
export function OfficialsPanel({ officials, print = false, className }: OfficialsPanelProps) {
  const sorted = [...officials].sort(
    (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role),
  )
  // Line judges are numbered in roster order so a query can name which one.
  const lineJudges = sorted.filter((o) => o.role === 'line_judge')
  const labelled = sorted.map((official) => ({
    official,
    label:
      official.role === 'line_judge'
        ? `Line judge ${lineJudges.indexOf(official) + 1}`
        : DUTY_ROLE_LABELS[official.role],
  }))
  // An empty seat is worth one line, not a card of its own: on a sheet that is
  // read at a glance, four boxes saying "Unassigned" bury the names that matter.
  const ordered = labelled.filter((row) => row.official.playerName)
  const vacant = labelled.filter((row) => !row.official.playerName).map((row) => row.label)

  return (
    <section className={cn('flex flex-col gap-2', className)} aria-labelledby="officials-heading">
      <h2
        id="officials-heading"
        className={cn(
          'font-[family-name:var(--font-heading)] font-extrabold',
          print ? 'text-lg' : 'text-xl',
        )}
        style={{ color: 'var(--color-plum)' }}
      >
        Officials on duty
      </h2>

      {ordered.length === 0 ? (
        <p className="rounded-[var(--radius-md)] bg-[var(--color-frost-100)] px-3 py-2 text-sm text-[var(--color-ink-soft)]">
          {vacant.length === 0
            ? 'No duty roster was published for this match.'
            : `Nobody was rostered for this match — ${vacant.join(', ').toLowerCase()} were all unassigned.`}
        </p>
      ) : (
        <dl className="grid gap-2 sm:grid-cols-2">
          {ordered.map(({ official, label }, index) => {
            return (
              <div
                key={`${official.role}-${official.playerId || index}`}
                className="rounded-[var(--radius-md)] border border-[var(--color-brand-lilac-light)] bg-white px-3 py-2"
              >
                <dt className="text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">
                  {label}
                </dt>
                <dd className="font-semibold text-[var(--color-ink)]">
                  {official.playerName || 'Unassigned'}
                </dd>
              </div>
            )
          })}
        </dl>
      )}

      {ordered.length > 0 && vacant.length > 0 ? (
        <p className="text-sm text-[var(--color-ink-muted)]">
          Unassigned: {vacant.join(', ').toLowerCase()}.
        </p>
      ) : null}
    </section>
  )
}
