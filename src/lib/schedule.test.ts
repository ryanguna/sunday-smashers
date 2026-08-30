import { describe, expect, it } from 'vitest'
import { generateRoundRobin, type Fixture, type TeamId } from './draw'
import {
  assignToCourts,
  detectConflicts,
  deriveDutyRoster,
  dutiesForPlayer,
  matchId,
  matchesForTeam,
  mulberry32,
  type DutyAssignment,
  type FixtureToSchedule,
  type ScheduledMatch,
  type TeamRoster,
  type TimeSlot,
} from './schedule'

const pairs = (n: number): TeamId[] =>
  Array.from({ length: n }, (_, i) => `pair-${String(i + 1).padStart(2, '0')}`)

const slots = (n: number): TimeSlot[] =>
  Array.from({ length: n }, (_, i) => ({ index: i, label: `slot-${i}` }))

const courts = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `Court ${i + 1}`)

const toSchedule = (fixtures: readonly Fixture[], division = 'mens_doubles'): FixtureToSchedule[] =>
  fixtures.map((fixture) => ({ fixture, division, stage: 'elims' as const }))

/** Builds a `TeamRoster` giving each pair two distinct players named after it. */
const rosterFor = (teams: readonly TeamId[]): TeamRoster => {
  const map = new Map<TeamId, string[]>()
  for (const team of teams) map.set(team, [`${team}-p1`, `${team}-p2`])
  return map
}

describe('assignToCourts', () => {
  it('returns empty results for no fixtures', () => {
    const result = assignToCourts([], courts(2), slots(4))
    expect(result.schedule).toEqual([])
    expect(result.unscheduled).toEqual([])
    expect(result.conflicts).toEqual([])
  })

  it('reports a shortfall and schedules nothing when there are no courts or slots', () => {
    const fixtures = toSchedule(generateRoundRobin(pairs(4)))
    const noCourts = assignToCourts(fixtures, [], slots(4))
    expect(noCourts.schedule).toEqual([])
    expect(noCourts.unscheduled).toHaveLength(fixtures.length)
    expect(noCourts.conflicts.some((c) => c.type === 'unassigned_fixture')).toBe(true)

    const noSlots = assignToCourts(fixtures, courts(2), [])
    expect(noSlots.schedule).toEqual([])
    expect(noSlots.unscheduled).toHaveLength(fixtures.length)
  })

  it('never double-books a court in a single slot', () => {
    const fixtures = toSchedule(generateRoundRobin(pairs(11)))
    const { schedule } = assignToCourts(fixtures, courts(3), slots(20), { minRestSlots: 0 })

    const seen = new Set<string>()
    for (const match of schedule) {
      const key = `${match.court}#${match.slot.index}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })

  it('never schedules a pair in two places in the same slot', () => {
    const fixtures = toSchedule(generateRoundRobin(pairs(11)))
    const { schedule } = assignToCourts(fixtures, courts(3), slots(20), { minRestSlots: 0 })

    const slotTeams = new Map<number, Set<TeamId>>()
    for (const match of schedule) {
      const set = slotTeams.get(match.slot.index) ?? new Set<TeamId>()
      expect(set.has(match.fixture.teamA)).toBe(false)
      expect(set.has(match.fixture.teamB)).toBe(false)
      set.add(match.fixture.teamA)
      set.add(match.fixture.teamB)
      slotTeams.set(match.slot.index, set)
    }
  })

  it('schedules every fixture when there is enough capacity', () => {
    const fixtures = toSchedule(generateRoundRobin(pairs(8)))
    const { schedule, unscheduled, conflicts } = assignToCourts(fixtures, courts(4), slots(20))
    expect(schedule).toHaveLength(fixtures.length)
    expect(unscheduled).toEqual([])
    expect(conflicts.filter((c) => c.type === 'unassigned_fixture')).toEqual([])
  })

  it('reports the shortfall when there are more fixtures than slots x courts', () => {
    const fixtures = toSchedule(generateRoundRobin(pairs(11))) // 55 fixtures
    const { schedule, unscheduled, conflicts } = assignToCourts(fixtures, courts(2), slots(3)) // 6 cells
    expect(schedule.length).toBeLessThanOrEqual(6)
    expect(schedule.length + unscheduled.length).toBe(fixtures.length)
    expect(unscheduled.length).toBeGreaterThan(0)
    expect(conflicts.some((c) => c.type === 'unassigned_fixture')).toBe(true)
  })

  it('respects minRestSlots when capacity allows it', () => {
    const fixtures = toSchedule(generateRoundRobin(pairs(4))) // 6 fixtures, plenty of room
    const { schedule, conflicts } = assignToCourts(fixtures, courts(1), slots(12), {
      minRestSlots: 2,
    })

    const byTeam = new Map<TeamId, number[]>()
    for (const match of schedule) {
      for (const team of [match.fixture.teamA, match.fixture.teamB]) {
        const list = byTeam.get(team) ?? []
        list.push(match.slot.index)
        byTeam.set(team, list)
      }
    }
    for (const list of byTeam.values()) {
      list.sort((a, b) => a - b)
      for (let i = 0; i < list.length - 1; i++) {
        expect(list[i + 1] - list[i] - 1).toBeGreaterThanOrEqual(2)
      }
    }
    expect(conflicts.filter((c) => c.type === 'insufficient_rest')).toEqual([])
  })

  it('flags insufficient rest rather than silently producing a bad draw when capacity is tight', () => {
    const fixtures = toSchedule(generateRoundRobin(pairs(4)))
    // Only 1 court and few slots forces some pairs back-to-back if minRestSlots is high.
    const { schedule, conflicts } = assignToCourts(fixtures, courts(1), slots(6), {
      minRestSlots: 3,
    })
    expect(schedule).toHaveLength(fixtures.length) // still placed, just flagged
    expect(conflicts.some((c) => c.type === 'insufficient_rest')).toBe(true)
  })

  it('is deterministic for the same input with no rng supplied', () => {
    const fixtures = toSchedule(generateRoundRobin(pairs(11)))
    const a = assignToCourts(fixtures, courts(3), slots(20))
    const b = assignToCourts(fixtures, courts(3), slots(20))
    expect(a.schedule).toEqual(b.schedule)
    expect(a.unscheduled).toEqual(b.unscheduled)
  })

  it('is deterministic for the same input and same seeded rng', () => {
    const fixtures = toSchedule(generateRoundRobin(pairs(11)))
    const a = assignToCourts(fixtures, courts(3), slots(20), { rng: mulberry32(42) })
    const b = assignToCourts(fixtures, courts(3), slots(20), { rng: mulberry32(42) })
    expect(a.schedule).toEqual(b.schedule)
  })

  it('can produce a different (but still valid) order with a different seed', () => {
    const fixtures = toSchedule(generateRoundRobin(pairs(11)))
    const a = assignToCourts(fixtures, courts(3), slots(20), { rng: mulberry32(1) })
    const b = assignToCourts(fixtures, courts(3), slots(20), { rng: mulberry32(2) })
    // Not asserting inequality (a seed could coincidentally match) — just that
    // both are internally valid schedules of the same size.
    expect(a.schedule).toHaveLength(fixtures.length)
    expect(b.schedule).toHaveLength(fixtures.length)
  })

  it('spreads a pair matches across the day rather than clustering with ample capacity', () => {
    const fixtures = toSchedule(generateRoundRobin(pairs(4)))
    const { schedule } = assignToCourts(fixtures, courts(1), slots(20), { minRestSlots: 1 })
    const bySlotForPair01 = schedule
      .filter((m) => m.fixture.teamA === 'pair-01' || m.fixture.teamB === 'pair-01')
      .map((m) => m.slot.index)
      .sort((a, b) => a - b)
    // pair-01 plays 3 matches (round robin of 4) — with 20 slots available and
    // minRestSlots 1 they should not all be crammed into the first 3 slots.
    expect(bySlotForPair01[bySlotForPair01.length - 1] - bySlotForPair01[0]).toBeGreaterThan(2)
  })

  it('assigns a unique, stable matchId per court+slot', () => {
    const fixtures = toSchedule(generateRoundRobin(pairs(4)))
    const { schedule } = assignToCourts(fixtures, courts(2), slots(10))
    for (const match of schedule) {
      expect(match.id).toBe(matchId(match))
    }
    const ids = new Set(schedule.map((m) => m.id))
    expect(ids.size).toBe(schedule.length)
  })

  it('handles a single pair (no fixtures) without throwing', () => {
    const result = assignToCourts(toSchedule(generateRoundRobin(['solo-pair'])), courts(2), slots(4))
    expect(result.schedule).toEqual([])
  })
})

describe('deriveDutyRoster', () => {
  it('returns nothing for an empty schedule', () => {
    const result = deriveDutyRoster([], rosterFor([]))
    expect(result.assignments).toEqual([])
    expect(result.conflicts).toEqual([])
    expect(result.dutyCountsByPlayer.size).toBe(0)
  })

  it('draws officials for a match from the next match on the same court', () => {
    const teams = pairs(4)
    const roster = rosterFor(teams)
    const fixtures = toSchedule(generateRoundRobin(teams))
    const { schedule } = assignToCourts(fixtures, courts(1), slots(10), { minRestSlots: 0 })
    const { assignments } = deriveDutyRoster(schedule, roster)

    const byCourt = schedule.filter((m) => m.court === 'Court 1').sort((a, b) => a.slot.index - b.slot.index)
    for (let i = 0; i < byCourt.length - 1; i++) {
      const match = byCourt[i]
      const next = byCourt[i + 1]
      const nextPlayers = new Set([
        ...roster.get(next.fixture.teamA)!,
        ...roster.get(next.fixture.teamB)!,
      ])
      const forMatch = assignments.filter((a) => a.matchId === match.id && a.player)
      for (const a of forMatch) {
        expect(nextPlayers.has(a.player)).toBe(true)
        expect(a.source).toBe('derived')
      }
    }
  })

  it('never rosters a player to officiate a match in a slot where they are also playing (full round robin)', () => {
    const teams = pairs(11)
    const roster = rosterFor(teams)
    const fixtures = toSchedule(generateRoundRobin(teams))
    const { schedule } = assignToCourts(fixtures, courts(3), slots(30), { minRestSlots: 1 })
    const { assignments } = deriveDutyRoster(schedule, roster)

    const playingBySlot = new Map<number, Set<string>>()
    for (const match of schedule) {
      const set = playingBySlot.get(match.slot.index) ?? new Set<string>()
      for (const p of roster.get(match.fixture.teamA)!) set.add(p)
      for (const p of roster.get(match.fixture.teamB)!) set.add(p)
      playingBySlot.set(match.slot.index, set)
    }
    const matchById = new Map(schedule.map((m) => [m.id, m]))

    for (const a of assignments) {
      if (!a.player) continue
      const match = matchById.get(a.matchId)!
      const playing = playingBySlot.get(match.slot.index)
      expect(playing?.has(a.player)).toBe(false)
    }
  })

  it('never lets one player officiate two different matches in the same slot', () => {
    const teams = pairs(11)
    const roster = rosterFor(teams)
    const fixtures = toSchedule(generateRoundRobin(teams))
    const { schedule } = assignToCourts(fixtures, courts(4), slots(30), { minRestSlots: 1 })
    const { assignments } = deriveDutyRoster(schedule, roster)
    const matchById = new Map(schedule.map((m) => [m.id, m]))

    const officiatingBySlot = new Map<number, Set<string>>()
    for (const a of assignments) {
      if (!a.player) continue
      const match = matchById.get(a.matchId)!
      const set = officiatingBySlot.get(match.slot.index) ?? new Set<string>()
      expect(set.has(a.player)).toBe(false)
      set.add(a.player)
      officiatingBySlot.set(match.slot.index, set)
    }
  })

  it('uses the fallback rule and flags it for the last match on a court', () => {
    const teams = pairs(4)
    const roster = rosterFor(teams)
    const fixtures = toSchedule(generateRoundRobin(teams))
    const { schedule } = assignToCourts(fixtures, courts(2), slots(10), { minRestSlots: 0 })

    const byCourt = new Map<string, ScheduledMatch[]>()
    for (const m of schedule) {
      const list = byCourt.get(m.court) ?? []
      list.push(m)
      byCourt.set(m.court, list)
    }
    for (const list of byCourt.values()) list.sort((a, b) => a.slot.index - b.slot.index)

    const { assignments, conflicts } = deriveDutyRoster(schedule, roster)

    for (const [, list] of byCourt) {
      const last = list[list.length - 1]
      const isVeryLastOverall = !schedule.some((m) => m.slot.index > last.slot.index)
      const forMatch = assignments.filter((a) => a.matchId === last.id)
      if (isVeryLastOverall) {
        expect(forMatch.every((a) => a.source === 'unassigned' || a.player === '')).toBe(true)
      } else {
        expect(forMatch.some((a) => a.source === 'fallback')).toBe(true)
      }
    }
    expect(
      conflicts.some((c) => c.type === 'fallback_officials_used' || c.type === 'no_officials_assigned'),
    ).toBe(true)
  })

  it('leaves roles unassigned and flags them when no eligible player exists for the very last match', () => {
    const teams = pairs(2)
    const roster = rosterFor(teams)
    const fixtures = toSchedule(generateRoundRobin(teams)) // single fixture
    const { schedule } = assignToCourts(fixtures, courts(1), slots(1))
    const { assignments, conflicts } = deriveDutyRoster(schedule, roster)

    expect(assignments.every((a) => a.source === 'unassigned' && a.player === '')).toBe(true)
    expect(conflicts.some((c) => c.type === 'no_officials_assigned')).toBe(true)
  })

  it('handles a pair with fewer than two known players gracefully', () => {
    const teams = pairs(3)
    const roster: TeamRoster = new Map([
      ['pair-01', ['pair-01-p1', 'pair-01-p2']],
      ['pair-02', ['pair-02-p1']], // only one known player
      ['pair-03', []], // none known
    ])
    const fixtures = toSchedule(generateRoundRobin(teams))
    const { schedule } = assignToCourts(fixtures, courts(1), slots(10), { minRestSlots: 0 })
    const { assignments, conflicts } = deriveDutyRoster(schedule, roster)

    // Should not throw, and should report partial/none-assigned where the
    // "next match" source pair had too few known players.
    expect(assignments.length).toBeGreaterThan(0)
    expect(
      conflicts.some(
        (c) => c.type === 'partial_officials_assigned' || c.type === 'no_officials_assigned',
      ),
    ).toBe(true)
  })

  it('maps a full 4-player next match onto all 4 roles with no duplicates', () => {
    const teams = pairs(4)
    const roster = rosterFor(teams)
    const fixtures = toSchedule(generateRoundRobin(teams))
    const { schedule } = assignToCourts(fixtures, courts(1), slots(10), { minRestSlots: 0 })
    const { assignments } = deriveDutyRoster(schedule, roster)

    const byMatch = new Map<string, DutyAssignment[]>()
    for (const a of assignments) {
      const list = byMatch.get(a.matchId) ?? []
      list.push(a)
      byMatch.set(a.matchId, list)
    }
    for (const list of byMatch.values()) {
      const filled = list.filter((a) => a.player)
      const roles = filled.map((a) => a.role)
      expect(roles.filter((r) => r === 'umpire_scorer')).toHaveLength(
        filled.some((a) => a.role === 'umpire_scorer') ? 1 : 0,
      )
      const players = filled.map((a) => a.player)
      expect(new Set(players).size).toBe(players.length) // no player double-booked in one match
    }
  })

  it('distributes duties across players (fairness) rather than always picking the same person', () => {
    const teams = pairs(11)
    const roster = rosterFor(teams)
    const fixtures = toSchedule(generateRoundRobin(teams))
    const { schedule } = assignToCourts(fixtures, courts(3), slots(30), { minRestSlots: 1 })
    const { dutyCountsByPlayer } = deriveDutyRoster(schedule, roster)

    expect(dutyCountsByPlayer.size).toBeGreaterThan(1)
    const counts = [...dutyCountsByPlayer.values()]
    const max = Math.max(...counts)
    const min = Math.min(...counts)
    // Not a tight bound (the "next match" rule is not a fairness algorithm by
    // itself) but no one player should be swamped compared to everyone else.
    expect(max - min).toBeLessThanOrEqual(Math.max(4, Math.ceil(max * 0.6)))
  })

  it('supports manual overrides that win over the derived roster', () => {
    const teams = pairs(4)
    const roster = rosterFor(teams)
    const fixtures = toSchedule(generateRoundRobin(teams))
    const { schedule } = assignToCourts(fixtures, courts(1), slots(10), { minRestSlots: 0 })
    const first = schedule[0]

    const { assignments } = deriveDutyRoster(schedule, roster, {
      manualOverrides: [
        { matchId: first.id, role: 'umpire_scorer', player: 'admin-picked-player', source: 'manual' },
      ],
    })

    const overridden = assignments.filter((a) => a.matchId === first.id && a.role === 'umpire_scorer')
    expect(overridden).toHaveLength(1)
    expect(overridden[0]).toMatchObject({ player: 'admin-picked-player', source: 'manual' })
  })

  it('is deterministic for the same input', () => {
    const teams = pairs(8)
    const roster = rosterFor(teams)
    const fixtures = toSchedule(generateRoundRobin(teams))
    const { schedule } = assignToCourts(fixtures, courts(2), slots(20))
    const a = deriveDutyRoster(schedule, roster)
    const b = deriveDutyRoster(schedule, roster)
    expect(a.assignments).toEqual(b.assignments)
  })
})

describe('detectConflicts', () => {
  it('finds no structural conflicts for a clean schedule and roster', () => {
    const teams = pairs(6)
    const roster = rosterFor(teams)
    const fixtures = toSchedule(generateRoundRobin(teams))
    const { schedule } = assignToCourts(fixtures, courts(2), slots(20), { minRestSlots: 1 })
    const dutyRoster = deriveDutyRoster(schedule, roster)
    const conflicts = detectConflicts(schedule, dutyRoster, { teamRoster: roster })
    // "no_officials_assigned" is expected for the very last match(es) of the
    // day, which the draft rules give no fallback for — everything else
    // (double-booking, officiating while playing) must be conflict-free.
    const unexpected = conflicts.filter(
      (c) => c.severity === 'error' && c.type !== 'no_officials_assigned',
    )
    expect(unexpected).toEqual([])
  })

  it('detects a court double-booked in one slot', () => {
    const schedule: ScheduledMatch[] = [
      {
        id: 'Court 1#0',
        fixture: { round: 1, teamA: 'pair-01', teamB: 'pair-02' },
        division: 'mens_doubles',
        stage: 'elims',
        court: 'Court 1',
        slot: { index: 0 },
      },
      {
        id: 'Court 1#0-dup',
        fixture: { round: 1, teamA: 'pair-03', teamB: 'pair-04' },
        division: 'mens_doubles',
        stage: 'elims',
        court: 'Court 1',
        slot: { index: 0 },
      },
    ]
    const dutyRoster = deriveDutyRoster(schedule, rosterFor(pairs(4)))
    const conflicts = detectConflicts(schedule, dutyRoster)
    expect(conflicts.some((c) => c.type === 'court_double_booked')).toBe(true)
  })

  it('detects a pair double-booked across two courts in the same slot', () => {
    const schedule: ScheduledMatch[] = [
      {
        id: 'Court 1#0',
        fixture: { round: 1, teamA: 'pair-01', teamB: 'pair-02' },
        division: 'mens_doubles',
        stage: 'elims',
        court: 'Court 1',
        slot: { index: 0 },
      },
      {
        id: 'Court 2#0',
        fixture: { round: 1, teamA: 'pair-01', teamB: 'pair-03' },
        division: 'mens_doubles',
        stage: 'elims',
        court: 'Court 2',
        slot: { index: 0 },
      },
    ]
    const dutyRoster = deriveDutyRoster(schedule, rosterFor(pairs(3)))
    const conflicts = detectConflicts(schedule, dutyRoster)
    expect(conflicts.some((c) => c.type === 'pair_double_booked' && c.teamId === 'pair-01')).toBe(true)
  })

  it('flags a match with no officials assigned', () => {
    const schedule: ScheduledMatch[] = [
      {
        id: 'Court 1#0',
        fixture: { round: 1, teamA: 'pair-01', teamB: 'pair-02' },
        division: 'mens_doubles',
        stage: 'elims',
        court: 'Court 1',
        slot: { index: 0 },
      },
    ]
    const conflicts = detectConflicts(schedule, {
      assignments: [],
      dutyCountsByPlayer: new Map(),
      conflicts: [],
    })
    expect(conflicts.some((c) => c.type === 'no_officials_assigned')).toBe(true)
  })

  it('flags insufficient rest between two matches for the same pair', () => {
    const schedule: ScheduledMatch[] = [
      {
        id: 'Court 1#0',
        fixture: { round: 1, teamA: 'pair-01', teamB: 'pair-02' },
        division: 'mens_doubles',
        stage: 'elims',
        court: 'Court 1',
        slot: { index: 0 },
      },
      {
        id: 'Court 1#1',
        fixture: { round: 2, teamA: 'pair-01', teamB: 'pair-03' },
        division: 'mens_doubles',
        stage: 'elims',
        court: 'Court 1',
        slot: { index: 1 },
      },
    ]
    const dutyRoster = deriveDutyRoster(schedule, rosterFor(pairs(3)))
    const conflicts = detectConflicts(schedule, dutyRoster, { minRestSlots: 1 })
    expect(conflicts.some((c) => c.type === 'insufficient_rest' && c.teamId === 'pair-01')).toBe(true)
  })

  it('detects a player rostered to officiate while also playing (hand-edited roster)', () => {
    const roster: TeamRoster = new Map([
      ['pair-01', ['alice', 'bob']],
      ['pair-02', ['carol', 'dave']],
      ['pair-03', ['alice', 'erin']], // alice plays for two pairs — an edge case
    ])
    const schedule: ScheduledMatch[] = [
      {
        id: 'Court 1#0',
        fixture: { round: 1, teamA: 'pair-01', teamB: 'pair-02' },
        division: 'mens_doubles',
        stage: 'elims',
        court: 'Court 1',
        slot: { index: 0 },
      },
      {
        id: 'Court 2#0',
        fixture: { round: 1, teamA: 'pair-03', teamB: 'pair-01' },
        division: 'mens_doubles',
        stage: 'elims',
        court: 'Court 2',
        slot: { index: 0 },
      },
    ]
    // Hand-crafted roster that (incorrectly) puts alice on umpire duty for a
    // match happening in the same slot she is playing in.
    const dutyRoster = {
      assignments: [
        { matchId: 'Court 1#0', role: 'umpire_scorer' as const, player: 'alice', source: 'manual' as const },
      ],
      dutyCountsByPlayer: new Map([['alice', 1]]),
      conflicts: [],
    }
    const conflicts = detectConflicts(schedule, dutyRoster, { teamRoster: roster })
    expect(
      conflicts.some((c) => c.type === 'officiating_while_playing' && c.playerId === 'alice'),
    ).toBe(true)
  })

  it('returns an empty array for empty schedule and roster', () => {
    const conflicts = detectConflicts([], { assignments: [], dutyCountsByPlayer: new Map(), conflicts: [] })
    expect(conflicts).toEqual([])
  })
})

describe('dutiesForPlayer', () => {
  it('returns only the assignments for the given player', () => {
    const dutyRoster = {
      assignments: [
        { matchId: 'm1', role: 'umpire_scorer' as const, player: 'alice', source: 'derived' as const },
        { matchId: 'm2', role: 'scoresheet' as const, player: 'bob', source: 'derived' as const },
        { matchId: 'm3', role: 'line_judge' as const, player: 'alice', source: 'derived' as const },
      ],
      dutyCountsByPlayer: new Map([['alice', 2], ['bob', 1]]),
      conflicts: [],
    }
    expect(dutiesForPlayer(dutyRoster, 'alice')).toHaveLength(2)
    expect(dutiesForPlayer(dutyRoster, 'nobody')).toEqual([])
  })
})

describe('matchesForTeam', () => {
  it('returns only the matches for the given team, ordered earliest-first', () => {
    const teams = pairs(4)
    const fixtures = toSchedule(generateRoundRobin(teams))
    const { schedule } = assignToCourts(fixtures, courts(2), slots(10))
    const matches = matchesForTeam(schedule, 'pair-01')
    expect(matches.length).toBeGreaterThan(0)
    for (const m of matches) {
      expect([m.fixture.teamA, m.fixture.teamB]).toContain('pair-01')
    }
    for (let i = 0; i < matches.length - 1; i++) {
      expect(matches[i].slot.index).toBeLessThanOrEqual(matches[i + 1].slot.index)
    }
  })

  it('returns an empty array for a team with no matches', () => {
    const teams = pairs(4)
    const fixtures = toSchedule(generateRoundRobin(teams))
    const { schedule } = assignToCourts(fixtures, courts(2), slots(10))
    expect(matchesForTeam(schedule, 'unknown-pair')).toEqual([])
  })
})
