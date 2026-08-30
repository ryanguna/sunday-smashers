'use client'

import { useId, useState } from 'react'

import { Button, Modal } from '@/components/ui'

export interface DisputeDialogProps {
  open: boolean
  onClose: () => void
  /** Names the sheet, so nobody disputes the wrong match from a list. */
  matchLabel: string
  busy: boolean
  onSubmit: (reason: string) => void
}

const PROMPTS = [
  'The score is wrong',
  'A rally was recorded to the wrong pair',
  'The winner is recorded the wrong way round',
  'Something else',
]

/**
 * Disagreeing has to be as easy as agreeing.
 *
 * A pair who think the sheet is wrong must be able to say so and say *why*,
 * rather than being cornered into signing something they do not accept or
 * walking away and leaving the result unresolved. The reason is mandatory
 * because "disputed, no reason given" is not something the tabulator can act
 * on at the end of a long day.
 */
export function DisputeDialog({ open, onClose, matchLabel, busy, onSubmit }: DisputeDialogProps) {
  const id = useId()
  const [prompt, setPrompt] = useState(PROMPTS[0])
  const [detail, setDetail] = useState('')
  const [error, setError] = useState('')

  function handleSubmit() {
    const text = detail.trim()
    if (text.length < 4) {
      setError('Say what is wrong — the tabulator needs something to check.')
      return
    }
    setError('')
    onSubmit(`${prompt}: ${text}`)
    setPrompt(PROMPTS[0])
    setDetail('')
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Raise a dispute"
      description={`${matchLabel} — this sheet will not count towards the standings until it is sorted out.`}
    >
      <div className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-bold text-[var(--color-ink)]">
            What is the problem?
          </legend>
          {PROMPTS.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-sm has-[:checked]:bg-[var(--color-brand-lilac-light)]/50"
            >
              <input
                type="radio"
                name={`${id}-prompt`}
                value={option}
                checked={prompt === option}
                onChange={() => setPrompt(option)}
                className="h-4 w-4 accent-[var(--color-brand-pink-dark)]"
              />
              <span className="text-[var(--color-ink)]">{option}</span>
            </label>
          ))}
        </fieldset>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-detail`} className="text-sm font-bold text-[var(--color-ink)]">
            In your own words <span className="font-normal">(required)</span>
          </label>
          <textarea
            id={`${id}-detail`}
            rows={3}
            value={detail}
            onChange={(event) => {
              setDetail(event.target.value)
              setError('')
            }}
            aria-invalid={error.length > 0}
            aria-describedby={error ? `${id}-error` : undefined}
            placeholder="e.g. the last two rallies went to us, not to them"
            className="rounded-[var(--radius-md)] border-2 border-[var(--color-brand-lilac-light)] bg-white px-3 py-2 text-base text-[var(--color-ink)] focus-visible:border-[var(--color-brand-pink-dark)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-pink-dark)]"
          />
          {error ? (
            <p
              id={`${id}-error`}
              role="alert"
              className="text-sm font-semibold text-[var(--color-danger)]"
            >
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="danger"
            size="sm"
            type="button"
            onClick={handleSubmit}
            loading={busy}
            disabled={busy}
          >
            Record the dispute
          </Button>
          <Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  )
}
