import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { REGISTRATION_FORM_PATH, shouldPromptRegistration } from './registration-gate'

/**
 * Signing up and entering the tournament are one intention.
 *
 * Before this, creating an account left you on a dashboard for a tournament
 * you had not entered, behind a "Register to play" button you had to notice —
 * so an account could exist in `profiles` with nothing in `registrations`,
 * and nobody found out until the draw was built.
 */

const read = (relative: string) =>
  readFileSync(path.join(process.cwd(), 'src', relative), 'utf8')

describe('shouldPromptRegistration', () => {
  const base = { status: null, isStaff: false, acceptsSubmissions: true } as const

  it('prompts a player who has an account but no entry', () => {
    expect(shouldPromptRegistration(base)).toBe(true)
  })

  it('leaves staff alone', () => {
    // Organisers are often not entrants. Bouncing an admin to the entry form
    // every time they opened their dashboard would make the console unusable.
    expect(shouldPromptRegistration({ ...base, isStaff: true })).toBe(false)
  })

  it('stays quiet when there is no form to submit', () => {
    // Before the sheet opens and once the tournament is under way there is
    // nothing to do at `/register`, and a redirect to a dead end is a trap.
    expect(shouldPromptRegistration({ ...base, acceptsSubmissions: false })).toBe(false)
  })

  it('leaves every decided and undecided entry to the approval gate', () => {
    // Pending, waitlisted and declined players belong on `/status`. If this
    // returned true for any of them, `/dashboard` would send them to
    // `/register`, which sends an entered player to `/status` — a volley.
    for (const status of ['pending', 'approved', 'waitlisted', 'rejected'] as const) {
      expect(shouldPromptRegistration({ ...base, status })).toBe(false)
    }
  })

  it('points at the entry form', () => {
    expect(REGISTRATION_FORM_PATH).toBe('/register')
  })
})

describe('the signup journey ends at the entry form', () => {
  it('sends a finished profile to the entry form, not the dashboard', () => {
    const onboarding = read('app/onboarding/page.tsx')
    expect(onboarding).toContain("window.location.assign('/register')")
    expect(onboarding).not.toContain("window.location.assign('/dashboard')")
  })

  it('prompts an unentered account from the dashboard', () => {
    const dashboard = read('app/dashboard/page.tsx')
    expect(dashboard).toContain('promptRegistrationIfNeeded()')
    // Order matters: the approval gate runs first, so a pending player is
    // sent to `/status` rather than asked to enter a second time.
    expect(dashboard.indexOf('requireApprovedPlayer')).toBeLessThan(
      dashboard.indexOf('promptRegistrationIfNeeded()'),
    )
  })

  it('sends an entered player off the entry form, so the two cannot volley', () => {
    const register = read('app/register/page.tsx')
    expect(register).toContain('loadViewerRegistrationStatus()')
    expect(register).toContain('redirect(REGISTRATION_STATUS_PATH)')
  })

  it('lets a player decline the redirect and enter a second division', () => {
    // Entries are per division and the database allows a second one, so this
    // has to be a nudge rather than a wall across a legitimate path.
    expect(read('app/register/page.tsx')).toContain('params.again == null')
  })

  it('does not promise an entry list before the entry form is reached', () => {
    // The old subtitle said "you're on the entry list" and then handed people
    // a dashboard. Either the promise or the flow had to change; both did.
    const signup = read('app/signup/page.tsx')
    expect(signup).not.toContain("you're on the entry list")
    expect(signup).toMatch(/tournament entry/i)
  })
})
