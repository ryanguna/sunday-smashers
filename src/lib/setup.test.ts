import { describe, expect, it } from 'vitest'
import {
  canSubmitSetupForm,
  deriveSetupStage,
  formatEntryFee,
  isSetupComplete,
  parseEntryFeeCents,
  setupFormErrors,
  slugify,
  validateSetupForm,
  type SetupFormValues,
  type SetupStatus,
} from './setup'

const status = (over: Partial<SetupStatus> = {}): SetupStatus => ({
  isConfigured: true,
  hasAdmin: false,
  hasTournament: false,
  isSignedIn: false,
  ...over,
})

const form = (over: Partial<SetupFormValues> = {}): SetupFormValues => ({
  name: 'Sunday Smashers Christmas Mini Tournament',
  slug: 'sunday-smashers-christmas-2026',
  tournamentDate: '2026-12-13T09:00:00+11:00',
  venueName: 'Olympic Park Sports Centre',
  venueAddress: 'Sydney Olympic Park NSW',
  description: 'Men\u2019s and women\u2019s doubles.',
  registrationOpensAt: '2026-09-06T00:00:00+10:00',
  registrationClosesAt: '2026-12-06T23:59:00+11:00',
  registrationCloseConfirmed: true,
  contactName: 'Committee',
  contactEmail: 'committee@example.com',
  contactPhone: '0400 000 000',
  entryFee: '25',
  paymentInstructions: 'PayID committee@example.com, reference your name.',
  doorsOpenAt: '2026-12-13T08:15:00+11:00',
  ...over,
})

describe('deriveSetupStage', () => {
  it('asks for an account before anything else', () => {
    expect(deriveSetupStage(status()).stage).toBe('needs-account')
  })

  it('offers the admin claim once signed in on an ownerless system', () => {
    expect(deriveSetupStage(status({ isSignedIn: true })).stage).toBe('claim-admin')
  })

  it('moves to the tournament form once an admin exists', () => {
    const info = deriveSetupStage(status({ isSignedIn: true, hasAdmin: true }))
    expect(info.stage).toBe('create-tournament')
    expect(info.step).toBe(3)
  })

  it('is complete only when BOTH an admin and a tournament exist', () => {
    expect(deriveSetupStage(status({ hasAdmin: true, hasTournament: true })).stage).toBe('complete')
    expect(isSetupComplete(status({ hasAdmin: true, hasTournament: true }))).toBe(true)
  })

  it('is NOT complete when a tournament exists but nobody can administer it', () => {
    // The dangerous half-state: rows exist, but no human can reach the console.
    expect(isSetupComplete(status({ hasAdmin: false, hasTournament: true }))).toBe(false)
    expect(deriveSetupStage(status({ hasTournament: true, isSignedIn: true })).stage).toBe(
      'claim-admin',
    )
  })

  it('never reports a step outside 1..totalSteps', () => {
    for (const isConfigured of [true, false]) {
      for (const hasAdmin of [true, false]) {
        for (const hasTournament of [true, false]) {
          for (const isSignedIn of [true, false]) {
            const info = deriveSetupStage({ isConfigured, hasAdmin, hasTournament, isSignedIn })
            expect(info.step).toBeGreaterThanOrEqual(1)
            expect(info.step).toBeLessThanOrEqual(info.totalSteps)
            expect(info.heading.length).toBeGreaterThan(0)
            expect(info.blurb.length).toBeGreaterThan(0)
          }
        }
      }
    }
  })
})

describe('slugify', () => {
  it('produces a url-safe slug', () => {
    expect(slugify('Sunday Smashers Christmas Mini Tournament')).toBe(
      'sunday-smashers-christmas-mini-tournament',
    )
  })

  it('strips accents, punctuation and repeated separators', () => {
    expect(slugify("Noe\u0308l  --  Smash!! 2026")).toBe('noel-smash-2026')
  })

  it('never leaves a leading or trailing hyphen, even after truncation', () => {
    const long = slugify('a'.repeat(58) + ' bbbb')
    expect(long).not.toMatch(/^-|-$/)
    expect(long.length).toBeLessThanOrEqual(60)
  })

  it('returns empty for input with nothing slug-worthy', () => {
    expect(slugify('!!! ???')).toBe('')
  })
})

describe('parseEntryFeeCents', () => {
  it.each([
    ['25', 2500],
    ['25.50', 2550],
    ['$25', 2500],
    ['0', 0],
    [' 12.05 ', 1205],
  ])('parses %s', (input, expected) => {
    expect(parseEntryFeeCents(input)).toBe(expected)
  })

  it.each(['', '  ', 'abc', '25.505', '-5', '1,000'])('rejects %s', (input) => {
    expect(parseEntryFeeCents(input)).toBe(null)
  })

  it('round-trips through formatEntryFee', () => {
    expect(formatEntryFee(parseEntryFeeCents('25'))).toBe('25')
    expect(formatEntryFee(parseEntryFeeCents('25.50'))).toBe('25.50')
    expect(formatEntryFee(null)).toBe('')
  })
})

describe('validateSetupForm', () => {
  it('accepts a fully filled form with no errors or warnings', () => {
    expect(validateSetupForm(form())).toEqual([])
    expect(canSubmitSetupForm(form())).toBe(true)
  })

  it('delegates shared rules to validateTournamentDetails rather than restating them', () => {
    // A close date after the tournament is a rule owned by settings.ts; if the
    // delegation ever breaks, this catches it.
    const issues = validateSetupForm(form({ registrationClosesAt: '2026-12-20T00:00:00+11:00' }))
    expect(issues.some((i) => i.path === 'details.registrationClosesAt')).toBe(true)
  })

  it.each([
    ['', 'blank'],
    ['Not A Slug', 'uppercase and spaces'],
    ['-leading', 'leading hyphen'],
    ['trailing-', 'trailing hyphen'],
    ['double--hyphen', 'doubled hyphen'],
  ])('rejects the slug %s (%s)', (slug) => {
    expect(setupFormErrors(form({ slug })).some((i) => i.path === 'slug')).toBe(true)
  })

  it('rejects an unparseable fee but only warns when it is left blank', () => {
    expect(setupFormErrors(form({ entryFee: 'twenty five' })).some((i) => i.path === 'entryFee')).toBe(
      true,
    )
    const blank = validateSetupForm(form({ entryFee: '' }))
    expect(blank.some((i) => i.path === 'entryFee' && i.severity === 'warning')).toBe(true)
    expect(setupFormErrors(form({ entryFee: '' }))).toEqual([])
  })

  it('warns when a fee is set with no way to pay it', () => {
    const issues = validateSetupForm(form({ paymentInstructions: '' }))
    expect(issues.some((i) => i.path === 'paymentInstructions' && i.severity === 'warning')).toBe(true)
  })

  it('rejects doors opening after the first serve', () => {
    const issues = setupFormErrors(form({ doorsOpenAt: '2026-12-13T10:00:00+11:00' }))
    expect(issues.some((i) => i.path === 'doorsOpenAt')).toBe(true)
  })

  it('warns when no arrival time is given, because late arrival forfeits', () => {
    const issues = validateSetupForm(form({ doorsOpenAt: '' }))
    expect(issues.some((i) => i.path === 'doorsOpenAt' && i.severity === 'warning')).toBe(true)
    expect(canSubmitSetupForm(form({ doorsOpenAt: '' }))).toBe(true)
  })

  it('warnings never block submission; errors always do', () => {
    const warnOnly = form({ entryFee: '', doorsOpenAt: '', paymentInstructions: '' })
    expect(validateSetupForm(warnOnly).length).toBeGreaterThan(0)
    expect(canSubmitSetupForm(warnOnly)).toBe(true)

    expect(canSubmitSetupForm(form({ name: 'x' }))).toBe(false)
  })
})

describe('deriveSetupStage — no database connected', () => {
  it('says so instead of reporting the other flags', () => {
    // Regression: demo mode used to report hasAdmin/hasTournament as true, so
    // /setup told an organiser "an organiser and a tournament both exist" on a
    // site with no database behind it at all.
    const info = deriveSetupStage(status({ isConfigured: false }))
    expect(info.stage).toBe('unconfigured')
    expect(info.heading).toBe('Connect a database first')
  })

  it('outranks every other stage, since the flags mean nothing without a database', () => {
    const info = deriveSetupStage(
      status({ isConfigured: false, hasAdmin: true, hasTournament: true, isSignedIn: true })
    )
    expect(info.stage).toBe('unconfigured')
  })
})
