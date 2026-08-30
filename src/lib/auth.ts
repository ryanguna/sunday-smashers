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
  // `ProfileRow` etc. in `src/lib/supabase/types.ts` are declared with `interface`, which
  // TypeScript's structural checks don't treat as satisfying `Record<string, unknown>` —
  // so the generated `Database['public']['Tables']` schema resolves to `never` for every
  // query result. Cast back to the real row shape rather than editing that (out-of-scope) file.
  return data as ProfileRow | null
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

/** Redirects to `/login?next=<path>` unless a session exists. Returns the signed-in user. */
export async function requireAuth(currentPath: string): Promise<User> {
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
  const roles = await getUserRoles()
  if (!roles.includes(role) && !roles.includes('admin')) {
    redirect('/403')
  }
  return user
}

export async function requireAdmin(currentPath: string): Promise<User> {
  return requireRole('admin', currentPath)
}
