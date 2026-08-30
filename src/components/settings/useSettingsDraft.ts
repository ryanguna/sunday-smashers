'use client'

import { useCallback, useMemo, useRef, useState, useTransition } from 'react'
import type { SettingsChange, SettingsIssue } from '@/lib/settings'

/**
 * Shared "edit a chunk of settings" state machine for every settings form.
 *
 * Holds the draft, works out whether it differs from what is saved, runs the
 * pure validators on every keystroke, and hands the draft to a Server Action
 * inside a transition. On success the saved baseline moves forward so the
 * unsaved-changes bar disappears.
 */

export interface DraftSaveResult {
  ok: boolean
  demo?: boolean
  message: string
  issues?: SettingsIssue[]
  changes?: SettingsChange[]
}

export interface UseSettingsDraftOptions<T> {
  initial: T
  /** Pure validator, re-run on every change. */
  validate: (draft: T) => SettingsIssue[]
  /** Field-level diff against the last saved value. */
  diff: (saved: T, draft: T) => SettingsChange[]
  /** Server Action. */
  save: (draft: T) => Promise<DraftSaveResult>
}

export interface SettingsDraft<T> {
  draft: T
  saved: T
  setDraft: (updater: T | ((current: T) => T)) => void
  changes: SettingsChange[]
  dirty: boolean
  issues: SettingsIssue[]
  errors: SettingsIssue[]
  warnings: SettingsIssue[]
  canSave: boolean
  saving: boolean
  /** Set after a save attempt; cleared as soon as the draft changes again. */
  result: DraftSaveResult | null
  celebrate: boolean
  submit: () => void
  reset: () => void
}

export function useSettingsDraft<T>({
  initial,
  validate,
  diff,
  save,
}: UseSettingsDraftOptions<T>): SettingsDraft<T> {
  const [saved, setSaved] = useState<T>(initial)
  const [draft, setDraftState] = useState<T>(initial)
  const [result, setResult] = useState<DraftSaveResult | null>(null)
  const [celebrate, setCelebrate] = useState(false)
  const [saving, startSaving] = useTransition()
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setDraft = useCallback((updater: T | ((current: T) => T)) => {
    setResult(null)
    setCelebrate(false)
    setDraftState((current) =>
      typeof updater === 'function' ? (updater as (value: T) => T)(current) : updater,
    )
  }, [])

  const issues = useMemo(() => validate(draft), [draft, validate])
  const changes = useMemo(() => diff(saved, draft), [saved, draft, diff])

  const errors = useMemo(() => issues.filter((issue) => issue.severity === 'error'), [issues])
  const warnings = useMemo(() => issues.filter((issue) => issue.severity === 'warning'), [issues])

  const submit = useCallback(() => {
    startSaving(async () => {
      const outcome = await save(draft)
      setResult(outcome)
      if (outcome.ok) {
        setSaved(draft)
        setCelebrate(true)
        if (celebrationTimer.current) clearTimeout(celebrationTimer.current)
        celebrationTimer.current = setTimeout(() => setCelebrate(false), 2600)
      }
    })
  }, [draft, save])

  const reset = useCallback(() => {
    setResult(null)
    setCelebrate(false)
    setDraftState(saved)
  }, [saved])

  return {
    draft,
    saved,
    setDraft,
    changes,
    dirty: changes.length > 0,
    issues,
    errors,
    warnings,
    canSave: changes.length > 0 && errors.length === 0 && !saving,
    saving,
    result,
    celebrate,
    submit,
    reset,
  }
}
