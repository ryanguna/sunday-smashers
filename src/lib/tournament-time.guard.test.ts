import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { formatTournamentTime, formatTournamentTimeRange } from './tournament'
import {
  defaultTournamentSettings,
  formatSydneyDate,
  parseWallClock,
  toDateInput,
  validateTournamentDetails,
  type TournamentDetails,
} from './settings'

/**
 * The site could say which day the tournament was and never what time.
 *
 * `tournaments.tournament_date` is a `date` column, so there was nowhere to
 * put a start time — and the console hid that rather than admitting it. The
 * field rendered as a `datetime-local` labelled "first serve" and read back
 * "Currently Sun, 13 Dec 2026, 11:00 am (Sydney time)", which was invented:
 * a bare date parsed as UTC midnight formats in Sydney as 11am. Any time the
 * committee typed was discarded on save.
 *
 * Migration 0019 adds real `start_time` / `end_time` columns.
 */

const read = (relative: string) =>
  readFileSync(path.join(process.cwd(), 'src', relative), 'utf8')

describe('formatTournamentTime', () => {
  it('drops the minutes on a whole hour', () => {
    expect(formatTournamentTime('11:00:00')).toBe('11am')
    expect(formatTournamentTime('17:00:00')).toBe('5pm')
  })

  it('keeps the minutes when there are any', () => {
    expect(formatTournamentTime('08:30:00')).toBe('8:30am')
    expect(formatTournamentTime('17:45')).toBe('5:45pm')
  })

  it('handles noon and midnight without calling either 0', () => {
    expect(formatTournamentTime('12:00')).toBe('12pm')
    expect(formatTournamentTime('00:30')).toBe('12:30am')
  })

  it('says nothing rather than "Invalid Date"', () => {
    expect(formatTournamentTime(null)).toBe('')
    expect(formatTournamentTime('')).toBe('')
    expect(formatTournamentTime('not a time')).toBe('')
    expect(formatTournamentTime('99:99')).toBe('')
  })
})

describe('formatTournamentTimeRange', () => {
  it('reads as the phrase the committee used', () => {
    expect(formatTournamentTimeRange('11:00:00', '17:00:00')).toBe('11am to 5pm')
  })

  it('stays silent unless both ends are known', () => {
    // "From 11am" with no finish is what people plan a whole Sunday around
    // and get wrong, so a half-known window says nothing at all.
    expect(formatTournamentTimeRange('11:00:00', null)).toBe('')
    expect(formatTournamentTimeRange(null, '17:00:00')).toBe('')
    expect(formatTournamentTimeRange(null, null)).toBe('')
  })
})

describe('the tournament day is a day, not an instant', () => {
  it('reads a date input straight off the stored value', () => {
    // Round-tripping through `Date` is what shifted this: a `date` column
    // parses as UTC midnight, which is the previous day west of Greenwich.
    expect(toDateInput('2026-12-13')).toBe('2026-12-13')
    expect(toDateInput('2026-12-13T09:00:00+11:00')).toBe('2026-12-13')
    expect(toDateInput(null)).toBe('')
  })

  it('reads the day back without a time beside it', () => {
    expect(formatSydneyDate('2026-12-13')).toBe('Sun, 13 Dec 2026')
    expect(formatSydneyDate(null)).toBe('—')
  })

  it('no longer offers a time on the field that cannot store one', () => {
    const form = read('components/settings/TournamentDetailsForm.tsx')
    expect(form).not.toContain('label="Tournament day (first serve)"')
    expect(form).toContain('label="First serve"')
    expect(form).toContain('label="Play finishes"')
  })
})

describe('validating the playing window', () => {
  const details = (over: Partial<TournamentDetails> = {}): TournamentDetails => ({
    ...defaultTournamentSettings().details,
    startTime: '11:00',
    endTime: '17:00',
    ...over,
  })
  const errorsOn = (path: string, over: Partial<TournamentDetails>) =>
    validateTournamentDetails(details(over)).filter(
      (issue) => issue.path === path && issue.severity === 'error',
    )

  it('accepts a normal day', () => {
    expect(errorsOn('details.startTime', {})).toHaveLength(0)
    expect(errorsOn('details.endTime', {})).toHaveLength(0)
  })

  it('accepts both being unset, because it may not be decided', () => {
    expect(errorsOn('details.startTime', { startTime: '', endTime: '' })).toHaveLength(0)
    expect(errorsOn('details.endTime', { startTime: '', endTime: '' })).toHaveLength(0)
  })

  it('refuses half a window', () => {
    expect(errorsOn('details.endTime', { endTime: '' })).toHaveLength(1)
    expect(errorsOn('details.startTime', { startTime: '' })).toHaveLength(1)
  })

  it('refuses a day that finishes before it starts', () => {
    expect(errorsOn('details.endTime', { startTime: '17:00', endTime: '11:00' })).toHaveLength(1)
    expect(errorsOn('details.endTime', { startTime: '11:00', endTime: '11:00' })).toHaveLength(1)
  })

  it('parses wall-clock times to comparable minutes', () => {
    expect(parseWallClock('11:00')).toBe(660)
    expect(parseWallClock('17:30')).toBe(1050)
    expect(parseWallClock('rubbish')).toBeNull()
    expect(parseWallClock('')).toBeNull()
  })
})

describe('where the time is shown', () => {
  it('appears in the landing hero beside the date', () => {
    const landing = read('app/page.tsx')
    expect(landing).toContain('formatTournamentTimeRange(tournament.startTime, tournament.endTime)')
    expect(landing).toContain('{timeRange}')
  })

  it('is saved by the console, not silently dropped', () => {
    const actions = read('app/admin/settings/actions.ts')
    expect(actions).toContain('start_time: details.startTime.trim() || null')
    expect(actions).toContain('end_time: details.endTime.trim() || null')
  })

  it('is readable by the anonymous site', () => {
    // The public view names its columns, so a new column on the table is
    // invisible to every player-facing page until it is listed there too.
    const migration = readFileSync(
      path.join(process.cwd(), 'supabase/migrations/0019_tournament_start_and_end_time.sql'),
      'utf8',
    )
    expect(migration).toContain('create or replace view public.tournament_public')
    expect(migration).toContain('start_time')
    expect(migration).toContain('end_time')
  })
})
