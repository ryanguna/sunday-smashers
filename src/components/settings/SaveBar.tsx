'use client'

import { useState, type ReactNode } from 'react'
import { Badge, Button, Confetti } from '@/components/ui'
import { GiftIcon, HollyIcon, ShuttlecockIcon } from '@/components/icons'
import type { SettingsChange } from '@/lib/settings'
import type { DraftSaveResult } from './useSettingsDraft'

/**
 * Sticky "you have unsaved changes" bar + festive save feedback.
 *
 * It is deliberately loud: settings drive the draw, and an admin who walks
 * away mid-edit should never wonder whether their change landed.
 */

export interface SaveBarProps {
  dirty: boolean
  saving: boolean
  canSave: boolean
  changes: readonly SettingsChange[]
  result: DraftSaveResult | null
  celebrate: boolean
  onSave: () => void
  onReset: () => void
  /** Blocks saving until acknowledged, e.g. a dangerous rules change. */
  blockedReason?: string
  children?: ReactNode
}

export function SaveBar({
  dirty,
  saving,
  canSave,
  changes,
  result,
  celebrate,
  onSave,
  onReset,
  blockedReason,
  children,
}: SaveBarProps) {
  const [showChanges, setShowChanges] = useState(false)

  return (
    <div className="sticky bottom-0 z-30 -mx-1 mt-6 px-1 pb-3">
      <Confetti active={celebrate} count={36} />

      {result && (
        <div
          role="status"
          className={[
            'mb-2 flex items-start gap-2.5 rounded-[var(--radius-md)] px-4 py-3 text-sm font-medium shadow-[var(--shadow-lift)]',
            result.ok
              ? 'bg-[var(--color-success-bg)] text-[var(--color-success)]'
              : 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]',
          ].join(' ')}
        >
          {result.ok ? (
            <GiftIcon size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
          ) : (
            <HollyIcon size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
          )}
          <span>{result.message}</span>
        </div>
      )}

      <div
        className={[
          'rounded-[var(--radius-lg)] border px-4 py-3 shadow-[var(--shadow-lift)] backdrop-blur',
          dirty
            ? 'border-[var(--color-brand-pink)] bg-white/95'
            : 'border-[var(--color-brand-lilac-light)] bg-white/80',
        ].join(' ')}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <ShuttlecockIcon
              size={22}
              aria-hidden="true"
              className={dirty ? 'text-[var(--color-brand-pink-dark)]' : 'text-[var(--color-brand-mint-dark)]'}
            />
            <div className="min-w-0">
              <p className="font-[family-name:var(--font-heading)] font-bold text-[var(--color-plum)]">
                {dirty ? 'Unsaved changes' : 'All changes saved'}
              </p>
              <p className="truncate text-xs text-[var(--color-ink-muted)]">
                {dirty
                  ? `${changes.length} change${changes.length === 1 ? '' : 's'} waiting to be saved.`
                  : 'Everything on this screen matches what players will see.'}
              </p>
            </div>
            {dirty && (
              <Badge status="pending" className="hidden sm:inline-flex">
                {changes.length}
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {dirty && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowChanges((open) => !open)}
                aria-expanded={showChanges}
              >
                {showChanges ? 'Hide' : 'Review'} changes
              </Button>
            )}
            <Button type="button" variant="secondary" size="sm" onClick={onReset} disabled={!dirty || saving}>
              Discard
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onSave}
              loading={saving}
              disabled={!canSave || Boolean(blockedReason)}
              title={blockedReason}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>

        {blockedReason && dirty && (
          <p className="mt-2 text-xs font-semibold text-[var(--color-danger)]">{blockedReason}</p>
        )}

        {children}

        {showChanges && dirty && (
          <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto border-t border-black/5 pt-3 text-sm">
            {changes.map((change) => (
              <li key={change.path} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-semibold text-[var(--color-plum)]">{change.label}</span>
                <span className="text-[var(--color-ink-muted)] line-through">{change.before}</span>
                <span aria-hidden="true" className="text-[var(--color-ink-muted)]">
                  →
                </span>
                <span className="font-semibold text-[var(--color-brand-mint-dark)]">{change.after}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
