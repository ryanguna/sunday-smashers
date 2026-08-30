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

interface FormErrors {
  fullName?: string
  email?: string
  password?: string
  confirmPassword?: string
}

function validate(fullName: string, email: string, password: string, confirmPassword: string): FormErrors {
  const errors: FormErrors = {}
  if (fullName.trim().length < 2) errors.fullName = 'Tell us your full name (at least 2 characters).'
  if (!/^\S+@\S+\.\S+$/.test(email)) errors.email = 'That doesn\u2019t look like a valid email address.'
  if (password.length < 8) errors.password = 'Use at least 8 characters.'
  if (confirmPassword !== password) errors.confirmPassword = 'Passwords don\u2019t match.'
  return errors
}

export default function SignupPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setServerError(null)
    const validation = validate(fullName, email, password, confirmPassword)
    setErrors(validation)
    if (Object.keys(validation).length > 0) return

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/onboarding')}`,
      },
    })
    setLoading(false)
    if (error) {
      setServerError(
        error.message.toLowerCase().includes('already registered')
          ? 'That email is already registered — try signing in instead.'
          : error.message,
      )
      return
    }
    setSubmitted(true)
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
          <Link href="/login" className="font-semibold text-[var(--color-brand-pink-dark)] hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {!isSupabaseConfigured() ? (
        <DemoModeNotice />
      ) : submitted ? (
        <AlertBanner variant="success">
          Almost there! We&apos;ve sent a confirmation link to <strong>{email}</strong> — click it to
          verify your account, then finish your player profile.
        </AlertBanner>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          {serverError && <AlertBanner>{serverError}</AlertBanner>}
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
            hint="At least 8 characters."
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
          <Button type="submit" className="mt-2 w-full" loading={loading}>
            Create account
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
