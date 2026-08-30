import { describe, expect, it } from 'vitest'

import {
  describeResultChange,
  draftFromRow,
  EMPTY_MATCH_FILTERS,
  filterMatches,
  isDecidedStatus,
  matchAdminStats,
  matchSearchText,
  MATCH_STATUS_LABELS,
  needsOffender,
  normalisesScore,
  otherMatchSide,
  overwritesVerifiedScoresheet,
  previewReschedule,
  reschedulePatch,
  rescheduleWarnings,
  resolveResult,
  roundLabel,
  SETTABLE_MATCH_STATUSES,
  sideForTeamId,
  sortMatchRows,
  suggestWinner,
  summariseResult,
  validateResult,
  whereAndWhen,
  type AdminMatchRow,
  type ResultDraft,
} from '@/lib/match-admin'
import type {
  PlacementMap,
  ScheduleCourt,
  ScheduleSlot,
  ScheduleTeam,
  SchedulableMatch,
} from '@/lib/schedule-admin'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function row(overrides: Partial<AdminMatchRow> = {}): AdminMatchRow {
  return {
    id: 'match-1',
    divisionId: 'mens',
    divisionName: "Men's Doubles",
    stage: 'elims',
    round: 3,
    bracketKey: null,
    courtId: 'court-1',
    courtName: 'Court 1',
    slotId: 'slot-2',
    slotIndex: 2,
    slotLabel: '10:00am',
    teamA: { id: 'team-a', name: 'Sugarplum Smackers', players: ['Queenie Latu', 'Rosa Delgado'] },
    teamB: { id: 'team-b', name: 'Jingle Ballers', players: ['Sasha Moe', 'Tui Faleolo'] },
    scoreA: 0,
    scoreB: 0,
    status: 'scheduled',
    winnerTeamId: null,
    forfeitedByTeamId: null,
    forfeitReason: null,
    pointsToWin: 15,
    deuce: false,
    cap: null,
    scoresheetStatus: null,
    ...overrides,
  }
}

function draft(overrides: Partial<ResultDraft> = {}): ResultDraft {
  return {
    status: 'completed',
    scoreA: 15,
    scoreB: 9,
    winner: null,
    offender: null,
    reason: '',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------

describe('vocabulary', () => {
  it('names every match status', () => {
    expect(Object.keys(MATCH_STATUS_LABELS)).toHaveLength(7)
    expect(MATCH_STATUS_LABELS.retired).toBe('Retired')
  })

  it('never offers in_progress as something an admin can set', () => {
    expect(SETTABLE_MATCH_STATUSES).not.toContain('in_progress')
  })

  it('counts the four decided statuses and nothing else', () => {
    const decided = (['completed', 'forfeited', 'walkover', 'retired'] as const).every(
      isDecidedStatus,
    )
    expect(decided).toBe(true)
    expect(isDecidedStatus('scheduled')).toBe(false)
    expect(isDecidedStatus('in_progress')).toBe(false)
    expect(isDecidedStatus('cancelled')).toBe(false)
  })

  it('normalises the score for a forfeit and a walkover only', () => {
    expect(normalisesScore('forfeited')).toBe(true)
    expect(normalisesScore('walkover')).toBe(true)
    expect(normalisesScore('retired')).toBe(false)
    expect(normalisesScore('completed')).toBe(false)
  })

  it('asks who was at fault for the three early endings', () => {
    expect(needsOffender('forfeited')).toBe(true)
    expect(needsOffender('walkover')).toBe(true)
    expect(needsOffender('retired')).toBe(true)
    expect(needsOffender('completed')).toBe(false)
    expect(needsOffender('cancelled')).toBe(false)
  })

  it('flips sides', () => {
    expect(otherMatchSide('a')).toBe('b')
    expect(otherMatchSide('b')).toBe('a')
  })

  it('finds the side a team is playing on', () => {
    const r = row()
    expect(sideForTeamId(r, 'team-b')).toBe('b')
    expect(sideForTeamId(r, 'nobody')).toBeNull()
    expect(sideForTeamId(r, null)).toBeNull()
  })

  it('labels rounds and knockout brackets', () => {
    expect(roundLabel(row())).toBe('Round 3')
    expect(roundLabel(row({ round: null }))).toBe('Round robin')
    expect(roundLabel(row({ bracketKey: 'FINAL', stage: 'final' }))).toBe('Championship')
    expect(roundLabel(row({ bracketKey: 'THIRD' }))).toBe('Battle for 3rd')
  })

  it('is honest when a fixture has nowhere to play', () => {
    expect(whereAndWhen(row())).toBe('Court 1 · 10:00am')
    expect(whereAndWhen(row({ courtName: null, slotLabel: null }))).toBe('No court · no time slot')
  })
})

// ---------------------------------------------------------------------------

describe('filtering', () => {
  const rows = [
    row({ id: '1', status: 'completed', stage: 'elims' }),
    row({
      id: '2',
      status: 'in_progress',
      divisionId: 'womens',
      divisionName: "Women's Doubles",
      teamA: { id: 't3', name: 'Tinsel Titans', players: ['Ivy Novak'] },
    }),
    row({ id: '3', status: 'retired', stage: 'final' }),
    row({ id: '4', status: 'scheduled' }),
  ]

  it('passes everything through by default', () => {
    expect(filterMatches(rows, EMPTY_MATCH_FILTERS)).toHaveLength(4)
  })

  it('filters by division, stage and status', () => {
    expect(filterMatches(rows, { ...EMPTY_MATCH_FILTERS, divisionId: 'womens' })).toHaveLength(1)
    expect(filterMatches(rows, { ...EMPTY_MATCH_FILTERS, stage: 'final' })).toHaveLength(1)
    expect(filterMatches(rows, { ...EMPTY_MATCH_FILTERS, status: 'retired' })).toHaveLength(1)
  })

  it('has an "undecided" status filter for the matches still to sort out', () => {
    const undecided = filterMatches(rows, { ...EMPTY_MATCH_FILTERS, status: 'undecided' })
    expect(undecided.map((r) => r.id)).toEqual(['2', '4'])
  })

  it('searches pair names, player names, court and time', () => {
    expect(filterMatches(rows, { ...EMPTY_MATCH_FILTERS, search: 'ivy' })).toHaveLength(1)
    expect(filterMatches(rows, { ...EMPTY_MATCH_FILTERS, search: 'jingle' })).toHaveLength(4)
    expect(filterMatches(rows, { ...EMPTY_MATCH_FILTERS, search: '10:00am' })).toHaveLength(4)
    expect(filterMatches(rows, { ...EMPTY_MATCH_FILTERS, search: 'nobody' })).toHaveLength(0)
  })

  it('ignores case and surrounding whitespace in the search', () => {
    // Row 2 swapped its pair A out, so only three rows still list Rosa.
    expect(filterMatches(rows, { ...EMPTY_MATCH_FILTERS, search: '  ROSA  ' })).toHaveLength(3)
  })

  it('combines filters rather than replacing them', () => {
    const found = filterMatches(rows, {
      ...EMPTY_MATCH_FILTERS,
      divisionId: 'mens',
      status: 'undecided',
    })
    expect(found.map((r) => r.id)).toEqual(['4'])
  })

  it('includes the placeholder text of an undecided pair', () => {
    expect(matchSearchText(row())).toContain('sugarplum smackers')
    expect(matchSearchText(row())).toContain('tui faleolo')
  })

  it('sorts into running order, with unplaced fixtures last', () => {
    const sorted = sortMatchRows([
      row({ id: 'late', slotIndex: 5 }),
      row({ id: 'unplaced', slotIndex: null, courtName: null }),
      row({ id: 'early', slotIndex: 1 }),
    ])
    expect(sorted.map((r) => r.id)).toEqual(['early', 'late', 'unplaced'])
  })

  it('summarises the day for the stat cards', () => {
    const stats = matchAdminStats([
      ...rows,
      row({ id: '5', status: 'cancelled' }),
      row({ id: '6', status: 'completed', scoresheetStatus: 'verified' }),
      row({ id: '7', courtId: null, slotId: null }),
    ])
    expect(stats).toMatchObject({
      total: 7,
      decided: 3,
      live: 1,
      cancelled: 1,
      verified: 1,
      unplaced: 1,
    })
  })
})

// ---------------------------------------------------------------------------

describe('resolving a result', () => {
  it('keeps the entered score for a completed match', () => {
    const patch = resolveResult(row(), draft({ scoreA: 15, scoreB: 12 }))
    expect(patch).toMatchObject({
      status: 'completed',
      score_a: 15,
      score_b: 12,
      winner_team_id: 'team-a',
      forfeited_by_team_id: null,
      forfeit_reason: null,
    })
  })

  it('lets the admin name a winner the score does not obviously imply', () => {
    const patch = resolveResult(row(), draft({ scoreA: 15, scoreB: 12, winner: 'b' }))
    expect(patch.winner_team_id).toBe('team-b')
  })

  it('normalises a forfeit to points_to_win–0 against the offender', () => {
    const patch = resolveResult(
      row({ scoreA: 7, scoreB: 4 }),
      draft({ status: 'forfeited', offender: 'a', scoreA: 7, scoreB: 4, reason: 'no-show' }),
    )
    expect(patch).toMatchObject({
      status: 'forfeited',
      score_a: 0,
      score_b: 15,
      winner_team_id: 'team-b',
      forfeited_by_team_id: 'team-a',
      forfeit_reason: 'no-show',
    })
  })

  it('normalises a walkover the same way, under its own status', () => {
    const patch = resolveResult(row(), draft({ status: 'walkover', offender: 'b' }))
    expect(patch).toMatchObject({
      status: 'walkover',
      score_a: 15,
      score_b: 0,
      winner_team_id: 'team-a',
      forfeited_by_team_id: 'team-b',
    })
  })

  it('uses the match record for the normalised score, never a hardcoded 15', () => {
    const patch = resolveResult(
      row({ pointsToWin: 21, stage: 'final' }),
      draft({ status: 'forfeited', offender: 'a' }),
    )
    expect(patch.score_b).toBe(21)
  })

  it('keeps the score actually played for a retirement', () => {
    const patch = resolveResult(
      row({ scoreA: 7, scoreB: 13, status: 'in_progress' }),
      draft({ status: 'retired', offender: 'b', scoreA: 7, scoreB: 13, reason: 'calf strain' }),
    )
    expect(patch).toMatchObject({
      status: 'retired',
      score_a: 7,
      score_b: 13,
      winner_team_id: 'team-a',
      forfeit_reason: 'calf strain',
    })
  })

  it('never blames a retiring pair in forfeited_by_team_id', () => {
    const patch = resolveResult(row(), draft({ status: 'retired', offender: 'b', scoreA: 9, scoreB: 11 }))
    expect(patch.forfeited_by_team_id).toBeNull()
  })

  it('lets a retiring pair be ahead on the scoreboard and still lose', () => {
    // The whole reason the winner is stored rather than derived.
    const patch = resolveResult(
      row({ scoreA: 3, scoreB: 14 }),
      draft({ status: 'retired', offender: 'b', scoreA: 3, scoreB: 14 }),
    )
    expect(patch.winner_team_id).toBe('team-a')
    expect(patch.score_b).toBeGreaterThan(patch.score_a)
  })

  it('gives the three endings three different statuses', () => {
    const statuses = (['forfeited', 'walkover', 'retired'] as const).map(
      (status) => resolveResult(row(), draft({ status, offender: 'a' })).status,
    )
    expect(new Set(statuses).size).toBe(3)
  })

  it('clears everything when a result is cleared back to scheduled', () => {
    const patch = resolveResult(
      row({ status: 'forfeited', scoreA: 15, winnerTeamId: 'team-a', forfeitedByTeamId: 'team-b' }),
      draft({ status: 'scheduled', reason: 'entered against the wrong fixture' }),
    )
    expect(patch).toEqual({
      status: 'scheduled',
      score_a: 0,
      score_b: 0,
      winner_team_id: null,
      forfeited_by_team_id: null,
      forfeit_reason: null,
    })
  })

  it('cancels with a reason but with nobody winning', () => {
    const patch = resolveResult(row(), draft({ status: 'cancelled', reason: 'court flooded' }))
    expect(patch).toMatchObject({
      status: 'cancelled',
      score_a: 0,
      score_b: 0,
      winner_team_id: null,
      forfeit_reason: 'court flooded',
    })
  })

  it('trims a blank reason to null rather than storing whitespace', () => {
    expect(resolveResult(row(), draft({ status: 'cancelled', reason: '   ' })).forfeit_reason).toBeNull()
  })

  it('clamps a score to what the match could actually produce', () => {
    const patch = resolveResult(row({ pointsToWin: 15 }), draft({ scoreA: 900, scoreB: -4 }))
    expect(patch.score_a).toBe(30)
    expect(patch.score_b).toBe(0)
  })

  it('clamps to the cap when the match has one', () => {
    const patch = resolveResult(
      row({ pointsToWin: 21, deuce: true, cap: 30 }),
      draft({ scoreA: 45, scoreB: 29 }),
    )
    expect(patch.score_a).toBe(30)
  })

  it('does not blame anyone when the offender is missing', () => {
    const patch = resolveResult(row(), draft({ status: 'forfeited', offender: null }))
    expect(patch.forfeited_by_team_id).toBeNull()
    expect(patch.winner_team_id).toBeNull()
  })

  it('suggests a winner from the score without ever committing to it', () => {
    expect(suggestWinner(15, 9)).toBe('a')
    expect(suggestWinner(9, 15)).toBe('b')
    expect(suggestWinner(11, 11)).toBeNull()
  })
})

// ---------------------------------------------------------------------------

describe('validating a result', () => {
  it('accepts an ordinary completed match', () => {
    expect(validateResult(row(), draft()).ok).toBe(true)
  })

  it('refuses a draw', () => {
    const result = validateResult(row(), draft({ scoreA: 12, scoreB: 12 }))
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toContain('no draws')
  })

  it('refuses a winner with fewer points', () => {
    const result = validateResult(row(), draft({ scoreA: 15, scoreB: 9, winner: 'b' }))
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toContain('fewer points')
  })

  it('insists on knowing which pair did not play', () => {
    expect(validateResult(row(), draft({ status: 'forfeited' })).ok).toBe(false)
    expect(validateResult(row(), draft({ status: 'walkover' })).ok).toBe(false)
    expect(validateResult(row(), draft({ status: 'retired' })).ok).toBe(false)
  })

  it('refuses a result on a fixture whose pairs are not decided yet', () => {
    const undecided = row({ teamB: { id: null, name: 'Winner of M1', players: [] } })
    expect(validateResult(undecided, draft()).ok).toBe(false)
  })

  it('still lets an undecided fixture be cancelled', () => {
    const undecided = row({ teamB: { id: null, name: 'Winner of M1', players: [] } })
    expect(validateResult(undecided, draft({ status: 'cancelled' })).ok).toBe(true)
  })

  it('warns when a completed win falls short of points_to_win', () => {
    const result = validateResult(row(), draft({ scoreA: 11, scoreB: 4 }))
    expect(result.ok).toBe(true)
    expect(result.warnings.join(' ')).toContain('retirement')
  })

  it('warns that a 0–0 retirement is probably a walkover', () => {
    const result = validateResult(row(), draft({ status: 'retired', offender: 'a', scoreA: 0, scoreB: 0 }))
    expect(result.warnings.join(' ')).toContain('walkover')
  })

  it('warns when an ending is recorded with no reason', () => {
    const result = validateResult(row(), draft({ status: 'forfeited', offender: 'a' }))
    expect(result.warnings.join(' ')).toContain('No reason')
  })

  it('warns loudly when a verified scoresheet is about to be overwritten', () => {
    const verified = row({ status: 'completed', scoresheetStatus: 'verified' })
    const result = validateResult(verified, draft({ status: 'retired', offender: 'a' }))
    expect(result.warnings.join(' ')).toContain('standings')
  })

  it('says nothing about a verified scoresheet when nothing about the result moves', () => {
    const verified = row({ status: 'completed', scoresheetStatus: 'verified' })
    expect(validateResult(verified, draft()).warnings.join(' ')).not.toContain('verified')
  })

  it('warns when a score had to be clamped', () => {
    expect(validateResult(row(), draft({ scoreA: 99 })).warnings.join(' ')).toContain('clamped')
  })
})

// ---------------------------------------------------------------------------

describe('overwrite detection', () => {
  const verified = row({
    status: 'completed',
    scoreA: 15,
    scoreB: 11,
    winnerTeamId: 'team-a',
    scoresheetStatus: 'verified',
  })

  it('is quiet when there is no verified scoresheet', () => {
    const unverified = row({ ...verified, scoresheetStatus: 'submitted' })
    const patch = resolveResult(unverified, draft({ scoreA: 15, scoreB: 2 }))
    expect(overwritesVerifiedScoresheet(unverified, patch)).toBe(false)
  })

  it('is quiet when the save changes nothing', () => {
    const patch = resolveResult(verified, draft({ scoreA: 15, scoreB: 11 }))
    expect(overwritesVerifiedScoresheet(verified, patch)).toBe(false)
  })

  it('fires when the score moves', () => {
    const patch = resolveResult(verified, draft({ scoreA: 15, scoreB: 2 }))
    expect(overwritesVerifiedScoresheet(verified, patch)).toBe(true)
  })

  it('fires when only the winner moves', () => {
    const patch = resolveResult(verified, draft({ scoreA: 11, scoreB: 15 }))
    expect(overwritesVerifiedScoresheet(verified, patch)).toBe(true)
  })

  it('fires when the status moves', () => {
    const patch = resolveResult(verified, draft({ status: 'retired', offender: 'b', scoreA: 15, scoreB: 11 }))
    expect(overwritesVerifiedScoresheet(verified, patch)).toBe(true)
  })
})

// ---------------------------------------------------------------------------

describe('previewing the change', () => {
  it('shows every field, marking only the ones that move', () => {
    const before = row({ status: 'in_progress', scoreA: 7, scoreB: 13 })
    const patch = resolveResult(before, draft({ status: 'retired', offender: 'b', scoreA: 7, scoreB: 13 }))
    const lines = describeResultChange(before, patch)

    const byLabel = Object.fromEntries(lines.map((l) => [l.label, l]))
    expect(byLabel.Status).toMatchObject({ from: 'In progress', to: 'Retired', changed: true })
    expect(byLabel.Score).toMatchObject({ from: '7–13', to: '7–13', changed: false })
    expect(byLabel.Winner).toMatchObject({ to: 'Sugarplum Smackers', changed: true })
    expect(byLabel['Forfeited by']).toMatchObject({ to: '—', changed: false })
  })

  it('says retired, not forfeited, in the summary', () => {
    const before = row({ scoreA: 7, scoreB: 13 })
    const patch = resolveResult(before, draft({ status: 'retired', offender: 'b', scoreA: 7, scoreB: 13 }))
    const summary = summariseResult(before, patch)
    expect(summary).toContain('retired')
    expect(summary).not.toContain('forfeit')
    expect(summary).toContain('7–13')
  })

  it('says forfeit and walkover in their own words', () => {
    const before = row()
    expect(
      summariseResult(before, resolveResult(before, draft({ status: 'forfeited', offender: 'a' }))),
    ).toContain('forfeit')
    expect(
      summariseResult(before, resolveResult(before, draft({ status: 'walkover', offender: 'a' }))),
    ).toContain('walkover')
  })

  it('describes clearing a result', () => {
    const before = row({ status: 'completed' })
    const patch = resolveResult(before, draft({ status: 'scheduled' }))
    expect(summariseResult(before, patch)).toContain('back on the timetable')
  })
})

// ---------------------------------------------------------------------------

describe('seeding the dialog from the row', () => {
  it('starts a fresh match at "completed" with its current score', () => {
    expect(draftFromRow(row({ scoreA: 4, scoreB: 2 }))).toMatchObject({
      status: 'completed',
      scoreA: 4,
      scoreB: 2,
    })
  })

  it('recovers the offender of a forfeit', () => {
    const seeded = draftFromRow(
      row({ status: 'forfeited', forfeitedByTeamId: 'team-b', winnerTeamId: 'team-a' }),
    )
    expect(seeded).toMatchObject({ status: 'forfeited', offender: 'b', winner: 'a' })
  })

  it('recovers the pair that retired from the winner, since nobody is blamed', () => {
    const seeded = draftFromRow(
      row({ status: 'retired', forfeitedByTeamId: null, winnerTeamId: 'team-a', scoreA: 7, scoreB: 13 }),
    )
    expect(seeded).toMatchObject({ status: 'retired', offender: 'b', scoreA: 7, scoreB: 13 })
  })

  it('round-trips an existing result unchanged', () => {
    const existing = row({
      status: 'retired',
      scoreA: 7,
      scoreB: 13,
      winnerTeamId: 'team-a',
      forfeitReason: 'calf strain',
    })
    const patch = resolveResult(existing, draftFromRow(existing))
    expect(patch).toMatchObject({
      status: 'retired',
      score_a: 7,
      score_b: 13,
      winner_team_id: 'team-a',
      forfeited_by_team_id: null,
      forfeit_reason: 'calf strain',
    })
  })
})

// ---------------------------------------------------------------------------
// Rescheduling
// ---------------------------------------------------------------------------

const COURTS: ScheduleCourt[] = [
  { id: 'court-1', name: 'Court 1', sortOrder: 0 },
  { id: 'court-2', name: 'Court 2', sortOrder: 1 },
]

const SLOTS: ScheduleSlot[] = [
  { id: 'slot-0', index: 0, label: '9:00am' },
  { id: 'slot-1', index: 1, label: '9:30am' },
  { id: 'slot-2', index: 2, label: '10:00am' },
  { id: 'slot-3', index: 3, label: '10:30am' },
]

const TEAMS: ScheduleTeam[] = [
  { id: 'team-a', divisionId: 'mens', name: 'A', players: [{ id: 'p1', name: 'P1' }, { id: 'p2', name: 'P2' }] },
  { id: 'team-b', divisionId: 'mens', name: 'B', players: [{ id: 'p3', name: 'P3' }, { id: 'p4', name: 'P4' }] },
  { id: 'team-c', divisionId: 'mens', name: 'C', players: [{ id: 'p5', name: 'P5' }, { id: 'p6', name: 'P6' }] },
  { id: 'team-d', divisionId: 'mens', name: 'D', players: [{ id: 'p7', name: 'P7' }, { id: 'p8', name: 'P8' }] },
]

function schedulable(
  id: string,
  teamAId: string,
  teamBId: string,
  courtId: string,
  slotId: string,
): SchedulableMatch {
  return {
    id,
    divisionId: 'mens',
    divisionName: "Men's Doubles",
    stage: 'elims',
    round: 1,
    bracketKey: null,
    teamAId,
    teamBId,
    sourceA: null,
    sourceB: null,
    courtId,
    slotId,
    status: 'scheduled',
    hasResult: false,
  }
}

const FIXTURES: SchedulableMatch[] = [
  schedulable('m1', 'team-a', 'team-b', 'court-1', 'slot-0'),
  schedulable('m2', 'team-c', 'team-d', 'court-2', 'slot-0'),
  schedulable('m3', 'team-a', 'team-c', 'court-1', 'slot-2'),
]

const PLACEMENTS: PlacementMap = {
  m1: { courtId: 'court-1', slotId: 'slot-0' },
  m2: { courtId: 'court-2', slotId: 'slot-0' },
  m3: { courtId: 'court-1', slotId: 'slot-2' },
}

function preview(matchId: string, courtId: string | null, slotId: string | null) {
  const fixture = FIXTURES.find((f) => f.id === matchId)!
  return previewReschedule({
    match: row({ id: matchId, courtId: fixture.courtId, slotId: fixture.slotId }),
    draft: { courtId, slotId },
    matches: FIXTURES,
    placements: PLACEMENTS,
    courts: COURTS,
    slots: SLOTS,
    teams: TEAMS,
  })
}

describe('previewing a reschedule', () => {
  it('recognises a move that changes nothing', () => {
    const result = preview('m3', 'court-1', 'slot-2')
    expect(result.unchanged).toBe(true)
    expect(result.blocking).toHaveLength(0)
  })

  it('allows a clean move to a free cell', () => {
    const result = preview('m3', 'court-2', 'slot-3')
    expect(result.unchanged).toBe(false)
    expect(result.blocking).toHaveLength(0)
    expect(result.occupiedBy).toBeNull()
  })

  it('names the from and to cells in words an admin recognises', () => {
    const result = preview('m3', 'court-2', 'slot-3')
    expect(result.from).toBe('Court 1 · 10:00am')
    expect(result.to).toBe('Court 2 · 10:30am')
  })

  it('blocks a move that double-books a court', () => {
    const result = preview('m3', 'court-2', 'slot-0')
    expect(result.blocking.some((c) => c.type === 'court_double_booked')).toBe(true)
    expect(result.occupiedBy).toBe('m2')
  })

  it('blocks a move that puts a pair in two places at once', () => {
    // m3 involves team-a, who already play m1 in slot-0.
    const result = preview('m3', 'court-1', 'slot-0')
    expect(result.blocking.some((c) => c.type === 'pair_double_booked')).toBe(true)
  })

  it('flags a move that leaves no breather between a pair’s matches', () => {
    // Moving m3 to slot-1 puts team-a back on court immediately after slot-0.
    const result = preview('m3', 'court-2', 'slot-1')
    expect([...result.blocking, ...result.warnings].some((c) => c.type === 'insufficient_rest')).toBe(
      true,
    )
  })

  it('catches a player rostered to officiate a match they would now be playing in', () => {
    // f1 is at 9:00am with a hand-assigned umpire from pair C. Pair C plays f2
    // at 10:00am, so today that is fine. Move f2 into the 9:00am slot and that
    // umpire is suddenly on court.
    const fixtures: SchedulableMatch[] = [
      schedulable('f1', 'team-a', 'team-b', 'court-1', 'slot-0'),
      schedulable('f2', 'team-c', 'team-d', 'court-1', 'slot-2'),
    ]
    const placements: PlacementMap = {
      f1: { courtId: 'court-1', slotId: 'slot-0' },
      f2: { courtId: 'court-1', slotId: 'slot-2' },
    }
    const overrides = [{ matchId: 'f1', role: 'umpire_scorer' as const, index: 0, playerId: 'p5' }]

    const clean = previewReschedule({
      match: row({ id: 'f2', courtId: 'court-1', slotId: 'slot-2' }),
      draft: { courtId: 'court-2', slotId: 'slot-3' },
      matches: fixtures,
      placements,
      courts: COURTS,
      slots: SLOTS,
      teams: TEAMS,
      overrides,
    })
    expect(
      [...clean.blocking, ...clean.warnings].some((c) => c.type === 'officiating_while_playing'),
    ).toBe(false)

    const clashing = previewReschedule({
      match: row({ id: 'f2', courtId: 'court-1', slotId: 'slot-2' }),
      draft: { courtId: 'court-2', slotId: 'slot-0' },
      matches: fixtures,
      placements,
      courts: COURTS,
      slots: SLOTS,
      teams: TEAMS,
      overrides,
    })
    expect(
      [...clashing.blocking, ...clashing.warnings].some(
        (c) => c.type === 'officiating_while_playing',
      ),
    ).toBe(true)
  })

  it('does not blame the move for a clash that already existed', () => {
    const clashing: PlacementMap = { ...PLACEMENTS, m3: { courtId: 'court-2', slotId: 'slot-0' } }
    const result = previewReschedule({
      match: row({ id: 'm3', courtId: 'court-2', slotId: 'slot-0' }),
      draft: { courtId: 'court-2', slotId: 'slot-0' },
      matches: FIXTURES.map((f) => (f.id === 'm3' ? { ...f, courtId: 'court-2', slotId: 'slot-0' } : f)),
      placements: clashing,
      courts: COURTS,
      slots: SLOTS,
      teams: TEAMS,
    })
    expect(result.blocking).toHaveLength(0)
    expect(result.preExisting).toBeGreaterThan(0)
  })

  it('handles unscheduling a match entirely', () => {
    const result = preview('m3', null, null)
    expect(result.to).toBe('Not scheduled')
    expect(result.occupiedBy).toBeNull()
  })

  it('turns a draft into the row update', () => {
    expect(reschedulePatch({ courtId: 'court-2', slotId: 'slot-1' })).toEqual({
      court_id: 'court-2',
      time_slot_id: 'slot-1',
    })
    expect(reschedulePatch({ courtId: null, slotId: null })).toEqual({
      court_id: null,
      time_slot_id: null,
    })
  })
})

describe('warning before a move', () => {
  it('says nothing about a match that has not started', () => {
    expect(rescheduleWarnings(row())).toHaveLength(0)
  })

  it('warns about a match being played right now', () => {
    expect(rescheduleWarnings(row({ status: 'in_progress' })).join(' ')).toContain('right now')
  })

  it('warns about every decided status, retirement included', () => {
    for (const status of ['completed', 'forfeited', 'walkover', 'retired'] as const) {
      expect(rescheduleWarnings(row({ status })).join(' ')).toContain('already has a result')
    }
  })
})
