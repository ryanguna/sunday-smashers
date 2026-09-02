'use client'

import { useCallback } from 'react'

import { SparkleIcon } from '@/components/icons'
import {
  describeLiveStatus,
  diffLiveStatus,
  firstErrorFor,
  validateLiveStatus,
  type LiveStatus,
  type SettingsChange,
} from '@/lib/settings'
import { IssueList, SettingsCard } from './Chrome'
import { SaveBar } from './SaveBar'
import { useSettingsDraft, type DraftSaveResult } from './useSettingsDraft'

export interface GoLiveCardProps {
  initial: LiveStatus
  save: (status: LiveStatus) => Promise<DraftSaveResult>
  readOnly?: boolean
}

const diff = (saved: LiveStatus, draft: LiveStatus): SettingsChange[] => diffLiveStatus(saved, draft)

interface SwitchRowProps {
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}

function SwitchRow({ label, description, checked, disabled, onChange }: SwitchRowProps) {
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

/**
 * The two switches that take the site from "placeholder" to "live".
 *
 * These exist because the go-live runbook's last step had no button: the
 * `is_published` and `is_registration_open` columns decide whether the public
 * site sees anything real, and nothing in the console wrote to either. A
 * committee could finish setup, fill in every detail, and still have a site
 * that showed built-in defaults and told every player registration was closed.
 */
export function GoLiveCard({ initial, save, readOnly = false }: GoLiveCardProps) {
  const form = useSettingsDraft<LiveStatus>({
    initial,
    validate: validateLiveStatus,
    diff,
    save,
  })

  const { draft, setDraft, issues } = form

  const set = useCallback(
    <K extends keyof LiveStatus>(key: K, value: LiveStatus[K]) => {
      setDraft((current) => {
        const next = { ...current, [key]: value }
        // Unpublishing must take registration down with it, otherwise the
        // saved state is one the validator rejects and the committee is stuck
        // looking at an error they did not cause.
        if (key === 'isPublished' && value === false) next.isRegistrationOpen = false
        return next
      })
    },
    [setDraft],
  )

  return (
    <SettingsCard
      title="Going live"
      description="Until the tournament is published the public site shows placeholder details and nobody can register."
      icon={<SparkleIcon size={20} />}
      tone="gold"
    >
      <div className="space-y-3">
        <SwitchRow
          label="Publish this tournament"
          description="Puts the real name, date, venue, entry fee and contact details on the public site."
          checked={draft.isPublished}
          disabled={readOnly}
          onChange={(next) => set('isPublished', next)}
        />
        <SwitchRow
          label="Open the registration sheet now"
          description="Overrides the calendar so players can register straight away — useful for a test run. Turning it off puts registration back on the dates below."
          checked={draft.isRegistrationOpen}
          disabled={readOnly || !draft.isPublished}
          onChange={(next) => set('isRegistrationOpen', next)}
        />

        <p className="rounded-2xl bg-[var(--color-mint)]/25 px-4 py-3 text-sm text-[var(--color-ink-soft)]">
          <span className="font-semibold text-[var(--color-ink)]">Right now: </span>
          {describeLiveStatus(draft)}
        </p>

        {firstErrorFor(issues, 'tournament.is_registration_open') && <IssueList issues={issues} />}
      </div>

      <SaveBar
        dirty={form.dirty}
        saving={form.saving}
        canSave={form.canSave && !readOnly}
        changes={form.changes}
        result={form.result}
        celebrate={form.celebrate}
        onSave={form.submit}
        onReset={form.reset}
      />
    </SettingsCard>
  )
}
