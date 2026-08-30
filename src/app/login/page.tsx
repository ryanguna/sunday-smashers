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

type Mode = 'password' | 'magic-link'

function LoginForm() {
  const searchParams = useSearchParams()
  const next = sanitiseNextPath(searchParams.get('next'))
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [magicLinkSent, setMagicLinkSent] = useState(false)

  async function handlePasswordSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (signInError) {
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
    setError(null)
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
      setError(otpError.message)
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
      {!isSupabaseConfigured() && <DemoModeNotice />}

      {isSupabaseConfigured() && (
        <>
          <div className="mb-5 flex rounded-[var(--radius-pill)] bg-[var(--color-brand-lilac-light)]/40 p-1 text-sm font-semibold">
            <button
              type="button"
              onClick={() => {
                setMode('password')
                setError(null)
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
                setMagicLinkSent(false)
              }}
              className={`flex-1 rounded-[var(--radius-pill)] py-2 transition ${mode === 'magic-link' ? 'bg-white text-[var(--color-plum)] shadow-[var(--shadow-soft)]' : 'text-[var(--color-ink-soft)]'}`}
            >
              Magic link ✨
            </button>
          </div>

          {error && <AlertBanner>{error}</AlertBanner>}

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
              <Button type="submit" className="w-full" loading={loading}>
                Sign in
              </Button>
            </form>
          ) : magicLinkSent ? (
            <AlertBanner variant="success">
              Check your inbox! We sent a magic link to <strong>{email}</strong> — click it to sign
              straight in.
            </AlertBanner>
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
              <Button type="submit" variant="festive" className="w-full" loading={loading}>
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
