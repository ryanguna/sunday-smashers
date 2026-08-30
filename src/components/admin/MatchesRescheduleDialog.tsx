'use client'

import { useState } from 'react'

import { Button, Modal } from '@/components/ui'
import { cn } from '@/lib/cn'
import type {
  DutyOverride,
  PlacementMap,
  ScheduleCourt,
  ScheduleSlot,
  ScheduleTeam,
  SchedulableMatch,
} from '@/lib/schedule-admin'
import {
  previewReschedule,
  reschedulePatch,
  rescheduleWarnings,
  type AdminMatchRow,
  type ReschedulePatch,
} from '@/lib/match-admin'

/**
 * The move dialog: change a match's court and/or time slot.
 *
 * The clash rail is not written here. `previewReschedule()` runs the schedule
 * builder's own `analyseSchedule()` pass over the proposed layout and reports
 * only what the move *introduces*, so a pair booked into two courts at once —
 * or a player rostered to officiate a match they would now be playing in — is
 * caught by exactly the same rule the builder enforces, not a second copy of
 * it that can drift.
 */

const fieldLabel = 'mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]'
const selectClasses =
  'w-full rounded-[var(--radius-md)] border border-[var(--color-brand-lilac-light)] bg-white px-3 py-2 text-sm font-semibold text-[var(--color-plum)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-pink-dark)]'

export interface RescheduleContextData {
  matches: readonly SchedulableMatch[]
  placements: PlacementMap
  courts: readonly ScheduleCourt[]
  slots: readonly ScheduleSlot[]
  teams: readonly ScheduleTeam[]
  overrides: readonly DutyOverride[]
}

export function MatchesRescheduleDialog({
  row,
  context,
  open,
  saving,
  onClose,
  onSave,
}: {
  row: AdminMatchRow | null
  context: RescheduleContextData
  open: boolean
  saving: boolean
  onClose: () => void
  onSave: (input: { patch: ReschedulePatch; summary: string; conflicts: string[] }) => void
}) {
  const [courtId, setCourtId] = useState<string | null>(null)
  const [slotId, setSlotId] = useState<string | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [seededFor, setSeededFor] = useState<string | null>(null)

  if (row && seededFor !== row.id) {
    setSeededFor(row.id)
    setCourtId(row.courtId)
    setSlotId(row.slotId)
    setAcknowledged(false)
  }

  if (!row) return null

  const draft = { courtId, slotId }
  const preview = previewReschedule({
    match: row,
    draft,
    matches: context.matches,
    placements: context.placements,
    courts: context.courts,
    slots: context.slots,
    teams: context.teams,
    overrides: context.overrides,
  })

  const careWarnings = rescheduleWarnings(row)
  const conflictHeadlines = [...preview.blocking, ...preview.warnings].map(
    (conflict) => `${conflict.title}: ${conflict.detail}`,
  )
  const blocked = preview.unchanged || (preview.blocking.length > 0 && !acknowledged)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Move this match"
      description={`${row.teamA.name} v ${row.teamB.name} — currently ${preview.from}`}
      className="max-w-2xl"
    >
      <div className="flex flex-col gap-4">
        <div className="-mr-1 max-h-[58svh] space-y-4 overflow-y-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="reschedule-court" className={fieldLabel}>
                Court
              </label>
              <select
                id="reschedule-court"
                value={courtId ?? ''}
                onChange={(event) => setCourtId(event.target.value || null)}
                className={selectClasses}
              >
                <option value="">No court yet</option>
                {context.courts.map((court) => (
                  <option key={court.id} value={court.id}>
                    {court.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="reschedule-slot" className={fieldLabel}>
                Time slot
              </label>
              <select
                id="reschedule-slot"
                value={slotId ?? ''}
                onChange={(event) => setSlotId(event.target.value || null)}
                className={selectClasses}
              >
                <option value="">No time yet</option>
                {context.slots.map((slot) => (
                  <option key={slot.id} value={slot.id}>
                    {slot.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <dl className="rounded-[var(--radius-md)] bg-white p-3 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="font-semibold text-[var(--color-ink-soft)]">Moving from</dt>
              <dd className="text-[var(--color-ink-soft)]">{preview.from}</dd>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-3">
              <dt className="font-semibold text-[var(--color-ink-soft)]">Moving to</dt>
              <dd
                className={cn(
                  'font-bold',
                  preview.unchanged ? 'text-[var(--color-ink-soft)]' : 'text-[var(--color-plum)]',
                )}
              >
                {preview.to}
              </dd>
            </div>
          </dl>

          {preview.unchanged && (
            <p className="rounded-[var(--radius-md)] bg-[var(--color-info-bg)] p-3 text-sm text-[var(--color-info)]">
              That is where this match already is. Pick a different court or time.
            </p>
          )}

          {careWarnings.length > 0 && (
            <ul className="space-y-1 rounded-[var(--radius-md)] bg-[var(--color-warn-bg)] p-3 text-sm text-[var(--color-warn)]">
              {careWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}

          {preview.warnings.length > 0 && (
            <ul className="space-y-1 rounded-[var(--radius-md)] bg-[var(--color-warn-bg)] p-3 text-sm text-[var(--color-warn)]">
              {preview.warnings.map((conflict) => (
                <li key={conflict.id}>
                  <span className="font-bold">{conflict.title}.</span> {conflict.detail}
                </li>
              ))}
            </ul>
          )}

          {preview.blocking.length > 0 && (
            <div className="rounded-[var(--radius-md)] bg-[var(--color-danger-bg)] p-3 text-sm text-[var(--color-danger)]">
              <p className="font-bold">This move creates a clash.</p>
              <ul className="mt-1 space-y-1">
                {preview.blocking.map((conflict) => (
                  <li key={conflict.id}>
                    <span className="font-bold">{conflict.title}.</span> {conflict.detail}
                  </li>
                ))}
              </ul>
              <label className="mt-2 flex cursor-pointer items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  className="h-4 w-4 accent-[var(--color-danger)]"
                />
                Move it anyway — I will sort the clash out by hand.
              </label>
            </div>
          )}

          {preview.preExisting > 0 && preview.blocking.length === 0 && (
            <p className="text-xs text-[var(--color-ink-soft)]">
              The schedule already has {preview.preExisting} unresolved clash
              {preview.preExisting === 1 ? '' : 'es'} elsewhere. This move does not add to them.
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={blocked || saving}
            onClick={() =>
              onSave({
                patch: reschedulePatch(draft),
                summary: `Moved from ${preview.from} to ${preview.to}.`,
                conflicts: conflictHeadlines,
              })
            }
          >
            Move the match
          </Button>
        </div>
      </div>
    </Modal>
  )
}
