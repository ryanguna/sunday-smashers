/**
 * Pure helpers for reading Supabase Auth error messages on the sign-in and
 * sign-up screens.
 *
 * This module used to be `resend-cooldown.ts` and carried a whole family of
 * email-delivery detectors. The tournament has **no SMTP server**, so every
 * email-sending flow (confirmation, magic link, password reset) has been
 * removed from the app — see `docs/GO-LIVE.md`. What survives is the small set
 * of message checks that still apply to a password-only sign-in.
 *
 * Kept pure (no React, no Supabase) so `sign-in-errors.test.ts` can cover it.
 */

/** True when Supabase is telling us the address already has an account. */
export function isAlreadyRegisteredError(message: string | null | undefined): boolean {
  if (!message) return false
  const text = message.toLowerCase()
  return text.includes('already registered') || text.includes('user already exists')
}

/**
 * True when the credentials simply didn't match.
 *
 * Worth detecting separately because it is the one sign-in failure a player can
 * actually fix themselves, so it earns friendlier copy than the raw string.
 */
export function isInvalidCredentialsError(message: string | null | undefined): boolean {
  if (!message) return false
  const text = message.toLowerCase()
  return text.includes('invalid login') || text.includes('invalid credentials')
}

/**
 * True when the account exists but its email address was never confirmed.
 *
 * This should be unreachable: "Confirm email" is switched **off** in the
 * Supabase project precisely because we cannot send the confirmation. But if
 * someone turns it back on, a player would otherwise be handed the bare string
 * "Email not confirmed" and no way forward — there is no resend button any
 * more, and no email would arrive if there were. So we keep the check and point
 * them at a human instead.
 */
export function isUnconfirmedEmailError(message: string | null | undefined): boolean {
  if (!message) return false
  const text = message.toLowerCase()
  return (
    text.includes('not confirmed') ||
    text.includes('email_not_confirmed') ||
    text.includes('confirm your email')
  )
}

/**
 * True when Supabase failed while trying to send an email.
 *
 * Also meant to be unreachable, and for the same reason: with confirmation off
 * the app never asks Supabase to send anything. It stays as a safety net so a
 * misconfigured project produces "ask an organiser" rather than the raw
 * "Error sending confirmation email" that players saw before.
 */
export function isEmailDeliveryError(message: string | null | undefined): boolean {
  if (!message) return false
  const text = message.toLowerCase()
  if (text.includes('not authorized') || text.includes('not authorised')) return true
  return /error sending\b.*\bemail|error sending email/.test(text)
}
