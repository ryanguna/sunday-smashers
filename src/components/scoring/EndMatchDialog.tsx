'use client'

import { useState } from 'react'

import { Button, Modal } from '@/components/ui'
import { MATCH_END_KINDS, type MatchEndKind, type ScoringSide } from '@/lib/scoring'

export interface EndMatchDialogProps {
  open: boolean
  onClose: () => void
  teamAName: string
  teamBName: string
  onConfirm: (kind: MatchEndKind, losingSide: ScoringSide, reason: string) => void
}

/**
 * Forfeit, walkover and retirement — the endings the committee will actually
 * hit on the day.
 *
 * The question is asked as "which pair could not continue", because that is
 * how it is reported courtside; the winner and the awarded score are then
 * derived from the match's own `points_to_win` rather than typed in.
 */
export function EndMatchDialog({
  open,
  onClose,
  teamAName,
  teamBName,
  onConfirm,
}: EndMatchDialogProps) {
  const [kind, setKind] = useState<MatchEndKind>('forfeit')
  const [side, setSide] = useState<ScoringSide>('a')
  const [reason, setReason] = useState('')

  const submit = () => {
    onConfirm(kind, side, reason.trim())
    setReason('')
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="End the match early"
      description="Use this for a forfeit, a no-show or an injury. The score is worked out from the match rules."
    >
      <div className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-[family-name:var(--font-heading)] text-base font-bold text-[var(--color-plum)]">
            What happened?
          </legend>
          {MATCH_END_KINDS.map((option) => (
            <label
              key={option.kind}
              className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-brand-lilac-light)] px-3 py-2.5 has-[:checked]:border-[var(--color-brand-lilac-dark)] has-[:checked]:bg-[var(--color-brand-lilac-light)]/40"
            >
              <input
                type="radio"
                name="end-kind"
                value={option.kind}
                checked={kind === option.kind}
                onChange={() => setKind(option.kind)}
                className="mt-1 h-6 w-6 accent-[var(--color-brand-lilac-dark)]"
              />
              <span>
                <span className="block font-semibold text-[var(--color-plum)]">{option.label}</span>
                <span className="block text-sm text-[var(--color-ink-soft)]">{option.blurb}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-[family-name:var(--font-heading)] text-base font-bold text-[var(--color-plum)]">
            Which pair could not continue?
          </legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['a', teamAName],
                ['b', teamBName],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--color-brand-lilac-light)] px-4 py-2 has-[:checked]:border-[var(--color-brand-lilac-dark)] has-[:checked]:bg-[var(--color-brand-lilac-light)]/40"
              >
                <input
                  type="radio"
                  name="end-side"
                  value={value}
                  checked={side === value}
                  onChange={() => setSide(value)}
                  className="h-6 w-6 accent-[var(--color-brand-lilac-dark)]"
                />
                <span className="font-semibold text-[var(--color-plum)]">{label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="end-reason"
            className="font-[family-name:var(--font-heading)] text-base font-bold text-[var(--color-plum)]"
          >
            Note for the organisers <span className="font-normal">(optional)</span>
          </label>
          <input
            id="end-reason"
            type="text"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. rolled an ankle at 9–6"
            className="rounded-[var(--radius-md)] border border-[var(--color-brand-lilac-light)] px-3 py-2.5 text-base text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-lilac-dark)]"
          />
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={submit}>
            Record it
          </Button>
        </div>
      </div>
    </Modal>
  )
}
