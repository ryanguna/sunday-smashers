import { Card, CardBody } from '@/components/ui'
import { GiftIcon, MedalIcon, ShuttlecockIcon, TrophyIcon } from '@/components/icons'
import { formatCents } from '@/lib/admin'
import type { DerivedQuantities } from '@/lib/checklist'

/**
 * Every number here is derived from real data — approved registrations for
 * the loot-bag counts and the Settings → Prizes config for the money and
 * hardware. Nothing on this panel is typed in by hand, which is the whole
 * point: the loot bag order can't drift from who actually entered.
 */
export interface DerivedQuantitiesPanelProps {
  derived: DerivedQuantities
  /** Print view drops the frosted cards for plain boxes. */
  print?: boolean
}

function Figure({
  icon,
  label,
  value,
  hint,
}: {
  icon?: React.ReactNode
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="rounded-[var(--radius-md)] bg-white/70 p-3 print:border print:border-black print:bg-white">
      <div className="flex items-center gap-2">
        {icon && (
          <span className="text-[var(--color-brand-lilac-dark)] print:hidden" aria-hidden="true">
            {icon}
          </span>
        )}
        <p className="text-xs font-semibold tracking-wide text-[var(--color-ink-muted)] uppercase">
          {label}
        </p>
      </div>
      <p
        className="mt-1 font-[family-name:var(--font-heading)] text-2xl font-extrabold"
        style={{ color: 'var(--color-plum)' }}
      >
        {value}
      </p>
      <p className="text-xs text-[var(--color-ink-soft)]">{hint}</p>
    </div>
  )
}

export function DerivedQuantitiesPanel({ derived, print = false }: DerivedQuantitiesPanelProps) {
  const body = (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          icon={<GiftIcon size={18} />}
          label="Loot bags"
          value={String(derived.lootBags)}
          hint="One per player in the hall — waitlist included."
        />
        <Figure
          icon={<MedalIcon size={18} />}
          label="Medals"
          value={`${derived.medalsConfigured}/${derived.medalsNeeded}`}
          hint={`${derived.divisionCount} division${derived.divisionCount === 1 ? '' : 's'} × 3 podium pairs × 2 players.`}
        />
        <Figure
          icon={<TrophyIcon size={18} />}
          label="Trophies"
          value={`${derived.trophiesConfigured}/${derived.trophiesNeeded}`}
          hint="One champion trophy per division."
        />
        <Figure
          icon={<ShuttlecockIcon size={18} />}
          label="Prize pool"
          value={formatCents(derived.prizePoolCents)}
          hint="Cash across every division, from Settings → Prizes."
        />
      </div>

      <div className="grid gap-3">
        <div className="rounded-[var(--radius-md)] bg-white/70 p-3 print:border print:border-black print:bg-white">
          <p
            className="font-[family-name:var(--font-heading)] font-extrabold"
            style={{ color: 'var(--color-plum)' }}
          >
            What goes in each bag
          </p>
          <p className="mb-2 text-xs text-[var(--color-ink-soft)]">
            Per-player contents × {derived.lootBags} bags.
          </p>
          {derived.lootBagLines.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              Nothing configured yet — add loot bag contents in Settings → Prizes.
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {derived.lootBagLines.map((line) => (
                <li key={line.name} className="flex items-baseline justify-between gap-3">
                  <span className="text-[var(--color-ink)]">
                    {line.name}
                    {line.notes && (
                      <span className="text-[var(--color-ink-muted)]"> — {line.notes}</span>
                    )}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-[var(--color-ink-soft)]">
                    {line.perPlayer} ea · {line.total} total
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )

  if (print) return body

  return (
    <Card variant="frosted">
      <CardBody>
        <p className="mb-3 font-[family-name:var(--font-script)] text-xl text-[var(--color-brand-pink-dark)]">
          The numbers, worked out for you
        </p>
        {body}
      </CardBody>
    </Card>
  )
}
