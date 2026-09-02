import type { Metadata } from 'next'
import { requireAuth } from '@/lib/auth'
import { ChangePasswordForm } from './ChangePasswordForm'

/**
 * Signed-in only: never prerender. Without this the auth check runs at build
 * time (when there is no session) and the result is cached and served to
 * everyone. Most pages here are dynamic anyway because they read cookie-bound
 * data, but that is incidental — this states it.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Change password',
  description: 'Set a new password for your Sunday Smashers account.',
  robots: { index: false, follow: false },
}

/**
 * Guarded so an anonymous visitor is sent to sign in rather than shown a form
 * that could never work — the email it needs comes from the session.
 */
export default async function ChangePasswordPage() {
  const user = await requireAuth('/account/password')
  return <ChangePasswordForm email={user.email ?? ''} />
}
