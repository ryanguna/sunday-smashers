/**
 * Pure helpers for the "resend confirmation email" buttons on the signup and
 * login screens. Supabase rate-limits its own transactional email, and real
 * players will tap a button that seems to do nothing — so we hold the button
 * for a cooldown and say exactly how long is left.
 *
 * Kept pure (no React, no Supabase) so `resend-cooldown.test.ts` can cover it.
 */

/** Seconds a player must wait between confirmation-email sends. */
export const RESEND_COOLDOWN_SECONDS = 60

/** Seconds remaining before another resend is allowed. 0 means "go ahead". */
export function secondsUntilResendAllowed(
  lastSentAt: number | null,
  now: number,
  cooldownSeconds: number = RESEND_COOLDOWN_SECONDS,
): number {
  if (lastSentAt === null) return 0
  const elapsed = Math.floor((now - lastSentAt) / 1000)
  const remaining = cooldownSeconds - elapsed
  return remaining > 0 ? remaining : 0
}

export function canResend(
  lastSentAt: number | null,
  now: number,
  cooldownSeconds: number = RESEND_COOLDOWN_SECONDS,
): boolean {
  return secondsUntilResendAllowed(lastSentAt, now, cooldownSeconds) === 0
}

/** Button label for the current cooldown state. */
export function resendButtonLabel(secondsRemaining: number, sending: boolean): string {
  if (sending) return 'Sending…'
  if (secondsRemaining > 0) return `Resend in ${secondsRemaining}s`
  return 'Resend confirmation email'
}

/**
 * True when a sign-in / sign-up error means "this address exists but the
 * email address has never been confirmed" — the case where the only useful
 * thing we can offer is another confirmation email.
 */
export function isUnconfirmedEmailError(message: string | null | undefined): boolean {
  if (!message) return false
  const text = message.toLowerCase()
  return text.includes('not confirmed') || text.includes('email_not_confirmed') || text.includes('confirm your email')
}

/** True when Supabase is telling us the address already has an account. */
export function isAlreadyRegisteredError(message: string | null | undefined): boolean {
  if (!message) return false
  const text = message.toLowerCase()
  return text.includes('already registered') || text.includes('user already exists')
}

/** True when Supabase's own email rate limit kicked in. */
export function isRateLimitedError(message: string | null | undefined): boolean {
  if (!message) return false
  const text = message.toLowerCase()
  return text.includes('rate limit') || text.includes('too many requests') || text.includes('security purposes')
}

/**
 * True when the confirmation/magic-link email could not be delivered at all.
 *
 * Two different causes land here, because from the player's seat they are the
 * same event — no email is coming, and nothing they do will change that:
 *
 *  - **"Email address not authorized"** — a project with no custom SMTP will
 *    only deliver to the project's own organisation members.
 *  - **"Error sending confirmation email"** — custom SMTP *is* configured but
 *    the provider rejected the handoff (wrong SMTP password, a sender address
 *    that does not belong to the sending domain, an exhausted quota). Supabase
 *    returns this as a bare HTTP 500.
 *
 * The second is the one that bites in production, and it used to fall through
 * to the generic error path, so a player saw the raw string "Error sending
 * confirmation email" and no idea what to do next. Both now get copy that
 * names the committee as the fix, because a retry cannot help.
 *
 * Matching is deliberately broad across the "Error sending …" family — the
 * suffix varies by flow (confirmation, recovery, magic link, invite) and a
 * list of exact strings would silently stop matching when one is reworded.
 */
export function isEmailNotAuthorizedError(message: string | null | undefined): boolean {
  if (!message) return false
  const text = message.toLowerCase()
  if (text.includes('not authorized') || text.includes('not authorised')) return true
  // "Error sending confirmation email", "...recovery email", "...magic link email".
  // Guard against the rate-limit message, which is a different, temporary problem.
  if (isRateLimitedError(text)) return false
  return /error sending\b.*\bemail|error sending email/.test(text)
}
