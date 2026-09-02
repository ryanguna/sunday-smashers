import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui'
import { SnowflakeIcon } from '@/components/icons'
import type { SettingsIssue } from '@/lib/settings'

/**
 * Festive chrome shared by every settings screen. Server-safe (no `use
 * client`) so pages can render the frame and only hydrate the forms inside.
 */

export interface SettingsCardProps {
  title: string
  description?: ReactNode
  icon?: ReactNode
  /** Small pill on the right of the header, e.g. a count. */
  meta?: ReactNode
  tone?: 'pink' | 'mint' | 'sky' | 'gold' | 'lilac'
  className?: string
  children: ReactNode
}

const toneHeader: Record<NonNullable<SettingsCardProps['tone']>, string> = {
  pink: 'from-[var(--color-brand-pink-light)] to-[var(--color-brand-lilac-light)]',
  mint: 'from-[var(--color-brand-mint-light)] to-[var(--color-brand-sky-light)]',
  sky: 'from-[var(--color-brand-sky-light)] to-[var(--color-brand-lilac-light)]',
  gold: 'from-[var(--color-brand-gold-light)] to-[var(--color-brand-pink-light)]',
  lilac: 'from-[var(--color-brand-lilac-light)] to-[var(--color-brand-mint-light)]',
}

export function SettingsCard({
  title,
  description,
  icon,
  meta,
  tone = 'pink',
  className,
  children,
}: SettingsCardProps) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-[var(--radius-lg)] bg-white shadow-[var(--shadow-soft)]',
        className,
      )}
    >
      <header
        className={cn(
          'flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r px-5 py-4',
          toneHeader[tone],
        )}
      >
        <div className="flex items-center gap-3">
          {icon && (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/80 text-[var(--color-brand-pink-dark)] shadow-[var(--shadow-soft)]">
              {icon}
            </span>
          )}
          <div>
            <h2 className="text-lg leading-tight font-bold text-[var(--color-plum)]">{title}</h2>
            {description && (
              <p className="mt-0.5 text-sm text-[var(--color-ink-soft)]">{description}</p>
            )}
          </div>
        </div>
        {meta}
      </header>
      <div className="p-5">{children}</div>
    </section>
  )
}

/** Compact two/three column grid used inside every card. */
export function FieldGrid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 }) {
  return (
    <div className={cn('grid gap-x-4 sm:grid-cols-2', cols === 3 && 'lg:grid-cols-3')}>{children}</div>
  )
}

export function IssueList({ issues, title }: { issues: readonly SettingsIssue[]; title?: string }) {
  if (issues.length === 0) return null
  const errors = issues.filter((issue) => issue.severity === 'error')
  const warnings = issues.filter((issue) => issue.severity === 'warning')

  return (
    <div className="mt-4 space-y-2">
      {errors.length > 0 && (
        <div
          role="alert"
          className="rounded-[var(--radius-md)] bg-[var(--color-danger-bg)] p-3.5 text-sm text-[var(--color-danger)]"
        >
          <p className="font-[family-name:var(--font-heading)] font-bold">
            {title ?? 'Fix these before saving'}
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {errors.map((issue, i) => (
              <li key={`${issue.path}-${i}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-[var(--radius-md)] bg-[var(--color-warn-bg)] p-3.5 text-sm text-[var(--color-warn)]">
          <p className="flex items-center gap-1.5 font-[family-name:var(--font-heading)] font-bold">
            <SnowflakeIcon size={16} aria-hidden="true" />
            Worth a look
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {warnings.map((issue, i) => (
              <li key={`${issue.path}-${i}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Pastel "what this means" panel used by the rules previews. */
export function PreviewPanel({
  title,
  lines,
  footer,
}: {
  title: string
  lines: readonly string[]
  footer?: ReactNode
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-brand-mint)]/40 bg-[var(--color-brand-mint-light)]/40 p-4">
      <p className="font-[family-name:var(--font-heading)] text-sm font-bold text-[var(--color-brand-mint-dark)]">
        {title}
      </p>
      <ul className="mt-2 space-y-1.5 text-sm text-[var(--color-ink-soft)]">
        {lines.map((line, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden="true" className="text-[var(--color-brand-mint-dark)]">
              •
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  )
}

export function DemoBadge() {
  return <Badge status="info">Demo data</Badge>
}

export function StatPill({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--color-frost-100)] px-3 py-2 text-center">
      <p className="font-[family-name:var(--font-heading)] text-lg leading-none font-bold text-[var(--color-plum)]">
        {value}
      </p>
      <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{label}</p>
    </div>
  )
}

export interface SwitchRowProps {
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}

/**
 * A large, thumb-friendly checkbox row for a single on/off setting.
 *
 * Shared because the go-live switches and the "announce the prizes" switch
 * must look and behave identically — these all flip something the public can
 * see, and a committee member should recognise the control instantly. The
 * 24px box is deliberate: this console is used on phones.
 */
export function SwitchRow({ label, description, checked, disabled, onChange }: SwitchRowProps) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[var(--color-line)] bg-white/60 p-4 transition-colors hover:bg-white">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-6 w-6 shrink-0 accent-[var(--color-brand-pink)]"
      />
      <span className="min-w-0">
        <span className="block font-semibold text-[var(--color-ink)]">{label}</span>
        <span className="mt-0.5 block text-sm text-[var(--color-ink-soft)]">{description}</span>
      </span>
    </label>
  )
}
