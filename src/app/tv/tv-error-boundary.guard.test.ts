import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `/tv` is the one surface with no operator. It runs on a monitor bolted to a
 * gym wall for the length of the tournament, so a render throw there is not a
 * page a user retries -- it is a dead screen for the rest of the day.
 *
 * Without this file, the throw fell through to `src/app/error.tsx`: light
 * theme, site chrome, and a "Try again" button nobody is standing next to.
 * These assertions pin the properties that make it unattended-safe, none of
 * which survive a casual "tidy up the error pages" refactor.
 */
const FILE = path.resolve(__dirname, 'error.tsx')

describe('the courtside TV view recovers on its own', () => {
  it('has its own error boundary rather than inheriting the site one', () => {
    expect(
      existsSync(FILE),
      'src/app/tv/error.tsx is gone — /tv now falls back to the site-wide error page'
    ).toBe(true)
  })

  const source = existsSync(FILE) ? readFileSync(FILE, 'utf8') : ''

  it('is a client component, since a boundary has to hold state', () => {
    expect(source.trimStart().startsWith("'use client'")).toBe(true)
  })

  it('retries without anyone touching the screen', () => {
    // A boundary that only calls reset() from onClick is the bug this replaced.
    const effects = [...source.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\n  \}/g)].map(
      (m) => m[1]
    )
    expect(effects.length).toBeGreaterThan(0)
    expect(
      effects.some((body) => body.includes('reset()')),
      'reset() is never called from an effect, so the screen waits for a human'
    ).toBe(true)
    expect(source).toMatch(/setInterval|setTimeout/)
  })

  it('stays on the dark high-contrast palette the monitor uses', () => {
    // The TV layout paints #1c0f2e; a light error screen is unreadable from
    // across a gym and jarring next to the scoreboard it replaces.
    expect(source).toContain('#1c0f2e')
    expect(source).toContain('text-white')
  })
})

/**
 * This tournament officiates itself: the umpire, scoresheet person and two
 * line judges for a match are the players of the *next* match on that court.
 * The side panel beside the score is the only place courtside that says so,
 * and as one slide among seven it was on screen for 12 seconds in every 84 —
 * long enough to be missed by exactly the people who need it, which stalls
 * the next match while somebody goes looking for them.
 */
describe('the duty roster is never more than one slide away', () => {
  const source = readFileSync(path.resolve(__dirname, '..', '..', 'components', 'tv', 'Scoreboard.tsx'), 'utf8')

  function slidesBlock(): string {
    const start = source.indexOf('const slides = useMemo(')
    expect(start, 'the slide list moved — update this test').toBeGreaterThan(-1)
    return source.slice(start, source.indexOf('}, [upNext,', start))
  }

  it('interleaves Up Next between the other panels rather than queueing it once', () => {
    const block = slidesBlock()
    expect(block).toContain('interleaved')
    // Every other slide is followed by the roster again.
    expect(block).toMatch(/for \(const slide of others\) \{[\s\S]*?interleaved\.push\(upNextSlide\)/)
  })

  it('still starts the rotation on the roster', () => {
    expect(slidesBlock()).toMatch(/const interleaved[^=]*= \[upNextSlide\]/)
  })

  it('does not rotate through an empty notices panel', () => {
    // An announcements slide with nothing in it is 12 seconds of dead air on
    // a screen whose whole job is to be glanceable.
    expect(slidesBlock()).toContain('announcements.length > 0')
  })
})
