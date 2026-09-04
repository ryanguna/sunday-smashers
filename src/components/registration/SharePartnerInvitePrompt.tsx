'use client'

import { useState, useSyncExternalStore } from 'react'

import { Button, Card } from '@/components/ui'
import { GiftIcon } from '@/components/icons'
import { cn } from '@/lib/cn'

export interface SharePartnerInvitePromptProps {
  /** Who the invite was addressed to, when we know. */
  partnerLabel?: string | null
  className?: string
}

/**
 * The nudge the app cannot send.
 *
 * A partner invite is stored, not delivered: this project has no mailer and no
 * SMS provider, so the only way an invited partner learns about it is by
 * signing up and looking at their dashboard. "Partner invite sent" therefore
 * promised something nothing was going to do, and a pair could sit
 * half-registered until someone noticed in December.
 *
 * Rather than pretend, hand the one person who *can* reach the partner — the
 * player who just typed their email — a message to send. They are already on
 * their phone, one tap from the group chat.
 *
 * The link is read from `window.location.origin` rather than an env var so it
 * is right on the preview deployments and on localhost too. It comes through
 * `useSyncExternalStore` with an empty server snapshot, which is how the rest
 * of this codebase reads browser-only values without a hydration mismatch.
 */
/** The origin never changes within a page's life, so there is nothing to watch. */
const subscribeNever = () => () => {}
const readOrigin = () => window.location.origin

export function SharePartnerInvitePrompt({
  partnerLabel,
  className,
}: SharePartnerInvitePromptProps) {
  const [copied, setCopied] = useState(false)
  const origin = useSyncExternalStore(subscribeNever, readOrigin, () => '')

  const link = `${origin}/register/invites`
  const message =
    `I've entered us in the Sunday Smashers Christmas tournament 🎄🏸 ` +
    `Sign up and accept the partner invite here: ${link}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 4000)
    } catch {
      // Clipboard access is refused on some in-app browsers and on any page
      // that is not a secure context. The message is on screen and selectable,
      // so say so instead of failing silently.
      setCopied(false)
    }
  }

  return (
    <Card
      variant="default"
      className={cn(
        'mt-5 border-2 border-[var(--color-brand-mint-dark)] bg-[var(--color-brand-mint-light)]/30',
        className,
      )}
    >
      <h3 className="flex items-center gap-2 text-lg font-bold text-[var(--color-plum)]">
        <GiftIcon size={20} aria-hidden="true" />
        Now go and tell {partnerLabel?.trim() ? partnerLabel : 'your partner'}
      </h3>
      <p className="mt-2 text-[var(--color-ink-soft)]">
        We’ve saved the invite, but we can’t message them for you — there’s no email or
        text going out. They’ll only see it once they sign up. Send them this:
      </p>

      <p
        className="mt-3 select-all rounded-[var(--radius-lg)] bg-white/90 px-3 py-2.5 text-sm text-[var(--color-ink)] break-words"
        data-testid="partner-invite-message"
      >
        {message}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" onClick={copy}>
          Copy the message
        </Button>
        <span role="status" aria-live="polite" className="text-sm font-semibold text-[var(--color-success)]">
          {copied ? 'Copied — paste it into your chat 🎄' : ''}
        </span>
      </div>
    </Card>
  )
}
