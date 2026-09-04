import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SaveScorePayload } from './actions'

/**
 * The courtside race the duty roster makes inevitable.
 *
 * The rules put two people on every match — an umpire/scorer and a scoresheet
 * person — and both are duty officials, so RLS lets both drive `/scoring/[id]`.
 * A save replaces the whole rally log, so whichever phone tapped last silently
 * wiped every point the other one had recorded. Nobody was told; the score just
 * went backwards on the TV.
 *
 * `matches.updated_at` already moves on every write (there is a trigger on it),
 * so it works as a version token with no migration. These tests pin the three
 * outcomes that have to stay distinguishable.
 */

const REVISION = '2026-12-13T02:15:00.000Z'
const NEXT_REVISION = '2026-12-13T02:15:30.000Z'
const ME = 'umpire-user-id'
const OTHER = 'scoresheet-user-id'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/config', () => ({ isSupabaseConfigured: () => true }))
vi.mock('@/lib/auth', () => ({ getCurrentUser: async () => ({ id: ME }) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fake }))

/** What the fake database should pretend is true for one test. */
interface Scenario {
  /** The row's current version. A guarded update only matches this. */
  revision: string | null
  /** Who wrote the newest point, or null for an empty log. */
  lastAuthor: string | null
  /** False when the match row reads back as missing — an RLS refusal. */
  readable: boolean
}

let scenario: Scenario
const updates: { guard: string | null }[] = []

/**
 * A chainable stand-in for the PostgREST builder. Each call records itself and
 * the whole thing is awaited at the end, which is exactly how the action uses
 * the real client.
 */
function builder(table: string, op: string) {
  const filters: Record<string, unknown> = {}
  const chain = {
    eq(column: string, value: unknown) {
      filters[column] = value
      return chain
    },
    order: () => chain,
    limit: () => chain,
    select: () => chain,
    maybeSingle: async () => resolve(table, op, filters, true),
    then: (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(resolve(table, op, filters, false)).then(onFulfilled, onRejected),
  }
  return chain
}

function resolve(
  table: string,
  op: string,
  filters: Record<string, unknown>,
  single: boolean,
) {
  if (table === 'matches' && op === 'update') {
    const guard = (filters.updated_at as string | undefined) ?? null
    updates.push({ guard })
    const matched = guard == null || guard === scenario.revision
    if (!matched) return { data: [], error: null }
    scenario.revision = NEXT_REVISION
    return { data: [{ id: 'match-1', updated_at: NEXT_REVISION }], error: null }
  }
  if (table === 'matches' && op === 'select') {
    const row = scenario.readable ? { id: 'match-1' } : null
    return single ? { data: row, error: null } : { data: row ? [row] : [], error: null }
  }
  if (table === 'score_events' && op === 'select') {
    return {
      data: scenario.lastAuthor ? [{ scored_by: scenario.lastAuthor }] : [],
      error: null,
    }
  }
  return { data: [], error: null }
}

const fake = {
  from(table: string) {
    return {
      update: () => builder(table, 'update'),
      select: () => builder(table, 'select'),
      delete: () => builder(table, 'delete'),
      insert: async () => ({ data: [], error: null }),
    }
  },
}

function payload(knownRevision: string | null): SaveScorePayload {
  return {
    matchId: 'match-1',
    snapshot: {
      v: 1,
      matchId: 'match-1',
      baseline: {
        scoreA: 0,
        scoreB: 0,
        servingSide: 'a',
        positionsA: null,
        positionsB: null,
      },
      rallies: [{ seq: 1, side: 'a', at: 1 }],
      ending: null,
    },
    rules: { pointsToWin: 15, deuce: false },
    teamA: { id: 'team-a', name: 'Tinsel Smashers', players: [] },
    teamB: { id: 'team-b', name: 'Reindeer Rally', players: [] },
    knownRevision,
  }
}

async function save(knownRevision: string | null) {
  const { saveScore } = await import('./actions')
  return saveScore(payload(knownRevision))
}

describe('saveScore guards against two officials scoring one match', () => {
  beforeEach(() => {
    updates.length = 0
    scenario = { revision: REVISION, lastAuthor: ME, readable: true }
  })

  it('saves when nothing has moved under this phone', async () => {
    const result = await save(REVISION)
    expect(result.ok).toBe(true)
    expect(updates[0].guard, 'the save was not version-guarded').toBe(REVISION)
  })

  it('hands back the new revision so the next save is guarded too', async () => {
    const result = await save(REVISION)
    expect(result.revision).toBe(NEXT_REVISION)
  })

  it('refuses when another official has scored since this phone synced', async () => {
    scenario.revision = NEXT_REVISION
    scenario.lastAuthor = OTHER

    const result = await save(REVISION)
    expect(result.ok, 'the other official’s points were silently overwritten').toBe(false)
    expect(result.conflict).toBe(true)
    expect(result.message).toMatch(/another official/i)
  })

  it('does not accuse the umpire of racing themselves after a lost reply', async () => {
    // The save landed; the answer never made it back over the venue wifi. The
    // console retries the same payload with the revision it still remembers.
    scenario.revision = NEXT_REVISION
    scenario.lastAuthor = ME

    const result = await save(REVISION)
    expect(result.ok, 'a retried save was mistaken for a conflict').toBe(true)
    expect(result.conflict).toBeUndefined()
  })

  it('lets the official who just started the match score its first point', async () => {
    // `startMatch` bumps `updated_at` on its own and writes no score events.
    scenario.revision = NEXT_REVISION
    scenario.lastAuthor = null

    const result = await save(REVISION)
    expect(result.ok, 'starting a match locked its own umpire out of scoring it').toBe(true)
  })

  it('still reports an RLS refusal as a roster problem, not a conflict', async () => {
    scenario.revision = NEXT_REVISION
    scenario.readable = false

    const result = await save(REVISION)
    expect(result.ok).toBe(false)
    expect(result.conflict).toBeUndefined()
    expect(result.message).toMatch(/duty roster/i)
  })
})
