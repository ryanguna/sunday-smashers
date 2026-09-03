import { describe, expect, it } from 'vitest'

import {
  formatTournamentDate,
  formatTournamentDateLabel,
  formatTournamentDayMonth,
} from './tournament'

/**
 * These formatters are the only sanctioned way for a screen to say the
 * tournament date out loud — `tournament-dates.guard.test.ts` bans typing it
 * into copy. That makes their behaviour on bad input load-bearing: if they
 * ever rendered "Invalid Date", the guard would have pushed a visible defect
 * into every page that used to be hardcoded and therefore safe.
 */
describe('formatTournamentDayMonth', () => {
  it('drops the year, because the surrounding copy already implies it', () => {
    expect(formatTournamentDayMonth('2026-12-13T09:00:00+11:00')).toBe('13 December')
  })

  it('follows the organiser rather than the seeded date', () => {
    expect(formatTournamentDayMonth('2027-01-24T09:00:00+11:00')).toBe('24 January')
  })

  it('uses Sydney time, so a 9am AEDT start never renders as the day before', () => {
    // 2026-12-13T09:00+11:00 is 2026-12-12T22:00Z. Formatted in the server's
    // own zone this is the 12th, and a Vercel lambda runs in UTC — so the
    // whole site would advertise the wrong day.
    expect(formatTournamentDayMonth('2026-12-12T22:00:00Z')).toBe('13 December')
  })

  it('returns empty for missing or unparseable input so callers can omit the clause', () => {
    expect(formatTournamentDayMonth(null)).toBe('')
    expect(formatTournamentDayMonth(undefined)).toBe('')
    expect(formatTournamentDayMonth('not a date')).toBe('')
  })
})

describe('the three formatters agree about which day it is', () => {
  // They are used side by side — the rules banner and the awards heading can
  // appear on screen together — so they must not disagree by a day at the
  // timezone boundary.
  const boundary = '2026-12-12T22:00:00Z'

  it('all render the 13th for a 9am AEDT start', () => {
    expect(formatTournamentDayMonth(boundary)).toContain('13')
    expect(formatTournamentDate(boundary)).toContain('13')
    expect(formatTournamentDateLabel(boundary)).toContain('13')
  })

  it('degrade differently on bad input, and deliberately so', () => {
    // The label backs off to the seeded date because it is used where a date
    // must appear; the other two return empty so the sentence can drop the
    // clause entirely.
    expect(formatTournamentDateLabel('nonsense')).toContain('December')
    expect(formatTournamentDate('nonsense')).toBe('')
    expect(formatTournamentDayMonth('nonsense')).toBe('')
  })
})
