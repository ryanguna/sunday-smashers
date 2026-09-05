import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { matchesSearch, type AdminRegistration } from './admin'
import { searchUsers, type ManagedUser } from './settings'

/**
 * The admin console showed an empty Email column against the real database.
 *
 * Both loaders hardcoded `email: null` with a comment explaining that email
 * lived in `auth.users`, which the anon key cannot read. That was true until
 * migration 0007 mirrored the address onto `profiles` — the loaders never
 * caught up, and because the demo fixtures carry real-looking addresses the
 * console looked correct in demo mode and in CI. Only production was blank.
 */

const read = (relative: string) =>
  readFileSync(path.join(process.cwd(), 'src', relative), 'utf8')

describe('the admin console reads the email it is allowed to read', () => {
  it('takes the registration email from the profile row', () => {
    const data = read('components/admin/data.ts')
    expect(data).toContain('email: profile?.email ?? null')
    expect(data).not.toMatch(/^\s*email: null,$/m)
  })

  it('takes the People & roles email from the profile row', () => {
    // Without this, two accounts under one name are indistinguishable on the
    // one page you use to decide which of them to promote.
    const data = read('app/admin/settings/data.ts')
    expect(data).toContain('email: profile.email')
    expect(data).not.toMatch(/^\s*email: null,$/m)
  })

  it('no longer claims the address is hidden in Supabase auth', () => {
    // That fallback rendered for every single person, so it read as a policy
    // rather than as the genuinely-missing case.
    const roles = read('components/settings/RolesManager.tsx')
    expect(roles).not.toContain('Email hidden — lives in Supabase auth.')
  })

  it('selects the whole profile row, so the column arrives', () => {
    expect(read('components/admin/data.ts')).toContain("from('profiles').select('*')")
  })
})

describe('the features that were silently starved by the blank column', () => {
  const registration = {
    playerName: 'Charm Manalili',
    nickname: null,
    email: 'charm.melencio@gmail.com',
    phone: null,
    teamName: null,
    partnerName: null,
    divisionName: "Women's Doubles",
    notes: null,
    skillLevel: null,
  } as unknown as AdminRegistration

  it('finds a registration by email address', () => {
    // The search box has always listed email as a field and always had an
    // empty string to search, so this returned nothing and looked like "that
    // player is not registered".
    expect(matchesSearch(registration, 'charm.melencio@gmail.com')).toBe(true)
    expect(matchesSearch(registration, 'melencio')).toBe(true)
    expect(matchesSearch(registration, 'nobody@example.com')).toBe(false)
  })

  it('finds a person by email on People & roles', () => {
    const user: ManagedUser = {
      id: 'u1',
      fullName: 'Julia Emily Gonzaga',
      nickname: null,
      email: 'shaow.1230@gmail.com',
      roles: ['player'],
    }
    expect(searchUsers([user], 'shaow.1230@gmail.com')).toHaveLength(1)
    expect(searchUsers([user], 'someone.else@gmail.com')).toHaveLength(0)
  })

  it('keeps email in the CSV export columns', () => {
    // The export is what you would use to mail everyone their start times.
    // An empty column there fails quietly and is only noticed afterwards.
    const admin = read('lib/admin.ts')
    expect(admin).toContain('row.email')
  })
})
