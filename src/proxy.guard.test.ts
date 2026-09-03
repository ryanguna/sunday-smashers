import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guards `PROTECTED_PREFIXES` in `src/proxy.ts` against drift.
 *
 * The defect this exists for is recorded in that file: `/scoresheets` and
 * `/account` both had server-side auth guards but were missing from the
 * middleware list. An anonymous request got `200 OK` and the page's own
 * markup, where `/dashboard` returned a clean `307` — the guard eventually
 * redirected, but only after rendering had already begun.
 *
 * Adding a guarded route is the easy half; remembering this second, separate
 * list is the half that gets forgotten. So the test derives the answer from
 * the routes themselves rather than restating it.
 */
const APP_DIR = join(process.cwd(), 'src/app')
const PROXY_SOURCE = readFileSync(join(process.cwd(), 'src/proxy.ts'), 'utf8')

/**
 * Routes that guard themselves server-side but must stay reachable signed out.
 * Each needs a reason, so the exception list cannot quietly become a dumping
 * ground for routes someone forgot to add.
 */
const DELIBERATELY_PUBLIC: Record<string, string> = {
  '/setup': 'On day zero there is no admin to authenticate as. claim_first_admin() refuses once one exists.',
}

function readProtectedPrefixes(): string[] {
  const block = PROXY_SOURCE.match(/const PROTECTED_PREFIXES = \[([\s\S]*?)\]/)
  if (!block) throw new Error('PROTECTED_PREFIXES not found in src/proxy.ts')
  return [...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
}

/** Every `page.tsx` under `src/app`, as a route path. */
function collectPages(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      collectPages(full, found)
    } else if (entry === 'page.tsx') {
      found.push(full)
    }
  }
  return found
}

function toRoute(file: string): string {
  const rel = relative(APP_DIR, file).split(sep).slice(0, -1)
  // Route groups like `(marketing)` do not appear in the URL.
  const segments = rel.filter((segment) => !segment.startsWith('('))
  return `/${segments.join('/')}`
}

describe('middleware protected prefixes', () => {
  const prefixes = readProtectedPrefixes()

  it('lists the routes it is documented to list', () => {
    for (const route of ['/account', '/admin', '/dashboard', '/scoresheets', '/scoring', '/tabulator']) {
      expect(prefixes).toContain(route)
    }
  })

  it('covers every page that requires a signed-in user', () => {
    const unguarded: string[] = []

    for (const file of collectPages(APP_DIR)) {
      const source = readFileSync(file, 'utf8')
      // The three server-side guards. A page using any of them cannot render
      // anything useful to an anonymous visitor, so the edge should turn it
      // away first.
      if (!/\b(requireAuth|requireRole|requireAdmin)\b/.test(source)) continue

      const route = toRoute(file)
      if (route in DELIBERATELY_PUBLIC) continue
      if (prefixes.some((prefix) => route === prefix || route.startsWith(`${prefix}/`))) continue

      unguarded.push(route)
    }

    expect(unguarded, `add these to PROTECTED_PREFIXES in src/proxy.ts: ${unguarded.join(', ')}`).toEqual([])
  })

  it('keeps /setup reachable so the first admin can be claimed', () => {
    // The inverse mistake: locking this one down bricks a fresh deployment,
    // because there is nobody to sign in as yet.
    expect(prefixes).not.toContain('/setup')
    expect(DELIBERATELY_PUBLIC['/setup']).toBeTruthy()
  })

  it('redirects /onboarding at the edge rather than in a client effect', () => {
    // `/onboarding` checked auth in a `useEffect`, so a signed-out visitor saw
    // the profile form flash before being sent to /login.
    expect(prefixes).toContain('/onboarding')
  })
})
