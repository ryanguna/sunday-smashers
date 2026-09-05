'use client'

import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import type { ProfileRow, RegistrationStatus, UserRole, UserRoleRow } from '@/lib/supabase/types'

export interface UseAuthResult {
  user: User | null
  profile: ProfileRow | null
  roles: UserRole[]
  /**
   * The viewer's most recent entry status, or `null` when they have not
   * entered (or the read failed). The header uses it to avoid offering a
   * dashboard the approval gate would bounce them off.
   */
  registrationStatus: RegistrationStatus | null
  /** True while the initial session/profile/roles fetch is in flight. */
  loading: boolean
  /** True once Supabase env vars are present — false means "demo mode". */
  configured: boolean
  hasRole: (role: UserRole) => boolean
  isAdmin: boolean
  signOut: () => Promise<void>
  /** Re-fetches profile + roles (e.g. after onboarding saves). */
  refresh: () => Promise<void>
}

/**
 * Client-side auth hook for use in Client Components (forms, nav, guards
 * that need reactive state rather than a one-off server redirect).
 *
 * In demo mode (`isSupabaseConfigured()` false) this resolves immediately
 * with `user: null`, `loading: false` and never throws — components using
 * it must render their own "not configured" messaging rather than assuming
 * a session will ever arrive.
 */
export function useAuth(): UseAuthResult {
  const configured = isSupabaseConfigured()
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [roles, setRoles] = useState<UserRole[]>([])
  const [registrationStatus, setRegistrationStatus] = useState<RegistrationStatus | null>(null)
  const [loading, setLoading] = useState(configured)

  const loadProfileAndRoles = useCallback(async (currentUser: User | null) => {
    if (!configured || !currentUser) {
      setProfile(null)
      setRoles([])
      setRegistrationStatus(null)
      return
    }
    const supabase = createClient()
    const [{ data: profileRow }, { data: roleRows }, { data: registrationRows }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', currentUser.id),
      supabase
        .from('registrations')
        .select('status, created_at')
        .eq('player_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(1),
    ])
    // See the comment in `src/lib/auth.ts#getProfile` — `Database['public']['Tables']`
    // resolves to `never` because the row types are declared with `interface`, so we
    // cast back to the real shapes here instead of editing that (out-of-scope) file.
    setProfile((profileRow as ProfileRow | null) ?? null)
    setRoles(((roleRows ?? []) as Pick<UserRoleRow, 'role'>[]).map((row) => row.role))
    const entry = ((registrationRows ?? []) as { status: RegistrationStatus }[])[0]
    setRegistrationStatus(entry?.status ?? null)
  }, [configured])

  const refresh = useCallback(async () => {
    if (!configured) return
    const supabase = createClient()
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()
    setUser(currentUser)
    await loadProfileAndRoles(currentUser)
  }, [configured, loadProfileAndRoles])

  useEffect(() => {
    if (!configured) {
      return
    }

    let cancelled = false
    const supabase = createClient()

    supabase.auth.getUser().then(async ({ data: { user: currentUser } }) => {
      if (cancelled) return
      setUser(currentUser)
      await loadProfileAndRoles(currentUser)
      if (!cancelled) setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      loadProfileAndRoles(currentUser)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured])

  const signOut = useCallback(async () => {
    if (!configured) return
    const supabase = createClient()
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setRoles([])
    setRegistrationStatus(null)
  }, [configured])

  return {
    user,
    profile,
    roles,
    registrationStatus,
    loading,
    configured,
    hasRole: (role) => roles.includes(role),
    isAdmin: roles.includes('admin'),
    signOut,
    refresh,
  }
}
