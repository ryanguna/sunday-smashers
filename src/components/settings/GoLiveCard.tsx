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
import { IssueList, SettingsCard, SwitchRow } from './Chrome'
import { SaveBar } from './SaveBar'
import { useSettingsDraft, type DraftSaveResult } from './useSettingsDraft'

export interface GoLiveCardProps {
  initial: LiveStatus
  save: (status: LiveStatus) => Promise<DraftSaveResult>
  readOnly?: boolean
}

const diff = (saved: LiveStatus, draft: LiveStatus): SettingsChange[] => diffLiveStatus(saved, draft)

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
        // looking at an error they did not cause. Back to "follow the dates"
        // rather than "held shut": unpublishing says nothing about what should
        // happen once the tournament is published again.
        if (key === 'isPublished' && value === false) next.isRegistrationOpen = null
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

        {/* Three answers, not two. The old switch offered "open now" and
            "off", and described "off" as putting registration back on the
            dates — but the window treats an explicit `false` as "keep it
            shut", so the dates were never reached. A committee could set an
            opening date, be told it was in force, and watch the day pass with
            the sheet still closed. */}
        <div className="rounded-2xl border border-[var(--color-brand-lilac-light)] bg-white/60 px-4 py-3">
          <label
            htmlFor="registration-override"
            className="block text-sm font-semibold text-[var(--color-plum)]"
          >
            The registration sheet
          </label>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Normally the dates below decide. Override them for a test run, or to shut the sheet the
            moment the draw is built.
          </p>
          <select
            id="registration-override"
            value={draft.isRegistrationOpen === null ? 'dates' : draft.isRegistrationOpen ? 'open' : 'shut'}
            disabled={readOnly || !draft.isPublished}
            onChange={(event) =>
              set(
                'isRegistrationOpen',
                event.target.value === 'dates' ? null : event.target.value === 'open',
              )
            }
            className="mt-3 w-full rounded-[var(--radius-md)] border border-[var(--color-brand-lilac-light)] bg-white px-4 py-2.5 text-[var(--color-plum)] shadow-[var(--shadow-soft)] focus:border-[var(--color-brand-pink)] focus:ring-2 focus:ring-[var(--color-brand-pink-light)] focus:outline-none disabled:opacity-60"
          >
            <option value="dates">Follow the dates below</option>
            <option value="open">Open it now, whatever the dates say</option>
            <option value="shut">Keep it shut, whatever the dates say</option>
          </select>
        </div>

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
