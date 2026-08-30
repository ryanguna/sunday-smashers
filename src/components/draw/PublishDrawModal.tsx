'use client'

import { useMemo, useState } from 'react'

import { Button, Modal } from '@/components/ui'
import { GiftIcon, HollyIcon, TrophyIcon } from '@/components/icons'
import { publishSafety, type ExistingMatchSummary } from '@/lib/draw-admin'
import { DrawAlert } from './DrawUI'

const DESTRUCTIVE_PHRASE = 'REPLACE'

export interface PublishConfirmation {
  confirmReplace: boolean
  confirmDestroyResults: boolean
}

/**
 * The "are you sure" gate in front of every publish.
 *
 * Publishing is what makes a draw public, so the modal always spells that
 * out. It then escalates: replacing an untouched draw needs one tick;
 * replacing a draw with recorded results needs a second tick *and* the word
 * REPLACE typed out, because those results are deleted for good.
 */
export interface PublishDrawModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (confirmation: PublishConfirmation) => void
  existing: readonly ExistingMatchSummary[]
  kind: 'round-robin' | 'knockout'
  fixtureCount: number
  divisionName: string
  busy?: boolean
}

/**
 * Unmounts entirely while closed, so every confirmation tick and the typed
 * REPLACE phrase reset themselves the next time it opens — no effect, no
 * chance of a stale confirmation carrying over into the next publish.
 */
export function PublishDrawModal(props: PublishDrawModalProps) {
  if (!props.open) return null
  return <PublishDrawModalContent {...props} />
}

function PublishDrawModalContent({
  open,
  onClose,
  onConfirm,
  existing,
  kind,
  fixtureCount,
  divisionName,
  busy = false,
}: PublishDrawModalProps) {
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [confirmDestroy, setConfirmDestroy] = useState(false)
  const [phrase, setPhrase] = useState('')

  const safety = useMemo(
    () =>
      publishSafety(existing, {
        confirmReplace,
        confirmDestroyResults: confirmDestroy,
      }),
    [existing, confirmReplace, confirmDestroy]
  )

  const phraseOk = !safety.destructive || phrase.trim().toUpperCase() === DESTRUCTIVE_PHRASE
  const canPublish = safety.canPublish && phraseOk && fixtureCount > 0

  const label = kind === 'round-robin' ? 'round robin draw' : 'knockout bracket'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Publish the ${label}?`}
      description={`${divisionName} — ${fixtureCount} fixture${fixtureCount === 1 ? '' : 's'}.`}
    >
      <div className="flex flex-col gap-3">
        <DrawAlert
          level="info"
          title="Publishing makes this draw public"
          detail="Players, the schedule page and the courtside TV all read from these fixtures the moment you publish. Everything before this button is a preview only."
        />

        {safety.existingCount > 0 && (
          <DrawAlert level={safety.level} title={safety.headline} detail={safety.detail} />
        )}

        {safety.requiresReplaceConfirmation && (
          <label className="flex items-start gap-2.5 rounded-[var(--radius-md)] bg-[var(--color-frost-100)] p-3 text-sm text-[var(--color-ink-soft)]">
            <input
              type="checkbox"
              checked={confirmReplace}
              onChange={(event) => setConfirmReplace(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-brand-pink-dark)]"
            />
            <span>
              <span className="font-bold text-[var(--color-plum)]">Regenerate and replace</span> the{' '}
              {safety.existingCount} fixture{safety.existingCount === 1 ? '' : 's'} already published
              for {divisionName}.
            </span>
          </label>
        )}

        {safety.destructive && (
          <div className="flex flex-col gap-2.5 rounded-[var(--radius-md)] bg-[var(--color-danger-bg)] p-3">
            <label className="flex items-start gap-2.5 text-sm text-[var(--color-danger)]">
              <input
                type="checkbox"
                checked={confirmDestroy}
                onChange={(event) => setConfirmDestroy(event.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-danger)]"
              />
              <span>
                I understand that{' '}
                <span className="font-bold">
                  {safety.resultCount} recorded result{safety.resultCount === 1 ? '' : 's'} will be
                  permanently deleted
                </span>{' '}
                and cannot be recovered.
              </span>
            </label>
            <label className="text-sm text-[var(--color-danger)]">
              <span className="mb-1 block font-bold">
                Type {DESTRUCTIVE_PHRASE} to confirm
              </span>
              <input
                type="text"
                value={phrase}
                onChange={(event) => setPhrase(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                aria-label={`Type ${DESTRUCTIVE_PHRASE} to confirm deleting recorded results`}
                className="w-full rounded-[var(--radius-md)] border border-[var(--color-danger)]/40 bg-white px-3 py-2 font-[family-name:var(--font-heading)] font-bold tracking-widest text-[var(--color-plum)] outline-none focus:ring-2 focus:ring-[var(--color-danger)]"
              />
            </label>
          </div>
        )}

        <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Not yet
          </Button>
          <Button
            variant={safety.destructive ? 'danger' : 'primary'}
            disabled={!canPublish}
            loading={busy}
            onClick={() =>
              onConfirm({ confirmReplace, confirmDestroyResults: confirmDestroy })
            }
          >
            {safety.destructive ? (
              <HollyIcon size={18} aria-hidden="true" />
            ) : kind === 'knockout' ? (
              <TrophyIcon size={18} aria-hidden="true" />
            ) : (
              <GiftIcon size={18} aria-hidden="true" />
            )}
            {safety.destructive ? 'Replace and publish' : 'Publish the draw'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
