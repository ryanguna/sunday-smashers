import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'
import { Card } from '@/components/ui'
import {
  BaubleIcon,
  HollyIcon,
  ShuttlecockIcon,
  SnowflakeIcon,
  SparkleIcon,
} from '@/components/icons'
import type { DrawWarning, DrawWarningLevel } from '@/lib/draw-admin'

/**
 * Small festive presentation pieces shared by the two draw pages.
 * Presentational only — safe in both Server and Client Components.
 */

const levelClasses: Record<DrawWarningLevel, string> = {
  info: 'bg-[var(--color-info-bg)] text-[var(--color-info)]',
  warn: 'bg-[var(--color-warn-bg)] text-[var(--color-warn)]',
  danger: 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]',
}

const levelIcon: Record<DrawWarningLevel, ReactNode> = {
  info: <SnowflakeIcon size={18} aria-hidden="true" />,
  warn: <BaubleIcon size={18} aria-hidden="true" />,
  danger: <HollyIcon size={18} aria-hidden="true" />,
}

export function DrawAlert({
  level,
  title,
  detail,
  action,
  className,
}: {
  level: DrawWarningLevel
  title: string
  detail?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-[var(--radius-md)] p-3.5 text-sm',
        levelClasses[level],
        className
      )}
    >
      <span className="mt-0.5 shrink-0">{levelIcon[level]}</span>
      <div className="min-w-0 flex-1">
        <p className="font-[family-name:var(--font-heading)] font-bold">{title}</p>
        {detail && <p className="mt-0.5 opacity-90">{detail}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/** The stack of pre-draw warnings, or a cheerful all-clear. */
export function WarningRail({ warnings }: { warnings: readonly DrawWarning[] }) {
  if (warnings.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-[var(--radius-md)] bg-[var(--color-success-bg)] p-3.5 text-sm text-[var(--color-success)]">
        <SparkleIcon size={18} aria-hidden="true" />
        <p className="font-[family-name:var(--font-heading)] font-bold">
          Every entry is approved, paid and ready to be drawn. Sleigh bells ring!
        </p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {warnings.map((warning) => (
        <li key={warning.code}>
          <DrawAlert level={warning.level} title={warning.title} detail={warning.detail} />
        </li>
      ))}
    </ul>
  )
}

const toneClasses = {
  pink: 'bg-[var(--color-brand-pink-light)] text-[var(--color-brand-pink-dark)]',
  lilac: 'bg-[var(--color-brand-lilac-light)] text-[var(--color-brand-lilac-dark)]',
  mint: 'bg-[var(--color-brand-mint-light)] text-[var(--color-brand-mint-dark)]',
  sky: 'bg-[var(--color-brand-sky-light)] text-[var(--color-brand-sky-dark)]',
  gold: 'bg-[var(--color-brand-gold-light)] text-[var(--color-brand-gold-dark)]',
} as const

export type DrawStatTone = keyof typeof toneClasses

/** Compact stat tile used across the summary strips. */
export function DrawStat({
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
  tone?: DrawStatTone
}) {
  return (
    <Card variant="frosted" className="flex items-start gap-3 p-3.5">
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)]',
          toneClasses[tone]
        )}
        aria-hidden="true"
      >
        {icon ?? <ShuttlecockIcon size={18} />}
      </span>
      <div className="min-w-0">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
          {label}
        </p>
        <p className="font-[family-name:var(--font-heading)] text-xl font-extrabold leading-tight text-[var(--color-plum)]">
          {value}
        </p>
        {hint && <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">{hint}</p>}
      </div>
    </Card>
  )
}

/** Section title with a candy underline, used inside the workbench cards. */
export function PanelHeading({
  icon,
  title,
  description,
  actions,
}: {
  icon?: ReactNode
  title: string
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 font-[family-name:var(--font-heading)] text-lg font-extrabold text-[var(--color-plum)]">
          {icon ?? <SnowflakeIcon size={18} className="text-[var(--color-brand-lilac-dark)]" aria-hidden="true" />}
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-sm text-[var(--color-ink-soft)]">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Horizontal progress bar with a festive gradient fill. */
export function ProgressBar({ percent, label }: { percent: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)))
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs text-[var(--color-ink-soft)]">
        <span className="font-semibold">{label}</span>
        <span className="tabular-nums font-bold text-[var(--color-plum)]">{clamped}%</span>
      </div>
      <div
        className="h-2.5 w-full overflow-hidden rounded-[var(--radius-pill)] bg-[var(--color-brand-lilac-light)]"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="h-full rounded-[var(--radius-pill)] bg-[image:var(--gradient-candy)] transition-[width] duration-500"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}
