'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui'
import { GiftIcon } from '@/components/icons'
import { AuthShell } from '@/components/auth/AuthShell'
import { TextField } from '@/components/auth/FormField'
import { AlertBanner, DemoModeNotice } from '@/components/auth/DemoModeNotice'
import { createClient } from '@/lib/supabase/client'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { ResendConfirmation, SpamFolderNote } from '../auth/ResendConfirmation'
import { isAlreadyRegisteredError, isEmailNotAuthorizedError } from '../auth/resend-cooldown'

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
  const [existingAccount, setExistingAccount] = useState(false)
  const [emailUndeliverable, setEmailUndeliverable] = useState(false)
  const doneRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Send focus to the confirmation once it appears, so a screen reader reads
  // "check your email" instead of leaving the user on a vanished form.
  useEffect(() => {
    if (submitted) doneRef.current?.focus()
  }, [submitted])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return
    setServerError(null)
    setExistingAccount(false)
    setEmailUndeliverable(false)
    const validation = validate(fullName, email, password, confirmPassword)
    setErrors(validation)
    if (Object.keys(validation).length > 0) return

    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/onboarding')}`,
      },
    })
    setLoading(false)
    if (error) {
      if (isAlreadyRegisteredError(error.message)) {
        setExistingAccount(true)
        return
      }
      if (isEmailNotAuthorizedError(error.message)) {
        setEmailUndeliverable(true)
        return
      }
      setServerError(error.message)
      return
    }
    // When the project has email confirmation switched off, Supabase signs the
    // player in immediately and sends nothing. Telling them to go and click a
    // link that will never arrive would strand someone who is, in fact,
    // already logged in.
    if (data.session) {
      router.replace('/onboarding')
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
        <div ref={doneRef} tabIndex={-1} className="outline-none">
          <AlertBanner variant="success">
            Almost there! We&apos;ve sent a confirmation link to <strong>{email}</strong> — click it
            to verify your account, then finish your player profile.
          </AlertBanner>
          <SpamFolderNote />
          <ResendConfirmation email={email} startOnCooldown className="mt-4" />
          <button
            type="button"
            onClick={() => setSubmitted(false)}
            className="mt-4 w-full text-sm font-semibold text-[var(--color-brand-pink-dark)] underline hover:no-underline"
          >
            Wrong email? Start again
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          {serverError && <AlertBanner>{serverError}</AlertBanner>}
          {emailUndeliverable && (
            <div
              role="alert"
              className="mb-4 rounded-[var(--radius-md)] bg-[var(--color-warn-bg)] p-3.5 text-sm text-[var(--color-warn)]"
            >
              <p className="font-[family-name:var(--font-heading)] font-bold">
                We can&apos;t email you just yet
              </p>
              <p className="mt-1.5 font-medium">
                This one is on us, not you — the tournament&apos;s email delivery
                isn&apos;t working right now, so the confirmation link can&apos;t
                reach <strong>{email}</strong>. Your details haven&apos;t been
                saved. Please let an organiser know, and try again once
                they&apos;ve sorted it.
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
                or{' '}
                <Link href="/forgot-password" className="font-semibold underline">
                  reset your password
                </Link>
                . Never confirmed your email? We can send that link again.
              </p>
              <ResendConfirmation email={email} className="mt-3" />
              <SpamFolderNote />
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
          <Button type="submit" className="mt-2 w-full" loading={loading} disabled={loading}>
            Create account
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
