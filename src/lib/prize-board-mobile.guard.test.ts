import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  PLAYERS_PER_PAIR,
  formatCents,
  formatList,
  placingsFor,
  type PublicDivisionPrize,
} from './settings'

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

  it('carries each placing both the pair figure and the per-player split', () => {
    // Stored amounts are per player. The board leads with the pair figure, so
    // it must be derived here — a card showing the per-player amount summed to
    // half the total pool printed directly above it.
    expect(placingsFor(prize).map((placing) => placing.pairCents)).toEqual([
      20_000, 15_000, 12_000, 0,
    ])
    expect(placingsFor(prize).map((placing) => placing.perPlayerCents)).toEqual([
      10_000, 7_500, 6_000, 0,
    ])
  })

  it('adds up to the same pool the landing page advertises', () => {
    // The headline total is summed per player and multiplied by the pair size.
    // If these two ever drift, the page contradicts itself in two places a
    // reader can see at once.
    const pairTotal = placingsFor(prize).reduce((total, placing) => total + placing.pairCents, 0)
    const perPlayerTotal = placingsFor(prize).reduce(
      (total, placing) => total + placing.perPlayerCents,
      0,
    )
    expect(pairTotal).toBe(perPlayerTotal * PLAYERS_PER_PAIR)
  })

  it('says the figure is what the pair takes home, not what one player gets', () => {
    const landing = read('app/page.tsx')
    expect(landing).toContain('what the pair takes home')
    expect(landing).toContain('each')
    // The old caption led with "Amounts are per player", which is true of the
    // stored data and misleading beside a pair-sized figure.
    expect(landing).not.toMatch(/Amounts are\{' '\}/)
  })

  it('leaves an unset amount as zero for the caller to caption', () => {
    // Fourth place was added after the prizes were budgeted, so an unset
    // amount means "not decided yet". The page renders that as "To be
    // confirmed" — a literal $0.00 beside real money reads as a bug.
    expect(placingsFor(prize)[3]?.pairCents).toBe(0)
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

describe('formatList', () => {
  it('reads as prose, not as an array', () => {
    expect(formatList(['champion', 'runner-up', '3rd place'])).toBe(
      'champion, runner-up and 3rd place',
    )
    expect(formatList(['champion'])).toBe('champion')
  })

  it('lets the summary card name the placings the pool actually funds', () => {
    // The card used to hardcode "champion, runner-up and third place" while a
    // funded 4th place was listed in the board directly beneath it.
    const landing = read('app/page.tsx')
    expect(landing).toContain('formatList(paidPlacings)')
    expect(landing).toContain('paid in every division')
  })
})

describe('formatCents', () => {
  it('groups thousands, because the prize pool is four figures', () => {
    // The landing page headline read "$2080.00", which is misread at a glance
    // on the one number that promises players real money.
    expect(formatCents(208_000)).toBe('$2,080.00')
    expect(formatCents(1_000_000)).toBe('$10,000.00')
  })

  it('leaves smaller amounts alone', () => {
    expect(formatCents(5_000)).toBe('$50.00')
    expect(formatCents(0)).toBe('$0.00')
    expect(formatCents(-2_500)).toBe('-$25.00')
  })
})
