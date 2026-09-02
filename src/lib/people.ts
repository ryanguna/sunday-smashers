/**
 * Who can do what, and who is allowed to change that.
 *
 * The database has had roles since the first migration — a `user_role` enum,
 * a `user_roles` join table, and RLS that lets only `public.is_admin()` write
 * to it. What it never had was a way to *use* any of that without opening the
 * Supabase SQL editor. This module is the logic behind the admin screen that
 * closes the gap.
 *
 * The interesting part is not granting roles, it is refusing to. An admin
 * console that lets the last admin demote themselves is one click away from
 * locking the committee out of its own tournament with no way back in short
 * of a service-role key. Those rules live here, as pure functions, so they
 * are tested rather than hoped for.
 */

import type { UserRole } from '@/lib/supabase/types'

/**
 * The roles an admin may actually grant or revoke, in the order they appear
 * in the UI.
 *
 * `public` is deliberately absent. It exists in the enum to describe someone
 * who is *not* signed in, so granting it means nothing — every signed-in user
 * already has at least `player` from the `handle_new_user` trigger.
 */
export const MANAGEABLE_ROLES = ['player', 'duty_official', 'tabulator', 'admin'] as const

export type ManageableRole = (typeof MANAGEABLE_ROLES)[number]

export function isManageableRole(value: string): value is ManageableRole {
  return (MANAGEABLE_ROLES as readonly string[]).includes(value)
}

/** Human labels and one-line explanations, shown next to each toggle. */
export const ROLE_LABELS: Record<ManageableRole, { label: string; description: string }> = {
  player: {
    label: 'Player',
    description: 'Can register, see their own matches and duties. Granted automatically on sign-up.',
  },
  duty_official: {
    label: 'Duty official',
    description: 'Can run the scoring console for matches they are rostered to.',
  },
  tabulator: {
    label: 'Tabulator',
    description: 'Can verify submitted scoresheets and commit results to the standings.',
  },
  admin: {
    label: 'Admin',
    description: 'Full access to this console, including roles, settings and going live.',
  },
}

export interface PersonRoles {
  userId: string
  fullName: string
  email: string | null
  nickname: string | null
  avatarUrl: string | null
  joinedAt: string
  roles: UserRole[]
}

/** Why a role change must be refused, or `null` when it may go ahead. */
export type RoleChangeBlocker =
  /** Removing your own admin role — you would lose this screen mid-click. */
  | 'self-demotion'
  /** Removing the only admin left, locking everyone out of the console. */
  | 'last-admin'
  /** `public` is not a real grant; see MANAGEABLE_ROLES. */
  | 'not-manageable'

export interface RoleChangeRequest {
  /** The admin performing the change. */
  actorId: string
  /** The account being changed. */
  targetId: string
  role: string
  grant: boolean
  /** Every user id that currently holds `admin`. */
  currentAdminIds: readonly string[]
}

/**
 * Decides whether a role change may proceed, returning why not if it may not.
 *
 * Both refusals concern the *removal* of admin, and they are separate on
 * purpose. Demoting yourself is almost always a mistake and is refused even
 * when other admins remain, because the click takes effect immediately and
 * the screen you were using disappears — recovering means asking a colleague.
 * Removing the last admin is worse and is unrecoverable from inside the app,
 * so it is refused regardless of who asks.
 */
export function roleChangeBlocker(request: RoleChangeRequest): RoleChangeBlocker | null {
  const { actorId, targetId, role, grant, currentAdminIds } = request

  if (!isManageableRole(role)) return 'not-manageable'

  // Granting is always safe: it can only ever add capability.
  if (grant) return null

  if (role !== 'admin') return null

  if (actorId === targetId) return 'self-demotion'

  const remaining = currentAdminIds.filter((id) => id !== targetId)
  if (remaining.length === 0) return 'last-admin'

  return null
}

/** The message shown to the volunteer when a change is refused. */
export function roleChangeBlockerMessage(blocker: RoleChangeBlocker): string {
  switch (blocker) {
    case 'self-demotion':
      return 'You cannot remove your own admin access — you would be locked out of this page straight away. Ask another admin to do it.'
    case 'last-admin':
      return 'This is the last admin account. Promote somebody else first, otherwise nobody can reach this console.'
    case 'not-manageable':
      return 'That is not a role you can grant.'
  }
}

/**
 * Filter people by a free-text query across name, nickname and email.
 *
 * Matching is case-insensitive and substring-based — volunteers search for
 * "dave" or a fragment of an email, not for exact records.
 */
export function filterPeople(people: readonly PersonRoles[], query: string): PersonRoles[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...people]

  return people.filter((person) =>
    [person.fullName, person.nickname ?? '', person.email ?? ''].some((field) =>
      field.toLowerCase().includes(needle)
    )
  )
}

/**
 * Admins first, then alphabetically by name.
 *
 * The committee is the reason anyone opens this screen — either to check who
 * has access or to change it — so those accounts belong at the top rather
 * than scattered through a roster of a hundred players.
 */
export function sortPeople(people: readonly PersonRoles[]): PersonRoles[] {
  return [...people].sort((a, b) => {
    const aAdmin = a.roles.includes('admin')
    const bAdmin = b.roles.includes('admin')
    if (aAdmin !== bAdmin) return aAdmin ? -1 : 1
    return a.fullName.localeCompare(b.fullName)
  })
}

/** Every user id currently holding `admin`. */
export function adminIds(people: readonly PersonRoles[]): string[] {
  return people.filter((person) => person.roles.includes('admin')).map((person) => person.userId)
}
