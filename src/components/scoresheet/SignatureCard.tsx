'use client'

import { useId, useState } from 'react'

import { Badge, Button } from '@/components/ui'
import {
  findSigner,
  formatAge,
  isSignatureNameMatch,
  type SignatureSlot,
} from '@/lib/scoresheet'
import type { ScoringPlayer, ScoringSide } from '@/lib/scoring'
import { cn } from '@/lib/cn'

export interface SignatureCardProps {
  slot: SignatureSlot
  /** What this pair is putting their name to, in one sentence. */
  agreement: string
  /** False when the sheet is not open for signatures. */
  open: boolean
  /** Why signing is unavailable, when it is. */
  lockedNote: string
  busy: boolean
  now: number
  /**
   * The signed-in account. Only this player may sign, because
   * `scoresheet_signatures` accepts a row only from the player it names —
   * offering anyone else the button is offering an action that will fail.
   */
  viewerId: string
  /** Demo mode has no database and no account, so anyone may drive the sheet. */
  anySignerAllowed: boolean
  /** True when this viewer may take the recorded signature back. */
  canWithdraw: boolean
  onSign: (side: ScoringSide, player: ScoringPlayer) => void
  onWithdraw: (side: ScoringSide) => void
  className?: string
}

/**
 * One pair's signature slot.
 *
 * Signing takes two deliberate acts — pick your own name out of your pair,
 * then type it — because a single tap is not agreement, and because the row
 * that lands in `scoresheet_signatures` has to name a specific person. The
 * exact wording of what is being agreed to sits directly above the button, not
 * behind a link.
 *
 * Only the signed-in player is offered the pen. The database accepts a
 * signature only from the account it names, so listing the whole pair invited
 * whoever held the phone to sign for their partner and be refused — the card
 * now says plainly that the other player has to sign in themselves.
 */
export function SignatureCard({
  slot,
  agreement,
  open,
  lockedNote,
  busy,
  now,
  viewerId,
  anySignerAllowed,
  canWithdraw,
  onSign,
  onWithdraw,
  className,
}: SignatureCardProps) {
  const groupId = useId()
  const [expanded, setExpanded] = useState(false)
  const [picked, setPicked] = useState<string>('')
  const [typed, setTyped] = useState('')
  const [error, setError] = useState('')

  const signed = slot.signature
  const eligible = anySignerAllowed
    ? slot.players
    : slot.players.filter((p) => p.id === viewerId && p.id !== '')
  // One candidate needs no choosing — pre-select so the only step left is
  // typing your name.
  const selected = picked || (eligible.length === 1 ? eligible[0].id : '')
  const player = eligible.find((p) => p.id === selected) ?? null
  const matches = player != null && isSignatureNameMatch(typed, player)

  function reset() {
    setExpanded(false)
    setPicked('')
    setTyped('')
    setError('')
  }

  function handleSign() {
    if (!player) {
      setError('Choose which of you is signing.')
      return
    }
    if (!isSignatureNameMatch(typed, player)) {
      const other = findSigner(typed, eligible)
      setError(
        other
          ? `That is ${other.name}’s name — select ${other.name} above, or type ${player.name} instead.`
          : `Type ${player.name} exactly as it appears above to sign.`,
      )
      return
    }
    setError('')
    onSign(slot.side, player)
    reset()
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-[var(--radius-lg)] border-2 p-4',
        signed
          ? 'border-[var(--color-brand-mint-dark)] bg-[var(--color-success-bg)]'
          : 'border-[var(--color-brand-lilac-light)] bg-white',
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3
          className="font-[family-name:var(--font-heading)] text-lg font-extrabold"
          style={{ color: 'var(--color-plum)' }}
        >
          {slot.teamName}
        </h3>
        <Badge status={signed ? 'approved' : 'pending'}>{signed ? 'Signed' : 'Not signed'}</Badge>
      </div>

      <p className="text-sm text-[var(--color-ink-soft)]">
        {slot.players.map((p) => p.name).join(' & ') || 'Pair to be confirmed'}
      </p>

      {signed ? (
        <>
          <p className="text-sm text-[var(--color-ink)]">
            <span className="font-semibold">{signed.playerName}</span> signed for this pair,{' '}
            {formatAge(signed.signedAt, now)}.
          </p>
          {open && canWithdraw ? (
            <div>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                disabled={busy}
                onClick={() => onWithdraw(slot.side)}
              >
                Take this signature back
              </Button>
            </div>
          ) : open ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              Only {signed.playerName} or a duty official for this match can take this signature
              back.
            </p>
          ) : null}
        </>
      ) : !open ? (
        <p className="text-sm text-[var(--color-ink-muted)]">{lockedNote}</p>
      ) : eligible.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-muted)]">
          {slot.players.length === 0
            ? 'This pair has no players on the roster yet, so nobody can sign for them.'
            : `Only ${slot.players
                .map((p) => p.name)
                .join(' or ')} can sign for this pair, from their own account. Hand them the phone and let them sign in — a signature typed by anyone else is refused by the database, not recorded.`}
        </p>
      ) : !expanded ? (
        <div>
          <Button variant="primary" size="sm" type="button" onClick={() => setExpanded(true)}>
            Sign for {slot.teamName}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="rounded-[var(--radius-md)] bg-[var(--color-frost-100)] px-3 py-2 text-sm text-[var(--color-ink)]">
            {agreement}
          </p>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-sm font-bold text-[var(--color-ink)]">
              Which of you is signing?
            </legend>
            {eligible.length === 0 ? (
              <p className="text-sm text-[var(--color-ink-muted)]">
                This pair has no players on the roster yet, so nobody can sign for them.
              </p>
            ) : (
              eligible.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-sm has-[:checked]:bg-[var(--color-brand-lilac-light)]/50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-brand-pink-dark)]"
                >
                  <input
                    type="radio"
                    name={`${groupId}-signer`}
                    value={p.id}
                    checked={selected === p.id}
                    onChange={() => {
                      setPicked(p.id)
                      setError('')
                    }}
                    className="h-4 w-4 accent-[var(--color-brand-pink-dark)]"
                  />
                  <span className="font-semibold text-[var(--color-ink)]">{p.name}</span>
                </label>
              ))
            )}
          </fieldset>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${groupId}-typed`}
              className="text-sm font-bold text-[var(--color-ink)]"
            >
              Type your full name to sign
            </label>
            <input
              id={`${groupId}-typed`}
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={typed}
              onChange={(event) => {
                setTyped(event.target.value)
                setError('')
              }}
              aria-describedby={error ? `${groupId}-error` : `${groupId}-hint`}
              aria-invalid={error.length > 0}
              placeholder={player ? player.name : 'Choose your name first'}
              disabled={eligible.length === 0}
              className="rounded-[var(--radius-md)] border-2 border-[var(--color-brand-lilac-light)] bg-white px-3 py-2 text-base text-[var(--color-ink)] focus-visible:border-[var(--color-brand-pink-dark)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-pink-dark)] disabled:opacity-60"
            />
            <p id={`${groupId}-hint`} className="text-xs text-[var(--color-ink-muted)]">
              Signing records your name and the time against this result.
            </p>
            {error ? (
              <p
                id={`${groupId}-error`}
                role="alert"
                className="text-sm font-semibold text-[var(--color-danger)]"
              >
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              type="button"
              onClick={handleSign}
              loading={busy}
              disabled={busy || !matches}
            >
              Sign as {player ? player.name : 'this pair'}
            </Button>
            <Button variant="ghost" size="sm" type="button" onClick={reset} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
