import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ENV_KEYS = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const

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
