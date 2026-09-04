import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Same regression as `src/components/admin/data.test.ts`, for the pairing bench. */

const ENV_KEYS = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const

type QueryResult = { data: unknown[] | null; error: { message: string } | null }

function fakeClient(result: QueryResult) {
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    limit: () => query,
    // `loadEntryFeeResolver` reads the tournament fee and the settings extras
    // blob as single rows; without this the fee lookup threw and the whole
    // page reported "we couldn't reach the database".
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (value: QueryResult) => unknown) => Promise.resolve(resolve(result)),
  }
  return { from: () => query }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => currentClient,
}))

let currentClient: ReturnType<typeof fakeClient>

async function loadTeams(options: { configured: boolean; result: QueryResult }) {
  for (const key of ENV_KEYS) delete process.env[key]
  if (options.configured) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  }
  currentClient = fakeClient(options.result)
  vi.resetModules()
  const { getTeamsAdminData } = await import('./data')
  return getTeamsAdminData()
}

describe('getTeamsAdminData', () => {
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

  it('returns the demo bench when Supabase is not configured', async () => {
    const data = await loadTeams({ configured: false, result: { data: [], error: null } })

    expect(data.isDemo).toBe(true)
    expect(data.error).toBeNull()
    expect(data.teams.length).toBeGreaterThan(0)
  })

  it('returns an empty bench — not demo pairs — on an empty project', async () => {
    const data = await loadTeams({ configured: true, result: { data: [], error: null } })

    expect(data.isDemo).toBe(false)
    expect(data.error).toBeNull()
    expect(data.teams).toEqual([])
    expect(data.freeAgents).toEqual([])
    expect(data.divisions).toEqual([])
  })

  it('surfaces a query failure instead of swallowing it into demo pairs', async () => {
    const data = await loadTeams({
      configured: true,
      result: { data: null, error: { message: 'permission denied' } },
    })

    expect(data.isDemo).toBe(false)
    expect(data.error).toBeTruthy()
    expect(data.teams).toEqual([])
  })
})
