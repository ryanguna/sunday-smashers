import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

import { TOURNAMENT_DATE, PRE_REGISTRATION_OPENS_AT, REGISTRATION_CLOSES_AT } from './tournament'

/**
 * A guard against this project's single most persistent defect class.
 *
 * Eight separate times now, a list or constant that already had a home has
 * been restated somewhere else, and the two copies then drifted:
 *
 *   1. match-status lists            5. signature side-attribution
 *   2. the reduced-motion allowlist  6. 'walkover' missing from a policy
 *   3. the canonical site URL        7. a duplicate player-name view
 *   4. heading levels / loading markup
 *   8. `TOURNAMENT_DATE` redeclared in `src/lib/tv/types.ts`, so changing the
 *      date would have left the courtside TV countdown on the old one.
 *
 * Every one was found by reading, not by a test. This test makes number nine
 * fail in CI instead: the tournament dates may be written down exactly once,
 * in `src/lib/tournament.ts`. Everywhere else must import them.
 */

const SRC = join(__dirname, '..')
const OWNER = join(SRC, 'lib', 'tournament.ts')

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      sourceFiles(full, acc)
    } else if (/\.(ts|tsx)$/.test(entry)) {
      acc.push(full)
    }
  }
  return acc
}

describe('the tournament dates have exactly one home', () => {
  const dates = [
    ['TOURNAMENT_DATE', TOURNAMENT_DATE],
    ['PRE_REGISTRATION_OPENS_AT', PRE_REGISTRATION_OPENS_AT],
    ['REGISTRATION_CLOSES_AT', REGISTRATION_CLOSES_AT],
  ] as const

  it.each(dates)('%s is not hardcoded anywhere but src/lib/tournament.ts', (name, value) => {
    const offenders = sourceFiles(SRC)
      .filter((file) => file !== OWNER)
      // Tests legitimately reference the values to assert on them; the rule is
      // about *shipped* code silently carrying a second copy.
      .filter((file) => !/\.test\.tsx?$/.test(file))
      .filter((file) => readFileSync(file, 'utf8').includes(value))
      .map((file) => relative(SRC, file))

    expect(
      offenders,
      `${name} (${value}) is written out again in: ${offenders.join(', ')}.\n` +
        'Import it from "@/lib/tournament" instead — a second copy will drift the moment the date changes.',
    ).toEqual([])
  })

  it('the date label agrees with the date it claims to describe', () => {
    // The label is hand-written, so it can disagree with TOURNAMENT_DATE
    // without anything complaining. It has to be checked somewhere.
    const formatted = new Date(TOURNAMENT_DATE).toLocaleDateString('en-AU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Australia/Sydney',
    })
    // en-AU renders "Sunday, 13 December 2026" as "Sunday 13 December 2026" in
    // some ICU builds, so compare on the parts rather than the punctuation.
    const label = readFileSync(OWNER, 'utf8').match(
      /TOURNAMENT_DATE_LABEL = '([^']+)'/,
    )?.[1]
    expect(label).toBeDefined()
    for (const part of formatted.replace(/,/g, '').split(' ')) {
      expect(label).toContain(part)
    }
  })
})
