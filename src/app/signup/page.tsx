'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui'
import { GiftIcon } from '@/components/icons'
import { AuthShell } from '@/components/auth/AuthShell'
import { TextField } from '@/components/auth/FormField'
import { AlertBanner, DemoModeNotice } from '@/components/auth/DemoModeNotice'
import { createClient } from '@/lib/supabase/client'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { isAlreadyRegisteredError, isEmailDeliveryError } from '../auth/sign-in-errors'

interface FormErrors {
  fullName?: string
  email?: string
  password?: string
  confirmPassword?: string
}

function validate(
  fullName: string,
  email: string,
  password: string,
  confirmPassword: string,
): FormErrors {
  const errors: FormErrors = {}
  if (fullName.trim().length < 2) errors.fullName = 'Tell us your full name (at least 2 characters).'
  if (!/^\S+@\S+\.\S+$/.test(email)) errors.email = 'That doesn\u2019t look like a valid email address.'
  if (password.length < 8) errors.password = 'Use at least 8 characters.'
  if (confirmPassword !== password) errors.confirmPassword = 'Passwords don\u2019t match.'
  return errors
}

/**
 * Create a player account and go straight to the profile questions.
 *
 * Email confirmation is switched **off** in the Supabase project, because the
 * tournament has no SMTP server to send the confirmation with. So signup now
 * has exactly one happy path: Supabase returns a session, and we move the
 * player on to `/onboarding`. The old "check your inbox" screen, its resend
 * button and its spam-folder note are gone — they described an email that will
 * never be sent.
 *
 * The address is still collected because it is the account's *identity* — it is
 * what you sign in with. It is never used to send anything.
 */
export default function SignupPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [existingAccount, setExistingAccount] = useState(false)
  const [confirmationRequired, setConfirmationRequired] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return
    setServerError(null)
    setExistingAccount(false)
    setConfirmationRequired(false)
    const validation = validate(fullName, email, password, confirmPassword)
    setErrors(validation)
    if (Object.keys(validation).length > 0) return

    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    setLoading(false)

    if (error) {
      if (isAlreadyRegisteredError(error.message)) {
        setExistingAccount(true)
        return
      }
      // Only reachable if someone switches "Confirm email" back on in Supabase
      // without wiring up an SMTP server. Say who to chase rather than showing
      // the raw "Error sending confirmation email".
      if (isEmailDeliveryError(error.message)) {
        setConfirmationRequired(true)
        return
      }
      setServerError(error.message)
      return
    }

    if (data.session) {
      // A full document load, not a router push. Sign-up has just written the
      // session cookie, and `/onboarding` is only useful to a request the
      // *server* can see it on. A client-side navigation reuses the router
      // cache built while this browser was signed out, so the new session is
      // invisible to every server component until the next hard load — which
      // is how finishing sign-up ended with "please sign in" while the header
      // was already showing the new player's name. `/login` learned this the
      // same way; see the comment beside `window.location.assign` there.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- discarding the client router cache is the point, not a side effect.
      window.location.assign('/onboarding')
      return
    }

    // Signup succeeded but Supabase withheld the session, which only happens
    // when confirmation is required. No email is coming, so send them to a
    // human instead of a dead "check your inbox" screen.
    setConfirmationRequired(true)
  }

  return (
    <AuthShell
      icon={<GiftIcon size={26} />}
      eyebrow="Join the smash"
      title="Create your account"
      subtitle="One quick sign-up and you're on the entry list for the Christmas Mini Tournament."
      footer={
        <>
          Already playing?{' '}
          <Link
            href="/login"
            className="font-semibold text-[var(--color-brand-pink-dark)] hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      {!isSupabaseConfigured() ? (
        <DemoModeNotice />
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          {serverError && <AlertBanner>{serverError}</AlertBanner>}

          {confirmationRequired && (
            <div
              role="alert"
              className="mb-4 rounded-[var(--radius-md)] bg-[var(--color-warn-bg)] p-3.5 text-sm text-[var(--color-warn)]"
            >
              <p className="font-[family-name:var(--font-heading)] font-bold">
                Your account needs an organiser to switch it on
              </p>
              <p className="mt-1.5 font-medium">
                This one is on us, not you. Sunday Smashers doesn&apos;t send email, so the
                confirmation step can&apos;t finish by itself.{' '}
                <Link href="/forgot-password" className="font-semibold underline">
                  Message an organiser
                </Link>{' '}
                and they&apos;ll activate <strong>{email}</strong> for you.
              </p>
            </div>
          )}

          {existingAccount && (
            <div
              role="alert"
              className="mb-4 rounded-[var(--radius-md)] bg-[var(--color-info-bg)] p-3.5 text-sm text-[var(--color-info)]"
            >
              <p className="font-[family-name:var(--font-heading)] font-bold">
                You&apos;re already on the list
              </p>
              <p className="mt-1.5 font-medium">
                <strong>{email}</strong> already has an account.{' '}
                <Link href="/login" className="font-semibold underline">
                  Sign in
                </Link>{' '}
                instead — and if you&apos;ve forgotten the password,{' '}
                <Link href="/forgot-password" className="font-semibold underline">
                  an organiser can reset it
                </Link>
                .
              </p>
            </div>
          )}

          <TextField
            label="Full name"
            name="fullName"
            autoComplete="name"
            required
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            error={errors.fullName}
            placeholder="Holly Smasher"
          />
          <TextField
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={errors.email}
            hint="This is how you sign in. We never send you email."
            placeholder="you@example.com"
          />
          <TextField
            label="Password"
            type="password"
            name="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={errors.password}
            hint="At least 8 characters. Write it down — we can't email you a reset link."
            placeholder="••••••••"
          />
          <TextField
            label="Confirm password"
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            error={errors.confirmPassword}
            placeholder="••••••••"
          />
          <Button type="submit" className="mt-2 w-full" loading={loading} disabled={loading}>
            Create account
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
