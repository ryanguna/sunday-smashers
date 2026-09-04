import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A division small enough to skip the semi finals.
 *
 * Three pairs cannot fill a four-pair bracket, so the division is set to
 * `qualifyingPlaces: 2` and plays a straight Championship between the top two.
 * That produces a single FINAL fixture and nothing for `semi` or
 * `third_place`.
 *
 * `publish_draw()` swaps exactly one division+stage per call, so a stage with
 * no fixtures needs a call with an empty list — otherwise it is simply left
 * alone. Publishing used to iterate the fixtures rather than the stages, so a
 * division that had already published a four-pair bracket and then dropped to
 * a straight final kept its superseded semi finals: still scheduled, still on
 * the public bracket, still rostered for duty.
 */

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/config', () => ({ isSupabaseConfigured: () => true }))
vi.mock('@/lib/auth', () => ({ isAdmin: async () => true, getCurrentUser: async () => ({ id: 'admin-1' }) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fake }))

interface RpcCall {
  stage: string
  count: number
}

let rpcCalls: RpcCall[]
/** Rows `publish_draw` would see as already present, across all stages. */
let existingRows: Record<string, unknown>[]

function builder() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    update: () => chain,
    then: (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve({ data: existingRows, error: null }).then(onFulfilled, onRejected),
  }
  return chain
}

const fake = {
  from: () => builder(),
  rpc: async (_name: string, args: { p_stage: string; p_matches: unknown[] }) => {
    rpcCalls.push({ stage: args.p_stage, count: args.p_matches.length })
    return { data: args.p_matches.length, error: null }
  },
}

const RULES = { pointsToWin: 21, deuce: false }

beforeEach(() => {
  rpcCalls = []
  existingRows = []
  vi.resetModules()
})

async function publish(qualifyingPlaces: number, rankedTeamIds: string[]) {
  const { publishKnockoutAction } = await import('./actions')
  return publishKnockoutAction({
    divisionId: 'div-1',
    rankedTeamIds,
    rules: RULES,
    qualifyingPlaces,
    confirmReplace: true,
    confirmDestroyResults: true,
  })
}

describe('a three-pair division playing a straight final', () => {
  it('publishes the bracket instead of refusing outright', async () => {
    const result = await publish(2, ['a', 'b', 'c'])
    expect(result.ok).toBe(true)
  })

  it('writes exactly one fixture — the Championship', async () => {
    await publish(2, ['a', 'b', 'c'])
    const withFixtures = rpcCalls.filter((call) => call.count > 0)
    expect(withFixtures).toEqual([{ stage: 'final', count: 1 }])
  })

  it('still clears the semi and third-place stages', async () => {
    // The regression: these two calls did not happen at all, so a previously
    // published four-pair bracket kept its semis alongside the new final.
    await publish(2, ['a', 'b', 'c'])
    expect(rpcCalls).toEqual([
      { stage: 'semi', count: 0 },
      { stage: 'third_place', count: 0 },
      { stage: 'final', count: 1 },
    ])
  })

  it('clears the superseded stages before writing the final', async () => {
    // Order matters on tournament day: the earlier rounds are what gets
    // played first, so a mid-way failure must not leave a final without them.
    await publish(2, ['a', 'b', 'c'])
    const stages = rpcCalls.map((call) => call.stage)
    expect(stages.indexOf('final')).toBe(stages.length - 1)
  })

  it('reports the format it actually published', async () => {
    const result = await publish(2, ['a', 'b', 'c'])
    expect(result.message).toContain('straight Championship')
    expect(result.message).not.toContain('Battle for 3rd')
  })
})

describe('a full four-pair bracket is unaffected', () => {
  it('publishes all four fixtures across the three stages', async () => {
    await publish(4, ['a', 'b', 'c', 'd'])
    expect(rpcCalls).toEqual([
      { stage: 'semi', count: 2 },
      { stage: 'third_place', count: 1 },
      { stage: 'final', count: 1 },
    ])
  })

  it('still describes the semis and the Battle for 3rd', async () => {
    const result = await publish(4, ['a', 'b', 'c', 'd'])
    expect(result.message).toContain('Battle for 3rd')
  })
})

describe('the qualifier count still has to be met', () => {
  it('refuses when fewer pairs are ranked than qualify', async () => {
    const result = await publish(4, ['a', 'b', 'c'])
    expect(result.ok).toBe(false)
    expect(result.message).toContain('4 qualified pairs')
    expect(rpcCalls).toEqual([])
  })

  it('accepts the same three pairs once the division drops to a straight final', async () => {
    const result = await publish(2, ['a', 'b', 'c'])
    expect(result.ok).toBe(true)
  })
})
