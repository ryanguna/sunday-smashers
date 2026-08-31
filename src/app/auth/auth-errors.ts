/**
 * Single source of truth for the `?error=` values `/auth/callback` puts on
 * `/login`, and the copy shown for each one.
 *
 * The callback route and the login page BOTH need this list. It lives here
 * so the codes can never drift apart: the route imports
 * `callbackErrorCodeFromParams` to decide what to emit, and the login page
 * imports `resolveAuthCallbackError` to decide what to render. Never
 * hand-write one of these strings anywhere else.
 *
 * Pure and dependency-free (no `next/*`, no Supabase) so it is safe in a
 * Route Handler, in a Client Component, and in vitest.
 */

export const AUTH_CALLBACK_ERROR_CODES = ['link_expired', 'link_invalid', 'verification_failed'] as const

export type AuthCallbackErrorCode = (typeof AUTH_CALLBACK_ERROR_CODES)[number]

export interface AuthErrorAction {
  label: string
  href: string
}

export interface AuthCallbackErrorMessage {
  code: AuthCallbackErrorCode
  /** Short headline, e.g. "That link has expired". */
  title: string
  /** Plain-English explanation of what happened. */
  body: string
  /** At least one way forward — never show one of these without an action. */
  actions: AuthErrorAction[]
}

const NEW_MAGIC_LINK: AuthErrorAction = { label: 'Send me a new sign-in link', href: '/login' }
const NEW_RESET_LINK: AuthErrorAction = { label: 'Reset my password', href: '/forgot-password' }
const START_SIGNUP: AuthErrorAction = { label: 'Create an account', href: '/signup' }

const MESSAGES: Record<AuthCallbackErrorCode, AuthCallbackErrorMessage> = {
  link_expired: {
    code: 'link_expired',
    title: 'That link has expired',
    body: 'Email links are only good for a short while, and each one can only be used once. Grab a fresh one below and you’ll be back on court in no time.',
    actions: [NEW_MAGIC_LINK, NEW_RESET_LINK],
  },
  link_invalid: {
    code: 'link_invalid',
    title: 'We couldn’t read that link',
    body: 'Some email apps trim links in half. Try opening the link again straight from the email, or ask us for a new one.',
    actions: [NEW_MAGIC_LINK, START_SIGNUP],
  },
  verification_failed: {
    code: 'verification_failed',
    title: 'We couldn’t sign you in with that link',
    body: 'Something went wrong finishing that sign-in — it may have already been used. A brand new link should sort it out.',
    actions: [NEW_MAGIC_LINK, NEW_RESET_LINK],
  },
}

export function isAuthCallbackErrorCode(value: unknown): value is AuthCallbackErrorCode {
  return typeof value === 'string' && (AUTH_CALLBACK_ERROR_CODES as readonly string[]).includes(value)
}

/**
 * Maps a `?error=` query value to the copy the login page renders. Unknown
 * or missing values return `null` (render nothing) rather than inventing a
 * scary message — except that any non-empty unrecognised value falls back to
 * the generic `verification_failed` copy, so a user is never left with a
 * silent form.
 */
export function resolveAuthCallbackError(value: string | null | undefined): AuthCallbackErrorMessage | null {
  if (!value) return null
  if (isAuthCallbackErrorCode(value)) return MESSAGES[value]
  return MESSAGES.verification_failed
}

export interface CallbackParams {
  /** The PKCE `code` param, if Supabase sent one. */
  code: string | null
  /** Supabase's own `error` param, e.g. `access_denied`. */
  error: string | null
  /** Supabase's own `error_code` param, e.g. `otp_expired`. */
  errorCode: string | null
  /** Message from a failed `exchangeCodeForSession` call, if we got that far. */
  exchangeErrorMessage?: string | null
}

/**
 * Decides which `AuthCallbackErrorCode` the callback route should redirect
 * with. Pure so the branching is unit-testable without a live Supabase.
 */
export function callbackErrorCodeFromParams({
  code,
  error,
  errorCode,
  exchangeErrorMessage,
}: CallbackParams): AuthCallbackErrorCode {
  const haystack = `${errorCode ?? ''} ${error ?? ''} ${exchangeErrorMessage ?? ''}`.toLowerCase()

  if (haystack.includes('otp_expired') || haystack.includes('expired')) return 'link_expired'
  if (error || errorCode || exchangeErrorMessage) return 'verification_failed'
  if (!code) return 'link_invalid'
  return 'verification_failed'
}

/** Builds the `/login?error=…` target, preserving where the user was headed. */
export function loginErrorPath(errorCode: AuthCallbackErrorCode, next?: string | null): string {
  const params = new URLSearchParams({ error: errorCode })
  if (next && next !== '/dashboard') params.set('next', next)
  return `/login?${params.toString()}`
}
