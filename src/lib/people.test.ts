import { describe, expect, it } from 'vitest'

import {
  adminIds,
  filterPeople,
  isManageableRole,
  MANAGEABLE_ROLES,
  roleChangeBlocker,
  roleChangeBlockerMessage,
  sortPeople,
  type PersonRoles,
} from './people'

function person(overrides: Partial<PersonRoles> & { userId: string }): PersonRoles {
  return {
    fullName: 'Test Player',
    email: 'test@smashers.example',
    nickname: null,
    avatarUrl: null,
    joinedAt: '2026-09-01T00:00:00.000Z',
    roles: ['player'],
    ...overrides,
  }
}

describe('MANAGEABLE_ROLES', () => {
  it('excludes "public", which describes signed-out visitors and cannot be granted', () => {
    expect(MANAGEABLE_ROLES).not.toContain('public')
    expect(isManageableRole('public')).toBe(false)
  })

  it('covers every role the console needs to hand out', () => {
    expect(MANAGEABLE_ROLES).toEqual(['player', 'duty_official', 'tabulator', 'admin'])
  })
})

describe('roleChangeBlocker', () => {
  const twoAdmins = ['admin-1', 'admin-2']

  it('always allows granting, which can only add capability', () => {
    expect(
      roleChangeBlocker({
        actorId: 'admin-1',
        targetId: 'player-1',
        role: 'admin',
        grant: true,
        currentAdminIds: twoAdmins,
      })
    ).toBeNull()
  })

  it('allows an admin to revoke a non-admin role from anyone', () => {
    expect(
      roleChangeBlocker({
        actorId: 'admin-1',
        targetId: 'admin-1',
        role: 'tabulator',
        grant: false,
        currentAdminIds: twoAdmins,
      })
    ).toBeNull()
  })

  it('allows one admin to demote another when admins remain', () => {
    expect(
      roleChangeBlocker({
        actorId: 'admin-1',
        targetId: 'admin-2',
        role: 'admin',
        grant: false,
        currentAdminIds: twoAdmins,
      })
    ).toBeNull()
  })

  it('refuses "public" as a grant', () => {
    expect(
      roleChangeBlocker({
        actorId: 'admin-1',
        targetId: 'player-1',
        role: 'public',
        grant: true,
        currentAdminIds: twoAdmins,
      })
    ).toBe('not-manageable')
  })

  /**
   * The click takes effect immediately and this screen is admin-only, so the
   * page vanishes underneath the person who pressed it.
   */
  it('refuses self-demotion even when other admins remain', () => {
    expect(
      roleChangeBlocker({
        actorId: 'admin-1',
        targetId: 'admin-1',
        role: 'admin',
        grant: false,
        currentAdminIds: twoAdmins,
      })
    ).toBe('self-demotion')
  })

  /**
   * The unrecoverable one. With no admins left, nothing inside the app can
   * grant the role back — it would take a service-role key or the Supabase
   * SQL editor.
   */
  it('refuses removing the last admin', () => {
    expect(
      roleChangeBlocker({
        actorId: 'admin-1',
        targetId: 'admin-1',
        role: 'admin',
        grant: false,
        currentAdminIds: ['admin-1'],
      })
    ).toBe('self-demotion')

    // Even asked by somebody else — a service-role script, say — the last
    // admin must survive.
    expect(
      roleChangeBlocker({
        actorId: 'someone-else',
        targetId: 'admin-1',
        role: 'admin',
        grant: false,
        currentAdminIds: ['admin-1'],
      })
    ).toBe('last-admin')
  })

  it('explains every refusal in words a volunteer can act on', () => {
    for (const blocker of ['self-demotion', 'last-admin', 'not-manageable'] as const) {
      expect(roleChangeBlockerMessage(blocker).length).toBeGreaterThan(20)
    }
  })
})

describe('filterPeople', () => {
  const people = [
    person({ userId: '1', fullName: 'Dave Smith', email: 'dave@smashers.example' }),
    person({ userId: '2', fullName: 'Priya Patel', nickname: 'Rocket', email: 'priya@x.example' }),
  ]

  it('returns everyone for a blank query', () => {
    expect(filterPeople(people, '   ')).toHaveLength(2)
  })

  it('matches on name, nickname and email, case-insensitively', () => {
    expect(filterPeople(people, 'DAVE').map((p) => p.userId)).toEqual(['1'])
    expect(filterPeople(people, 'rocket').map((p) => p.userId)).toEqual(['2'])
    expect(filterPeople(people, '@x.example').map((p) => p.userId)).toEqual(['2'])
  })

  it('copes with people who have no email or nickname', () => {
    const anon = [person({ userId: '3', fullName: 'No Contact', email: null, nickname: null })]
    expect(filterPeople(anon, 'contact')).toHaveLength(1)
    expect(filterPeople(anon, 'nothing')).toHaveLength(0)
  })
})

describe('sortPeople', () => {
  it('puts admins first, then sorts by name', () => {
    const sorted = sortPeople([
      person({ userId: '1', fullName: 'Zoe Adams' }),
      person({ userId: '2', fullName: 'Bob Brown', roles: ['player', 'admin'] }),
      person({ userId: '3', fullName: 'Alice Chen' }),
    ])
    expect(sorted.map((p) => p.fullName)).toEqual(['Bob Brown', 'Alice Chen', 'Zoe Adams'])
  })

  it('does not mutate the input', () => {
    const input = [person({ userId: '1', fullName: 'Zoe' }), person({ userId: '2', fullName: 'Al' })]
    sortPeople(input)
    expect(input.map((p) => p.fullName)).toEqual(['Zoe', 'Al'])
  })
})

describe('adminIds', () => {
  it('lists only the accounts holding admin', () => {
    const people = [
      person({ userId: '1', roles: ['player'] }),
      person({ userId: '2', roles: ['player', 'admin'] }),
      person({ userId: '3', roles: ['tabulator'] }),
    ]
    expect(adminIds(people)).toEqual(['2'])
  })
})
