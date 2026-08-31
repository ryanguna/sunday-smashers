import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Covers the guard that decides whether a visitor may reach the admin console.
 *
 * The bug these exist to prevent: the `/admin` layout used to write its own
 * guard as `if (isSupabaseConfigured()) await requireAdmin(path)`, which
 * disables itself in precisely the state where it is needed — a production
 * deployment whose environment variables were never finished. The console,
 * complete with Approve buttons, was served to anyone who guessed the URL.
 */

const ENV_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'VERCEL_ENV',
] as const

const original: Record<string, string | undefined> = {}

/** Stands in for Next's `redirect`, which throws to unwind the render. */
class RedirectError extends Error {
  constructor(public readonly to: string) {
    super(`redirect:${to}`)
  }
}

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new RedirectError(to)
  },
}))

const getUser = vi.fn()
const rolesFor = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser },
    from: () => ({
      select: () => ({
        eq: () => {
          const result = { data: rolesFor(), error: null }
          return Object.assign(Promise.resolve(result), {
            maybeSingle: async () => ({ data: null, error: null }),
          })
        },
      }),
    }),
  }),
}))

beforeEach(() => {
  for (const key of ENV_KEYS) original[key] = process.env[key]
  getUser.mockReset()
  rolesFor.mockReset()
  vi.resetModules()
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (original[key] === undefined) delete process.env[key]
    else process.env[key] = original[key]
  }
})

function setEnv(env: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  for (const key of ENV_KEYS) {
    const value = env[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

/** Config reads env at module-evaluation time, so import after setting it. */
async function loadAuth() {
  return import('./auth')
}

async function redirectTarget(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run()
    return null
  } catch (error) {
    if (error instanceof RedirectError) return error.to
    throw error
  }
}

describe('requireAdminOrDemo', () => {
  it('sends an unconfigured production deployment to /setup', async () => {
    setEnv({ VERCEL_ENV: 'production' })
    const { requireAdminOrDemo } = await loadAuth()

    expect(await redirectTarget(() => requireAdminOrDemo('/admin'))).toBe('/setup')
  })

  it('sends a half-configured production deployment to /setup', async () => {
    // The exact live state: URL set, anon key never added.
    setEnv({
      VERCEL_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: 'https://xkxsjafexqexnnkyujou.supabase.co',
    })
    const { requireAdminOrDemo } = await loadAuth()

    expect(await redirectTarget(() => requireAdminOrDemo('/admin'))).toBe('/setup')
  })

  it('leaves preview deployments in demo mode', async () => {
    // Preview variables are withheld on purpose so pull-request previews stay
    // browsable without reaching the real tournament.
    setEnv({ VERCEL_ENV: 'preview' })
    const { requireAdminOrDemo } = await loadAuth()

    expect(await requireAdminOrDemo('/admin')).toBe(true)
  })

  it('leaves local and CI runs in demo mode', async () => {
    // No VERCEL_ENV: `npm run build` and the Playwright suite browse /admin.
    setEnv({})
    const { requireAdminOrDemo } = await loadAuth()

    expect(await requireAdminOrDemo('/admin')).toBe(true)
  })

  it('admits an admin on a configured deployment', async () => {
    setEnv({
      VERCEL_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    })
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    rolesFor.mockReturnValue([{ role: 'admin' }])
    const { requireAdminOrDemo } = await loadAuth()

    expect(await requireAdminOrDemo('/admin')).toBe(false)
  })

  it('bounces a signed-out visitor to login on a configured deployment', async () => {
    setEnv({
      VERCEL_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    })
    getUser.mockResolvedValue({ data: { user: null } })
    const { requireAdminOrDemo } = await loadAuth()

    expect(await redirectTarget(() => requireAdminOrDemo('/admin'))).toBe(
      '/login?next=%2Fadmin',
    )
  })

  it('sends a signed-in non-admin to /403', async () => {
    setEnv({
      VERCEL_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    })
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    rolesFor.mockReturnValue([{ role: 'player' }])
    const { requireAdminOrDemo } = await loadAuth()

    expect(await redirectTarget(() => requireAdminOrDemo('/admin'))).toBe('/403')
  })
})

describe('requireAuth', () => {
  it('refuses an unconfigured production deployment', async () => {
    // /scoring, /tabulator and /scoresheets call this directly.
    setEnv({ VERCEL_ENV: 'production' })
    const { requireAuth } = await loadAuth()

    expect(await redirectTarget(() => requireAuth('/scoring'))).toBe('/setup')
  })

  it('still hands out the demo user locally', async () => {
    setEnv({})
    const { requireAuth } = await loadAuth()

    await expect(requireAuth('/scoring')).resolves.toMatchObject({ id: expect.any(String) })
  })
})
