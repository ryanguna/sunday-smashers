import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ENV_KEYS = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const

/** `config.ts` reads `process.env` once at module load, so re-import per test. */
async function importFresh(configured: boolean) {
  for (const key of ENV_KEYS) delete process.env[key]
  if (configured) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  }
  vi.resetModules()
  return import('./demo-mode')
}

describe('loadLiveOrDemo', () => {
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
    const { loadLiveOrDemo } = await importFresh(false)
    const live = vi.fn(async () => ['live'])

    const result = await loadLiveOrDemo({
      demo: () => ['demo'],
      empty: () => [],
      live,
    })

    expect(result).toEqual({ data: ['demo'], isDemo: true, error: null })
    expect(live).not.toHaveBeenCalled()
  })

  it('returns a genuinely empty result — never demo data — when configured and there are no rows', async () => {
    const { loadLiveOrDemo } = await importFresh(true)

    const result = await loadLiveOrDemo({
      demo: () => ['demo'],
      empty: () => ['empty-shape'],
      live: async () => [],
    })

    expect(result.data).toEqual([])
    expect(result.isDemo).toBe(false)
    expect(result.error).toBeNull()
  })

  it('surfaces an error — never demo data — when configured and a query fails', async () => {
    const { loadLiveOrDemo, DATA_LOAD_ERROR_MESSAGE } = await importFresh(true)

    const result = await loadLiveOrDemo({
      demo: () => ['demo'],
      empty: () => [],
      live: async () => {
        throw new Error('permission denied for table registrations')
      },
    })

    expect(result.data).toEqual([])
    expect(result.isDemo).toBe(false)
    expect(result.error).toBe(DATA_LOAD_ERROR_MESSAGE)
  })

  it('never reports demo mode while Supabase is configured, whatever happens', async () => {
    const { loadLiveOrDemo } = await importFresh(true)

    const outcomes = await Promise.all([
      loadLiveOrDemo({ demo: () => 'demo', empty: () => 'empty', live: async () => 'live' }),
      loadLiveOrDemo({ demo: () => 'demo', empty: () => 'empty', live: async () => 'empty' }),
      loadLiveOrDemo({
        demo: () => 'demo',
        empty: () => 'empty',
        live: async () => {
          throw new Error('boom')
        },
      }),
    ])

    expect(outcomes.every((outcome) => outcome.isDemo === false)).toBe(true)
    expect(outcomes.some((outcome) => outcome.data === 'demo')).toBe(false)
  })

  it('awaits async demo and empty builders', async () => {
    const { loadLiveOrDemo } = await importFresh(false)

    const result = await loadLiveOrDemo({
      demo: async () => 'async-demo',
      empty: () => 'empty',
      live: async () => 'live',
    })

    expect(result.data).toBe('async-demo')
  })
})

describe('rowsOrThrow / rowOrThrow', () => {
  it('returns rows when the query succeeded', async () => {
    const { rowsOrThrow, rowOrThrow } = await import('./demo-mode')
    expect(rowsOrThrow({ data: [{ id: 'a' }], error: null })).toEqual([{ id: 'a' }])
    expect(rowOrThrow({ data: { id: 'a' }, error: null })).toEqual({ id: 'a' })
  })

  it('treats no rows as an empty list, not a failure', async () => {
    const { rowsOrThrow, rowOrThrow } = await import('./demo-mode')
    expect(rowsOrThrow({ data: null, error: null })).toEqual([])
    expect(rowOrThrow({ data: null, error: null })).toBeNull()
  })

  it('throws so the failure can be surfaced rather than swallowed', async () => {
    const { rowsOrThrow, rowOrThrow } = await import('./demo-mode')
    expect(() => rowsOrThrow({ data: null, error: { message: 'RLS' } })).toThrow('RLS')
    expect(() => rowOrThrow({ data: null, error: { message: 'RLS' } })).toThrow('RLS')
  })
})
