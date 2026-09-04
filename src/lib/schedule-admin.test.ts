import { describe, expect, it } from 'vitest'

import { mulberry32 } from './schedule'
import {
  analyseSchedule,
  autoSchedule,
  buildDutyRoster,
  buildTimeline,
  canAssignOfficial,
  DUTY_SEATS,
  dutiesByPlayer,
  dutyRosterInserts,
  eligibleOfficials,
  isPlaceholderTeamId,
  matchAtCell,
  matchesNeedingVolunteers,
  matchesWithEmptySeats,
  matchLabel,
  placeMatch,
  placementsFromMatches,
  playerNameMap,
  printableCourtSheets,
  restGaps,
  schedulePatches,
  schedulePublishSafety,
  scheduleStats,
  sortMatches,
  stageLabel,
  swapMatches,
  teamNameMap,
  toScheduledMatches,
  unplacedMatches,
  type PlacementMap,
  type ScheduleCourt,
  type ScheduleSlot,
  type ScheduleTeam,
  type SchedulableMatch,
} from './schedule-admin'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DIVISION = 'mens_doubles'

function teams(count: number): ScheduleTeam[] {
  return Array.from({ length: count }, (_, i) => {
    const id = `t${i + 1}`
    return {
      id,
      divisionId: DIVISION,
      name: `Pair ${i + 1}`,
      players: [
        { id: `${id}-p1`, name: `Player ${i + 1}A` },
        { id: `${id}-p2`, name: `Player ${i + 1}B` },
      ],
    }
  })
}

function courts(count: number): ScheduleCourt[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `court-${i + 1}`,
    name: `Court ${i + 1}`,
    sortOrder: i,
  }))
}

function slots(count: number): ScheduleSlot[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `slot-${i + 1}`,
    index: i,
    label: `${9 + i}:00am`,
  }))
}

function match(
  id: string,
  teamAId: string | null,
  teamBId: string | null,
  overrides: Partial<SchedulableMatch> = {},
): SchedulableMatch {
  return {
    id,
    divisionId: DIVISION,
    divisionName: "Men's Doubles",
    stage: 'elims',
    round: 1,
    bracketKey: null,
    teamAId,
    teamBId,
    sourceA: null,
    sourceB: null,
    courtId: null,
    slotId: null,
    status: 'scheduled',
    hasResult: false,
    ...overrides,
  }
}

/** Round robin-ish set: 4 pairs, 6 matches, rounds 1..3 (disjoint). */
function roundRobin4(): SchedulableMatch[] {
  return [
    match('m1', 't1', 't2', { round: 1 }),
    match('m2', 't3', 't4', { round: 1 }),
    match('m3', 't1', 't3', { round: 2 }),
    match('m4', 't2', 't4', { round: 2 }),
    match('m5', 't1', 't4', { round: 3 }),
    match('m6', 't2', 't3', { round: 3 }),
  ]
}

// ---------------------------------------------------------------------------
// Placement basics
// ---------------------------------------------------------------------------

describe('placement helpers', () => {
  it('reads existing placements off match rows', () => {
    const rows = [
      match('m1', 't1', 't2', { courtId: 'court-1', slotId: 'slot-1' }),
      match('m2', 't3', 't4'),
      // Half-placed rows are ignored: a court with no slot is not a placement.
      match('m3', 't1', 't3', { courtId: 'court-2' }),
    ]
    expect(placementsFromMatches(rows)).toEqual({ m1: { courtId: 'court-1', slotId: 'slot-1' } })
    expect(unplacedMatches(rows, placementsFromMatches(rows)).map((m) => m.id)).toEqual(['m2', 'm3'])
  })

  it('places and clears a match', () => {
    let placements: PlacementMap = {}
    placements = placeMatch(placements, 'm1', { courtId: 'court-1', slotId: 'slot-2' })
    expect(placements.m1).toEqual({ courtId: 'court-1', slotId: 'slot-2' })
    placements = placeMatch(placements, 'm1', null)
    expect(placements.m1).toBeUndefined()
  })

  it('swaps two matches, including into an empty cell', () => {
    const placements: PlacementMap = {
      m1: { courtId: 'court-1', slotId: 'slot-1' },
      m2: { courtId: 'court-2', slotId: 'slot-2' },
    }
    const swapped = swapMatches(placements, 'm1', 'm2')
    expect(swapped.m1).toEqual({ courtId: 'court-2', slotId: 'slot-2' })
    expect(swapped.m2).toEqual({ courtId: 'court-1', slotId: 'slot-1' })

    const oneWay = swapMatches({ m1: { courtId: 'court-1', slotId: 'slot-1' } }, 'm1', 'm2')
    expect(oneWay.m2).toEqual({ courtId: 'court-1', slotId: 'slot-1' })
    expect(oneWay.m1).toBeUndefined()
  })

  it('finds the match sitting on a cell', () => {
    const rows = roundRobin4()
    const placements: PlacementMap = { m3: { courtId: 'court-2', slotId: 'slot-4' } }
    expect(matchAtCell(rows, placements, 'court-2', 'slot-4')?.id).toBe('m3')
    expect(matchAtCell(rows, placements, 'court-1', 'slot-4')).toBeNull()
  })

  it('sorts matches by division, stage then round', () => {
    const rows = [
      match('f', 't1', 't2', { stage: 'final', round: null, bracketKey: 'FINAL' }),
      match('e2', 't1', 't2', { stage: 'elims', round: 2 }),
      match('s', 't1', 't2', { stage: 'semi', round: null, bracketKey: 'M1' }),
      match('e1', 't1', 't2', { stage: 'elims', round: 1 }),
    ]
    expect(sortMatches(rows).map((m) => m.id)).toEqual(['e1', 'e2', 's', 'f'])
  })
})

describe('labels', () => {
  it('names both sides, falling back to the knockout placeholder', () => {
    const names = teamNameMap(teams(2))
    expect(matchLabel(match('m1', 't1', 't2'), names)).toBe('Pair 1 v Pair 2')
    expect(
      matchLabel(
        match('m2', null, null, { sourceA: 'Winner of M1', sourceB: 'Winner of M2' }),
        names,
      ),
    ).toBe('Winner of M1 v Winner of M2')
  })

  it('labels stages', () => {
    expect(stageLabel(match('m1', 't1', 't2', { round: 3 }))).toBe('Round robin · R3')
    expect(stageLabel(match('m2', 't1', 't2', { stage: 'third_place', round: null }))).toBe(
      'Battle for 3rd',
    )
  })

  it('maps player ids to names', () => {
    expect(playerNameMap(teams(1))).toEqual({ 't1-p1': 'Player 1A', 't1-p2': 'Player 1B' })
  })
})

// ---------------------------------------------------------------------------
// toScheduledMatches
// ---------------------------------------------------------------------------

describe('toScheduledMatches', () => {
  it('keeps the real match id and resolves court name + slot index', () => {
    const scheduled = toScheduledMatches(
      roundRobin4(),
      { m1: { courtId: 'court-2', slotId: 'slot-3' } },
      courts(3),
      slots(5),
    )
    expect(scheduled).toHaveLength(1)
    expect(scheduled[0].id).toBe('m1')
    expect(scheduled[0].court).toBe('Court 2')
    expect(scheduled[0].slot.index).toBe(2)
  })

  it('gives undecided knockout sides a placeholder team id', () => {
    const scheduled = toScheduledMatches(
      [match('final', null, null, { stage: 'final', round: null })],
      { final: { courtId: 'court-1', slotId: 'slot-1' } },
      courts(1),
      slots(1),
    )
    expect(isPlaceholderTeamId(scheduled[0].fixture.teamA)).toBe(true)
    expect(scheduled[0].fixture.teamA).not.toBe(scheduled[0].fixture.teamB)
  })

  it('ignores placements pointing at a court or slot that no longer exists', () => {
    const scheduled = toScheduledMatches(
      roundRobin4(),
      { m1: { courtId: 'gone', slotId: 'slot-1' }, m2: { courtId: 'court-1', slotId: 'gone' } },
      courts(1),
      slots(1),
    )
    expect(scheduled).toEqual([])
  })

  it('orders by slot then court', () => {
    const scheduled = toScheduledMatches(
      roundRobin4(),
      {
        m1: { courtId: 'court-2', slotId: 'slot-2' },
        m2: { courtId: 'court-1', slotId: 'slot-2' },
        m3: { courtId: 'court-1', slotId: 'slot-1' },
      },
      courts(2),
      slots(3),
    )
    expect(scheduled.map((m) => m.id)).toEqual(['m3', 'm2', 'm1'])
  })
})

// ---------------------------------------------------------------------------
// autoSchedule
// ---------------------------------------------------------------------------

describe('autoSchedule', () => {
  it('places every match with no court or pair clash', () => {
    const rows = roundRobin4()
    const result = autoSchedule(rows, courts(2), slots(6))
    expect(result.unscheduled).toEqual([])
    expect(Object.keys(result.placements)).toHaveLength(6)

    const cells = new Set<string>()
    const teamSlots = new Map<string, Set<string>>()
    for (const row of rows) {
      const placement = result.placements[row.id]
      const cell = `${placement.courtId}#${placement.slotId}`
      expect(cells.has(cell)).toBe(false)
      cells.add(cell)
      for (const teamId of [row.teamAId!, row.teamBId!]) {
        const seen = teamSlots.get(teamId) ?? new Set<string>()
        expect(seen.has(placement.slotId)).toBe(false)
        seen.add(placement.slotId)
        teamSlots.set(teamId, seen)
      }
    }
  })

  it('is deterministic without an rng and reproducible with a seed', () => {
    const rows = roundRobin4()
    expect(autoSchedule(rows, courts(2), slots(6)).placements).toEqual(
      autoSchedule(rows, courts(2), slots(6)).placements,
    )
    const a = autoSchedule(rows, courts(2), slots(6), {}, { rng: mulberry32(7) })
    const b = autoSchedule(rows, courts(2), slots(6), {}, { rng: mulberry32(7) })
    expect(a.placements).toEqual(b.placements)
  })

  it('reports matches that do not fit', () => {
    const result = autoSchedule(roundRobin4(), courts(1), slots(2))
    expect(result.unscheduled.length).toBeGreaterThan(0)
    expect(result.conflicts.some((c) => c.type === 'unassigned_fixture')).toBe(true)
  })

  it('keeps locked matches where they are and never reuses their cell', () => {
    const rows = roundRobin4()
    const existing: PlacementMap = { m1: { courtId: 'court-1', slotId: 'slot-1' } }
    const result = autoSchedule(rows, courts(2), slots(8), existing, { lockedMatchIds: ['m1'] })

    expect(result.placements.m1).toEqual({ courtId: 'court-1', slotId: 'slot-1' })
    const others = rows.filter((r) => r.id !== 'm1')
    for (const other of others) {
      const placement = result.placements[other.id]
      expect(`${placement.courtId}#${placement.slotId}`).not.toBe('court-1#slot-1')
    }
  })

  it('respects the rest requirement when there is room', () => {
    const rows = roundRobin4()
    const result = autoSchedule(rows, courts(2), slots(12), {}, { minRestSlots: 1 })
    const gaps = restGaps(rows, result.placements, slots(12), teams(4), 1)
    expect(gaps.every((row) => row.minGap === -1 || row.minGap >= 1)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Timeline + stats
// ---------------------------------------------------------------------------

describe('buildTimeline', () => {
  it('builds a courts x slots grid with matches in the right cells', () => {
    const rows = roundRobin4()
    const placements: PlacementMap = {
      m1: { courtId: 'court-1', slotId: 'slot-1' },
      m2: { courtId: 'court-2', slotId: 'slot-1' },
    }
    const grid = buildTimeline(rows, placements, courts(2), slots(3))
    expect(grid).toHaveLength(3)
    expect(grid[0].cells.map((c) => c.match?.id)).toEqual(['m1', 'm2'])
    expect(grid[1].cells.every((c) => c.match === null)).toBe(true)
  })

  it('flags a double-booked cell', () => {
    const placements: PlacementMap = {
      m1: { courtId: 'court-1', slotId: 'slot-1' },
      m2: { courtId: 'court-1', slotId: 'slot-1' },
    }
    const grid = buildTimeline(roundRobin4(), placements, courts(1), slots(1))
    expect(grid[0].cells[0].doubleBooked).toBe(true)
  })
})

describe('scheduleStats', () => {
  it('counts placed, unplaced and the slot span in use', () => {
    const placements: PlacementMap = {
      m1: { courtId: 'court-1', slotId: 'slot-1' },
      m2: { courtId: 'court-2', slotId: 'slot-3' },
    }
    const stats = scheduleStats(roundRobin4(), placements, courts(2), slots(5))
    expect(stats).toMatchObject({ total: 6, placed: 2, unplaced: 4, courts: 2, slots: 5, slotsUsed: 3 })
    expect(stats.divisions[0]).toMatchObject({ divisionName: "Men's Doubles", total: 6, placed: 2 })
  })
})

describe('restGaps', () => {
  it('computes the tightest gap per pair and flags back-to-backs', () => {
    const rows = [match('m1', 't1', 't2', { round: 1 }), match('m2', 't1', 't3', { round: 2 })]
    const placements: PlacementMap = {
      m1: { courtId: 'court-1', slotId: 'slot-1' },
      m2: { courtId: 'court-1', slotId: 'slot-2' },
    }
    const gaps = restGaps(rows, placements, slots(4), teams(3), 1)
    const pair1 = gaps.find((g) => g.teamId === 't1')!
    expect(pair1.minGap).toBe(0)
    expect(pair1.tight).toBe(true)
    // A pair with a single match has no gap to measure.
    expect(gaps.find((g) => g.teamId === 't2')!.minGap).toBe(-1)
    expect(gaps.find((g) => g.teamId === 't2')!.tight).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Duty roster
// ---------------------------------------------------------------------------

/** Two matches back to back on one court, so match 1 has real officials. */
function twoOnOneCourt() {
  const rows = [match('m1', 't1', 't2', { round: 1 }), match('m2', 't3', 't4', { round: 2 })]
  const placements: PlacementMap = {
    m1: { courtId: 'court-1', slotId: 'slot-1' },
    m2: { courtId: 'court-1', slotId: 'slot-2' },
  }
  return { rows, placements, courts: courts(1), slots: slots(4), teams: teams(4) }
}

describe('buildDutyRoster', () => {
  it('rosters the next match up on the same court, four seats per match', () => {
    const f = twoOnOneCourt()
    const view = buildDutyRoster({
      matches: f.rows,
      placements: f.placements,
      courts: f.courts,
      slots: f.slots,
      teams: f.teams,
    })

    const first = view.matches.find((m) => m.match.id === 'm1')!
    expect(first.slots).toHaveLength(DUTY_SEATS.length)
    expect(first.slots.map((s) => s.label)).toEqual([
      'Umpire / Scorer',
      'Scoresheet',
      'Line judge 1',
      'Line judge 2',
    ])
    expect(first.slots.map((s) => s.playerId).sort()).toEqual([
      't3-p1',
      't3-p2',
      't4-p1',
      't4-p2',
    ])
    expect(first.slots.every((s) => s.source === 'derived')).toBe(true)
    expect(first.slots.every((s) => s.sourceMatchId === 'm2')).toBe(true)
  })

  it('leaves the last match on a court with no officials to roster', () => {
    const f = twoOnOneCourt()
    const view = buildDutyRoster({
      matches: f.rows,
      placements: f.placements,
      courts: f.courts,
      slots: f.slots,
      teams: f.teams,
    })
    const last = view.matches.find((m) => m.match.id === 'm2')!
    expect(last.needsVolunteers).toBe(true)
    expect(last.filledCount).toBe(0)
    expect(matchesNeedingVolunteers(view).map((m) => m.match.id)).toEqual(['m2'])
    expect(matchesWithEmptySeats(view).map((m) => m.match.id)).toEqual(['m2'])
  })

  it('borrows officials from another court when the court runs out', () => {
    const rows = [
      match('m1', 't1', 't2', { round: 1 }),
      match('m2', 't3', 't4', { round: 2 }),
    ]
    const placements: PlacementMap = {
      m1: { courtId: 'court-1', slotId: 'slot-1' },
      m2: { courtId: 'court-2', slotId: 'slot-2' },
    }
    const view = buildDutyRoster({
      matches: rows,
      placements,
      courts: courts(2),
      slots: slots(4),
      teams: teams(4),
    })
    const first = view.matches.find((m) => m.match.id === 'm1')!
    expect(first.slots.every((s) => s.source === 'fallback')).toBe(true)
    expect(view.conflicts.some((c) => c.type === 'fallback_officials_used')).toBe(true)
  })

  it('applies a manual override to one seat only', () => {
    const f = twoOnOneCourt()
    const base = buildDutyRoster({
      matches: f.rows,
      placements: f.placements,
      courts: f.courts,
      slots: f.slots,
      teams: f.teams,
    })
    const baseLineTwo = base.matches.find((m) => m.match.id === 'm1')!.slots[3].playerId

    const view = buildDutyRoster({
      matches: f.rows,
      placements: f.placements,
      courts: f.courts,
      slots: f.slots,
      teams: f.teams,
      overrides: [{ matchId: 'm1', role: 'line_judge', index: 0, playerId: 't4-p2' }],
    })
    const first = view.matches.find((m) => m.match.id === 'm1')!
    expect(first.slots[2].playerId).toBe('t4-p2')
    expect(first.slots[2].source).toBe('manual')
    expect(first.slots[2].sourceMatchId).toBeNull()
    // Line judge 2 must survive an edit to line judge 1.
    expect(first.slots[3].playerId).toBe(baseLineTwo)
    expect(first.slots[3].playerId).not.toBe('')
  })

  it('clears a seat when the override has no player', () => {
    const f = twoOnOneCourt()
    const view = buildDutyRoster({
      matches: f.rows,
      placements: f.placements,
      courts: f.courts,
      slots: f.slots,
      teams: f.teams,
      overrides: [{ matchId: 'm1', role: 'umpire_scorer', index: 0, playerId: '' }],
    })
    const first = view.matches.find((m) => m.match.id === 'm1')!
    expect(first.slots[0].playerId).toBe('')
    expect(first.slots[0].source).toBe('unassigned')
    expect(first.filledCount).toBe(3)
  })

  it('never rosters a player to officiate a match they are playing in', () => {
    // Three courts, three concurrent matches, then a later match on court 1.
    const rows = [
      match('m1', 't1', 't2', { round: 1 }),
      match('m2', 't3', 't4', { round: 1 }),
      match('m3', 't5', 't6', { round: 1 }),
      match('m4', 't3', 't5', { round: 2 }),
    ]
    const placements: PlacementMap = {
      m1: { courtId: 'court-1', slotId: 'slot-1' },
      m2: { courtId: 'court-2', slotId: 'slot-1' },
      m3: { courtId: 'court-3', slotId: 'slot-1' },
      m4: { courtId: 'court-1', slotId: 'slot-2' },
    }
    const roster = teams(6)
    const view = buildDutyRoster({
      matches: rows,
      placements,
      courts: courts(3),
      slots: slots(4),
      teams: roster,
    })

    const playersBySlot = new Map<number, Set<string>>()
    for (const row of rows) {
      const slotIndex = Number(placements[row.id].slotId.split('-')[1]) - 1
      const set = playersBySlot.get(slotIndex) ?? new Set<string>()
      for (const teamId of [row.teamAId!, row.teamBId!]) {
        for (const player of roster.find((t) => t.id === teamId)!.players) set.add(player.id)
      }
      playersBySlot.set(slotIndex, set)
    }

    for (const matchView of view.matches) {
      for (const seat of matchView.slots) {
        if (!seat.playerId) continue
        expect(playersBySlot.get(matchView.slotIndex)?.has(seat.playerId)).toBe(false)
      }
    }
    expect(view.conflicts.some((c) => c.type === 'officiating_while_playing')).toBe(false)
  })

  it('reports officiating_while_playing when an override breaks the invariant', () => {
    const rows = [
      match('m1', 't1', 't2', { round: 1 }),
      match('m2', 't3', 't4', { round: 1 }),
      match('m3', 't1', 't3', { round: 2 }),
    ]
    const placements: PlacementMap = {
      m1: { courtId: 'court-1', slotId: 'slot-1' },
      m2: { courtId: 'court-2', slotId: 'slot-1' },
      m3: { courtId: 'court-1', slotId: 'slot-2' },
    }
    const view = buildDutyRoster({
      matches: rows,
      placements,
      courts: courts(2),
      slots: slots(3),
      teams: teams(4),
      // t3-p1 plays on court 2 in the same slot as m1.
      overrides: [{ matchId: 'm1', role: 'umpire_scorer', index: 0, playerId: 't3-p1' }],
    })
    expect(view.conflicts.some((c) => c.type === 'officiating_while_playing')).toBe(true)
  })

  it('counts duties per player', () => {
    const f = twoOnOneCourt()
    const view = buildDutyRoster({
      matches: f.rows,
      placements: f.placements,
      courts: f.courts,
      slots: f.slots,
      teams: f.teams,
    })
    expect(view.dutyCountsByPlayer['t3-p1']).toBe(1)
    expect(view.dutyCountsByPlayer['t1-p1']).toBeUndefined()
  })
})

describe('canAssignOfficial', () => {
  const f = twoOnOneCourt()
  const base = {
    matches: f.rows,
    placements: f.placements,
    courts: f.courts,
    slots: f.slots,
    teams: f.teams,
  }

  it('hard-blocks a player from officiating their own match', () => {
    const verdict = canAssignOfficial({ ...base, matchId: 'm1', playerId: 't1-p1' })
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toMatch(/playing in this match/i)
  })

  it('hard-blocks a player who is on another court in the same slot', () => {
    const rows = [
      match('m1', 't1', 't2', { round: 1 }),
      match('m2', 't3', 't4', { round: 1 }),
    ]
    const placements: PlacementMap = {
      m1: { courtId: 'court-1', slotId: 'slot-1' },
      m2: { courtId: 'court-2', slotId: 'slot-1' },
    }
    const verdict = canAssignOfficial({
      matchId: 'm1',
      playerId: 't3-p1',
      matches: rows,
      placements,
      courts: courts(2),
      slots: slots(2),
      teams: teams(4),
    })
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toMatch(/Court 2/)
  })

  it('allows a player who is free in that slot', () => {
    expect(canAssignOfficial({ ...base, matchId: 'm1', playerId: 't3-p1' }).allowed).toBe(true)
  })

  it('allows clearing a seat', () => {
    expect(canAssignOfficial({ ...base, matchId: 'm1', playerId: '' }).allowed).toBe(true)
  })

  it('refuses an unknown match', () => {
    expect(canAssignOfficial({ ...base, matchId: 'nope', playerId: 't3-p1' }).allowed).toBe(false)
  })

  /**
   * `buildDutyRoster()` has always tracked who is already officiating in a
   * slot and refused to seat them twice. The manual editor did not: it only
   * knew about *playing* clashes, so the same volunteer could be made umpire
   * on Court 1 and line judge on Court 2 in the same slot and the roster
   * saved without complaint.
   */
  it('hard-blocks a player already officiating another court in the same slot', () => {
    const rows = [
      match('m1', 't1', 't2', { round: 1 }),
      match('m2', 't3', 't4', { round: 1 }),
    ]
    const placements: PlacementMap = {
      m1: { courtId: 'court-1', slotId: 'slot-1' },
      m2: { courtId: 'court-2', slotId: 'slot-1' },
    }
    const args = {
      matches: rows,
      placements,
      courts: courts(2),
      slots: slots(2),
      teams: teams(4),
      // 't5-p1' plays in neither match, so the only thing that can stop them
      // is the seat they already hold on m2.
      duties: [{ matchId: 'm2', playerId: 't5-p1' }],
    }

    const verdict = canAssignOfficial({ ...args, matchId: 'm1', playerId: 't5-p1' })
    expect(verdict.allowed, 'the same volunteer was seated on two courts at once').toBe(false)
    expect(verdict.reason).toMatch(/already officiating/i)
  })

  it('does not count the seat a player already holds on this very match', () => {
    const verdict = canAssignOfficial({
      ...base,
      matchId: 'm1',
      playerId: 't3-p1',
      duties: [{ matchId: 'm1', playerId: 't3-p1' }],
    })
    expect(verdict.allowed).toBe(true)
  })

  it('still allows a free player when a roster is supplied', () => {
    const verdict = canAssignOfficial({
      ...base,
      matchId: 'm1',
      playerId: 't3-p1',
      duties: [{ matchId: 'm2', playerId: 't4-p1' }],
    })
    expect(verdict.allowed).toBe(true)
  })
})

describe('eligibleOfficials', () => {
  it('lists everyone, disables players in the match and floats the next match up', () => {
    const f = twoOnOneCourt()
    const options = eligibleOfficials({
      matchId: 'm1',
      matches: f.rows,
      placements: f.placements,
      courts: f.courts,
      slots: f.slots,
      teams: f.teams,
    })

    expect(options).toHaveLength(8)
    expect(options.slice(0, 4).every((o) => o.nextUp)).toBe(true)
    expect(options.filter((o) => o.disabled).map((o) => o.playerId).sort()).toEqual([
      't1-p1',
      't1-p2',
      't2-p1',
      't2-p2',
    ])
    // Disabled options always sink to the bottom.
    expect(options.at(-1)!.disabled).toBe(true)
  })
})

describe('duty roster outputs', () => {
  const f = twoOnOneCourt()
  const view = buildDutyRoster({
    matches: f.rows,
    placements: f.placements,
    courts: f.courts,
    slots: f.slots,
    teams: f.teams,
  })

  it('summarises duties per player', () => {
    const rows = dutiesByPlayer(view)
    expect(rows).toHaveLength(4)
    expect(rows[0].duties[0]).toMatchObject({ matchId: 'm1', courtName: 'Court 1' })
  })

  it('groups a printable sheet per court in running order', () => {
    const sheets = printableCourtSheets(view)
    expect(sheets).toHaveLength(1)
    expect(sheets[0].matches.map((m) => m.match.id)).toEqual(['m1', 'm2'])
  })

  it('produces duty_assignments inserts with the source match traced', () => {
    const inserts = dutyRosterInserts(view)
    expect(inserts).toHaveLength(4)
    expect(inserts.every((row) => row.match_id === 'm1')).toBe(true)
    expect(inserts.every((row) => row.source_match_id === 'm2')).toBe(true)
    expect(inserts.filter((row) => row.duty_role === 'line_judge')).toHaveLength(2)
  })

  it('drops a duplicate (match, player, role) that the unique index would reject', () => {
    const dupe = buildDutyRoster({
      matches: f.rows,
      placements: f.placements,
      courts: f.courts,
      slots: f.slots,
      teams: f.teams,
      overrides: [
        { matchId: 'm1', role: 'line_judge', index: 0, playerId: 't3-p1' },
        { matchId: 'm1', role: 'line_judge', index: 1, playerId: 't3-p1' },
      ],
    })
    const lineJudges = dutyRosterInserts(dupe).filter((r) => r.duty_role === 'line_judge')
    expect(lineJudges).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// analyseSchedule
// ---------------------------------------------------------------------------

describe('analyseSchedule', () => {
  it('is clean for a well-formed schedule', () => {
    const rows = roundRobin4()
    const auto = autoSchedule(rows, courts(2), slots(10))
    const analysis = analyseSchedule({
      matches: rows,
      placements: auto.placements,
      courts: courts(2),
      slots: slots(10),
      teams: teams(4),
    })
    expect(analysis.errorCount).toBe(0)
    expect(analysis.unplacedCount).toBe(0)
    expect(analysis.clean).toBe(true)
  })

  it('flags a double-booked court', () => {
    const rows = roundRobin4()
    const placements: PlacementMap = {
      m1: { courtId: 'court-1', slotId: 'slot-1' },
      m2: { courtId: 'court-1', slotId: 'slot-1' },
    }
    const analysis = analyseSchedule({
      matches: rows,
      placements,
      courts: courts(2),
      slots: slots(4),
      teams: teams(4),
    })
    const conflict = analysis.conflicts.find((c) => c.type === 'court_double_booked')
    expect(conflict?.tone).toBe('danger')
    expect(conflict?.title).toBe('A court is double-booked')
    expect(analysis.clean).toBe(false)
  })

  it('flags a pair booked twice in the same slot', () => {
    const rows = [match('m1', 't1', 't2', { round: 1 }), match('m2', 't1', 't3', { round: 2 })]
    const placements: PlacementMap = {
      m1: { courtId: 'court-1', slotId: 'slot-1' },
      m2: { courtId: 'court-2', slotId: 'slot-1' },
    }
    const analysis = analyseSchedule({
      matches: rows,
      placements,
      courts: courts(2),
      slots: slots(4),
      teams: teams(3),
    })
    expect(analysis.conflicts.some((c) => c.type === 'pair_double_booked')).toBe(true)
    expect(analysis.matchIdsWithErrors).toEqual(expect.arrayContaining(['m1', 'm2']))
  })

  it('warns about back-to-back matches for one pair', () => {
    const rows = [match('m1', 't1', 't2', { round: 1 }), match('m2', 't1', 't3', { round: 2 })]
    const placements: PlacementMap = {
      m1: { courtId: 'court-1', slotId: 'slot-1' },
      m2: { courtId: 'court-1', slotId: 'slot-2' },
    }
    const analysis = analyseSchedule({
      matches: rows,
      placements,
      courts: courts(1),
      slots: slots(4),
      teams: teams(3),
    })
    const rest = analysis.conflicts.find((c) => c.type === 'insufficient_rest')
    expect(rest?.tone).toBe('warn')
  })

  it('counts unplaced matches as a hard problem', () => {
    const rows = roundRobin4()
    const analysis = analyseSchedule({
      matches: rows,
      placements: { m1: { courtId: 'court-1', slotId: 'slot-1' } },
      courts: courts(2),
      slots: slots(4),
      teams: teams(4),
    })
    expect(analysis.unplacedCount).toBe(5)
    expect(analysis.clean).toBe(false)
    expect(analysis.conflicts.some((c) => c.type === 'unassigned_fixture')).toBe(true)
  })

  it('surfaces a player playing and officiating at the same time', () => {
    const rows = [
      match('m1', 't1', 't2', { round: 1 }),
      match('m2', 't3', 't4', { round: 1 }),
      match('m3', 't1', 't3', { round: 2 }),
    ]
    const placements: PlacementMap = {
      m1: { courtId: 'court-1', slotId: 'slot-1' },
      m2: { courtId: 'court-2', slotId: 'slot-1' },
      m3: { courtId: 'court-1', slotId: 'slot-2' },
    }
    const analysis = analyseSchedule({
      matches: rows,
      placements,
      courts: courts(2),
      slots: slots(3),
      teams: teams(4),
      overrides: [{ matchId: 'm1', role: 'scoresheet', index: 0, playerId: 't3-p2' }],
    })
    const conflict = analysis.conflicts.find((c) => c.type === 'officiating_while_playing')
    expect(conflict?.tone).toBe('danger')
    expect(conflict?.title).toMatch(/playing and officiating/i)
  })
})

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

const CLEAN_ANALYSIS = {
  conflicts: [],
  errorCount: 0,
  warningCount: 0,
  infoCount: 0,
  placedCount: 6,
  unplacedCount: 0,
  clean: true,
  matchIdsWithErrors: [],
}

describe('schedulePublishSafety', () => {
  it('allows a clean publish that actually changes something', () => {
    const rows = roundRobin4()
    const placements: PlacementMap = { m1: { courtId: 'court-1', slotId: 'slot-1' } }
    const safety = schedulePublishSafety(rows, placements, CLEAN_ANALYSIS)
    expect(safety.canPublish).toBe(true)
    expect(safety.movedCount).toBe(1)
    expect(safety.destructive).toBe(false)
  })

  it('refuses a no-op publish', () => {
    const rows = [match('m1', 't1', 't2', { courtId: 'court-1', slotId: 'slot-1' })]
    const safety = schedulePublishSafety(
      rows,
      { m1: { courtId: 'court-1', slotId: 'slot-1' } },
      CLEAN_ANALYSIS,
    )
    expect(safety.canPublish).toBe(false)
    expect(safety.headline).toBe('Nothing to publish')
  })

  it('requires an explicit override while hard conflicts are unresolved', () => {
    const rows = roundRobin4()
    const placements: PlacementMap = { m1: { courtId: 'court-1', slotId: 'slot-1' } }
    const analysis = { ...CLEAN_ANALYSIS, errorCount: 1, clean: false }
    expect(schedulePublishSafety(rows, placements, analysis).canPublish).toBe(false)
    expect(
      schedulePublishSafety(rows, placements, analysis, { overrideConflicts: true }).canPublish,
    ).toBe(true)
  })

  it('demands a second confirmation before moving a played match', () => {
    const rows = [
      match('m1', 't1', 't2', {
        courtId: 'court-1',
        slotId: 'slot-1',
        hasResult: true,
        status: 'completed',
      }),
    ]
    const placements: PlacementMap = { m1: { courtId: 'court-2', slotId: 'slot-2' } }
    const safety = schedulePublishSafety(rows, placements, CLEAN_ANALYSIS)
    expect(safety.destructive).toBe(true)
    expect(safety.movedWithResults).toEqual(['m1'])
    expect(safety.canPublish).toBe(false)
    expect(
      schedulePublishSafety(rows, placements, CLEAN_ANALYSIS, { confirmMoveResults: true })
        .canPublish,
    ).toBe(true)
  })
})

describe('schedulePatches', () => {
  it('only emits rows whose court or slot changed, including clears', () => {
    const rows = [
      match('m1', 't1', 't2', { courtId: 'court-1', slotId: 'slot-1' }),
      match('m2', 't3', 't4', { courtId: 'court-2', slotId: 'slot-1' }),
      match('m3', 't1', 't3'),
    ]
    const patches = schedulePatches(rows, {
      m1: { courtId: 'court-1', slotId: 'slot-1' },
      m3: { courtId: 'court-1', slotId: 'slot-2' },
    })
    expect(patches).toEqual([
      { id: 'm2', court_id: null, time_slot_id: null },
      { id: 'm3', court_id: 'court-1', time_slot_id: 'slot-2' },
    ])
  })
})
