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
    { divisionId: 'men', championCents: 30000, runnerUpCents: 15000, thirdPlaceCents: 7500, fourthPlaceCents: 3750 },
    { divisionId: 'women', championCents: 20000, runnerUpCents: 10000, thirdPlaceCents: 5000, fourthPlaceCents: 2500 },
    { divisionId: 'ghost', championCents: 99900, runnerUpCents: 0, thirdPlaceCents: 0, fourthPlaceCents: 0 },
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
    expect(board.totalPoolCents).toBe((30000 + 15000 + 7500 + 3750) * 2)
  })

  it('totals only what it actually publishes', () => {
    const board = publicPrizeBoard(prizes, divisions)
    expect(board.totalPoolCents).toBe((30000 + 15000 + 7500 + 3750) * 2 + (20000 + 10000 + 5000 + 2500) * 2)
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

describe('parsePublicPrizeBoard on an older blob', () => {
  it('recomputes the total instead of trusting a per-pair figure', () => {
    // Written before amounts became per player and before 4th place existed.
    // The stored total was summed on the old basis, and it is the one number
    // on the landing page that promises players real money.
    const legacy = JSON.stringify({
      divisionPrizes: [
        {
          divisionId: 'div-a',
          divisionName: 'Mens',
          championCents: 20000,
          runnerUpCents: 15000,
          thirdPlaceCents: 12000,
        },
      ],
      trophyCount: 4,
      medalCount: 12,
      lootBagItems: [],
      totalPoolCents: 47000,
    })

    const board = parsePublicPrizeBoard(legacy)
    expect(board?.divisionPrizes[0].fourthPlaceCents).toBe(0)

    // The blob carries no `basis`, so its amounts are per *pair* — what the
    // committee agreed when they typed them. Rebased to per player they halve,
    // and the announced total lands back on the money actually being handed
    // out. Reading them as per-player would have doubled every figure on the
    // landing page.
    expect(board?.divisionPrizes[0].championCents).toBe(10000)
    expect(board?.divisionPrizes[0].runnerUpCents).toBe(7500)
    expect(board?.divisionPrizes[0].thirdPlaceCents).toBe(6000)
    expect(board?.totalPoolCents).toBe(47000)
  })

  it('leaves a blob that declares the per-player basis alone', () => {
    const current = JSON.stringify({
      basis: 'per-player',
      divisionPrizes: [
        {
          divisionId: 'div-a',
          divisionName: 'Mens',
          championCents: 10000,
          runnerUpCents: 7500,
          thirdPlaceCents: 6000,
          fourthPlaceCents: 0,
        },
      ],
      trophyCount: 4,
      medalCount: 12,
      lootBagItems: [],
      totalPoolCents: 47000,
    })

    const board = parsePublicPrizeBoard(current)
    expect(board?.divisionPrizes[0].championCents).toBe(10000)
    expect(board?.totalPoolCents).toBe(47000)
  })
})
