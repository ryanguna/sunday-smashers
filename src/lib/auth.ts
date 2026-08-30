import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import type { ProfileRow, UserRole, UserRoleRow } from '@/lib/supabase/types'
import type { User } from '@supabase/supabase-js'
import { loginRedirectPath } from '@/lib/auth-utils'

/**
 * Server-side auth helpers for Server Components, Route Handlers and
 * Server Actions. Everything here is safe to call in demo mode (no
 * Supabase env vars) — it simply resolves to "signed out" instead of
 * throwing, so pages that call `requireAuth()` etc. still render (redirect
 * to `/login`) rather than crashing the build/e2e run.
 *
 * The pure, dependency-free helpers (`isProfileComplete`, `loginRedirectPath`,
 * `sanitiseNextPath`) live in `./auth-utils` and are re-exported here so
 * server code can import everything from one place — but Client Components
 * must import them from `./auth-utils` directly, since this file pulls in
 * the server-only Supabase client (`next/headers`) and can't be bundled
 * for the browser.
 */
export { isProfileComplete, loginRedirectPath, sanitiseNextPath } from '@/lib/auth-utils'

/** Returns the current Supabase auth user, or `null` if signed out / demo mode. */
export async function getCurrentUser(): Promise<User | null> {
  if (!isSupabaseConfigured()) return null
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/** Alias kept for readability at call sites that only care about "is there a session". */
export async function getSession() {
  if (!isSupabaseConfigured()) return null
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session
}

/** Fetches the signed-in user's `profiles` row, or `null` if signed out / not found. */
export async function getProfile(): Promise<ProfileRow | null> {
  if (!isSupabaseConfigured()) return null
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  return data
}

/** All roles granted to the signed-in user (empty array if signed out / demo mode). */
export async function getUserRoles(): Promise<UserRole[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) return []
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id)
  return ((data ?? []) as Pick<UserRoleRow, 'role'>[]).map((row) => row.role)
}

export async function hasRole(role: UserRole): Promise<boolean> {
  const roles = await getUserRoles()
  return roles.includes(role)
}

export async function isAdmin(): Promise<boolean> {
  return hasRole('admin')
}

/**
 * The stand-in identity used by `requireAuth`/`requireRole` in demo mode.
 *
 * This is NOT a security hole. Demo mode means `isSupabaseConfigured()` is
 * false, so there is no database, no session store and no auth system at all —
 * there is nothing to authorise access *to*. Every Server Action in the app
 * short-circuits on the same check before it reaches `createClient()`, so no
 * write can occur either. The alternative (redirecting to `/login`) sends the
 * visitor to a sign-in form that cannot work, which made the entire admin
 * console, scoring and tabulator surfaces unreachable in the one mode that
 * runs with no setup.
 *
 * The moment real Supabase env vars are present this value is never
 * constructed and the genuine session checks below apply.
 */
const DEMO_USER = {
  id: '00000000-0000-0000-0000-000000000000',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'demo@sundaysmashers.example',
  app_metadata: {},
  user_metadata: { full_name: 'Demo Organiser' },
  created_at: '2026-01-01T00:00:00.000Z',
} as unknown as User

/** True when the app is running without Supabase configured. */
export function isDemoMode(): boolean {
  return !isSupabaseConfigured()
}

/**
 * Redirects to `/login?next=<path>` unless a session exists. Returns the
 * signed-in user. In demo mode, resolves to `DEMO_USER` so guarded pages
 * render their demo state instead of bouncing to an unusable login form.
 */
export async function requireAuth(currentPath: string): Promise<User> {
  if (!isSupabaseConfigured()) return DEMO_USER
  const user = await getCurrentUser()
  if (!user) {
    redirect(loginRedirectPath(currentPath))
  }
  return user
}

/**
 * Redirects unauthenticated users to `/login`, then unauthorised
 * (signed-in but lacking the role) users to the festive `/403` page.
 */
export async function requireRole(role: UserRole, currentPath: string): Promise<User> {
  const user = await requireAuth(currentPath)
  // In demo mode `requireAuth` returned the stand-in organiser; there are no
  // role rows to consult, so grant the role rather than bouncing to /403.
  if (!isSupabaseConfigured()) return user
  const roles = await getUserRoles()
  if (!roles.includes(role) && !roles.includes('admin')) {
    redirect('/403')
  }
  return user
}

export async function requireAdmin(currentPath: string): Promise<User> {
  return requireRole('admin', currentPath)
}
