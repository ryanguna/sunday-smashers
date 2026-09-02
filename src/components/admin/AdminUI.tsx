import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Button, Card, EmptyState } from '@/components/ui'
import { GiftIcon, HollyIcon, SparkleIcon } from '@/components/icons'
import type { AlertTone } from '@/lib/admin'

/** Shared festive presentation pieces for the admin console pages. */

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="mb-5 overflow-hidden rounded-[var(--radius-lg)] bg-[image:var(--gradient-candy)] p-[2px] shadow-[var(--shadow-soft)]">
      <div className="flex flex-col gap-3 rounded-[calc(var(--radius-lg)-2px)] bg-frost-glass px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
        <div className="min-w-0">
          {eyebrow && (
            <p className="font-[family-name:var(--font-script)] text-xl text-[var(--color-brand-pink-dark)]">
              {eyebrow}
            </p>
          )}
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-[var(--color-plum)] sm:text-3xl">
            <HollyIcon size={26} className="shrink-0 text-[var(--color-brand-holly)]" aria-hidden="true" />
            <span className="truncate">{title}</span>
          </h1>
          {description && (
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}

const statToneClasses: Record<string, string> = {
  pink: 'bg-[var(--color-brand-pink-light)] text-[var(--color-brand-pink-dark)]',
  lilac: 'bg-[var(--color-brand-lilac-light)] text-[var(--color-brand-lilac-dark)]',
  mint: 'bg-[var(--color-brand-mint-light)] text-[var(--color-brand-mint-dark)]',
  sky: 'bg-[var(--color-brand-sky-light)] text-[var(--color-brand-sky-dark)]',
  gold: 'bg-[var(--color-brand-gold-light)] text-[var(--color-brand-gold-dark)]',
}

export type StatTone = keyof typeof statToneClasses

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'lilac',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  tone?: StatTone
}) {
  return (
    <Card variant="frosted" className="hover-lift flex items-start gap-3 p-4">
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)]',
          statToneClasses[tone]
        )}
        aria-hidden="true"
      >
        {icon ?? <SparkleIcon size={20} />}
      </span>
      <div className="min-w-0">
        {/* `break-words`: at 320px the icon leaves ~48px for the label, which
            is narrower than a single word like "rostered". Without this the
            text spills out of the card and scrolls the whole page sideways. */}
        <p className="text-[0.7rem] font-bold uppercase tracking-[0.12em] break-words text-[var(--color-ink-muted)]">
          {label}
        </p>
        <p className="font-[family-name:var(--font-heading)] text-2xl font-extrabold leading-tight text-[var(--color-plum)]">
          {value}
        </p>
        {hint && <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">{hint}</p>}
      </div>
    </Card>
  )
}

const alertToneClasses: Record<AlertTone, string> = {
  info: 'bg-[var(--color-info-bg)] text-[var(--color-info)]',
  warn: 'bg-[var(--color-warn-bg)] text-[var(--color-warn)]',
  danger: 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]',
  success: 'bg-[var(--color-success-bg)] text-[var(--color-success)]',
}

export function AlertTile({
  tone,
  title,
  detail,
  href,
}: {
  tone: AlertTone
  title: string
  detail: string
  href?: string
}) {
  const content = (
    <div className={cn('rounded-[var(--radius-md)] p-3.5', alertToneClasses[tone])}>
      <p className="font-[family-name:var(--font-heading)] text-sm font-bold">{title}</p>
      <p className="mt-0.5 text-sm">{detail}</p>
      {href && <p className="mt-1.5 text-xs font-bold underline underline-offset-2">Take a look →</p>}
    </div>
  )
  if (!href) return content
  return (
    <a href={href} className="block transition-transform hover:scale-[1.01]">
      {content}
    </a>
  )
}

/** The "no database connected" strip shown across the console in demo mode. */
export function AdminDemoBanner() {
  return (
    <div
      role="status"
      className="mb-5 flex items-start gap-3 rounded-[var(--radius-md)] bg-[var(--color-info-bg)] p-3.5 text-sm text-[var(--color-info)]"
    >
      <GiftIcon size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p>
        <span className="font-[family-name:var(--font-heading)] font-bold">Demo mode.</span> No
        Supabase project is connected, so you&apos;re looking at sample registrations and payments.
        Approvals, rejections and payment edits are previewed but never saved.
      </p>
    </div>
  )
}

/**
 * Shown when a live query failed. The console deliberately does *not* fall
 * back to sample data (see `@/lib/demo-mode`), so this strip is how a
 * volunteer learns the page is thin because the database was unreachable —
 * not because the entries vanished.
 */
export function AdminDataErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mb-5 flex items-start gap-3 rounded-[var(--radius-md)] bg-[var(--color-warn-bg)] p-3.5 text-sm text-[var(--color-warn)]"
    >
      <SparkleIcon size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p>
        <span className="font-[family-name:var(--font-heading)] font-bold">
          Couldn&apos;t load everything.
        </span>{' '}
        {message}
      </p>
    </div>
  )
}

/**
 * The day-zero empty state: a real, connected project that simply has nothing
 * in it yet. Always tells the volunteer the single next thing to do.
 */
export function AdminEmptyState({
  title,
  description,
  href,
  linkLabel,
  icon,
}: {
  title: string
  description: string
  href?: string
  linkLabel?: string
  icon?: ReactNode
}) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      description={description}
      action={
        href && linkLabel ? (
          <Button href={href} variant="secondary" size="sm">
            {linkLabel}
          </Button>
        ) : undefined
      }
    />
  )
}
