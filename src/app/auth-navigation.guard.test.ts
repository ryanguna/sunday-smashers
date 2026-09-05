import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every screen that changes who you are must hand over with a full document
 * load, not a client-side router navigation.
 *
 * The defect: `/signup` finished with `router.replace('/onboarding')` and
 * `/onboarding` finished with `router.push('/dashboard')`. Both are client
 * navigations, so the request that renders the next page is served against a
 * router cache built while the browser was signed out — the brand new session
 * cookie is invisible to every server component until the next hard load.
 *
 * What the player saw: they completed onboarding and were asked to sign in,
 * while the header beside the message already showed their name and avatar.
 * The client knew who they were; the server did not. Reproduced against
 * production, which landed on `/login?next=%2Fdashboard`.
 *
 * `/login` already got this right and says so beside its
 * `window.location.assign`. These assertions stop the other two from drifting
 * back, which is easy to do because `router.push` is what every other page in
 * the app correctly uses.
 */
const files = {
  signup: readFileSync(join(process.cwd(), 'src/app/signup/page.tsx'), 'utf8'),
  onboarding: readFileSync(join(process.cwd(), 'src/app/onboarding/page.tsx'), 'utf8'),
  login: readFileSync(join(process.cwd(), 'src/app/login/page.tsx'), 'utf8'),
}

/** The statement that runs once the account/profile write has succeeded. */
function successHandoff(source: string, marker: string): string {
  const at = source.indexOf(marker)
  expect(at, `"${marker}" is gone — update this test`).toBeGreaterThan(-1)
  return source.slice(at, at + 900)
}

describe('handing over after an auth state change', () => {
  it('sign-up sends the new account to onboarding with a real page load', () => {
    const handoff = successHandoff(files.signup, 'if (data.session)')
    expect(handoff).toContain("window.location.assign('/onboarding')")
    expect(handoff).not.toMatch(/router\.(push|replace)\(/)
  })

  it('finishing onboarding reaches the entry form with a real page load', () => {
    // The destination is `/register`, not `/dashboard`: signing up and
    // entering are one journey — see `registration-prompt.guard.test.ts`.
    // What this test guards is the *how*, which is unchanged. The profile
    // that was just written is what the next page reads, and the router
    // cache in front of it predates both the profile and the session.
    const handoff = successHandoff(files.onboarding, 'if (error) {')
    expect(handoff).toContain("window.location.assign('/register')")
    expect(handoff).not.toMatch(/router\.(push|replace)\('\/(dashboard|register)'\)/)
  })

  it('sign-in still does the same thing, which is where the rule came from', () => {
    expect(files.login).toContain('window.location.assign(next)')
  })

  it('still uses the router for the redirects that are not auth handovers', () => {
    // Bouncing a signed-out visitor to `/login` is an ordinary navigation:
    // nothing has changed about who they are, so the cache is not stale.
    expect(files.onboarding).toContain("router.replace('/login?next=%2Fonboarding')")
  })
})

/**
 * `/setup` is the one route that works on an empty database, so it cannot sit
 * behind `requireAdmin` on day zero — there is no admin to satisfy it.
 *
 * That reasoning expires the moment an organiser exists, and it was left in
 * place. A player who found the URL was shown a committee wizard reading
 * "Step 3 of 3 — the hall is ready" above a button labelled "Open the admin
 * console". Nothing they could press would have worked (RLS refuses every
 * write and `claim_first_admin()` refuses once any admin exists), but that is
 * not the point: it read as *"my player account has organiser access"*, which
 * is exactly how it was reported.
 */
describe('the first-run setup page closes behind the committee', () => {
  const source = readFileSync(join(process.cwd(), 'src/app/setup/page.tsx'), 'utf8')

  it('turns non-admins away once an organiser exists', () => {
    expect(source).toContain('status.hasAdmin')
    // `requireAdmin`, not a bare role check: it sends a signed-out visitor to
    // sign in, where a bare check produced a 403 page that opens "you're
    // signed in, but this area needs a different role" at someone who is not
    // signed in at all.
    expect(source).toContain("requireAdmin('/setup')")
    expect(source).not.toContain("redirect('/403')")
  })

  it('stays open while there is genuinely no other way in', () => {
    // An unconfigured deployment sends people here to explain itself
    // (`requireAuth`), and a database with no organiser has nobody who could
    // pass an admin check. Both must still reach the page.
    const guard = source.slice(source.indexOf('const status'), source.indexOf('return ('))
    expect(guard).toContain('status.isConfigured')
    expect(guard).toContain('status.hasAdmin')
  })
})
