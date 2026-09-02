import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HOW_IT_WORKS,
  describeTarget,
  howItWorksSteps,
  joinWithOr,
} from './tournament-copy'
import type { PublicDivisionSummary } from './tournament-config'

function division(overrides: Partial<PublicDivisionSummary> = {}): PublicDivisionSummary {
  return {
    id: 'd1',
    name: "Men's Doubles",
    gender: 'mens',
    elims: { pointsToWin: 15, deuce: false, cap: null },
    finals: { pointsToWin: 21, deuce: false, cap: null },
    qualifyingPlaces: 4,
    ...overrides,
  }
}

describe('joinWithOr', () => {
  it('returns an empty string for no values', () => {
    expect(joinWithOr([])).toBe('')
  })

  it('leaves a single value alone', () => {
    expect(joinWithOr([15])).toBe('15')
  })

  it('joins two values with "or"', () => {
    expect(joinWithOr([15, 21])).toBe('15 or 21')
  })

  it('uses commas before the final "or"', () => {
    expect(joinWithOr([11, 15, 21])).toBe('11, 15 or 21')
  })
})

describe('describeTarget', () => {
  it('describes a single no-deuce target', () => {
    expect(describeTarget([{ pointsToWin: 15, deuce: false, cap: null }])).toBe(
      'first to 15 points (no deuce)',
    )
  })

  it('describes a deuce target as win by 2', () => {
    expect(describeTarget([{ pointsToWin: 21, deuce: true, cap: 30 }])).toBe(
      'first to 21 points (win by 2)',
    )
  })

  it('collapses divisions that agree into one number', () => {
    const same = { pointsToWin: 15, deuce: false, cap: null }
    expect(describeTarget([same, { ...same }])).toBe('first to 15 points (no deuce)')
  })

  it('flags divisions that disagree rather than quoting only the first', () => {
    expect(
      describeTarget([
        { pointsToWin: 21, deuce: false, cap: null },
        { pointsToWin: 15, deuce: false, cap: null },
      ]),
    ).toBe('first to 15 or 21 points (no deuce) depending on your division')
  })

  it('sorts targets ascending regardless of division order', () => {
    expect(
      describeTarget([
        { pointsToWin: 21, deuce: false, cap: null },
        { pointsToWin: 11, deuce: false, cap: null },
      ]),
    ).toContain('11 or 21')
  })

  it('omits the deuce claim when divisions disagree about deuce', () => {
    // Saying "no deuce" while one division plays advantage is worse than
    // saying nothing — the rules page carries the per-division detail.
    const copy = describeTarget([
      { pointsToWin: 15, deuce: false, cap: null },
      { pointsToWin: 15, deuce: true, cap: 20 },
    ])
    expect(copy).not.toContain('deuce')
    expect(copy).not.toContain('win by 2')
    expect(copy).toBe('first to 15 points')
  })

  it('returns an empty string with no stages', () => {
    expect(describeTarget([])).toBe('')
  })
})

describe('howItWorksSteps', () => {
  it('falls back to the draft rules when nothing is published', () => {
    expect(howItWorksSteps([])).toEqual([...DEFAULT_HOW_IT_WORKS])
  })

  it('never renders a blank target in the fallback', () => {
    for (const step of howItWorksSteps([])) {
      expect(step.description).not.toContain('first to  ')
      expect(step.description.trim()).not.toBe('')
    }
  })

  it('quotes the configured elimination and finals targets', () => {
    const steps = howItWorksSteps([division()])
    expect(steps[0].description).toContain('first to 15 points (no deuce)')
    expect(steps[2].description).toContain('first to 21 points (no deuce)')
  })

  it('follows an organiser who changes the scoring', () => {
    const steps = howItWorksSteps([
      division({
        elims: { pointsToWin: 11, deuce: false, cap: null },
        finals: { pointsToWin: 15, deuce: true, cap: 20 },
      }),
    ])
    expect(steps[0].description).toContain('first to 11 points')
    expect(steps[2].description).toContain('first to 15 points (win by 2)')
    // The seeded numbers must be gone entirely, not merely joined by new ones.
    const all = steps.map((s) => s.description).join(' ')
    expect(all).not.toContain('21')
  })

  it('names the semi final pairings from qualifying places', () => {
    const steps = howItWorksSteps([division({ qualifyingPlaces: 6 })])
    expect(steps[1].title).toBe('Top 6 qualify')
    expect(steps[1].description).toContain('Rank 1 vs Rank 6')
    expect(steps[1].description).toContain('Rank 2 vs Rank 5')
  })

  it('drops the semi final steps when only two pairs qualify', () => {
    const steps = howItWorksSteps([division({ qualifyingPlaces: 2 })])
    const all = steps.map((s) => `${s.title} ${s.description}`).join(' ')
    expect(all).not.toContain('semi')
    expect(all).not.toContain('Semi')
    expect(all).not.toContain('Battle for 3rd')
    expect(steps.at(-1)?.title).toBe('Championship')
  })

  it('drops the knockout entirely when nobody qualifies', () => {
    const steps = howItWorksSteps([division({ qualifyingPlaces: 0 })])
    expect(steps).toHaveLength(2)
    expect(steps[1].title).toBe('Ranking decides it')
    expect(steps.map((s) => s.description).join(' ')).not.toContain('Championship')
  })

  it('shows the honest step list when divisions disagree about the knockout', () => {
    // One division has semis and the other does not, so promising semi finals
    // to everyone would be wrong.
    const steps = howItWorksSteps([
      division({ id: 'a', qualifyingPlaces: 4 }),
      division({ id: 'b', name: "Women's Doubles", gender: 'womens', qualifyingPlaces: 2 }),
    ])
    expect(steps[1].title).toBe('Top 2 or 4 qualify')
    expect(steps.map((s) => s.title).join(' ')).not.toContain('Semi')
  })

  it('numbers the steps consecutively from 1 in every shape', () => {
    for (const places of [0, 2, 4, 6]) {
      const steps = howItWorksSteps([division({ qualifyingPlaces: places })])
      expect(steps.map((s) => s.step)).toEqual(steps.map((_, i) => String(i + 1)))
    }
  })
})
