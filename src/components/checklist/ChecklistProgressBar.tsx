import { cn } from '@/lib/cn'
import { progressTone, type Progress } from '@/lib/checklist'

const toneBar: Record<string, string> = {
  danger: 'bg-[var(--color-danger)]',
  warn: 'bg-[var(--color-warn)]',
  info: 'bg-[var(--color-brand-lilac-dark)]',
  success: 'bg-[var(--color-success)]',
}

export interface ChecklistProgressBarProps {
  progress: Progress
  label: string
  /** Larger treatment for the overall bar. */
  size?: 'sm' | 'lg'
  className?: string
}

/**
 * A progress bar that is readable without colour alone — the count is always
 * printed next to it, which also makes the print view work in black and white.
 */
export function ChecklistProgressBar({
  progress,
  label,
  size = 'sm',
  className,
}: ChecklistProgressBarProps) {
  const tone = progressTone(progress.percent)
  return (
    <div className={cn('w-full', className)}>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span
          className={cn(
            'font-[family-name:var(--font-heading)] font-bold',
            size === 'lg' ? 'text-base' : 'text-sm',
          )}
          style={{ color: 'var(--color-plum)' }}
        >
          {label}
        </span>
        <span className="text-xs font-semibold text-[var(--color-ink-soft)] tabular-nums">
          {progress.done}/{progress.total} · {progress.percent}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label}: ${progress.done} of ${progress.total} done`}
        aria-valuenow={progress.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className={cn(
          'w-full overflow-hidden rounded-[var(--radius-pill)] bg-[var(--color-brand-lilac-light)] print:border print:border-black',
          size === 'lg' ? 'h-3' : 'h-2',
        )}
      >
        <div
          className={cn('h-full rounded-[var(--radius-pill)] transition-[width] duration-500', toneBar[tone])}
          style={{ width: `${progress.percent.toFixed(0)}%` }}
        />
      </div>
    </div>
  )
}
