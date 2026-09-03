import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * People & roles reported "no users" on a live project that had accounts.
 *
 * `loadLive` returned early when no tournament row existed, and that early
 * shape hard-coded `users: []`. Accounts are not tournament-scoped — neither
 * `profiles` nor `user_roles` carries a `tournament_id` — so the list has to
 * survive the day-zero branch. It matters most exactly there: an organiser
 * cannot promote a second admin from a screen that shows nobody.
 */

const ENV_KEYS = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const

type Rows = Record<string, unknown[]>

function fakeClient(rows: Rows) {
  const from = (table: string) => {
    const result = { data: rows[table] ?? [], error: null }
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: () => query,
      maybeSingle: async () => ({ data: null, error: null }),
      then: (resolve: (value: typeof result) => unknown) => Promise.resolve(resolve(result)),
    }
    return query
  }
  return {
    from,
    auth: { getUser: async () => ({ data: { user: { id: 'user-admin' } } }) },
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => currentClient,
}))

let currentClient: ReturnType<typeof fakeClient>

async function load(rows: Rows) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  currentClient = fakeClient(rows)
  vi.resetModules()
  const { loadSettingsPageData } = await import('./data')
  return loadSettingsPageData()
}

const PROFILES = [
  { id: 'user-admin', full_name: 'Rina Organiser', nickname: 'rina', avatar_url: null },
  { id: 'user-player', full_name: 'Sam Smash', nickname: 'sam', avatar_url: null },
]

const ROLES = [{ user_id: 'user-admin', role: 'admin' }]

describe('loadSettingsPageData — People & roles', () => {
  const originalEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of ENV_KEYS) originalEnv[key] = process.env[key]
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key]
      else process.env[key] = originalEnv[key]
    }
    vi.resetModules()
  })

  it('lists accounts before a tournament exists', async () => {
    const data = await load({ tournaments: [], profiles: PROFILES, user_roles: ROLES })

    expect(data.isDemo).toBe(false)
    expect(data.tournamentId).toBeNull()
    expect(data.users.map((user) => user.id)).toEqual(['user-admin', 'user-player'])
  })

  it('keeps role assignments on the day-zero list, so a second admin can be promoted', async () => {
    const data = await load({ tournaments: [], profiles: PROFILES, user_roles: ROLES })

    const byId = new Map(data.users.map((user) => [user.id, user]))
    expect(byId.get('user-admin')?.roles).toEqual(['admin'])
    expect(byId.get('user-player')?.roles).toEqual([])
  })

  it('still identifies the signed-in organiser with no tournament', async () => {
    const data = await load({ tournaments: [], profiles: PROFILES, user_roles: ROLES })

    expect(data.currentUserId).toBe('user-admin')
  })

  it('lists the same accounts once a tournament exists', async () => {
    const data = await load({
      tournaments: [
        {
          id: 'tournament-1',
          name: 'Christmas Mini',
          tournament_date: '2026-12-13',
          registration_opens_at: '2026-09-06T00:00:00Z',
        },
      ],
      profiles: PROFILES,
      user_roles: ROLES,
    })

    expect(data.tournamentId).toBe('tournament-1')
    expect(data.users.map((user) => user.id)).toEqual(['user-admin', 'user-player'])
  })
})
