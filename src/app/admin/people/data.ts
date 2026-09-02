import 'server-only'

import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import { adminIds, sortPeople, type PersonRoles } from '@/lib/people'
import { DEMO_PEOPLE } from './demo'

export interface PeoplePageData {
  people: PersonRoles[]
  /** Every user id currently holding `admin`, for the lockout guards. */
  adminUserIds: string[]
  /** The signed-in admin, so the UI can refuse self-demotion up front. */
  currentUserId: string | null
  isDemo: boolean
  error: string | null
}

/**
 * Every account on the project, with the roles each one holds.
 *
 * Two queries rather than a join: PostgREST can embed `user_roles` under
 * `profiles`, but the embed is filtered by the *embedded* table's RLS, and
 * `user_roles_select_own_or_admin` would quietly return only the caller's own
 * row if `is_admin()` ever evaluated false. Fetching them separately means a
 * permissions problem shows up as an error we can display, rather than as a
 * screen where everybody looks like they hold no roles at all.
 */
export async function loadPeoplePageData(): Promise<PeoplePageData> {
  if (!isSupabaseConfigured()) {
    const people = sortPeople(DEMO_PEOPLE)
    return {
      people,
      adminUserIds: adminIds(people),
      currentUserId: people.find((person) => person.roles.includes('admin'))?.userId ?? null,
      isDemo: true,
      error: null,
    }
  }

  const supabase = await createClient()

  const [{ data: auth }, profiles, roles] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('profiles')
      .select('id, full_name, nickname, avatar_url, email, created_at')
      .order('full_name'),
    supabase.from('user_roles').select('user_id, role'),
  ])

  if (profiles.error || roles.error) {
    return {
      people: [],
      adminUserIds: [],
      currentUserId: auth.user?.id ?? null,
      isDemo: false,
      error: profiles.error?.message ?? roles.error?.message ?? 'Could not read the account list.',
    }
  }

  const rolesByUser = new Map<string, PersonRoles['roles']>()
  for (const row of roles.data ?? []) {
    const existing = rolesByUser.get(row.user_id)
    if (existing) existing.push(row.role)
    else rolesByUser.set(row.user_id, [row.role])
  }

  const people = sortPeople(
    (profiles.data ?? []).map((row) => ({
      userId: row.id,
      fullName: row.full_name,
      email: row.email ?? null,
      nickname: row.nickname,
      avatarUrl: row.avatar_url,
      joinedAt: row.created_at,
      roles: rolesByUser.get(row.id) ?? [],
    }))
  )

  return {
    people,
    adminUserIds: adminIds(people),
    currentUserId: auth.user?.id ?? null,
    isDemo: false,
    error: null,
  }
}
