import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The waitlist status had two homes that disagreed.
 *
 * `decideRegistrationOutcome` returns 'waitlisted' when the window has closed
 * or the division is full, and the confirmation screen said so — but the
 * insert in `data.ts` hard-coded `status: 'pending'`, so the committee saw an
 * ordinary entry. Approving the queue top-to-bottom would then quietly promote
 * waitlisted players past the cap the waitlist exists to enforce.
 *
 * The second half was that the confirmation screen read `?status=`, which the
 * player can retype. "You're in!" on a page that anyone can summon is not a
 * status, it is a decoration.
 *
 * Both are shapes a rendering test cannot see, so they are asserted against
 * the source.
 */

function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), 'src', ...parts), 'utf8')
}

describe('the registration insert records the decided status', () => {
  const source = read('components', 'registration', 'data.ts')

  /**
   * Only the insert block matters. The file's failure-result objects
   * legitimately carry a bare `status,`, and the enclosing function has its
   * own `status` parameter, so a whole-file scan reports those as violations.
   */
  function insertBlock(): string {
    // Three queries touch `registrations` in this file; only the insert is in
    // scope. Find it by the chain rather than by position, so adding another
    // read above it does not silently move the window.
    const matches = [...source.matchAll(/\.from\('registrations'\)/g)]
    const insert = matches.find((match) => {
      const after = source.slice(match.index ?? 0)
      return after.slice(0, 200).includes('.insert(')
    })
    expect(insert, "no `.from('registrations').insert(` found — update this test").toBeDefined()
    const start = insert?.index ?? 0
    const end = source.indexOf('.select(', start)
    expect(end).toBeGreaterThan(start)
    return source.slice(start, end)
  }

  it('does not hard-code pending', () => {
    // The exact line that caused the bug.
    expect(insertBlock()).not.toMatch(/status: 'pending',/)
  })

  it('derives the persisted status from the decided one', () => {
    expect(insertBlock()).toMatch(/status: status === 'waitlisted' \? 'waitlisted' : 'pending'/)
  })

  it('clamps rather than passing the client value straight through', () => {
    // `status` arrives from the browser. Writing it unfiltered would hand the
    // player the whole `registration_status` enum and leave RLS as the only
    // guard, surfacing as a raw database error.
    expect(insertBlock()).not.toMatch(/^\s*status,\s*$/m)
  })
})

describe('the confirmation screen trusts the database over the URL', () => {
  const source = read('app', 'register', 'success', 'page.tsx')

  it('reads the saved registration', () => {
    expect(source).toContain("from('registrations')")
    expect(source).toContain('persistedStatus')
  })

  it('prefers the saved status and keeps the query parameter only as a fallback', () => {
    expect(source).toMatch(/await persistedStatus\(divisionId\)\) \?\? readStatus\(params\.status\)/)
  })

  it('scopes the lookup to the signed-in player, not just the division', () => {
    expect(source).toContain("eq('player_id', user.id)")
  })

  it('never lets a failed read throw on a page the player has just been redirected to', () => {
    expect(source).toMatch(/catch \{\s*return null\s*\}/)
  })
})

describe('the redirect carries what the confirmation screen needs', () => {
  const source = read('components', 'registration', 'RegisterExperience.tsx')

  it('passes the division id, not only its display name', () => {
    expect(source).toContain("params.set('divisionId', result.divisionId)")
  })
})

describe('the waitlist badge matches the admin queue', () => {
  it('does not use the same badge for both outcomes', () => {
    const source = read('components', 'registration', 'ConfirmationPanel.tsx')
    // Was `status === 'waitlisted' ? 'pending' : 'pending'` — both branches
    // identical, so a waitlisted player saw the ordinary pending badge.
    expect(source).not.toMatch(/\?\s*'pending'\s*:\s*'pending'/)
    expect(source).toMatch(/status === 'waitlisted' \? 'info' : 'pending'/)
  })

  it('uses the colour the admin console uses for waitlisted', () => {
    const admin = read('components', 'admin', 'RegistrationsClient.tsx')
    expect(admin).toMatch(/waitlisted: 'info'/)
  })
})
