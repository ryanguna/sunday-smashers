'use client'

import { useState } from 'react'

import { Badge, Button, Modal } from '@/components/ui'
import { cn } from '@/lib/cn'
import {
  describeResultChange,
  draftFromRow,
  MATCH_STATUS_BLURBS,
  MATCH_STATUS_LABELS,
  needsOffender,
  normalisesScore,
  overwritesVerifiedScoresheet,
  resolveResult,
  SETTABLE_MATCH_STATUSES,
  summariseResult,
  suggestWinner,
  teamForSide,
  validateResult,
  type AdminMatchRow,
  type MatchResultPatch,
  type MatchSide,
  type ResultDraft,
  type SettableMatchStatus,
} from '@/lib/match-admin'

/**
 * The result override dialog.
 *
 * Nothing here computes a result: the draft goes straight to
 * `resolveResult()` / `validateResult()` in `@/lib/match-admin`, and the
 * before/after table the admin approves is rendered from the very patch that
 * will be written. There is deliberately no second implementation of the
 * scoring rules in the UI to drift out of step with the tested one.
 */

const fieldLabel = 'mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]'
const inputClasses =
  'w-full rounded-[var(--radius-md)] border border-[var(--color-brand-lilac-light)] bg-white px-3 py-2 text-sm font-semibold text-[var(--color-plum)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-pink-dark)]'

function SideChoice({
  name,
  legend,
  hint,
  row,
  value,
  onChange,
}: {
  name: string
  legend: string
  hint?: string
  row: AdminMatchRow
  value: MatchSide | null
  onChange: (side: MatchSide) => void
}) {
  return (
    <fieldset>
      <legend className={fieldLabel}>{legend}</legend>
      {hint && <p className="mb-1.5 text-xs text-[var(--color-ink-soft)]">{hint}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {(['a', 'b'] as const).map((side) => (
          <label
            key={side}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-sm font-semibold',
              value === side
                ? 'border-[var(--color-brand-pink-dark)] bg-[var(--color-brand-pink-light)] text-[var(--color-brand-pink-dark)]'
                : 'border-[var(--color-brand-lilac-light)] bg-white text-[var(--color-plum)]',
            )}
          >
            <input
              type="radio"
              name={name}
              value={side}
              checked={value === side}
              onChange={() => onChange(side)}
              className="h-6 w-6 accent-[var(--color-brand-pink-dark)]"
            />
            {teamForSide(row, side).name}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function MatchesResultDialog({
  row,
  open,
  saving,
  onClose,
  onSave,
}: {
  row: AdminMatchRow | null
  open: boolean
  saving: boolean
  onClose: () => void
  onSave: (input: { patch: MatchResultPatch; summary: string; overwroteVerified: boolean }) => void
}) {
  const [draft, setDraft] = useState<ResultDraft | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)

  // Seeding from the row on open, without an effect: the row id is the key
  // for "this is a different match", checked during render rather than after
  // a commit, so the dialog never flashes another match's numbers.
  const [seededFor, setSeededFor] = useState<string | null>(null)
  if (row && seededFor !== row.id) {
    setSeededFor(row.id)
    setDraft(draftFromRow(row))
    setAcknowledged(false)
  }

  if (!row || !draft) return null

  function patchDraft(partial: Partial<ResultDraft>) {
    setDraft((current) => (current ? { ...current, ...partial } : current))
  }

  const patch = resolveResult(row, draft)
  const validation = validateResult(row, draft)
  const changes = describeResultChange(row, patch)
  const summary = summariseResult(row, patch)
  const overwrites = overwritesVerifiedScoresheet(row, patch)
  const blocked = !validation.ok || (overwrites && !acknowledged)

  const showScores = draft.status === 'completed' || draft.status === 'retired'
  const normalised = normalisesScore(draft.status)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Set the result"
      description={`${row.teamA.name} v ${row.teamB.name} — ${row.divisionName}`}
      className="max-w-2xl"
    >
      <div className="flex flex-col gap-4">
        {/* The shared Modal centres itself and does not scroll, so on a phone
            a tall dialog would put the save button off-screen for good. The
            body scrolls; the buttons stay put. */}
        <div className="-mr-1 max-h-[58svh] space-y-4 overflow-y-auto pr-1">
          <fieldset>
            <legend className={fieldLabel}>What happened?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {SETTABLE_MATCH_STATUSES.map((status: SettableMatchStatus) => (
                <label
                  key={status}
                  className={cn(
                    'flex cursor-pointer gap-2 rounded-[var(--radius-md)] border p-2.5 text-sm',
                    draft.status === status
                      ? 'border-[var(--color-brand-pink-dark)] bg-[var(--color-brand-pink-light)]'
                      : 'border-[var(--color-brand-lilac-light)] bg-white',
                  )}
                >
                  <input
                    type="radio"
                    name="result-status"
                    value={status}
                    checked={draft.status === status}
                    onChange={() => patchDraft({ status })}
                    className="mt-0.5 h-6 w-6 shrink-0 accent-[var(--color-brand-pink-dark)]"
                  />
                  <span>
                    <span className="block font-bold text-[var(--color-plum)]">
                      {MATCH_STATUS_LABELS[status]}
                    </span>
                    <span className="block text-xs text-[var(--color-ink-soft)]">
                      {MATCH_STATUS_BLURBS[status]}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {needsOffender(draft.status) && (
            <SideChoice
              name="result-offender"
              legend={draft.status === 'retired' ? 'Which pair retired?' : 'Which pair did not play?'}
              hint={
                draft.status === 'retired'
                  ? 'They keep the points they had won. The other pair takes the match.'
                  : `The other pair is awarded ${row.pointsToWin}–0.`
              }
              row={row}
              value={draft.offender}
              onChange={(offender) => patchDraft({ offender })}
            />
          )}

          {showScores && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="result-score-a" className={fieldLabel}>
                  {row.teamA.name}
                </label>
                <input
                  id="result-score-a"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={draft.scoreA}
                  onChange={(event) => patchDraft({ scoreA: Number(event.target.value) })}
                  className={inputClasses}
                />
              </div>
              <div>
                <label htmlFor="result-score-b" className={fieldLabel}>
                  {row.teamB.name}
                </label>
                <input
                  id="result-score-b"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={draft.scoreB}
                  onChange={(event) => patchDraft({ scoreB: Number(event.target.value) })}
                  className={inputClasses}
                />
              </div>
            </div>
          )}

          {normalised && (
            <p className="rounded-[var(--radius-md)] bg-[var(--color-info-bg)] p-2.5 text-xs text-[var(--color-info)]">
              A {MATCH_STATUS_LABELS[draft.status].toLowerCase()} is scored {row.pointsToWin}–0, taken
              from this match&apos;s own rules rather than assumed.
            </p>
          )}

          {draft.status === 'completed' && (
            <SideChoice
              name="result-winner"
              legend="Who won?"
              hint="Stored on the match rather than worked out from the score, so a correction can never flip the wrong way."
              row={row}
              value={draft.winner ?? suggestWinner(draft.scoreA, draft.scoreB)}
              onChange={(winner) => patchDraft({ winner })}
            />
          )}

          {draft.status !== 'scheduled' && (
            <div>
              <label htmlFor="result-reason" className={fieldLabel}>
                Reason {needsOffender(draft.status) ? '' : '(optional)'}
              </label>
              <input
                id="result-reason"
                type="text"
                value={draft.reason}
                onChange={(event) => patchDraft({ reason: event.target.value })}
                placeholder="Rolled an ankle in the third rally"
                className={cn(inputClasses, 'font-normal')}
              />
            </div>
          )}

          <section aria-labelledby="result-preview-heading">
            <h3
              id="result-preview-heading"
              className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]"
              style={{ color: 'var(--color-ink-muted)' }}
            >
              What this will do
            </h3>
            <dl className="divide-y divide-black/5 rounded-[var(--radius-md)] bg-white p-3 text-sm">
              {changes.map((line) => (
                <div key={line.label} className="flex items-baseline justify-between gap-3 py-1.5">
                  <dt className="font-semibold text-[var(--color-ink-soft)]">{line.label}</dt>
                  <dd className="text-right">
                    {line.changed ? (
                      <>
                        <span className="text-[var(--color-ink-muted)] line-through">{line.from}</span>{' '}
                        <span className="font-bold text-[var(--color-plum)]">{line.to}</span>
                      </>
                    ) : (
                      <span className="text-[var(--color-ink-soft)]">{line.to}</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-sm font-semibold text-[var(--color-plum)]">{summary}</p>
          </section>

          {validation.errors.length > 0 && (
            <ul className="space-y-1 rounded-[var(--radius-md)] bg-[var(--color-danger-bg)] p-3 text-sm text-[var(--color-danger)]">
              {validation.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}

          {validation.warnings.length > 0 && (
            <ul className="space-y-1 rounded-[var(--radius-md)] bg-[var(--color-warn-bg)] p-3 text-sm text-[var(--color-warn)]">
              {validation.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}

          {overwrites && (
            <div className="rounded-[var(--radius-md)] bg-[var(--color-danger-bg)] p-3 text-sm text-[var(--color-danger)]">
              <p className="font-bold">
                <Badge status="approved" className="mr-1.5">
                  Verified
                </Badge>
                This overwrites a verified scoresheet.
              </p>
              <p className="mt-1">
                A tabulator has already signed this result off. Changing it changes the standings that
                decide who reaches the semi-finals.
              </p>
              <label className="mt-2 flex cursor-pointer items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  className="h-6 w-6 accent-[var(--color-danger)]"
                />
                I understand, and I still want to change it.
              </label>
            </div>
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
              onSave({ patch, summary, overwroteVerified: overwrites })
            }
          >
            Save this result
          </Button>
        </div>
      </div>
    </Modal>
  )
}
