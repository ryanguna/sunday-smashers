import Link from 'next/link'
import { Badge, Card, CardBody } from '@/components/ui'
import { GiftIcon, SparkleIcon } from '@/components/icons'
import { cn } from '@/lib/cn'
import type { StatusTone, StatusView } from '@/lib/dashboard'

const TONE_BADGE: Record<StatusTone, 'approved' | 'pending' | 'unpaid' | 'info'> = {
  success: 'approved',
  pending: 'pending',
  warn: 'pending',
  danger: 'unpaid',
  info: 'info',
}

const TONE_RING: Record<StatusTone, string> = {
  success: 'border-[var(--color-success)]',
  pending: 'border-[var(--color-warn)]',
  warn: 'border-[var(--color-warn)]',
  danger: 'border-[var(--color-danger)]',
  info: 'border-[var(--color-brand-lilac)]',
}

export interface StatusCardProps {
  title: string
  view: StatusView
  icon?: 'gift' | 'sparkle'
  className?: string
}

/** One "where do I stand" tile — registration status or payment status. */
export function StatusCard({ title, view, icon = 'gift', className }: StatusCardProps) {
  return (
    <Card variant="frosted" className={cn('border-2', TONE_RING[view.tone], className)}>
      <CardBody className="flex h-full flex-col gap-2 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[image:var(--gradient-candy)] text-white">
            {icon === 'gift' ? <GiftIcon size={16} /> : <SparkleIcon size={16} />}
          </span>
          <h3 className="text-base font-extrabold" style={{ color: 'var(--color-plum)' }}>
            {title}
          </h3>
          <Badge status={TONE_BADGE[view.tone]} className="ml-auto">
            {view.label}
          </Badge>
        </div>

        <p className="text-sm font-semibold text-[var(--color-ink-soft)]">{view.message}</p>

        {view.nudge && (
          <p className="rounded-[var(--radius-lg)] bg-white/80 px-3 py-2 text-sm text-[var(--color-ink-muted)]">
            {view.nudge}
          </p>
        )}

        {view.href && view.actionLabel && (
          <Link
            href={view.href}
            className="mt-auto text-sm font-extrabold text-[var(--color-brand-pink-dark)] inline-flex min-h-[24px] items-center underline-offset-4 hover:underline"
          >
            {view.actionLabel} →
          </Link>
        )}
      </CardBody>
    </Card>
  )
}
