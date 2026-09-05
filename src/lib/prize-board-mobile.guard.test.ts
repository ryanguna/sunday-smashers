import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { placingsFor, type PublicDivisionPrize } from './settings'

/**
 * The prize board and the pre-registration countdown are both read by people
 * standing in a gym holding a phone, and both had lost that argument: the
 * prizes were in a horizontally scrolling table whose money sat off the right
 * edge, and the countdown was labelled "Registration" next to a date it was
 * not counting to. Component behaviour cannot be asserted here — vitest runs
 * `src/**\/*.test.ts` only, so `.tsx` files are never collected — so these read
 * the source and pin the shape of the fix.
 */

const read = (relative: string) =>
  readFileSync(path.join(process.cwd(), 'src', relative), 'utf8')

describe('the prize board reads on a phone', () => {
  const landing = read('app/page.tsx')

  it('does not put the prize money in a table', () => {
    // A five-column table cannot fit a phone, so it was wrapped in an
    // `overflow-x-auto` box with a `min-w-[30rem]` floor — which is a scroll
    // gesture the page never advertised, hiding every amount.
    const prizeSection = landing.slice(landing.indexOf('prizes-heading'))
    expect(prizeSection).not.toContain('<table')
    expect(prizeSection).not.toContain('min-w-[30rem]')
  })

  it('renders one card per division from the shared placing order', () => {
    expect(landing).toContain('prizeBoard.divisionPrizes.map')
    expect(landing).toContain('placingsFor(prize)')
  })

  it('says the total prize pool can move', () => {
    // The pool is budgeted against an entry count nobody has yet. Saying so
    // beside the figure is the difference between a projection that was
    // adjusted and prize money that appears to have quietly shrunk.
    expect(landing).toMatch(/prize pool is subject to change/i)
  })
})

describe('placingsFor', () => {
  const prize: PublicDivisionPrize = {
    divisionId: 'd1',
    divisionName: "Men's Doubles",
    championCents: 10_000,
    runnerUpCents: 7_500,
    thirdPlaceCents: 6_000,
    fourthPlaceCents: 0,
  }

  it('lists the podium in finishing order', () => {
    expect(placingsFor(prize).map((placing) => placing.label)).toEqual([
      'Champion',
      'Runner-up',
      '3rd place',
      '4th place',
    ])
  })

  it('carries each placing its own amount', () => {
    expect(placingsFor(prize).map((placing) => placing.amountCents)).toEqual([
      10_000, 7_500, 6_000, 0,
    ])
  })

  it('leaves an unset amount as zero for the caller to caption', () => {
    // Fourth place was added after the prizes were budgeted, so an unset
    // amount means "not decided yet". The page renders that as "To be
    // confirmed" — a literal $0.00 beside real money reads as a bug.
    expect(placingsFor(prize)[3]?.amountCents).toBe(0)
    expect(read('app/page.tsx')).toContain('To be confirmed')
  })
})

describe('the countdown calls the window pre-registration', () => {
  it('labels the open window as pre-registration closing', () => {
    // Entering is a request the committee reviews. Calling it "registration"
    // in the countdown while the rest of the site says "pre-registration"
    // reads as two separate deadlines.
    const tournament = read('lib/tournament.ts')
    expect(tournament).toContain("countdownLabel: 'Pre-registration closes in'")
    expect(tournament).not.toContain("countdownLabel: 'Registration closes in'")
  })

  it('never pairs the countdown label with a date', () => {
    // The dashboard printed "<label> · <tournament date>", putting match day
    // beside a clock counting to the registration deadline instead.
    const dashboard = read('components/dashboard/DashboardStates.tsx')
    expect(dashboard).toContain('{phase.countdownLabel}')
    expect(dashboard).not.toMatch(/countdownLabel\}\s*·/)
    expect(dashboard).not.toContain('formatTournamentDateLabel')
  })

  it('keeps the registration page headings on the same wording', () => {
    const registration = read('lib/registration.ts')
    expect(registration).not.toMatch(/heading: 'Registration is/)
    expect(registration).toContain("heading: 'Pre-registration is OPEN — grab your spot!'")
  })
})
