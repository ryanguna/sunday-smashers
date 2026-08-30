import type { ProfileRow } from '@/lib/supabase/types'

/**
 * Pure, dependency-free auth helpers (profile-completeness, redirect-path
 * building/sanitising). Deliberately kept separate from `src/lib/auth.ts`
 * — that file imports the server-only Supabase client (`next/headers`),
 * so anything a Client Component needs (e.g. the login page's `next`
 * param handling) must live here instead, or Next.js's bundler refuses to
 * build the client bundle at all.
 */

/** The fields that must be filled in before a profile counts as "complete". */
const REQUIRED_PROFILE_FIELDS = [
  'full_name',
  'gender',
  'phone',
  'shirt_size',
  'skill_level',
  'emergency_contact_name',
  'emergency_contact_phone',
] as const satisfies readonly (keyof ProfileRow)[]

/**
 * True once every field the tournament needs for onboarding has a
 * non-empty value. Pure function — no Supabase access — so it's covered by
 * `auth.test.ts` without a live connection.
 */
export function isProfileComplete(profile: Pick<ProfileRow, (typeof REQUIRED_PROFILE_FIELDS)[number]> | null): boolean {
  if (!profile) return false
  return REQUIRED_PROFILE_FIELDS.every((field) => {
    const value = profile[field]
    return typeof value === 'string' && value.trim().length > 0
  })
}

/**
 * Builds a `/login?next=<path>` redirect target. Pure — exported so tests
 * can assert its exact query-encoding behaviour without touching
 * `next/navigation`.
 */
export function loginRedirectPath(nextPath: string): string {
  const safeNext = nextPath.startsWith('/') ? nextPath : `/${nextPath}`
  return `/login?next=${encodeURIComponent(safeNext)}`
}

/**
 * Validates a `next` redirect target came from our own app (never an open
 * redirect to an attacker-controlled host). Falls back to `/dashboard`.
 */
export function sanitiseNextPath(next: string | null | undefined): string {
  if (!next) return '/dashboard'
  if (!next.startsWith('/') || next.startsWith('//')) return '/dashboard'
  return next
}
