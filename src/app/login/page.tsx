'use client'

import { Suspense, useState, type FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui'
import { ShuttlecockIcon } from '@/components/icons'
import { AuthShell } from '@/components/auth/AuthShell'
import { TextField } from '@/components/auth/FormField'
import { AlertBanner, DemoModeNotice } from '@/components/auth/DemoModeNotice'
import { createClient } from '@/lib/supabase/client'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { sanitiseNextPath } from '@/lib/auth-utils'
import {
  isEmailDeliveryError,
  isInvalidCredentialsError,
  isUnconfirmedEmailError,
} from '../auth/sign-in-errors'

/**
 * Sign in with an email address and a password. That is the only way in.
 *
 * The magic-link tab that used to live here is gone: the tournament has no SMTP
 * server, so "we'll email you a one-click link" was a button that could only
 * ever fail. Same for the confirmation-resend panel. `/forgot-password` is
 * still linked, but it now explains how to reach an organiser rather than
 * sending a reset email. See `docs/GO-LIVE.md`.
 */
function LoginForm() {
  const searchParams = useSearchParams()
  const next = sanitiseNextPath(searchParams.get('next'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)

    if (signInError) {
      setError(signInErrorMessage(signInError.message))
      return
    }

    // A full page load rather than a router push: the sign-in cookie has just
    // been written, and every guarded page is server-rendered against it.
    window.location.assign(next)
  }

  return (
    <AuthShell
      icon={<ShuttlecockIcon size={26} />}
      eyebrow="Welcome back"
      title="Sign in to Sunday Smashers"
      subtitle="Court's open — let's get you back in the game."
      footer={
        <>
          New here?{' '}
          <Link
            href="/signup"
            className="font-semibold text-[var(--color-brand-pink-dark)] hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      {!isSupabaseConfigured() ? (
        <DemoModeNotice />
      ) : (
        <>
          {error && <AlertBanner>{error}</AlertBanner>}

          <form onSubmit={handleSubmit} noValidate>
            <TextField
              label="Email"
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
            <TextField
              label="Password"
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
            />
            <div className="-mt-2 mb-4 text-right text-sm">
              <Link
                href="/forgot-password"
                className="text-[var(--color-brand-lilac-dark)] hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <Button type="submit" className="w-full" loading={loading} disabled={loading}>
              Sign in
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  )
}

/**
 * Turn a Supabase sign-in failure into something a player can act on.
 *
 * The two "shouldn't happen" branches exist because they are exactly the
 * failures that leave someone stuck with no route forward: neither can be
 * fixed by retrying, and neither can be fixed by an email we cannot send.
 */
function signInErrorMessage(message: string): string {
  if (isInvalidCredentialsError(message)) {
    return 'That email and password combo didn’t match. Double-check and try again — or ask an organiser to reset it for you.'
  }
  if (isUnconfirmedEmailError(message) || isEmailDeliveryError(message)) {
    return 'This account is waiting on an email confirmation, but the tournament doesn’t send email. Ask an organiser to confirm your account — see “Forgot password?” for who to contact.'
  }
  return message
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
