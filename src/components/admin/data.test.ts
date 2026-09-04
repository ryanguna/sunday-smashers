import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The regression these cover: the console used to swap in the bundled demo
 * fixtures whenever a real project came back empty *or* a query failed, which
 * put ~44 invented players and invented money in front of a volunteer whose
 * "Approve" button was wired to the real database.
 */

const ENV_KEYS = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const

type QueryResult = { data: unknown[] | null; error: { message: string } | null }

/** Minimal thenable stand-in for the PostgREST query builder. */
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

async function loadConsole(options: { configured: boolean; result: QueryResult }) {
  for (const key of ENV_KEYS) delete process.env[key]
  if (options.configured) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  }
  currentClient = fakeClient(options.result)
  vi.resetModules()
  const { getAdminConsoleData } = await import('./data')
  return getAdminConsoleData()
}

describe('getAdminConsoleData', () => {
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

  it('returns the demo set when Supabase is not configured', async () => {
    const data = await loadConsole({ configured: false, result: { data: [], error: null } })

    expect(data.isDemo).toBe(true)
    expect(data.error).toBeNull()
    expect(data.registrations.length).toBeGreaterThan(0)
    expect(data.divisions.length).toBeGreaterThan(0)
  })

  it('returns a genuinely empty console — not demo players — on an empty project', async () => {
    const data = await loadConsole({ configured: true, result: { data: [], error: null } })

    expect(data.isDemo).toBe(false)
    expect(data.error).toBeNull()
    expect(data.registrations).toEqual([])
    expect(data.divisions).toEqual([])
    expect(data.pendingInvites).toEqual([])
  })

  it('surfaces a query failure instead of swallowing it into demo data', async () => {
    const data = await loadConsole({
      configured: true,
      result: { data: null, error: { message: 'permission denied' } },
    })

    expect(data.isDemo).toBe(false)
    expect(data.error).toBeTruthy()
    expect(data.registrations).toEqual([])
  })
})
