import Link from 'next/link'
import { Badge, Card, CardBody } from '@/components/ui'
import { ShuttlecockIcon, SnowflakeIcon } from '@/components/icons'
import { divisionStateBlurb, type AwardsDivisionView } from '@/lib/awards'

/**
 * The state a division sits in while it is still playing.
 *
 * The two divisions do not finish together — one podium gets confirmed while
 * the other is mid semi-final. During that window this panel keeps the
 * unfinished division on the page, pointing at the live scores, instead of
 * silently omitting it and making the page look broken.
 */
export interface DivisionPendingProps {
  division: AwardsDivisionView
}

export function DivisionPending({ division }: DivisionPendingProps) {
  return (
    <Card variant="frosted" className="text-center">
      <CardBody className="flex flex-col items-center gap-3 py-8">
        <span
          className="flex h-14 w-14 items-center justify-center rounded-full bg-[image:var(--gradient-mint-sky)] text-white"
          aria-hidden="true"
        >
          <SnowflakeIcon size={28} className="animate-twinkle [animation-duration:3.4s]" />
        </span>
        <Badge status="pending">Still to be crowned</Badge>
        <p className="max-w-md text-sm text-[var(--color-ink-soft)]">{divisionStateBlurb(division)}</p>
        <p className="flex flex-wrap items-center justify-center gap-3 text-sm font-bold">
          <Link
            href="/live"
            className="text-[var(--color-brand-pink-dark)] underline underline-offset-4"
          >
            Live scores
          </Link>
          <span aria-hidden="true" className="text-[var(--color-ink-muted)]">
            ·
          </span>
          <Link
            href="/bracket"
            className="text-[var(--color-brand-pink-dark)] underline underline-offset-4"
          >
            The bracket
          </Link>
        </p>
        <p className="flex items-center gap-2 text-xs text-[var(--color-ink-muted)]">
          <ShuttlecockIcon size={14} aria-hidden="true" />
          {division.divisionName} is still on court
        </p>
      </CardBody>
    </Card>
  )
}
