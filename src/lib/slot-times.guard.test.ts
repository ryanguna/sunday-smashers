import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `matchStartIso` tells a player what time to be on court. It used to compute
 * that from `slotIndex * 15 minutes` after 9:00am, which is a guess about a
 * schedule the organisers configure freely in `/admin/schedule`. Move the first
 * slot or change its length and every player is quoted the wrong time, with
 * nothing to signal the disagreement.
 *
 * The real answer is `time_slots.starts_at`, and it was already being loaded.
 * Two things keep it flowing, and neither is exercised by a unit test on its
 * own: the live match mapper has to carry it onto `PublicMatch`, and
 * `matchStartIso` has to prefer it. Pin both.
 */
function read(file: string): string {
  return readFileSync(path.resolve(__dirname, file), 'utf8')
}

describe('player match times come from the real schedule', () => {
  it('the live match mapper carries the slot start onto the match', () => {
    const source = read('public-data.ts')

    // Window on the live mapper. `slotStartsAt` also appears on the type and in
    // the demo mapper (hardcoded null), so a whole-file search would pass even
    // if the live path stopped setting it.
    const anchor = source.indexOf('const slot = m.time_slot_id ? slotById.get(m.time_slot_id)')
    expect(anchor, 'live match mapper not found — has it been renamed?').toBeGreaterThan(-1)
    const mapper = source.slice(anchor, anchor + 1200)

    expect(mapper).toMatch(/slotStartsAt:\s*slot\?\.starts_at/)
  })

  it('matchStartIso consults the real start before falling back to the guess', () => {
    const source = read('dashboard.ts')

    const anchor = source.indexOf('export function matchStartIso')
    expect(anchor).toBeGreaterThan(-1)
    const fn = source.slice(anchor, anchor + 1200)

    const usesReal = fn.indexOf('match.slotStartsAt')
    const usesGuess = fn.indexOf('SLOT_MINUTES')
    expect(usesReal, 'matchStartIso ignores the real slot start').toBeGreaterThan(-1)
    expect(usesGuess, 'the slotIndex fallback has gone').toBeGreaterThan(-1)
    expect(
      usesReal,
      'the 15-minute guess is consulted before the real slot time'
    ).toBeLessThan(usesGuess)
  })
})
