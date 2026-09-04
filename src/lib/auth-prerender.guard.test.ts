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

/**
 * Comments are stripped before looking for a guard. `/setup` documents that it
 * is "deliberately NOT behind `requireAdmin`" -- prose that would otherwise
 * make it look guarded and force a permanent exception into these checks for a
 * page that is correctly public.
 */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
}

function guardedPages(): string[] {
  return pageFiles(APP).filter((file) => GUARDS.test(code(file)))
}

function pageFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return pageFiles(full)
    return entry === 'page.tsx' ? [full] : []
  })
}

describe('signed-in pages are never prerendered', () => {
  it('every guarded page declares force-dynamic', () => {
    const offenders = guardedPages()
      .filter((file) => !readFileSync(file, 'utf8').includes("dynamic = 'force-dynamic'"))
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
    expect(guardedPages().length).toBeGreaterThanOrEqual(25)
  })
  /**
   * A page-level `requireAuth` is necessary but not sufficient.
   *
   * The root layout streams its shell before the page's guard resolves, so by
   * the time `redirect()` throws, the response is already committed as 200.
   * Next then emits the redirect inside the streamed payload: the browser does
   * leave, but only with JavaScript enabled, and the protected page's HTML has
   * already gone out over the wire.
   *
   * `/scoresheets` and `/account/password` were in exactly that state --
   * anonymous requests got `200 OK` and the page's own markup, while
   * `/dashboard` and `/admin` returned a clean `307`. The difference was
   * entirely the proxy's prefix list, which redirects before any rendering.
   *
   * So every guarded page needs a matching prefix there. `/setup` is the one
   * intentional exception, and it has to be listed rather than simply absent:
   * its guard is *conditional*. Once an organiser exists it requires admin,
   * but on day zero -- an empty database, or a deployment with no environment
   * variables -- there is nobody who could sign in, and a proxy prefix would
   * bounce the only route that can fix either state. It settles for the
   * page-level redirect, which costs a `200` where a `307` would be tidier but
   * still renders the 403 instead of the wizard.
   */
  const CONDITIONALLY_GUARDED = ['/setup']

  it('every guarded page sits behind a proxy prefix', () => {
    const proxy = readFileSync(join(import.meta.dirname, '..', 'proxy.ts'), 'utf8')
    const block = proxy.slice(proxy.indexOf('const PROTECTED_PREFIXES'))
    const prefixes = Array.from(block.slice(0, block.indexOf(']')).matchAll(/'([^']+)'/g)).map(
      (m) => m[1],
    )
    expect(prefixes.length).toBeGreaterThan(0)

    const unguarded = guardedPages()
      .map((file) => '/' + relative(APP, file).replace(/\/?page\.tsx$/, ''))
      .filter((route) => !CONDITIONALLY_GUARDED.includes(route))
      .filter((route) => !prefixes.some((p) => route === p || route.startsWith(`${p}/`)))

    expect(
      unguarded,
      'These pages check for a signed-in user but the proxy lets anonymous ' +
        `requests reach them: ${unguarded.join(', ')}.\n` +
        'The page-level redirect fires too late -- the layout has already ' +
        'streamed a 200 -- so add the prefix to PROTECTED_PREFIXES in ' +
        'src/proxy.ts, where the redirect happens before any rendering.',
    ).toEqual([])
  })
})
