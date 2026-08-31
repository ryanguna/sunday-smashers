import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ENV_KEYS = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'VERCEL_ENV'] as const

describe('supabase config', () => {
  const originalEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key]
      delete process.env[key]
    }
    // config.ts reads process.env at module-evaluation time, so force a
    // fresh evaluation for every test after mutating env vars.
    vi.resetModules()
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key]
      else process.env[key] = originalEnv[key]
    }
  })

  it('reports not configured when both env vars are absent', async () => {
    const { isSupabaseConfigured } = await import('./config')
    expect(isSupabaseConfigured()).toBe(false)
  })

  it('reports not configured when only the URL is set', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    const { isSupabaseConfigured } = await import('./config')
    expect(isSupabaseConfigured()).toBe(false)
  })

  it('reports not configured when only the anon key is set', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
    const { isSupabaseConfigured } = await import('./config')
    expect(isSupabaseConfigured()).toBe(false)
  })

  it('reports not configured when env vars are empty strings', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ''
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ''
    const { isSupabaseConfigured } = await import('./config')
    expect(isSupabaseConfigured()).toBe(false)
  })

  it('reports configured when both env vars are present', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
    const { isSupabaseConfigured } = await import('./config')
    expect(isSupabaseConfigured()).toBe(true)
  })
})

/**
 * Demo mode is welcome locally and in CI; on the production deployment it
 * means the environment variables were never finished, and the auth helpers
 * must not hand out the stand-in organiser to the public internet.
 */
describe('unconfigured production deployment', () => {
  const originalEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key]
      delete process.env[key]
    }
    vi.resetModules()
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key]
      else process.env[key] = originalEnv[key]
    }
  })

  it('flags production with no credentials', async () => {
    process.env.VERCEL_ENV = 'production'
    const { isUnconfiguredProductionDeployment } = await import('./config')
    expect(isUnconfiguredProductionDeployment()).toBe(true)
  })

  it('flags production when only the URL was set', async () => {
    // The exact half-finished state this app shipped in: URL present, key
    // missing, so `isSupabaseConfigured()` is false and demo mode kicks in.
    process.env.VERCEL_ENV = 'production'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    const { isUnconfiguredProductionDeployment } = await import('./config')
    expect(isUnconfiguredProductionDeployment()).toBe(true)
  })

  it('does not flag production once both credentials are present', async () => {
    process.env.VERCEL_ENV = 'production'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
    const { isUnconfiguredProductionDeployment } = await import('./config')
    expect(isUnconfiguredProductionDeployment()).toBe(false)
  })

  it('leaves preview deployments in demo mode', async () => {
    // Preview has its Supabase variables withheld on purpose, so that pull
    // request previews stay browsable without touching the real tournament.
    process.env.VERCEL_ENV = 'preview'
    const { isUnconfiguredProductionDeployment } = await import('./config')
    expect(isUnconfiguredProductionDeployment()).toBe(false)
  })

  it('leaves local development and CI alone', async () => {
    // No VERCEL_ENV at all: `npm run build` and the Playwright run depend on
    // demo mode continuing to work here.
    const { isUnconfiguredProductionDeployment } = await import('./config')
    expect(isUnconfiguredProductionDeployment()).toBe(false)
  })
})
