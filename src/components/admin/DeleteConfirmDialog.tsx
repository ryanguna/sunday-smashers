'use client'

import { useId, useState } from 'react'

import { Button, Modal } from '@/components/ui'
import { CONFIRM_WORD, type DeletionPlan } from '@/lib/admin-delete'

export interface DeleteConfirmDialogProps {
  open: boolean
  onClose: () => void
  plan: DeletionPlan
  /** Runs only after the organiser types the confirmation word. */
  onConfirm: () => void
  pending?: boolean
}

/**
 * The one dialog standing between an organiser and a permanent delete.
 *
 * It does two things a plain `confirm()` does not:
 *
 * - **Lists what actually disappears**, from `planRegistrationDeletion` or
 *   `analysePersonDeletion`, because in this schema deleting an entry also
 *   takes a payment record with it and deleting an account takes everything.
 * - **Requires the word typed out.** A yes/no dialog in a list of similar rows
 *   gets clicked through on reflex; the mistake worth catching is not "did you
 *   mean to delete" but "did you mean to delete *this one*".
 *
 * When the plan is blocked — your own account, the last admin — there is no
 * confirm button at all, only the reason.
 *
 * Callers must mount this only while a delete is actually pending, rather than
 * leaving it mounted and toggling `open`. That way the typed word cannot
 * survive from one target to the next and confirm a delete the organiser never
 * read — the guarantee comes from unmounting, not from a reset effect.
 */
export function DeleteConfirmDialog({
  open,
  onClose,
  plan,
  onConfirm,
  pending = false,
}: DeleteConfirmDialogProps) {
  const [typed, setTyped] = useState('')
  const inputId = useId()

  const matches = typed.trim().toUpperCase() === plan.confirmWord

  return (
    <Modal open={open} onClose={onClose} title={plan.title}>
      {plan.allowed ? (
        <div className="space-y-4">
          <ul className="space-y-2.5">
            {plan.effects.map((effect) => (
              <li
                key={effect.label}
                className={
                  effect.severe
                    ? 'rounded-[var(--radius-md)] border-2 border-[var(--color-danger)] bg-[var(--color-danger-bg)] p-3'
                    : 'rounded-[var(--radius-md)] bg-white/70 p-3'
                }
              >
                <p className="font-[family-name:var(--font-heading)] text-sm font-bold text-[var(--color-plum)]">
                  {effect.label}
                </p>
                <p className="mt-0.5 text-sm text-[var(--color-ink-soft)]">{effect.detail}</p>
              </li>
            ))}
          </ul>

          <div>
            <label
              htmlFor={inputId}
              className="block text-sm font-semibold text-[var(--color-plum)]"
            >
              Type <span className="font-mono">{plan.confirmWord}</span> to confirm
            </label>
            <input
              id={inputId}
              type="text"
              value={typed}
              autoComplete="off"
              onChange={(event) => setTyped(event.target.value)}
              className="mt-1.5 w-full rounded-[var(--radius-md)] border border-[var(--color-brand-lilac-light)] bg-white px-3 py-2.5 font-mono tracking-widest text-[var(--color-plum)]"
              placeholder={CONFIRM_WORD}
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Keep it
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={!matches || pending}
              loading={pending}
              onClick={onConfirm}
            >
              Delete permanently
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-ink-soft)]">{plan.blockedReason}</p>
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
