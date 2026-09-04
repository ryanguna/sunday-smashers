import { describe, expect, it } from 'vitest'

import type { PublicMatch, PublicTeam } from '@/lib/public-data'
import {
  canRecordPoint,
  canScoreWithRole,
  createScoringConfig,
  createScoringState,
  createSyncTracker,
  deriveScoreboard,
  describeSync,
  endKindLabel,
  formatElapsed,
  formatEndingReason,
  fromSnapshot,
  groupAssignments,
  matchScorePatch,
  otherSide,
  parseSnapshot,
  primaryAssignment,
  rallyHistory,
  restoreFromScoreEvents,
  rulesFromMatch,
  rulesSummary,
  scoreAnnouncement,
  scoreEventInserts,
  scoreForSide,
  scoreHeadline,
  scoringAssignments,
  scoringConfigFromMatch,
  scoringReducer,
  scoringStorageKey,
  serialiseSnapshot,
  serveSummary,
  syncConflict,
  syncFailed,
  syncLocalOnly,
  syncStarted,
  syncSucceeded,
  toSnapshot,
  type MatchScoringConfig,
  type ScoringAction,
  type ScoringSide,
  type ScoringState,
} from './scoring'
import type { StageRules } from './draw'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ELIMS: StageRules = { pointsToWin: 15, deuce: false }
const FINALS: StageRules = { pointsToWin: 21, deuce: false }
const DEUCE: StageRules = { pointsToWin: 21, deuce: true, cap: 30 }

function config(rules: StageRules = ELIMS, baseline?: Partial<MatchScoringConfig['baseline']>) {
  return createScoringConfig({
    matchId: 'match-1',
    rules,
    teamA: {
      id: 'team-a',
      name: 'Tinsel Titans',
      players: [
        { id: 'a1', name: 'Aroha Ngata' },
        { id: 'a2', name: 'Ben Cole' },
      ],
    },
    teamB: {
      id: 'team-b',
      name: 'Sleigh Servers',
      players: [
        { id: 'b1', name: 'Chris Doyle' },
        { id: 'b2', name: 'Dev Patel' },
      ],
    },
    baseline,
  })
}

function play(state: ScoringState, ...actions: ScoringAction[]): ScoringState {
  return actions.reduce(scoringReducer, state)
}

function points(state: ScoringState, sequence: string): ScoringState {
  return play(
    state,
    ...[...sequence].map((c) => ({ type: 'point', side: c as ScoringSide }) as ScoringAction),
  )
}

// ---------------------------------------------------------------------------

describe('rulesFromMatch', () => {
  it('reads the match record rather than assuming 15 or 21', () => {
    expect(rulesFromMatch({ pointsToWin: 11, deuceEnabled: true, cap: 15 })).toEqual({
      pointsToWin: 11,
      deuce: true,
      cap: 15,
    })
  })

  it('accepts the public shape and defaults deuce off', () => {
    expect(rulesFromMatch({ pointsToWin: 21, deuce: false })).toEqual({
      pointsToWin: 21,
      deuce: false,
    })
  })

  it('omits the cap when the record has none', () => {
    expect(rulesFromMatch({ pointsToWin: 15, cap: null })).not.toHaveProperty('cap')
  })
})

describe('recording points', () => {
  it('starts at the baseline of 0–0 with side A serving', () => {
    const board = deriveScoreboard(createScoringState(config()))
    expect(board.scoreA).toBe(0)
    expect(board.scoreB).toBe(0)
    expect(board.serve.servingSide).toBe('a')
    expect(board.serve.court).toBe('right')
    expect(board.serve.serverName).toBe('Aroha Ngata')
    expect(board.serve.receiverName).toBe('Chris Doyle')
    expect(board.complete).toBe(false)
    expect(board.canUndo).toBe(false)
  })

  it('adds a point to the tapped side', () => {
    const board = deriveScoreboard(points(createScoringState(config()), 'aab'))
    expect([board.scoreA, board.scoreB]).toEqual([2, 1])
    expect(board.ralliesPlayed).toBe(3)
    expect(board.totalPoints).toBe(3)
  })

  it('picks up a match that already has a score on the server', () => {
    const state = createScoringState(config(ELIMS, { scoreA: 8, scoreB: 6, servingSide: 'b' }))
    const board = deriveScoreboard(state)
    expect([board.scoreA, board.scoreB]).toEqual([8, 6])
    expect(board.serve.servingSide).toBe('b')
    // B on 6 — even, so serving from the right court.
    expect(board.serve.court).toBe('right')
    expect(board.canUndo).toBe(false)
  })
})

describe('undo', () => {
  it('is a no-op at 0–0 and never produces a negative score', () => {
    const state = createScoringState(config())
    const after = scoringReducer(state, { type: 'undo' })
    expect(after).toBe(state)
    const board = deriveScoreboard(after)
    expect([board.scoreA, board.scoreB]).toEqual([0, 0])
  })

  it('cannot undo below a server-supplied baseline', () => {
    const state = createScoringState(config(ELIMS, { scoreA: 8, scoreB: 6 }))
    const after = play(state, { type: 'undo' }, { type: 'undo' })
    expect(deriveScoreboard(after).scoreA).toBe(8)
  })

  it('takes back the most recent rally and restores the serve', () => {
    const before = points(createScoringState(config()), 'aaa')
    const after = scoringReducer(points(before, 'b'), { type: 'undo' })
    expect(deriveScoreboard(after)).toEqual(deriveScoreboard(before))
  })

  it('undoes across a game point, reopening a completed game', () => {
    let state = createScoringState(config())
    state = points(state, 'a'.repeat(14) + 'b'.repeat(3))
    let board = deriveScoreboard(state)
    expect(board.gamePointFor).toBe('a')
    expect(board.complete).toBe(false)

    state = points(state, 'a')
    board = deriveScoreboard(state)
    expect(board.complete).toBe(true)
    expect(board.winner).toBe('a')

    state = scoringReducer(state, { type: 'undo' })
    board = deriveScoreboard(state)
    expect(board.complete).toBe(false)
    expect(board.winner).toBeNull()
    expect([board.scoreA, board.scoreB]).toEqual([14, 3])
    expect(board.gamePointFor).toBe('a')
  })

  it('undoing a forfeit puts the match back in play', () => {
    let state = points(createScoringState(config()), 'aabb')
    state = scoringReducer(state, {
      type: 'end_match',
      kind: 'forfeit',
      side: 'b',
    })
    expect(deriveScoreboard(state).complete).toBe(true)
    state = scoringReducer(state, { type: 'undo' })
    const board = deriveScoreboard(state)
    expect(board.complete).toBe(false)
    expect([board.scoreA, board.scoreB]).toEqual([2, 2])
  })
})

describe('correcting a rally from several points ago', () => {
  it('removes a rally, renumbers the log and recomputes the score', () => {
    const state = points(createScoringState(config()), 'aabab')
    const fixed = scoringReducer(state, { type: 'remove_rally', seq: 2 })
    const board = deriveScoreboard(fixed)
    expect([board.scoreA, board.scoreB]).toEqual([2, 2])
    expect(fixed.rallies.map((r) => r.seq)).toEqual([1, 2, 3, 4])
  })

  it('re-awards a rally to the other pair and rebuilds the serve rotation', () => {
    const state = points(createScoringState(config()), 'aab')
    const fixed = scoringReducer(state, {
      type: 'correct_rally',
      seq: 3,
      side: 'a',
    })
    const board = deriveScoreboard(fixed)
    expect([board.scoreA, board.scoreB]).toEqual([3, 0])
    expect(board.serve.servingSide).toBe('a')
    expect(deriveScoreboard(points(createScoringState(config()), 'aaa'))).toEqual(board)
  })

  it('ignores corrections that reference an unknown rally', () => {
    const state = points(createScoringState(config()), 'ab')
    expect(scoringReducer(state, { type: 'remove_rally', seq: 99 })).toBe(state)
    expect(scoringReducer(state, { type: 'correct_rally', seq: 99, side: 'a' })).toBe(state)
    expect(scoringReducer(state, { type: 'correct_rally', seq: 1, side: 'a' })).toBe(state)
  })

  it('exposes a newest-first rally history with the server of each rally', () => {
    const rows = rallyHistory(points(createScoringState(config()), 'aab'))
    expect(rows.map((r) => r.seq)).toEqual([3, 2, 1])
    expect(rows[0].label).toBe('2–1 to Sleigh Servers')
    expect(rows[0].servedBy).toBe('a')
    expect(rows[0].latest).toBe(true)
    expect(rows[2].scoreA).toBe(1)
  })

  it('reset wipes the local log back to the baseline', () => {
    const state = points(createScoringState(config(ELIMS, { scoreA: 4, scoreB: 2 })), 'abab')
    const board = deriveScoreboard(scoringReducer(state, { type: 'reset' }))
    expect([board.scoreA, board.scoreB]).toEqual([4, 2])
  })
})

describe('serve rotation (BWF doubles)', () => {
  it('keeps the same server while their pair keeps winning, alternating courts', () => {
    let state = createScoringState(config())
    const seen: string[] = []
    for (let i = 0; i < 5; i++) {
      const board = deriveScoreboard(state)
      seen.push(`${board.serve.serverName}/${board.serve.court}`)
      state = points(state, 'a')
    }
    expect(seen).toEqual([
      'Aroha Ngata/right',
      'Aroha Ngata/left',
      'Aroha Ngata/right',
      'Aroha Ngata/left',
      'Aroha Ngata/right',
    ])
  })

  it('hands serve over without the receiving pair swapping courts', () => {
    // A serves and wins twice, then B wins the rally and takes serve at 0.
    const board = deriveScoreboard(points(createScoringState(config()), 'aab'))
    expect(board.serve.servingSide).toBe('b')
    expect(board.serve.court).toBe('left') // B are on 1 — odd
    expect(board.serve.serverName).toBe('Dev Patel')
    expect(board.serve.receiverName).toBe('Ben Cole')
  })

  it('brings the second player in only after the pair regain serve at an odd score', () => {
    // a a (A hold, Aroha throughout) b (B take serve) a (A regain at 3 — odd → left court)
    const board = deriveScoreboard(points(createScoringState(config()), 'aaba'))
    expect(board.serve.servingSide).toBe('a')
    expect([board.scoreA, board.scoreB]).toEqual([3, 1])
    expect(board.serve.court).toBe('left')
    // Two holds swapped A back to their starting positions, so Ben is on the left.
    expect(board.serve.serverName).toBe('Ben Cole')
  })

  it('service court always follows the serving pair’s score parity', () => {
    let state = createScoringState(config())
    for (let i = 0; i < 12; i++) {
      const board = deriveScoreboard(state)
      const servingScore = board.serve.servingSide === 'a' ? board.scoreA : board.scoreB
      expect(board.serve.court).toBe(servingScore % 2 === 0 ? 'right' : 'left')
      state = points(state, i % 3 === 0 ? 'b' : 'a')
    }
  })

  it('lets the umpire declare the first server before any rally', () => {
    const state = scoringReducer(createScoringState(config()), {
      type: 'set_serving_side',
      side: 'b',
    })
    const board = deriveScoreboard(state)
    expect(board.serve.servingSide).toBe('b')
    expect(board.serve.serverName).toBe('Chris Doyle')
  })

  it('lets the umpire swap which player of a pair stands on the right', () => {
    const state = scoringReducer(createScoringState(config()), {
      type: 'swap_serve_positions',
      side: 'a',
    })
    expect(deriveScoreboard(state).serve.serverName).toBe('Ben Cole')
  })

  it('copes with a pair whose line-up is unknown', () => {
    const bare = createScoringConfig({
      matchId: 'm',
      rules: ELIMS,
      teamA: { id: null, name: 'Winner of M1', players: [] },
      teamB: { id: null, name: 'Winner of M2', players: [] },
    })
    const board = deriveScoreboard(points(createScoringState(bare), 'aab'))
    expect(board.serve.serverName).toBe('')
    expect(serveSummary(board, bare)).toBe('Serving: Winner of M2, left service court')
  })
})

describe('game point and match end (no deuce)', () => {
  it('flags game point exactly one rally out', () => {
    const state = points(createScoringState(config()), 'a'.repeat(13) + 'b'.repeat(5))
    const board = deriveScoreboard(state)
    expect(board.gamePointFor).toBeNull()
    const next = deriveScoreboard(points(state, 'a'))
    expect(next.gamePointFor).toBe('a')
    expect(next.matchPoint).toBe(true)
    expect(scoreHeadline(next, config())).toBe('Game point — Tinsel Titans')
  })

  it('ends the game the moment the target is reached exactly', () => {
    const state = points(createScoringState(config()), 'a'.repeat(14) + 'b'.repeat(14) + 'a')
    const board = deriveScoreboard(state)
    expect([board.scoreA, board.scoreB]).toEqual([15, 14])
    expect(board.complete).toBe(true)
    expect(board.winner).toBe('a')
    expect(board.outcome).toBe('points')
    expect(scoreHeadline(board, config())).toBe('Game and match — Tinsel Titans!')
  })

  it('refuses further points once the game is complete', () => {
    const done = points(createScoringState(config()), 'a'.repeat(15))
    expect(canRecordPoint(done)).toBe(false)
    expect(scoringReducer(done, { type: 'point', side: 'b' })).toBe(done)
    expect(deriveScoreboard(done).scoreB).toBe(0)
  })

  it('honours a finals target of 21 read from the match record', () => {
    const state = points(createScoringState(config(FINALS)), 'a'.repeat(20))
    let board = deriveScoreboard(state)
    expect(board.complete).toBe(false)
    expect(board.gamePointFor).toBe('a')
    expect(board.pointsToWin).toBe(21)
    board = deriveScoreboard(points(state, 'a'))
    expect(board.complete).toBe(true)
  })

  it('never treats a cap as a target when deuce is off', () => {
    const state = points(
      createScoringState(config({ pointsToWin: 15, deuce: false, cap: 21 })),
      'a'.repeat(15),
    )
    expect(deriveScoreboard(state).complete).toBe(true)
    expect(rulesSummary(deriveScoreboard(state))).toBe('First to 15 — no deuce')
  })
})

describe('game point and match end (deuce enabled)', () => {
  it('requires a two point margin past the target', () => {
    const state = points(createScoringState(config(DEUCE)), 'ab'.repeat(20)) // 20–20
    let board = deriveScoreboard(state)
    expect(board.complete).toBe(false)
    expect(board.gamePointFor).toBeNull()

    board = deriveScoreboard(points(state, 'a'))
    expect(board.complete).toBe(false)
    expect(board.gamePointFor).toBe('a')

    board = deriveScoreboard(points(state, 'aa'))
    expect(board.complete).toBe(true)
    expect(board.winner).toBe('a')
  })

  it('ends the game at the cap even without a two point margin', () => {
    const state = points(createScoringState(config(DEUCE)), 'ab'.repeat(29)) // 29–29
    const board = deriveScoreboard(state)
    expect(board.complete).toBe(false)
    expect(board.doubleGamePoint).toBe(true)
    expect(board.gamePointFor).toBe(board.serve.servingSide)
    expect(scoreHeadline(board, config(DEUCE))).toBe('Game point — both pairs!')

    const capped = deriveScoreboard(points(state, 'b'))
    expect([capped.scoreA, capped.scoreB]).toEqual([29, 30])
    expect(capped.complete).toBe(true)
    expect(capped.winner).toBe('b')
  })

  it('describes the rules with the cap', () => {
    expect(rulesSummary(deriveScoreboard(createScoringState(config(DEUCE))))).toBe(
      'First to 21 — deuce, capped at 30',
    )
    expect(
      rulesSummary(deriveScoreboard(createScoringState(config({ pointsToWin: 21, deuce: true })))),
    ).toBe('First to 21 — deuce')
  })
})

describe('forfeit, walkover and retirement', () => {
  it('awards a forfeit mid-game as a clean win to the target', () => {
    const state = play(points(createScoringState(config()), 'a'.repeat(3) + 'b'.repeat(9)), {
      type: 'end_match',
      kind: 'forfeit',
      side: 'b',
      reason: 'refused to continue',
    })
    const board = deriveScoreboard(state)
    expect(board.complete).toBe(true)
    expect(board.winner).toBe('a')
    expect(board.outcome).toBe('forfeit')
    expect(scoreForSide(board, 'a')).toBe(15)
    expect(scoreForSide(board, 'b')).toBe(0)
    // The rallies actually played are still on the board underneath.
    expect([board.scoreA, board.scoreB]).toEqual([3, 9])
    expect(scoreHeadline(board, config())).toBe('Forfeit — Tinsel Titans win')
  })

  it('records a walkover as a never-started no-show', () => {
    const state = scoringReducer(createScoringState(config()), {
      type: 'end_match',
      kind: 'walkover',
      side: 'a',
      reason: 'no-show',
    })
    const board = deriveScoreboard(state)
    expect(board.winner).toBe('b')
    expect([scoreForSide(board, 'a'), scoreForSide(board, 'b')]).toEqual([0, 15])
    expect(matchScorePatch(board, config()).status).toBe('walkover')
  })

  it('keeps the played score when a pair retires', () => {
    const state = play(points(createScoringState(config()), 'a'.repeat(11) + 'b'.repeat(4)), {
      type: 'end_match',
      kind: 'retired',
      side: 'b',
      reason: 'rolled an ankle',
    })
    const board = deriveScoreboard(state)
    expect(board.winner).toBe('a')
    expect([scoreForSide(board, 'a'), scoreForSide(board, 'b')]).toEqual([11, 4])
    expect(formatEndingReason(board.ending!)).toBe('Retired: rolled an ankle')
    expect(scoreHeadline(board, config())).toBe('Opponents retired — Tinsel Titans win')
  })

  it('resume clears an ending', () => {
    const ended = scoringReducer(createScoringState(config()), {
      type: 'end_match',
      kind: 'forfeit',
      side: 'a',
    })
    expect(deriveScoreboard(scoringReducer(ended, { type: 'resume' })).complete).toBe(false)
  })

  it('labels the end kinds', () => {
    expect(endKindLabel('walkover')).toBe('Walkover (no-show)')
    expect(endKindLabel('retired')).toBe('Retired')
  })
})

describe('match record mapping', () => {
  it('writes an in-progress score while the game is live', () => {
    const board = deriveScoreboard(points(createScoringState(config()), 'aab'))
    expect(matchScorePatch(board, config())).toEqual({
      status: 'in_progress',
      score_a: 2,
      score_b: 1,
      winner_team_id: null,
      forfeited_by_team_id: null,
      forfeit_reason: null,
    })
  })

  it('leaves an untouched match as scheduled', () => {
    const board = deriveScoreboard(createScoringState(config()))
    expect(matchScorePatch(board, config()).status).toBe('scheduled')
  })

  it('writes the winner when the target is reached', () => {
    const board = deriveScoreboard(points(createScoringState(config()), 'a'.repeat(15)))
    expect(matchScorePatch(board, config())).toMatchObject({
      status: 'completed',
      score_a: 15,
      winner_team_id: 'team-a',
      forfeited_by_team_id: null,
    })
  })

  // The three-way distinction is the regression to guard: each ending has its
  // own status, and only forfeit and walkover normalise to pointsToWin-0.
  it('writes a forfeit as forfeited, normalised to the target', () => {
    const state = play(points(createScoringState(config()), 'aab'), {
      type: 'end_match',
      kind: 'forfeit',
      side: 'b',
      reason: 'refused to play',
    })
    expect(matchScorePatch(deriveScoreboard(state), config())).toEqual({
      status: 'forfeited',
      score_a: 15,
      score_b: 0,
      winner_team_id: 'team-a',
      forfeited_by_team_id: 'team-b',
      forfeit_reason: 'refused to play',
    })
  })

  it('writes a walkover as walkover, normalised to the target', () => {
    const state = play(createScoringState(config()), {
      type: 'end_match',
      kind: 'walkover',
      side: 'a',
      reason: 'never arrived',
    })
    expect(matchScorePatch(deriveScoreboard(state), config())).toEqual({
      status: 'walkover',
      score_a: 0,
      score_b: 15,
      winner_team_id: 'team-b',
      forfeited_by_team_id: 'team-a',
      forfeit_reason: 'never arrived',
    })
  })

  it('writes a retirement as retired and keeps the score actually played', () => {
    const state = play(points(createScoringState(config()), 'aab'), {
      type: 'end_match',
      kind: 'retired',
      side: 'b',
      reason: 'calf strain',
    })
    expect(matchScorePatch(deriveScoreboard(state), config())).toEqual({
      status: 'retired',
      score_a: 2,
      score_b: 1,
      winner_team_id: 'team-a',
      // An injured pair is not blamed for a forfeit.
      forfeited_by_team_id: null,
      forfeit_reason: 'calf strain',
    })
  })

  it('never smuggles the kind of ending into the reason column', () => {
    for (const kind of ['forfeit', 'walkover', 'retired'] as const) {
      const state = play(points(createScoringState(config()), 'ab'), {
        type: 'end_match',
        kind,
        side: 'b',
      })
      const patch = matchScorePatch(deriveScoreboard(state), config())
      expect(patch.forfeit_reason).toBeNull()
      expect(patch.status).toBe(
        kind === 'forfeit' ? 'forfeited' : kind === 'walkover' ? 'walkover' : 'retired',
      )
    }
  })

  it('gives the three endings three different statuses', () => {
    const statuses = (['forfeit', 'walkover', 'retired'] as const).map((kind) => {
      const state = play(points(createScoringState(config()), 'aab'), {
        type: 'end_match',
        kind,
        side: 'b',
      })
      return matchScorePatch(deriveScoreboard(state), config()).status
    })
    expect(new Set(statuses).size).toBe(3)
    expect(statuses).toEqual(['forfeited', 'walkover', 'retired'])
  })
})

describe('score_events log', () => {
  it('brackets the rallies with game_start and stops there while live', () => {
    const rows = scoreEventInserts(points(createScoringState(config()), 'aab'))
    expect(rows.map((r) => r.event_type)).toEqual(['game_start', 'point', 'point', 'point'])
    expect(rows.map((r) => r.sequence)).toEqual([1, 2, 3, 4])
    expect(rows.at(-1)).toMatchObject({
      side: 'b',
      score_a_after: 2,
      score_b_after: 1,
    })
  })

  it('appends game_end when the target is reached', () => {
    const rows = scoreEventInserts(points(createScoringState(config()), 'a'.repeat(15)))
    expect(rows.at(-1)).toMatchObject({
      event_type: 'game_end',
      side: 'a',
      score_a_after: 15,
    })
  })

  it('logs each ending under its own event_type', () => {
    const kinds = [
      ['forfeit', 'forfeit'],
      ['walkover', 'walkover'],
      ['retired', 'retire'],
    ] as const
    for (const [kind, eventType] of kinds) {
      const state = play(points(createScoringState(config()), 'ab'), {
        type: 'end_match',
        kind,
        side: 'b',
      })
      expect(scoreEventInserts(state).map((r) => r.event_type).slice(-2)).toEqual([
        eventType,
        'game_end',
      ])
    }
  })

  it('logs a retirement at the score actually played', () => {
    const state = play(points(createScoringState(config()), 'aab'), {
      type: 'end_match',
      kind: 'retired',
      side: 'b',
      reason: 'calf strain',
    })
    expect(scoreEventInserts(state).at(-2)).toMatchObject({
      event_type: 'retire',
      note: 'Retired: calf strain',
      score_a_after: 2,
      score_b_after: 1,
    })
  })

  it('appends a forfeit row plus game_end when a pair forfeits', () => {
    const state = play(points(createScoringState(config()), 'ab'), {
      type: 'end_match',
      kind: 'forfeit',
      side: 'b',
      reason: 'late',
    })
    const rows = scoreEventInserts(state)
    expect(rows.map((r) => r.event_type).slice(-2)).toEqual(['forfeit', 'game_end'])
    expect(rows.at(-2)).toMatchObject({
      note: 'Forfeit: late',
      score_a_after: 15,
      score_b_after: 0,
    })
    expect(new Set(rows.map((r) => r.sequence)).size).toBe(rows.length)
  })
})

describe('restoring from the server event log', () => {
  it('rebuilds the rally history so undo still works after a reload', () => {
    const state = points(createScoringState(config()), 'aabab')
    const restored = restoreFromScoreEvents(config(), scoreEventInserts(state))
    expect(deriveScoreboard(restored)).toEqual(deriveScoreboard(state))
    expect(restored.rallies).toHaveLength(5)
    expect(deriveScoreboard(scoringReducer(restored, { type: 'undo' })).scoreB).toBe(1)
  })

  it('carries the declared first server across the reload', () => {
    const state = points(
      scoringReducer(createScoringState(config()), {
        type: 'set_serving_side',
        side: 'b',
      }),
      'aab',
    )
    const restored = restoreFromScoreEvents(config(), scoreEventInserts(state))
    expect(restored.config.baseline.servingSide).toBe('b')
    expect(deriveScoreboard(restored).serve).toEqual(deriveScoreboard(state).serve)
  })

  it('rebuilds a retirement, kind and reason intact', () => {
    const state = play(points(createScoringState(config()), 'aab'), {
      type: 'end_match',
      kind: 'retired',
      side: 'a',
      reason: 'hamstring',
    })
    const restored = restoreFromScoreEvents(config(), scoreEventInserts(state))
    expect(restored.ending).toMatchObject({
      kind: 'retired',
      side: 'a',
      reason: 'hamstring',
    })
  })

  it('falls back to the configured baseline when the log is empty', () => {
    const cfg = config(ELIMS, { scoreA: 9, scoreB: 4 })
    const board = deriveScoreboard(restoreFromScoreEvents(cfg, []))
    expect([board.scoreA, board.scoreB]).toEqual([9, 4])
    expect(board.canUndo).toBe(false)
  })

  it('reads the ending off the event type, not the note', () => {
    const restored = restoreFromScoreEvents(config(), [
      { sequence: 1, side: 'a', event_type: 'game_start', score_a_after: 0, score_b_after: 0 },
      { sequence: 2, side: 'a', event_type: 'point', score_a_after: 1, score_b_after: 0 },
      {
        sequence: 3,
        side: 'b',
        event_type: 'retire',
        score_a_after: 1,
        score_b_after: 0,
        note: 'twisted knee',
      },
    ])
    expect(restored.ending).toMatchObject({ kind: 'retired', side: 'b', reason: 'twisted knee' })
    expect(deriveScoreboard(restored).scoreA).toBe(1)
  })

  it('reads a walkover off its own event type', () => {
    const restored = restoreFromScoreEvents(config(), [
      { sequence: 1, side: 'a', event_type: 'game_start', score_a_after: 0, score_b_after: 0 },
      { sequence: 2, side: 'a', event_type: 'walkover', score_a_after: 0, score_b_after: 15 },
    ])
    expect(deriveScoreboard(restored).outcome).toBe('walkover')
    expect(deriveScoreboard(restored).winner).toBe('b')
  })

  it('still understands a legacy row that wrote a retirement as a forfeit', () => {
    // Rows written before migration 0006 only had 'forfeit' to work with.
    const restored = restoreFromScoreEvents(config(), [
      { sequence: 1, side: 'a', event_type: 'game_start', score_a_after: 0, score_b_after: 0 },
      { sequence: 2, side: 'a', event_type: 'point', score_a_after: 1, score_b_after: 0 },
      {
        sequence: 3,
        side: 'b',
        event_type: 'forfeit',
        score_a_after: 1,
        score_b_after: 0,
        note: 'Retired: rolled an ankle',
      },
    ])
    expect(restored.ending).toMatchObject({ kind: 'retired', reason: 'rolled an ankle' })
  })

  it('tolerates a log that arrives out of order', () => {
    const rows = scoreEventInserts(points(createScoringState(config()), 'aba'))
    const board = deriveScoreboard(restoreFromScoreEvents(config(), [...rows].reverse()))
    expect([board.scoreA, board.scoreB]).toEqual([2, 1])
  })
})

describe('snapshots and local persistence', () => {
  it('round-trips a session through the wire format', () => {
    const state = play(points(createScoringState(config()), 'aabba'), {
      type: 'swap_serve_positions',
      side: 'b',
    })
    const restored = fromSnapshot(config(), parseSnapshot(serialiseSnapshot(state)))
    expect(deriveScoreboard(restored)).toEqual(deriveScoreboard(state))
  })

  it('keeps a forfeit through a reload', () => {
    const state = scoringReducer(createScoringState(config()), {
      type: 'end_match',
      kind: 'walkover',
      side: 'a',
      reason: 'never arrived',
    })
    const restored = fromSnapshot(config(), parseSnapshot(serialiseSnapshot(state)))
    expect(deriveScoreboard(restored).outcome).toBe('walkover')
  })

  it('ignores corrupt, empty, versioned-out or mismatched snapshots', () => {
    expect(parseSnapshot(null)).toBeNull()
    expect(parseSnapshot('not json')).toBeNull()
    expect(parseSnapshot('{"v":99,"matchId":"m","rallies":[]}')).toBeNull()
    expect(parseSnapshot('{"v":1,"rallies":[]}')).toBeNull()
    const other = {
      ...toSnapshot(createScoringState(config())),
      matchId: 'somebody-elses-match',
    }
    expect(fromSnapshot(config(), other).rallies).toEqual([])
  })

  it('drops junk rallies and renumbers what survives', () => {
    const parsed = parseSnapshot(
      JSON.stringify({
        v: 1,
        matchId: 'match-1',
        rallies: [{ seq: 7, side: 'a' }, { side: 'x' }, null],
      }),
    )
    expect(parsed?.rallies).toEqual([{ seq: 1, side: 'a' }])
  })

  it('namespaces storage per match', () => {
    expect(scoringStorageKey('abc')).toBe('ss:scoring:abc')
  })
})

describe('sync tracking', () => {
  it('never claims success while points are unsent', () => {
    let tracker = createSyncTracker()
    tracker = syncStarted(tracker, 3)
    expect(describeSync(tracker).tone).toBe('busy')
    tracker = syncFailed(tracker, 3, 'network error')
    const failed = describeSync(tracker)
    expect(failed.tone).toBe('danger')
    expect(failed.retryable).toBe(true)
    expect(failed.detail).toContain('3 points')
    expect(failed.detail).toContain('network error')
  })

  it('reports offline separately, and reassures that nothing is lost', () => {
    const tracker = syncFailed(syncStarted(createSyncTracker(), 1), 1, 'offline', true)
    const view = describeSync(tracker)
    expect(view.tone).toBe('warn')
    expect(view.title).toBe('No connection')
    expect(view.detail).toContain('1 point ')
  })

  it('clears the backlog on success', () => {
    const tracker = syncSucceeded(syncStarted(createSyncTracker(), 4), 4, 1_000)
    expect(tracker.syncedRallies).toBe(4)
    expect(tracker.lastError).toBeNull()
    expect(describeSync(tracker).tone).toBe('ok')
  })

  it('is honest in demo mode', () => {
    expect(describeSync(syncLocalOnly(createSyncTracker(), 2)).title).toBe('On this device only')
  })
})

describe('announcements', () => {
  it('reads the score then the serve, the way an umpire calls it', () => {
    const cfg = config()
    const board = deriveScoreboard(points(createScoringState(cfg), 'aab'))
    expect(scoreAnnouncement(board, cfg)).toBe(
      '2 Tinsel Titans, 1 Sleigh Servers. Serving: Dev Patel (Sleigh Servers), left service court.',
    )
  })

  it('leads with game point', () => {
    const cfg = config()
    const board = deriveScoreboard(points(createScoringState(cfg), 'a'.repeat(14)))
    expect(scoreAnnouncement(board, cfg)).toContain('Game point — Tinsel Titans.')
  })

  it('reads the awarded score once the match is over', () => {
    const cfg = config()
    const state = play(createScoringState(cfg), {
      type: 'end_match',
      kind: 'forfeit',
      side: 'b',
    })
    expect(scoreAnnouncement(deriveScoreboard(state), cfg)).toBe(
      'Forfeit — Tinsel Titans win. Final score 15 Tinsel Titans, 0 Sleigh Servers.',
    )
  })
})

describe('officiating assignments', () => {
  const teamA: PublicTeam = {
    id: 't-a',
    division: 'womens_doubles',
    name: 'Bauble Bashers',
    seed: 1,
    players: [
      { id: 'p1', name: 'Amy Chen' },
      { id: 'p2', name: 'Bree Walsh' },
    ],
  }
  const teamB: PublicTeam = {
    ...teamA,
    id: 't-b',
    name: 'Cocoa Crushers',
    seed: 2,
    players: [],
  }
  const teamC: PublicTeam = {
    ...teamA,
    id: 't-c',
    name: 'Noel Knockouts',
    seed: 3,
    players: [],
  }

  function match(overrides: Partial<PublicMatch>): PublicMatch {
    return {
      id: 'm1',
      division: 'womens_doubles',
      stage: 'elims',
      court: 'Court 5',
      slotIndex: 1,
      slotLabel: '9:15am',
      slotStartsAt: null,
      teamA,
      teamB,
      sourceA: null,
      sourceB: null,
      status: 'scheduled',
      scoreA: 0,
      scoreB: 0,
      pointsToWin: 15,
      deuce: false,
      cap: null,
      forfeitedBy: null,
      winnerTeamId: null,
      duties: [],
      ...overrides,
    }
  }

  const umpire = {
    role: 'umpire_scorer' as const,
    playerId: 'w-candy-p1',
    playerName: 'Ivy Novak',
    source: 'derived' as const,
  }
  const lines = { ...umpire, role: 'line_judge' as const }
  const player = { id: 'w-candy-p1', name: 'Ivy Novak' }

  it('finds every match this official is rostered to, in playing order', () => {
    const matches = [
      match({ id: 'later', slotIndex: 6, duties: [umpire] }),
      match({
        id: 'live',
        slotIndex: 2,
        status: 'in_progress',
        duties: [umpire],
      }),
      match({ id: 'done', slotIndex: 0, status: 'completed', duties: [lines] }),
      match({
        id: 'not-mine',
        slotIndex: 1,
        duties: [{ ...umpire, playerId: 'someone-else', playerName: 'Someone Else' }],
      }),
    ]
    const rows = scoringAssignments(matches, player)
    expect(rows.map((r) => r.match.id)).toEqual(['done', 'live', 'later'])
    expect(rows.map((r) => r.state)).toEqual(['done', 'live', 'upcoming'])
    expect(rows.map((r) => r.canScore)).toEqual([false, true, true])
  })

  it('marks the next duty as up next when nothing is live', () => {
    const rows = scoringAssignments(
      [
        match({ id: 'a', slotIndex: 3, duties: [umpire] }),
        match({ id: 'b', slotIndex: 5, duties: [umpire] }),
      ],
      player,
    )
    expect(rows.map((r) => r.state)).toEqual(['up_next', 'upcoming'])
    expect(primaryAssignment(rows)?.match.id).toBe('a')
    expect(groupAssignments(rows).upcoming).toHaveLength(2)
  })

  it('merges multiple seats on one match', () => {
    const rows = scoringAssignments([match({ duties: [lines, umpire] })], player)
    expect(rows).toHaveLength(1)
    expect(rows[0].roles).toEqual(['line_judge', 'umpire_scorer'])
    expect(rows[0].canScore).toBe(true)
  })

  it('flags a roster clash with the official’s own match', () => {
    const rows = scoringAssignments(
      [
        match({
          id: 'duty',
          slotIndex: 4,
          duties: [umpire],
          teamA: teamB,
          teamB: teamC,
        }),
        match({ id: 'playing', slotIndex: 4, court: 'Court 4' }),
      ],
      player,
      't-a',
    )
    expect(rows[0].clash).toBe(true)
  })

  it('returns nothing for an anonymous viewer', () => {
    expect(scoringAssignments([match({ duties: [umpire] })], { id: '', name: '  ' })).toEqual([])
  })

  it('matches on profile id, not on a display name that two people could share', () => {
    const twin = {
      ...umpire,
      playerId: 'someone-else',
      playerName: 'Ivy Novak',
    }
    expect(scoringAssignments([match({ duties: [twin] })], player)).toEqual([])
  })

  it('falls back to the display name when the roster has no id', () => {
    const nameOnly = { ...umpire, playerId: '' }
    expect(scoringAssignments([match({ duties: [nameOnly] })], player)).toHaveLength(1)
  })

  it('only lets the umpire/scorer and scoresheet person drive the console', () => {
    expect(canScoreWithRole('umpire_scorer')).toBe(true)
    expect(canScoreWithRole('scoresheet')).toBe(true)
    expect(canScoreWithRole('line_judge')).toBe(false)
  })

  it('builds a console config straight from a public fixture', () => {
    const cfg = scoringConfigFromMatch(
      match({ scoreA: 7, scoreB: 5, pointsToWin: 21, deuce: true }),
      {
        cap: 30,
      },
    )
    expect(cfg.rules).toEqual({ pointsToWin: 21, deuce: true, cap: 30 })
    expect(cfg.baseline.scoreA).toBe(7)
    expect(cfg.teamB.name).toBe('Cocoa Crushers')

    const fresh = scoringConfigFromMatch(match({ scoreA: 7 }), {
      useCurrentScore: false,
    })
    expect(fresh.baseline.scoreA).toBe(0)
  })

  it('takes the cap straight off the fixture, with no separate lookup', () => {
    const cfg = scoringConfigFromMatch(match({ pointsToWin: 21, deuce: true, cap: 30 }))
    expect(cfg.rules).toEqual({ pointsToWin: 21, deuce: true, cap: 30 })
    expect(deriveScoreboard(createScoringState(cfg)).cap).toBe(30)
  })

  it('leaves the cap off when the fixture has none', () => {
    expect(scoringConfigFromMatch(match({ cap: null })).rules).not.toHaveProperty('cap')
  })

  it('lets an explicit option override a fixture with no cap of its own', () => {
    expect(scoringConfigFromMatch(match({ cap: null }), { cap: 25 }).rules.cap).toBe(25)
  })

  it('falls back to the bracket placeholder when a team is undecided', () => {
    const cfg = scoringConfigFromMatch(
      match({
        teamA: null,
        sourceA: 'Winner of M1',
        teamB: null,
        sourceB: null,
      }),
    )
    expect(cfg.teamA.name).toBe('Winner of M1')
    expect(cfg.teamB.name).toBe('Pair B')
  })
})

describe('helpers', () => {
  it('flips sides', () => {
    expect(otherSide('a')).toBe('b')
    expect(otherSide('b')).toBe('a')
  })

  it('formats the match clock without ever reading a clock itself', () => {
    expect(formatElapsed(null, 1_000)).toBe('—')
    expect(formatElapsed(0, 0)).toBe('0:00')
    expect(formatElapsed(0, 65_000)).toBe('1:05')
    expect(formatElapsed(0, 3_725_000)).toBe('1:02:05')
    expect(formatElapsed(10_000, 0)).toBe('0:00')
  })
})

describe("the 'load' action", () => {
  it('replaces the whole session with a stored snapshot', () => {
    const server = points(createScoringState(config()), 'aab')
    const phone = points(createScoringState(config()), 'aabbba')

    const restored = scoringReducer(server, {
      type: 'load',
      snapshot: toSnapshot(phone),
    })
    expect(restored.rallies).toHaveLength(6)
    expect(deriveScoreboard(restored).scoreA).toBe(3)
    expect(deriveScoreboard(restored).scoreB).toBe(3)
  })

  it('ignores a snapshot belonging to another match', () => {
    const state = points(createScoringState(config()), 'aa')
    const foreign = { ...toSnapshot(state), matchId: 'someone-elses-match' }

    const loaded = scoringReducer(state, { type: 'load', snapshot: foreign })
    expect(loaded.rallies).toHaveLength(0)
  })

  it('carries an ending across with the snapshot', () => {
    const ended = play(
      createScoringState(config()),
      { type: 'point', side: 'a' },
      {
        type: 'end_match',
        kind: 'retired',
        side: 'b',
        reason: 'calf strain',
      },
    )
    const loaded = scoringReducer(createScoringState(config()), {
      type: 'load',
      snapshot: toSnapshot(ended),
    })
    expect(deriveScoreboard(loaded).outcome).toBe('retired')
    expect(deriveScoreboard(loaded).winner).toBe('a')
  })
})

describe('the banner when another official is scoring the same match', () => {
  const conflicted = syncConflict(
    { ...createSyncTracker('saving', 0), localRallies: 12, syncedRallies: 9 },
    12,
    'Another official has scored this match since your phone last synced.',
  )

  it('does not offer a retry that cannot possibly work', () => {
    expect(describeSync(conflicted).retryable).toBe(false)
  })

  it('tells the umpire to reload rather than promising nothing is lost', () => {
    const view = describeSync(conflicted)
    expect(view.detail).toMatch(/reload/i)
    expect(view.detail, 'this copy is only true of a dropped request').not.toMatch(
      /nothing is lost/i,
    )
  })

  it('warns that saving anyway would wipe the other official’s points', () => {
    expect(describeSync(conflicted).detail).toMatch(/wipe their points/i)
    expect(describeSync(conflicted).tone).toBe('danger')
  })
})
