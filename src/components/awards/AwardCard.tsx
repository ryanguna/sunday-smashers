import { Card, CardBody } from '@/components/ui'
import { cn } from '@/lib/cn'
import {
  awardDefinitionByKey,
  recipientLabel,
  recipientSubtitle,
  revealDelay,
  type AwardDefinition,
  type AwardRecord,
} from '@/lib/awards'
import { AwardIcon } from './AwardIcon'

const TONES = [
  'bg-[var(--color-brand-pink-light)] text-[var(--color-brand-pink-dark)]',
  'bg-[var(--color-brand-lilac-light)] text-[var(--color-brand-lilac-dark)]',
  'bg-[var(--color-brand-mint-light)] text-[var(--color-brand-mint-dark)]',
  'bg-[var(--color-brand-sky-light)] text-[var(--color-brand-sky-dark)]',
  'bg-[var(--color-brand-gold-light)] text-[var(--color-brand-gold-dark)]',
]

export interface AwardCardProps {
  record: AwardRecord
  definitions?: readonly AwardDefinition[]
  /** Used for the staggered reveal and the pastel rotation. */
  index?: number
  className?: string
}

/** One discretionary gong: MVP, Best Christmas Outfit, and friends. */
export function AwardCard({ record, definitions, index = 0, className }: AwardCardProps) {
  const definition = awardDefinitionByKey(record.key, definitions)
  const label = definition?.label ?? record.key
  const subtitle = recipientSubtitle(record.recipient)

  return (
    <Card
      variant="frosted"
      className={cn('animate-pop-in hover-lift h-full', className)}
      style={{ animationDelay: revealDelay(index, 0.12) }}
    >
      <CardBody className="flex items-start gap-3">
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)]',
            TONES[index % TONES.length]
          )}
          aria-hidden="true"
        >
          <AwardIcon icon={definition?.icon ?? 'sparkle'} size={22} />
        </span>
        <div className="min-w-0">
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
            {label}
          </p>
          <p
            className="font-[family-name:var(--font-heading)] text-lg font-extrabold leading-tight"
            style={{ color: 'var(--color-plum)' }}
          >
            {recipientLabel(record.recipient)}
          </p>
          {subtitle && <p className="text-sm text-[var(--color-ink-soft)]">{subtitle}</p>}
          {record.citation ? (
            <p className="mt-1.5 text-sm italic text-[var(--color-ink-soft)]">
              &ldquo;{record.citation}&rdquo;
            </p>
          ) : (
            definition?.blurb && (
              <p className="mt-1.5 text-sm text-[var(--color-ink-muted)]">{definition.blurb}</p>
            )
          )}
        </div>
      </CardBody>
    </Card>
  )
}
