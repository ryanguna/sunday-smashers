'use client'

import { useCallback, useState } from 'react'
import { TextField } from '@/components/auth'
import { BaubleIcon, HollyIcon, SnowflakeIcon } from '@/components/icons'
import {
  diffDetails,
  firstErrorFor,
  formatSydney,
  fromDateTimeLocal,
  toDateTimeLocal,
  validateTournamentDetails,
  type SettingsChange,
  type TournamentDetails,
} from '@/lib/settings'
import { formatEntryFee, parseEntryFeeCents } from '@/lib/setup'
import { FieldGrid, IssueList, SettingsCard } from './Chrome'
import { SaveBar } from './SaveBar'
import { useSettingsDraft, type DraftSaveResult } from './useSettingsDraft'

export interface TournamentDetailsFormProps {
  initial: TournamentDetails
  save: (details: TournamentDetails) => Promise<DraftSaveResult>
  readOnly?: boolean
}

const diff = (saved: TournamentDetails, draft: TournamentDetails): SettingsChange[] =>
  diffDetails(saved, draft)

export function TournamentDetailsForm({ initial, save, readOnly = false }: TournamentDetailsFormProps) {
  const form = useSettingsDraft<TournamentDetails>({
    initial,
    validate: validateTournamentDetails,
    diff,
    save,
  })

  const { draft, setDraft, issues } = form

  const set = useCallback(
    <K extends keyof TournamentDetails>(key: K, value: TournamentDetails[K]) => {
      setDraft((current) => ({ ...current, [key]: value }))
    },
    [setDraft],
  )

  // The fee is typed as dollars but stored as integer cents. Keeping the raw
  // text lets someone type "2" on the way to "25" without the value snapping
  // to $2 under their cursor.
  const [feeText, setFeeTextRaw] = useState(() => (initial.entryFeeCents / 100).toFixed(2))
  const setFeeText = useCallback(
    (next: string) => {
      setFeeTextRaw(next)
      const cents = parseEntryFeeCents(next)
      if (cents !== null) set('entryFeeCents', cents)
    },
    [set],
  )

  const error = (path: string) => firstErrorFor(issues, path)

  return (
    <div className="space-y-5">
      <SettingsCard
        title="The essentials"
        description="What the whole site says about this tournament."
        icon={<BaubleIcon size={20} />}
        tone="pink"
      >
        <FieldGrid>
          <div className="sm:col-span-2">
            <TextField
              label="Tournament name"
              value={draft.name}
              onChange={(event) => set('name', event.target.value)}
              error={error('details.name')}
              disabled={readOnly}
              required
            />
          </div>
          <TextField
            label="Tournament day (first serve)"
            type="datetime-local"
            value={toDateTimeLocal(draft.tournamentDate)}
            onChange={(event) => set('tournamentDate', fromDateTimeLocal(event.target.value))}
            hint={`Currently ${formatSydney(draft.tournamentDate)} (Sydney time).`}
            error={error('details.tournamentDate')}
            disabled={readOnly}
          />
          <TextField
            label="Venue"
            value={draft.venueName}
            onChange={(event) => set('venueName', event.target.value)}
            placeholder="Sunday Smashers Badminton Hall"
            error={error('details.venueName')}
            disabled={readOnly}
          />
          <div className="sm:col-span-2">
            <TextField
              label="Venue address"
              value={draft.venueAddress}
              onChange={(event) => set('venueAddress', event.target.value)}
              placeholder="12 Tinsel Ave, Sydney"
              hint="Shown on the landing page and the printed scoresheets."
              disabled={readOnly}
            />
          </div>
          <div className="sm:col-span-2">
            <label
              htmlFor="details-description"
              className="mb-1.5 block text-sm font-semibold text-[var(--color-plum)]"
            >
              Description
            </label>
            <textarea
              id="details-description"
              rows={3}
              value={draft.description}
              onChange={(event) => set('description', event.target.value)}
              disabled={readOnly}
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-brand-lilac-light)] bg-white px-4 py-2.5 text-[var(--color-plum)] shadow-[var(--shadow-soft)] transition focus:border-[var(--color-brand-pink)] focus:ring-2 focus:ring-[var(--color-brand-pink-light)] focus:outline-none disabled:opacity-60"
            />
            <p className="mt-1 mb-4 text-xs text-[var(--color-ink-soft)]">
              The festive blurb on the landing page. Markdown is not rendered here.
            </p>
          </div>
        </FieldGrid>
      </SettingsCard>

      <SettingsCard
        title="Registration window"
        description="When pairs can enter."
        icon={<SnowflakeIcon size={20} />}
        tone="sky"
      >
        <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-warn)]/30 bg-[var(--color-warn-bg)] p-3.5 text-sm text-[var(--color-warn)]">
          <p className="flex items-center gap-2 font-[family-name:var(--font-heading)] font-bold">
            <HollyIcon size={18} aria-hidden="true" />
            Closing date needs committee confirmation
          </p>
          <p className="mt-1">
            The current closing date is an <strong>assumption</strong> — one week before the event, so
            there is time to finalise the draw. It was never announced in the draft rules. Set the real
            date and tick the box below once the committee has confirmed it.
          </p>
        </div>

        <FieldGrid>
          <TextField
            label="Registration opens"
            type="datetime-local"
            value={toDateTimeLocal(draft.registrationOpensAt)}
            onChange={(event) => set('registrationOpensAt', fromDateTimeLocal(event.target.value))}
            hint={formatSydney(draft.registrationOpensAt)}
            error={error('details.registrationOpensAt')}
            disabled={readOnly}
          />
          <TextField
            label="Registration closes"
            type="datetime-local"
            value={toDateTimeLocal(draft.registrationClosesAt)}
            onChange={(event) => set('registrationClosesAt', fromDateTimeLocal(event.target.value))}
            hint={formatSydney(draft.registrationClosesAt)}
            error={error('details.registrationClosesAt')}
            disabled={readOnly}
          />
        </FieldGrid>

        <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] bg-[var(--color-frost-100)] p-3.5">
          <input
            type="checkbox"
            checked={draft.registrationCloseConfirmed}
            onChange={(event) => set('registrationCloseConfirmed', event.target.checked)}
            disabled={readOnly}
            className="mt-0.5 h-6 w-6 shrink-0 accent-[var(--color-brand-pink-dark)]"
          />
          <span className="text-sm">
            <span className="block font-semibold text-[var(--color-plum)]">
              The committee has confirmed this closing date
            </span>
            <span className="text-[var(--color-ink-soft)]">
              Until this is ticked the date is treated as a placeholder and flagged across the admin
              console.
            </span>
          </span>
        </label>
      </SettingsCard>

      <SettingsCard
        title="Who to contact"
        description="Shown to players when something goes wrong."
        icon={<HollyIcon size={20} />}
        tone="mint"
      >
        <FieldGrid cols={3}>
          <TextField
            label="Contact name"
            value={draft.contactName}
            onChange={(event) => set('contactName', event.target.value)}
            placeholder="Sunday Smashers Committee"
            disabled={readOnly}
          />
          <TextField
            label="Contact email"
            type="email"
            value={draft.contactEmail}
            onChange={(event) => set('contactEmail', event.target.value)}
            placeholder="hello@sundaysmashers.example"
            error={error('details.contactEmail')}
            disabled={readOnly}
          />
          <TextField
            label="Contact phone"
            type="tel"
            value={draft.contactPhone}
            onChange={(event) => set('contactPhone', event.target.value)}
            placeholder="0412 345 678"
            disabled={readOnly}
          />
        </FieldGrid>

        <IssueList issues={issues} />
      </SettingsCard>

      <SettingsCard
        title="Entry fee & payment"
        description="What one player pays, and how they pay it. Both appear on /pay, which is where every “How to pay” button in the app sends them."
        icon={<HollyIcon size={20} />}
        tone="mint"
      >
        <FieldGrid>
          <TextField
            label="Entry fee per player"
            inputMode="decimal"
            value={feeText}
            onChange={(event) => setFeeText(event.target.value)}
            hint={`${formatEntryFee(draft.entryFeeCents)} each — ${formatEntryFee(draft.entryFeeCents * 2)} a pair.`}
            error={error('details.entryFeeCents')}
            disabled={readOnly}
          />
        </FieldGrid>
        <div className="mt-4">
          <label className="mb-1 block text-sm font-semibold text-[var(--color-ink)]" htmlFor="payment-instructions">
            How to pay
          </label>
          <textarea
            id="payment-instructions"
            rows={4}
            value={draft.paymentInstructions}
            onChange={(event) => set('paymentInstructions', event.target.value)}
            placeholder={'Bank transfer to Sunday Smashers\nBSB 000-000  Acct 1234 5678\nUse your name as the reference — or cash to any committee member at the hall.'}
            disabled={readOnly}
            className="w-full rounded-2xl border border-[var(--color-line)] bg-white px-4 py-3 text-[var(--color-ink)] outline-none focus:border-[var(--color-brand-lilac)]"
          />
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Shown verbatim on /pay. Leave blank and players are told to contact the committee instead.
          </p>
        </div>
      </SettingsCard>

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
    </div>
  )
}
