'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import {
  RESEND_COOLDOWN_SECONDS,
  isRateLimitedError,
  resendButtonLabel,
  secondsUntilResendAllowed,
} from './resend-cooldown'

export interface ResendConfirmationProps {
  email: string
  /** Start already on cooldown (e.g. signup just sent the first email). */
  startOnCooldown?: boolean
  className?: string
}

/**
 * "Resend confirmation email" control, shared by the signup success screen
 * and the login page's "your email isn't confirmed yet" state so the copy and
 * the cooldown behave identically in both places.
 *
 * Guards against double-tapping (button is disabled while sending and for
 * `RESEND_COOLDOWN_SECONDS` afterwards) and announces the outcome via the
 * live region below the button. No-ops in demo mode.
 */
export function ResendConfirmation({ email, startOnCooldown = false, className }: ResendConfirmationProps) {
  const lastSentAtRef = useRef<number | null>(null)
  const [secondsRemaining, setSecondsRemaining] = useState(startOnCooldown ? RESEND_COOLDOWN_SECONDS : 0)
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null)

  // The countdown lives in a ref because `Date.now()` can't be read during
  // render; a single ticker keeps the button label honest.
  useEffect(() => {
    if (startOnCooldown && lastSentAtRef.current === null) {
      lastSentAtRef.current = Date.now()
    }
    const tick = () => setSecondsRemaining(secondsUntilResendAllowed(lastSentAtRef.current, Date.now()))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [startOnCooldown])

  const handleResend = useCallback(async () => {
    if (sending || secondsRemaining > 0 || !isSupabaseConfigured()) return
    setSending(true)
    setStatus(null)
    const supabase = createClient()
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    setSending(false)
    if (error) {
      setStatus({
        tone: 'danger',
        message: isRateLimitedError(error.message)
          ? 'We’ve sent a few already — give it a minute, then try again.'
          : `We couldn’t send that just now: ${error.message}`,
      })
      // Still start the cooldown so rapid retries don't make things worse.
      lastSentAtRef.current = Date.now()
      setSecondsRemaining(RESEND_COOLDOWN_SECONDS)
      return
    }
    lastSentAtRef.current = Date.now()
    setSecondsRemaining(RESEND_COOLDOWN_SECONDS)
    setStatus({ tone: 'success', message: `Sent! A fresh confirmation link is on its way to ${email}.` })
  }, [email, secondsRemaining, sending])

  const disabled = sending || secondsRemaining > 0

  return (
    <div className={className}>
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        onClick={handleResend}
        loading={sending}
        disabled={disabled}
      >
        {resendButtonLabel(secondsRemaining, sending)}
      </Button>
      <div aria-live="polite" className="mt-3">
        {status && (
          <p
            className={`text-sm font-medium ${
              status.tone === 'success' ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'
            }`}
          >
            {status.message}
          </p>
        )}
      </div>
    </div>
  )
}

/** The "look in your junk folder" nudge, worded the same everywhere. */
export function SpamFolderNote() {
  return (
    <p className="mt-3 text-sm text-[var(--color-ink-soft)]">
      Nothing in your inbox? Have a peek in your spam or junk folder — confirmation emails love to
      hide behind the tinsel.
    </p>
  )
}
