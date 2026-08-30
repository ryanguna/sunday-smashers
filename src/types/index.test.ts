import { describe, expect, it } from 'vitest'
import { computeStandings, matchWinner } from '@/lib/draw'
import type { MatchRow } from '@/lib/supabase/types'
import {
  divisionElimsRules,
  divisionFinalsRules,
  matchStageRules,
  toPlayedMatch,
  toStandingRowAggregatesOnly,
} from './index'
import type { DivisionRow, StandingsViewRow } from '@/lib/supabase/types'

function makeMatchRow(overrides: Partial<MatchRow> = {}): MatchRow {
  return {
    id: 'match-1',
    division_id: 'division-1',
    stage: 'elims',
    round: 1,
    bracket_key: null,
    court_id: null,
    time_slot_id: null,
    team_a_id: 'team-a',
    team_b_id: 'team-b',
    points_to_win: 15,
    deuce_enabled: false,
    cap: null,
    status: 'completed',
    score_a: 15,
    score_b: 9,
    winner_team_id: 'team-a',
    forfeited_by_team_id: null,
    forfeit_reason: null,
    next_match_id: null,
    started_at: null,
    completed_at: null,
    created_at: '2026-12-13T00:00:00Z',
    updated_at: '2026-12-13T00:00:00Z',
    ...overrides,
  }
}

function makeDivisionRow(overrides: Partial<DivisionRow> = {}): DivisionRow {
  return {
    id: 'division-1',
    tournament_id: 'tournament-1',
    name: "Men's Doubles",
    gender: 'mens',
    format_kind: 'round_robin_knockout',
    points_to_win_elims: 15,
    deuce_enabled_elims: false,
    cap_elims: null,
    points_to_win_finals: 21,
    deuce_enabled_finals: false,
    cap_finals: null,
    qualifying_places: 4,
    tiebreak_order: ['wins', 'head_to_head'],
    max_teams: null,
    is_published: true,
    created_at: '2026-09-06T00:00:00Z',
    updated_at: '2026-09-06T00:00:00Z',
    ...overrides,
  }
}

describe('toPlayedMatch', () => {
  it('converts a completed match row into a PlayedMatch', () => {
    const row = makeMatchRow()
    const played = toPlayedMatch(row)
    expect(played).toEqual({
      teamA: 'team-a',
      teamB: 'team-b',
      pointsA: 15,
      pointsB: 9,
      forfeitedBy: null,
    })
  })

  it('carries the forfeiting team through', () => {
    const row = makeMatchRow({ status: 'forfeited', forfeited_by_team_id: 'team-b', score_a: 0, score_b: 0 })
    const played = toPlayedMatch(row)
    expect(played?.forfeitedBy).toBe('team-b')
    // matchWinner() from draw.ts should honour the forfeit regardless of score.
    expect(matchWinner(played!)).toBe('team-a')
  })

  it('returns null for matches without two assigned teams', () => {
    expect(toPlayedMatch(makeMatchRow({ team_b_id: null }))).toBeNull()
  })

  it('returns null for matches that have not been decided yet', () => {
    expect(toPlayedMatch(makeMatchRow({ status: 'scheduled' }))).toBeNull()
    expect(toPlayedMatch(makeMatchRow({ status: 'in_progress' }))).toBeNull()
    expect(toPlayedMatch(makeMatchRow({ status: 'cancelled' }))).toBeNull()
  })

  it('treats a walkover as decided', () => {
    const row = makeMatchRow({ status: 'walkover', winner_team_id: 'team-a' })
    expect(toPlayedMatch(row)).not.toBeNull()
  })

  it('feeds real match rows through the draw engine end to end', () => {
    const rows = [
      makeMatchRow({ id: '1', team_a_id: 'p1', team_b_id: 'p2', score_a: 15, score_b: 10, winner_team_id: 'p1' }),
      makeMatchRow({ id: '2', team_a_id: 'p1', team_b_id: 'p3', score_a: 15, score_b: 12, winner_team_id: 'p1' }),
      makeMatchRow({ id: '3', team_a_id: 'p2', team_b_id: 'p3', score_a: 15, score_b: 8, winner_team_id: 'p2' }),
    ]

    const played = rows.map(toPlayedMatch).filter((m) => m !== null)
    const standings = computeStandings(['p1', 'p2', 'p3'], played)

    expect(standings[0]).toMatchObject({ teamId: 'p1', wins: 2, rank: 1 })
    expect(standings[1]).toMatchObject({ teamId: 'p2', wins: 1, rank: 2 })
    expect(standings[2]).toMatchObject({ teamId: 'p3', wins: 0, rank: 3 })
  })
})

describe('division rule adapters', () => {
  it('builds elims StageRules from a division row', () => {
    const division = makeDivisionRow()
    expect(divisionElimsRules(division)).toEqual({ pointsToWin: 15, deuce: false, cap: undefined })
  })

  it('builds finals StageRules from a division row', () => {
    const division = makeDivisionRow({ points_to_win_finals: 21, deuce_enabled_finals: true, cap_finals: 30 })
    expect(divisionFinalsRules(division)).toEqual({ pointsToWin: 21, deuce: true, cap: 30 })
  })

  it('builds StageRules directly from a denormalised match row', () => {
    const row = makeMatchRow({ points_to_win: 21, deuce_enabled: true, cap: 30 })
    expect(matchStageRules(row)).toEqual({ pointsToWin: 21, deuce: true, cap: 30 })
  })
})

describe('toStandingRowAggregatesOnly', () => {
  it('maps the standings view row shape without inventing tiebreak data', () => {
    const view: StandingsViewRow = {
      team_id: 'team-a',
      division_id: 'division-1',
      played: 3,
      wins: 2,
      losses: 1,
      forfeits: 0,
      points_for: 40,
      points_against: 30,
      point_diff: 10,
    }

    expect(toStandingRowAggregatesOnly(view)).toEqual({
      teamId: 'team-a',
      played: 3,
      wins: 2,
      losses: 1,
      forfeits: 0,
      pointsFor: 40,
      pointsAgainst: 30,
      pointDiff: 10,
    })
  })
})
