import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `/forgot-password` tells a locked-out player to message an organiser,
 * because this tournament has no mail server and therefore no reset emails.
 * For a while that was a promise nothing could keep: the admin console had no
 * way to change anybody's password, so the organiser being messaged was as
 * stuck as the player messaging them.
 *
 * These tests pin the pieces that make the promise true. They read source as
 * text because vitest here runs `src/**\/*.test.ts` only — `.tsx` files are
 * never collected, so component wiring cannot be asserted by rendering it.
 */

function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), 'src', ...parts), 'utf8')
}

/** The source of one exported function, from its `export` to the next one. */
function functionSource(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`)
  expect(start).toBeGreaterThan(-1)
  const next = source.indexOf('\nexport ', start + 1)
  return next === -1 ? source.slice(start) : source.slice(start, next)
}

describe('admin password reset', () => {
  it('is reachable from the People & roles page', () => {
    const page = read('app', 'admin', 'settings', 'roles', 'page.tsx')
    expect(page).toContain('resetUserPasswordAction')
    expect(page).toContain('resetPassword={resetUserPasswordAction}')
  })

  it('re-checks admin before touching the service-role key', () => {
    const actions = read('app', 'admin', 'settings', 'actions.ts')
    const body = functionSource(actions, 'resetUserPasswordAction')

    // Order matters: the service-role client bypasses every RLS policy in the
    // database, so authorisation has to be established before it exists.
    const adminCheck = body.indexOf('ensureAdmin()')
    const clientBuild = body.indexOf('createAdminClient()')
    expect(adminCheck).toBeGreaterThan(-1)
    expect(clientBuild).toBeGreaterThan(adminCheck)
  })

  it('never writes the issued password to the audit log', () => {
    const actions = read('app', 'admin', 'settings', 'actions.ts')
    const body = functionSource(actions, 'resetUserPasswordAction')
    const auditStart = body.indexOf('buildAuditEntry')
    const auditCall = body.slice(auditStart, body.indexOf('\n  )', auditStart))
    expect(auditStart).toBeGreaterThan(-1)
    expect(auditCall).not.toContain('temporaryPassword')
    expect(auditCall).not.toContain('password:')
    // But the reset itself is still recorded — who reset whose password is
    // exactly the kind of thing a committee needs to be able to look up.
    expect(body).toContain("'settings.password.reset'")
  })

  it('explains the missing environment variable instead of failing silently', () => {
    const admin = read('lib', 'supabase', 'admin.ts')
    expect(admin).toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(admin).toContain('SERVICE_ROLE_SETUP_HINT')
    // Returning null rather than throwing is what keeps demo mode, CI and any
    // deployment without the key rendering the console normally.
    expect(admin).toContain('return null')
  })

  it('keeps the service-role key server-side', () => {
    const admin = read('lib', 'supabase', 'admin.ts')
    // A NEXT_PUBLIC_ prefix would inline it into the browser bundle, handing
    // every visitor full database access.
    expect(admin).not.toContain('NEXT_PUBLIC_SUPABASE_SERVICE')
    expect(admin).toContain("process.env.SUPABASE_SERVICE_ROLE_KEY")
  })

  it('tells the player what to expect on the forgot-password page', () => {
    const page = read('app', 'forgot-password', 'page.tsx')
    expect(page).toContain('one-time password')
  })
})

describe('scoresheet print route', () => {
  it('is behind the approval gate like every other scoresheet page', () => {
    // It renders names, scores and signatures. Gating the index and detail
    // pages while leaving the printable version open would have been a gate
    // with a door next to it.
    const page = read('app', 'scoresheets', '[matchId]', 'print', 'page.tsx')
    expect(page).toContain('requireApprovedPlayer')
    expect(page).not.toContain('requireAuth(')
  })
})
