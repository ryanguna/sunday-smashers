'use client'

import { Button, Modal } from '@/components/ui'
import { GiftIcon } from '@/components/icons'
import { cn } from '@/lib/cn'
import type { ScheduleAnalysis, SchedulePublishSafety } from '@/lib/schedule-admin'

/**
 * Publish confirmation. Two separate, deliberate ticks:
 *   - override unresolved hard conflicts, and
 *   - accept moving matches that already have a result.
 * Neither is pre-ticked, and the destructive one is styled to be impossible
 * to skim past.
 */

export function PublishScheduleModal({
  open,
  onClose,
  safety,
  analysis,
  overrideConflicts,
  confirmMoveResults,
  onToggleOverride,
  onToggleMoveResults,
  onConfirm,
  busy,
  isDemo,
}: {
  open: boolean
  onClose: () => void
  safety: SchedulePublishSafety
  analysis: ScheduleAnalysis
  overrideConflicts: boolean
  confirmMoveResults: boolean
  onToggleOverride: (value: boolean) => void
  onToggleMoveResults: (value: boolean) => void
  onConfirm: () => void
  busy: boolean
  isDemo: boolean
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Publish the schedule"
      description="Everyone — players, the TV screen and the public schedule — sees this the moment you publish."
    >
      <div className="flex flex-col gap-3">
        <div
          className={cn(
            'rounded-[var(--radius-md)] p-3.5',
            safety.level === 'danger'
              ? 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]'
              : 'bg-[var(--color-info-bg)] text-[var(--color-info)]',
          )}
        >
          <p className="font-[family-name:var(--font-heading)] text-sm font-bold">
            {safety.headline}
          </p>
          <p className="mt-0.5 text-sm opacity-90">{safety.detail}</p>
        </div>

        <dl className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'Moving', value: safety.movedCount },
            { label: 'Conflicts', value: analysis.errorCount },
            { label: 'Unplaced', value: analysis.unplacedCount },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-[var(--radius-md)] bg-[var(--color-frost-100)] px-2 py-2"
            >
              <dt className="text-[0.65rem] font-bold uppercase tracking-[0.1em] text-[var(--color-ink-muted)]">
                {stat.label}
              </dt>
              <dd className="font-[family-name:var(--font-heading)] text-xl font-extrabold text-[var(--color-plum)]">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>

        {safety.requiresOverride && (
          <label className="flex items-start gap-2.5 rounded-[var(--radius-md)] bg-[var(--color-warn-bg)] p-3 text-sm text-[var(--color-warn)]">
            <input
              type="checkbox"
              checked={overrideConflicts}
              onChange={(event) => onToggleOverride(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-brand-pink-dark)]"
            />
            <span>
              <span className="font-bold">Publish with unresolved conflicts.</span> I have read them
              and I will sort it out courtside.
            </span>
          </label>
        )}

        {safety.destructive && (
          <label className="flex items-start gap-2.5 rounded-[var(--radius-md)] bg-[var(--color-danger-bg)] p-3 text-sm text-[var(--color-danger)]">
            <input
              type="checkbox"
              checked={confirmMoveResults}
              onChange={(event) => onToggleMoveResults(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-danger)]"
            />
            <span>
              <span className="font-bold">
                Yes, move {safety.movedWithResults.length} match
                {safety.movedWithResults.length === 1 ? '' : 'es'} that already have a result.
              </span>{' '}
              Scores are kept, but the printed running order everyone is holding will be wrong.
            </span>
          </label>
        )}

        {isDemo && (
          <p className="rounded-[var(--radius-md)] bg-[var(--color-info-bg)] p-3 text-sm text-[var(--color-info)]">
            Demo mode — publishing is previewed, never saved.
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Not yet
          </Button>
          <Button
            variant="festive"
            size="sm"
            onClick={onConfirm}
            disabled={busy || !safety.canPublish}
          >
            <GiftIcon size={16} aria-hidden="true" />
            {busy ? 'Publishing…' : 'Publish schedule'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
