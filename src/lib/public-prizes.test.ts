import { describe, expect, it } from 'vitest'
import { publicPrizeBoard, type DivisionSettings, type PrizeSettings } from '@/lib/settings'
import { parsePublicPrizeBoard } from '@/lib/public-prizes'

/**
 * The landing page's prize section is the one place tournament money becomes
 * public. Two properties matter enough to pin down:
 *
 *   1. Internal loot bag `notes` must never cross into the published blob.
 *      They are supplier reminders written by the committee, and the row this
 *      projection is stored in is readable by anonymous visitors.
 *   2. A blank or malformed board must read as "nothing announced yet", not
 *      as an empty table under a heading.
 */

function division(id: string, name: string, enabled: boolean): DivisionSettings {
  return {
    id,
    name,
    gender: 'mens',
    enabled,
    maxTeams: null,
    entryFeeCents: 2500,
    rules: {
      stages: {
        elims: { pointsToWin: 15, deuce: false, cap: null },
        semi: { pointsToWin: 21, deuce: false, cap: null },
        third_place: { pointsToWin: 21, deuce: false, cap: null },
        final: { pointsToWin: 21, deuce: false, cap: null },
      },
      qualifyingPlaces: 4,
    },
  }
}

const prizes: PrizeSettings = {
  divisionPrizes: [
    { divisionId: 'men', championCents: 30000, runnerUpCents: 15000, thirdPlaceCents: 7500 },
    { divisionId: 'women', championCents: 20000, runnerUpCents: 10000, thirdPlaceCents: 5000 },
    { divisionId: 'ghost', championCents: 99900, runnerUpCents: 0, thirdPlaceCents: 0 },
  ],
  trophyCount: 4,
  medalCount: 16,
  lootBagItems: [
    { id: 'l1', name: 'Shuttlecock tube', quantity: 1, notes: 'Ask Dave for mates rates' },
    { id: 'l2', name: 'Candy cane', quantity: 2, notes: 'Aldi, buy before December' },
  ],
  showOnPublicSite: true,
}

const divisions = [division('men', "Men's Doubles", true), division('women', "Women's Doubles", true)]

describe('publicPrizeBoard', () => {
  it('never publishes the committee’s internal loot bag notes', () => {
    const board = publicPrizeBoard(prizes, divisions)

    expect(board.lootBagItems).toEqual([
      { name: 'Shuttlecock tube', quantity: 1 },
      { name: 'Candy cane', quantity: 2 },
    ])
    // Belt and braces: the blob is serialised verbatim into a public row.
    expect(JSON.stringify(board)).not.toContain('mates rates')
    expect(JSON.stringify(board)).not.toContain('Aldi')
  })

  it('names each division so the public table is readable', () => {
    const board = publicPrizeBoard(prizes, divisions)
    expect(board.divisionPrizes.map((p) => p.divisionName)).toEqual([
      "Men's Doubles",
      "Women's Doubles",
    ])
  })

  it('drops prizes for divisions that are disabled or gone', () => {
    // 'ghost' has no division at all; disabling women's must remove it too,
    // otherwise the site advertises money for a division nobody can enter.
    const board = publicPrizeBoard(prizes, [
      division('men', "Men's Doubles", true),
      division('women', "Women's Doubles", false),
    ])

    expect(board.divisionPrizes.map((p) => p.divisionId)).toEqual(['men'])
    expect(board.totalPoolCents).toBe(30000 + 15000 + 7500)
  })

  it('totals only what it actually publishes', () => {
    const board = publicPrizeBoard(prizes, divisions)
    expect(board.totalPoolCents).toBe(30000 + 15000 + 7500 + 20000 + 10000 + 5000)
  })
})

describe('parsePublicPrizeBoard', () => {
  it('round-trips a board written by publicPrizeBoard', () => {
    const board = publicPrizeBoard(prizes, divisions)
    expect(parsePublicPrizeBoard(JSON.stringify(board))).toEqual(board)
  })

  it('returns null rather than throwing on unusable input', () => {
    expect(parsePublicPrizeBoard(null)).toBeNull()
    expect(parsePublicPrizeBoard('')).toBeNull()
    expect(parsePublicPrizeBoard('not json')).toBeNull()
    expect(parsePublicPrizeBoard('null')).toBeNull()
    expect(parsePublicPrizeBoard('[]')).toBeNull()
  })

  it('treats an empty board as nothing announced', () => {
    // A committee that saved with every amount at zero has not announced
    // prizes; rendering a heading over a blank table looks broken.
    const empty = publicPrizeBoard({ ...prizes, divisionPrizes: [] }, divisions)
    expect(parsePublicPrizeBoard(JSON.stringify(empty))).toBeNull()
  })

  it('survives a blob written by an older deploy', () => {
    const board = parsePublicPrizeBoard(
      JSON.stringify({
        divisionPrizes: [
          { divisionId: 'men', divisionName: "Men's Doubles", championCents: 100 },
          { divisionId: 'broken' },
        ],
        totalPoolCents: 100,
      }),
    )

    expect(board).not.toBeNull()
    expect(board?.divisionPrizes).toHaveLength(1)
    expect(board?.trophyCount).toBe(0)
    expect(board?.lootBagItems).toEqual([])
  })
})
