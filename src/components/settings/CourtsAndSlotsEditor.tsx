'use client'

import { useCallback, useState } from 'react'
import { Button } from '@/components/ui'
import { TextField } from '@/components/auth'
import { SnowflakeIcon, SparkleIcon } from '@/components/icons'
import {
  diffCourts,
  diffTimeSlots,
  firstErrorFor,
  formatSydney,
  formatSydneyTime,
  fromDateTimeLocal,
  generateTimeSlots,
  newId,
  slotDurationMinutes,
  toDateTimeLocal,
  validateCourts,
  validateTimeSlots,
  type CourtSettings,
  type SettingsChange,
  type SettingsIssue,
  type TimeSlotSettings,
} from '@/lib/settings'
import { IssueList, SettingsCard, StatPill } from './Chrome'
import { SaveBar } from './SaveBar'
import { useSettingsDraft, type DraftSaveResult } from './useSettingsDraft'

export interface CourtsAndSlotsEditorProps {
  initialCourts: CourtSettings[]
  initialSlots: TimeSlotSettings[]
  /** Used as the default start when bulk-generating slots. */
  tournamentDate: string
  save: (input: { courts: CourtSettings[]; timeSlots: TimeSlotSettings[] }) => Promise<DraftSaveResult>
  readOnly?: boolean
}

interface Draft {
  courts: CourtSettings[]
  timeSlots: TimeSlotSettings[]
}

function validate(draft: Draft): SettingsIssue[] {
  return [...validateCourts(draft.courts), ...validateTimeSlots(draft.timeSlots)]
}

function diff(saved: Draft, draft: Draft): SettingsChange[] {
  return [...diffCourts(saved.courts, draft.courts), ...diffTimeSlots(saved.timeSlots, draft.timeSlots)]
}

export function CourtsAndSlotsEditor({
  initialCourts,
  initialSlots,
  tournamentDate,
  save,
  readOnly = false,
}: CourtsAndSlotsEditorProps) {
  const form = useSettingsDraft<Draft>({
    initial: { courts: initialCourts, timeSlots: initialSlots },
    validate,
    diff,
    save,
  })
  const { draft, setDraft, issues } = form

  const [generator, setGenerator] = useState({ start: toDateTimeLocal(tournamentDate), duration: 15, count: 8, gap: 0 })

  const updateCourt = useCallback(
    (id: string, patch: Partial<CourtSettings>) => {
      setDraft((current) => ({
        ...current,
        courts: current.courts.map((court) => (court.id === id ? { ...court, ...patch } : court)),
      }))
    },
    [setDraft],
  )

  const addCourt = useCallback(() => {
    setDraft((current) => ({
      ...current,
      courts: [
        ...current.courts,
        {
          id: newId('court', current.courts),
          name: `Court ${current.courts.length + 1}`,
          sortOrder: current.courts.length + 1,
        },
      ],
    }))
  }, [setDraft])

  const removeCourt = useCallback(
    (id: string) => {
      setDraft((current) => ({ ...current, courts: current.courts.filter((court) => court.id !== id) }))
    },
    [setDraft],
  )

  const updateSlot = useCallback(
    (id: string, patch: Partial<TimeSlotSettings>) => {
      setDraft((current) => ({
        ...current,
        timeSlots: current.timeSlots.map((slot) => (slot.id === id ? { ...slot, ...patch } : slot)),
      }))
    },
    [setDraft],
  )

  const addSlot = useCallback(() => {
    setDraft((current) => {
      const last = current.timeSlots[current.timeSlots.length - 1]
      const startMs = last ? Date.parse(last.endsAt) : Date.parse(tournamentDate)
      const duration = last ? slotDurationMinutes(last) || 15 : 15
      return {
        ...current,
        timeSlots: [
          ...current.timeSlots,
          {
            id: newId('slot', current.timeSlots),
            startsAt: new Date(startMs).toISOString(),
            endsAt: new Date(startMs + duration * 60_000).toISOString(),
            label: `Slot ${current.timeSlots.length + 1}`,
          },
        ],
      }
    })
  }, [setDraft, tournamentDate])

  const removeSlot = useCallback(
    (id: string) => {
      setDraft((current) => ({ ...current, timeSlots: current.timeSlots.filter((slot) => slot.id !== id) }))
    },
    [setDraft],
  )

  const regenerate = useCallback(() => {
    const slots = generateTimeSlots({
      startsAt: fromDateTimeLocal(generator.start) || tournamentDate,
      durationMinutes: generator.duration,
      count: generator.count,
      gapMinutes: generator.gap,
    })
    if (slots.length === 0) return
    setDraft((current) => ({ ...current, timeSlots: slots }))
  }, [generator, setDraft, tournamentDate])

  const totalCapacity = draft.courts.length * draft.timeSlots.length

  return (
    <div className="space-y-5">
      <SettingsCard
        title="Courts"
        description="Every court the tournament can run matches on."
        icon={<SnowflakeIcon size={20} />}
        tone="sky"
        meta={<StatPill label="Match slots" value={totalCapacity} />}
      >
        <ul className="space-y-3">
          {draft.courts.map((court, index) => (
            <li
              key={court.id}
              className="flex flex-wrap items-end gap-3 rounded-[var(--radius-md)] bg-[var(--color-frost-100)] p-3"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white font-[family-name:var(--font-heading)] font-bold text-[var(--color-brand-sky-dark)]">
                {index + 1}
              </span>
              <div className="min-w-[10rem] flex-1">
                <TextField
                  label="Court name"
                  value={court.name}
                  onChange={(event) => updateCourt(court.id, { name: event.target.value })}
                  error={firstErrorFor(issues, `courts.${court.id}.name`)}
                  disabled={readOnly}
                  className="mb-0"
                />
              </div>
              <div className="w-28">
                <TextField
                  label="Order"
                  type="number"
                  min={1}
                  value={court.sortOrder}
                  onChange={(event) =>
                    updateCourt(court.id, { sortOrder: Number.parseInt(event.target.value, 10) || 1 })
                  }
                  disabled={readOnly}
                />
              </div>
              {!readOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mb-4 text-[var(--color-danger)]"
                  onClick={() => removeCourt(court.id)}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>

        {!readOnly && (
          <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={addCourt}>
            <SparkleIcon size={16} aria-hidden="true" />
            Add court
          </Button>
        )}

        <IssueList issues={issues.filter((issue) => issue.path.startsWith('courts'))} />
      </SettingsCard>

      <SettingsCard
        title="Time slots"
        description="The running order the scheduler drops matches into."
        icon={<SnowflakeIcon size={20} />}
        tone="lilac"
        meta={<StatPill label="Slots" value={draft.timeSlots.length} />}
      >
        {!readOnly && (
          <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-brand-lilac-light)] bg-[var(--color-frost)] p-4">
            <p className="mb-2 font-[family-name:var(--font-heading)] font-bold text-[var(--color-plum)]">
              Generate a run of slots
            </p>
            <div className="grid gap-x-3 sm:grid-cols-4">
              <TextField
                label="First slot starts"
                type="datetime-local"
                value={generator.start}
                onChange={(event) => setGenerator((g) => ({ ...g, start: event.target.value }))}
              />
              <TextField
                label="Minutes each"
                type="number"
                min={5}
                max={120}
                value={generator.duration}
                onChange={(event) =>
                  setGenerator((g) => ({ ...g, duration: Number.parseInt(event.target.value, 10) || 0 }))
                }
              />
              <TextField
                label="How many"
                type="number"
                min={1}
                max={60}
                value={generator.count}
                onChange={(event) =>
                  setGenerator((g) => ({ ...g, count: Number.parseInt(event.target.value, 10) || 0 }))
                }
              />
              <TextField
                label="Gap (minutes)"
                type="number"
                min={0}
                max={60}
                value={generator.gap}
                onChange={(event) =>
                  setGenerator((g) => ({ ...g, gap: Number.parseInt(event.target.value, 10) || 0 }))
                }
              />
            </div>
            <Button type="button" variant="festive" size="sm" onClick={regenerate}>
              Replace all slots
            </Button>
          </div>
        )}

        <ul className="space-y-3">
          {draft.timeSlots.map((slot) => (
            <li
              key={slot.id}
              className="flex flex-wrap items-end gap-3 rounded-[var(--radius-md)] bg-[var(--color-frost-100)] p-3"
            >
              <div className="w-36">
                <TextField
                  label="Label"
                  value={slot.label}
                  onChange={(event) => updateSlot(slot.id, { label: event.target.value })}
                  disabled={readOnly}
                />
              </div>
              <div className="min-w-[13rem] flex-1">
                <TextField
                  label="Starts"
                  type="datetime-local"
                  value={toDateTimeLocal(slot.startsAt)}
                  onChange={(event) => updateSlot(slot.id, { startsAt: fromDateTimeLocal(event.target.value) })}
                  error={firstErrorFor(issues, `timeSlots.${slot.id}.startsAt`)}
                  disabled={readOnly}
                />
              </div>
              <div className="min-w-[13rem] flex-1">
                <TextField
                  label="Ends"
                  type="datetime-local"
                  value={toDateTimeLocal(slot.endsAt)}
                  onChange={(event) => updateSlot(slot.id, { endsAt: fromDateTimeLocal(event.target.value) })}
                  error={firstErrorFor(issues, `timeSlots.${slot.id}.endsAt`)}
                  disabled={readOnly}
                />
              </div>
              <p className="mb-4 min-w-[8rem] text-sm text-[var(--color-ink-muted)]">
                {formatSydneyTime(slot.startsAt)} · {slotDurationMinutes(slot)} min
              </p>
              {!readOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mb-4 text-[var(--color-danger)]"
                  onClick={() => removeSlot(slot.id)}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>

        {!readOnly && (
          <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={addSlot}>
            <SparkleIcon size={16} aria-hidden="true" />
            Add slot
          </Button>
        )}

        <p className="mt-3 text-sm text-[var(--color-ink-soft)]">
          {draft.timeSlots.length > 0
            ? `First serve ${formatSydney(draft.timeSlots[0].startsAt)}, last slot ends ${formatSydneyTime(
                draft.timeSlots[draft.timeSlots.length - 1].endsAt,
              )}. That is ${totalCapacity} playable match slots across ${draft.courts.length} court${
                draft.courts.length === 1 ? '' : 's'
              }.`
            : 'No slots yet — generate a run above and the scheduler has somewhere to put every match.'}
        </p>

        <IssueList issues={issues.filter((issue) => issue.path.startsWith('timeSlots'))} />
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
        blockedReason={
          form.dirty && form.errors.length > 0 ? 'Fix the highlighted fields before saving.' : undefined
        }
      />
    </div>
  )
}
