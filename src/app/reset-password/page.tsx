'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui'
import { BaubleIcon } from '@/components/icons'
import { AuthShell } from '@/components/auth/AuthShell'
import { TextField } from '@/components/auth/FormField'
import { AlertBanner, DemoModeNotice } from '@/components/auth/DemoModeNotice'
import { createClient } from '@/lib/supabase/client'
import { isSupabaseConfigured } from '@/lib/supabase/config'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [checkingSession, setCheckingSession] = useState(isSupabaseConfigured())
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      return
    }
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session)
      setCheckingSession(false)
    })
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Use at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords don\u2019t match.')
      return
    }
    setLoading(true)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setDone(true)
    setTimeout(() => router.push('/dashboard'), 1800)
  }

  return (
    <AuthShell
      icon={<BaubleIcon size={26} />}
      eyebrow="Almost done"
      title="Choose a new password"
      subtitle="Pick something you'll remember for next Sunday."
    >
      {!isSupabaseConfigured() ? (
        <DemoModeNotice />
      ) : checkingSession ? (
        <p className="text-center text-sm text-[var(--color-ink-soft)]">Checking your reset link…</p>
      ) : done ? (
        <AlertBanner variant="success">Password updated! Taking you to your dashboard…</AlertBanner>
      ) : !hasSession ? (
        <AlertBanner>
          This reset link has expired or was already used. Head back to{' '}
          <a href="/forgot-password" className="font-semibold underline">
            forgot password
          </a>{' '}
          to request a new one.
        </AlertBanner>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          {error && <AlertBanner>{error}</AlertBanner>}
          <TextField
            label="New password"
            type="password"
            name="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            hint="At least 8 characters."
            placeholder="••••••••"
          />
          <TextField
            label="Confirm new password"
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="••••••••"
          />
          <Button type="submit" className="w-full" loading={loading}>
            Update password
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
