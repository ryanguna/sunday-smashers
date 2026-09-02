'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui'
import { AuthShell } from '@/components/auth/AuthShell'
import { TextField } from '@/components/auth/FormField'
import { AlertBanner, DemoModeNotice } from '@/components/auth/DemoModeNotice'
import { BaubleIcon } from '@/components/icons'
import { createClient } from '@/lib/supabase/client'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { isInvalidCredentialsError } from '@/app/auth/sign-in-errors'
import { hasIssues, validateNewPassword, type PasswordIssues } from '@/lib/password'

/**
 * Change your own password.
 *
 * Until now the app had no way to change a password at all — not for a player,
 * not for an organiser. `/forgot-password` told players "an organiser will set
 * a new one for you, then change it from your dashboard", and neither half of
 * that sentence was true: there was no admin control and no dashboard control.
 * This is the second half.
 *
 * ## Why the current password is asked for
 *
 * `supabase.auth.updateUser({ password })` does not verify the old one, so on
 * its own this form would let anyone who found an unlocked phone take over the
 * account permanently. Re-authenticating with `signInWithPassword` first is
 * the check Supabase's own "secure password change" setting performs, done
 * client-side so it works without that setting being enabled on the project.
 *
 * Signing in again also refreshes the session, which is what makes the
 * subsequent `updateUser` reliable rather than dependent on how old the
 * current session is.
 */
export function ChangePasswordForm({ email }: { email: string }) {
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<PasswordIssues & { form?: string }>({})
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return

    const issues = validateNewPassword(password, confirmPassword, current)
    if (hasIssues(issues)) {
      setErrors(issues)
      return
    }
    setErrors({})
    setLoading(true)

    const supabase = createClient()
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email,
      password: current,
    })
    if (reauthError) {
      setLoading(false)
      setErrors({
        form: isInvalidCredentialsError(reauthError.message)
          ? 'That current password isn’t right. If you’ve forgotten it, ask an organiser.'
          : reauthError.message,
      })
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (updateError) {
      setErrors({ form: updateError.message })
      return
    }

    setCurrent('')
    setPassword('')
    setConfirmPassword('')
    setDone(true)
  }

  return (
    <AuthShell
      icon={<BaubleIcon size={26} />}
      eyebrow="Your account"
      title="Change your password"
      subtitle={`Signed in as ${email}`}
      footer={
        <Link
          href="/dashboard"
          className="font-semibold text-[var(--color-brand-pink-dark)] hover:underline"
        >
          Back to my dashboard
        </Link>
      }
    >
      {!isSupabaseConfigured() ? (
        <DemoModeNotice />
      ) : (
        <>
          {done && (
            <div
              role="status"
              className="mb-4 rounded-[var(--radius-md)] bg-[var(--color-success-bg)] p-4 text-sm font-medium text-[var(--color-success)]"
            >
              Password changed. Use the new one next time you sign in.
            </div>
          )}
          {errors.form && <AlertBanner>{errors.form}</AlertBanner>}

          <form onSubmit={handleSubmit} noValidate>
            <TextField
              label="Current password"
              type="password"
              name="current-password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              placeholder="••••••••"
            />
            <TextField
              label="New password"
              type="password"
              name="new-password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={errors.password}
              hint="At least 8 characters."
              placeholder="••••••••"
            />
            <TextField
              label="Confirm new password"
              type="password"
              name="confirm-password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              error={errors.confirmPassword}
              placeholder="••••••••"
            />
            <Button type="submit" className="w-full" loading={loading} disabled={loading}>
              Change password
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  )
}
