'use client'

import { useCallback } from 'react'
import { SettingsCard } from './Chrome'
import { SaveBar } from './SaveBar'
import { useSettingsDraft, type DraftSaveResult } from './useSettingsDraft'
import { FORFEIT_GRACE_MINUTES_RANGE, SITE_COPY_FIELDS, type SiteCopy } from '@/lib/site-copy'
import type { SettingsChange, SettingsIssue } from '@/lib/settings'
import { GiftIcon } from '@/components/icons'

/**
 * Editor for the sentences the site says on the committee's behalf.
 *
 * Every field here used to be hard-coded, which is how the rules page ended up
 * permanently stamped "draft" — there was no way to say it was final. The list
 * is driven by `SITE_COPY_FIELDS` so adding a message is a one-line change in
 * the model rather than a new form control here.
 */

export interface SiteCopyEditorProps {
  initial: SiteCopy
  save: (draft: SiteCopy) => Promise<DraftSaveResult>
  disabled?: boolean
}

export function SiteCopyEditor({ initial, save, disabled }: SiteCopyEditorProps) {
  const validate = useCallback((draft: SiteCopy): SettingsIssue[] => {
    const issues: SettingsIssue[] = []
    const { min, max } = FORFEIT_GRACE_MINUTES_RANGE
    if (
      !Number.isInteger(draft.forfeitGraceMinutes) ||
      draft.forfeitGraceMinutes < min ||
      draft.forfeitGraceMinutes > max
    ) {
      issues.push({
        path: 'copy.forfeitGraceMinutes',
        severity: 'error',
        // Saved out of range this silently falls back to the default, so the
        // committee would read one number here and players another on /rules.
        message: `Forfeit grace period must be a whole number between ${min} and ${max} minutes.`,
      })
    }
    for (const field of SITE_COPY_FIELDS) {
      if (field.kind !== 'text') continue
      if (String(draft[field.key]).trim().length === 0) {
        issues.push({
          path: `copy.${field.key}`,
          severity: 'error',
          message: `${field.label} cannot be blank — players would see nothing at all.`,
        })
      }
    }
    return issues
  }, [])

  const diff = useCallback((before: SiteCopy, after: SiteCopy): SettingsChange[] => {
    const changes: SettingsChange[] = []
    for (const field of SITE_COPY_FIELDS) {
      const from = String(before[field.key])
      const to = String(after[field.key])
      if (from !== to) {
        changes.push({ path: `copy.${field.key}`, label: field.label, before: from, after: to })
      }
    }
    return changes
  }, [])

  const draftState = useSettingsDraft<SiteCopy>({ initial, validate, diff, save })
  const { draft, setDraft } = draftState

  return (
    <div className="space-y-5">
      <SettingsCard
        title="What the site says"
        tone="pink"
        icon={<GiftIcon size={18} aria-hidden="true" />}
        description="The messages players read at the moments that matter — while they wait, when they're approved, and if they're not. Write them the way you'd say them."
      >
        <div className="space-y-5">
          {SITE_COPY_FIELDS.map((field) =>
            field.kind === 'toggle' ? (
              <label
                key={field.key}
                className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-black/5 bg-[var(--color-frost-100)] p-3"
              >
                <input
                  type="checkbox"
                  checked={draft[field.key] === true}
                  disabled={disabled}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, [field.key]: event.target.checked }))
                  }
                  className="mt-0.5 h-6 w-6 shrink-0 accent-[var(--color-brand-pink-dark)]"
                />
                <span className="min-w-0 text-sm">
                  <span className="font-semibold text-[var(--color-plum)]">{field.label}</span>
                  <span className="mt-1 block text-[var(--color-ink-muted)]">{field.hint}</span>
                </span>
              </label>
            ) : field.kind === 'minutes' ? (
              <div key={field.key}>
                <label
                  htmlFor={`copy-${field.key}`}
                  className="block font-semibold text-[var(--color-plum)]"
                >
                  {field.label}
                </label>
                <p id={`copy-${field.key}-hint`} className="mt-0.5 text-sm text-[var(--color-ink-muted)]">
                  {field.hint}
                </p>
                <input
                  id={`copy-${field.key}`}
                  aria-describedby={`copy-${field.key}-hint`}
                  type="number"
                  inputMode="numeric"
                  min={FORFEIT_GRACE_MINUTES_RANGE.min}
                  max={FORFEIT_GRACE_MINUTES_RANGE.max}
                  step={1}
                  disabled={disabled}
                  value={String(draft[field.key])}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      [field.key]: Number(event.target.value),
                    }))
                  }
                  className="mt-2 w-32 rounded-[var(--radius-md)] border border-black/10 bg-white p-3 text-sm text-[var(--color-ink)] disabled:opacity-50"
                />
              </div>
            ) : (
              <div key={field.key}>
                <label
                  htmlFor={`copy-${field.key}`}
                  className="block font-semibold text-[var(--color-plum)]"
                >
                  {field.label}
                </label>
                <p id={`copy-${field.key}-hint`} className="mt-0.5 text-sm text-[var(--color-ink-muted)]">
                  {field.hint}
                </p>
                <textarea
                  id={`copy-${field.key}`}
                  aria-describedby={`copy-${field.key}-hint`}
                  rows={3}
                  disabled={disabled}
                  value={String(draft[field.key])}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, [field.key]: event.target.value }))
                  }
                  className="mt-2 w-full rounded-[var(--radius-md)] border border-black/10 bg-white p-3 text-sm text-[var(--color-ink)] disabled:opacity-50"
                />
              </div>
            ),
          )}
        </div>
      </SettingsCard>

      <SaveBar
        dirty={draftState.dirty}
        saving={draftState.saving}
        canSave={draftState.canSave}
        changes={draftState.changes}
        result={draftState.result}
        celebrate={draftState.celebrate}
        onSave={draftState.submit}
        onReset={draftState.reset}
      />
    </div>
  )
}
