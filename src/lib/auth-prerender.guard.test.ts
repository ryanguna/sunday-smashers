import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Signed-in pages must never be statically prerendered.
 *
 * `/account/password` shipped without `export const dynamic = 'force-dynamic'`
 * and Next prerendered it. Its only server-side work was `requireAuth`, which
 * ran at *build* time — where there is no session and no cookies to read — so
 * nothing ever marked the route dynamic. The resulting HTML was cached and
 * served to everyone: an anonymous visitor got the change-password form
 * instead of the sign-in redirect, and the form could never work because the
 * email it needs comes from the session.
 *
 * Twelve admin pages were missing the directive too. Those happened to be
 * dynamic anyway, because they fetch cookie-bound data and that access is what
 * opts a route out of prerendering. That is luck, not a guarantee: the day one
 * of them stops loading data on the server — or starts loading it entirely in
 * a client component — it silently becomes a cached public page.
 *
 * So the rule is the directive, not the side effect. Checking the source is
 * deliberate: reading `.next` would only work after a build, and this needs to
 * fail in the unit suite, before anything is deployed.
 */

const APP = join(import.meta.dirname, '..', 'app')

/** Anything that turns an anonymous visitor away. */
const GUARDS = /\brequire(Auth|Role|Admin|Tabulator)\b/

function pageFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return pageFiles(full)
    return entry === 'page.tsx' ? [full] : []
  })
}

describe('signed-in pages are never prerendered', () => {
  it('every guarded page declares force-dynamic', () => {
    const offenders = pageFiles(APP)
      .filter((file) => {
        const source = readFileSync(file, 'utf8')
        return GUARDS.test(source) && !source.includes("dynamic = 'force-dynamic'")
      })
      .map((file) => relative(APP, file))

    expect(
      offenders,
      'These pages check for a signed-in user but can still be prerendered, ' +
        `so the check runs at build time and the result is cached for everyone: ${offenders.join(', ')}.\n` +
        "Add `export const dynamic = 'force-dynamic'`.",
    ).toEqual([])
  })

  /**
   * Guards against the check above being satisfied by a page that no longer
   * has a guard at all — if the helper import is dropped the page leaves this
   * list silently, and the suite would still be green.
   */
  it('finds the guarded pages it is meant to be checking', () => {
    const guarded = pageFiles(APP).filter((file) => GUARDS.test(readFileSync(file, 'utf8')))
    expect(guarded.length).toBeGreaterThanOrEqual(26)
  })
})
