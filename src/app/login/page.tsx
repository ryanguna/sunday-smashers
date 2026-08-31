'use client'

import { Suspense, useEffect, useRef, useState, type FormEvent } from 'react'
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
import { resolveAuthCallbackError } from '../auth/auth-errors'
import { ResendConfirmation, SpamFolderNote } from '../auth/ResendConfirmation'
import { isUnconfirmedEmailError, isEmailNotAuthorizedError } from '../auth/resend-cooldown'

type Mode = 'password' | 'magic-link'

function LoginForm() {
  const searchParams = useSearchParams()
  const next = sanitiseNextPath(searchParams.get('next'))
  // `?error=` is set by /auth/callback when an emailed link can't be used.
  const linkError = resolveAuthCallbackError(searchParams.get('error'))
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const linkErrorRef = useRef<HTMLDivElement>(null)

  // Move focus onto the explanation so keyboard and screen-reader users land
  // on "why am I back here?" rather than silently on the email field.
  useEffect(() => {
    if (linkError) linkErrorRef.current?.focus()
  }, [linkError])

  async function handlePasswordSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return
    setError(null)
    setNeedsConfirmation(false)
    setLoading(true)
    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (signInError) {
      if (isUnconfirmedEmailError(signInError.message)) {
        setNeedsConfirmation(true)
        return
      }
      setError(
        signInError.message.toLowerCase().includes('invalid')
          ? 'That email and password combo didn\u2019t match. Double-check and try again, or reset your password below.'
          : signInError.message,
      )
      return
    }
    window.location.assign(next)
  }

  async function handleMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return
    setError(null)
    setNeedsConfirmation(false)
    setLoading(true)
    const supabase = createClient()
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })
    setLoading(false)
    if (otpError) {
      setError(
        isEmailNotAuthorizedError(otpError.message)
          ? 'We can’t email that link right now — the tournament’s email delivery isn’t working. Please let an organiser know, and try again once they’ve sorted it.'
          : otpError.message,
      )
      return
    }
    setMagicLinkSent(true)
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
          <Link href="/signup" className="font-semibold text-[var(--color-brand-pink-dark)] hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      {linkError && (
        <div
          ref={linkErrorRef}
          tabIndex={-1}
          role="alert"
          className="mb-4 rounded-[var(--radius-md)] bg-[var(--color-danger-bg)] p-3.5 text-sm text-[var(--color-danger)] outline-none"
        >
          <p className="font-[family-name:var(--font-heading)] font-bold">{linkError.title}</p>
          <p className="mt-1.5 font-medium">{linkError.body}</p>
          <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
            {linkError.actions.map((action) => (
              <li key={action.href}>
                <Link href={action.href} className="font-semibold underline">
                  {action.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isSupabaseConfigured() && <DemoModeNotice />}

      {isSupabaseConfigured() && (
        <>
          <div className="mb-5 flex rounded-[var(--radius-pill)] bg-[var(--color-brand-lilac-light)]/40 p-1 text-sm font-semibold">
            <button
              type="button"
              onClick={() => {
                setMode('password')
                setError(null)
                setNeedsConfirmation(false)
                setMagicLinkSent(false)
              }}
              className={`flex-1 rounded-[var(--radius-pill)] py-2 transition ${mode === 'password' ? 'bg-white text-[var(--color-plum)] shadow-[var(--shadow-soft)]' : 'text-[var(--color-ink-soft)]'}`}
            >
              Password
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('magic-link')
                setError(null)
                setNeedsConfirmation(false)
                setMagicLinkSent(false)
              }}
              className={`flex-1 rounded-[var(--radius-pill)] py-2 transition ${mode === 'magic-link' ? 'bg-white text-[var(--color-plum)] shadow-[var(--shadow-soft)]' : 'text-[var(--color-ink-soft)]'}`}
            >
              Magic link ✨
            </button>
          </div>

          {error && <AlertBanner>{error}</AlertBanner>}

          {needsConfirmation && (
            <div
              role="alert"
              className="mb-4 rounded-[var(--radius-md)] bg-[var(--color-info-bg)] p-3.5 text-sm text-[var(--color-info)]"
            >
              <p className="font-[family-name:var(--font-heading)] font-bold">
                Your email isn&apos;t confirmed yet
              </p>
              <p className="mt-1.5 font-medium">
                Click the link we emailed to <strong>{email}</strong> and you&apos;re in. Lost it?
                We&apos;ll happily send another.
              </p>
              <ResendConfirmation email={email} className="mt-3" />
              <SpamFolderNote />
            </div>
          )}

          {mode === 'password' ? (
            <form onSubmit={handlePasswordSignIn} noValidate>
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
                <Link href="/forgot-password" className="text-[var(--color-brand-lilac-dark)] hover:underline">
                  Forgot password?
                </Link>
              </div>
              <Button type="submit" className="w-full" loading={loading} disabled={loading}>
                Sign in
              </Button>
            </form>
          ) : magicLinkSent ? (
            <>
              <AlertBanner variant="success">
                Check your inbox! We sent a magic link to <strong>{email}</strong> — click it to sign
                straight in.
              </AlertBanner>
              <SpamFolderNote />
              <Button
                type="button"
                variant="ghost"
                className="mt-3 w-full"
                onClick={() => setMagicLinkSent(false)}
              >
                Wrong email? Try another
              </Button>
            </>
          ) : (
            <form onSubmit={handleMagicLink} noValidate>
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
              <p className="mb-4 text-sm text-[var(--color-ink-soft)]">
                No password needed — we&apos;ll email you a one-click sign-in link.
              </p>
              <Button type="submit" variant="festive" className="w-full" loading={loading} disabled={loading}>
                Send magic link
              </Button>
            </form>
          )}
        </>
      )}
    </AuthShell>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
