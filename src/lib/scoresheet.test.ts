import { describe, expect, it } from 'vitest'

import {
  SCORESHEET_STATUS_ORDER,
  SCORESHEET_TRANSITIONS,
  applyScoresheetCommand,
  attributeSignatures,
  bothPairsSigned,
  canTransition,
  chainOfCustody,
  countsTowardsStandings,
  createSheetState,
  demoSheetState,
  demoSheetStatus,
  describeEnding,
  findSigner,
  formatAge,
  formatStamp,
  formatWaiting,
  groupInbox,
  inboxCounts,
  inboxHeadline,
  isSignatureNameMatch,
  missingSignatureSides,
  normaliseSignerName,
  rallySourceNote,
  reconstructRallies,
  resolveMatchEnding,
  scoresheetStatusView,
  signatureFor,
  signatureSlots,
  waitingSince,
  type InboxItem,
  type ScoresheetCommand,
  type SheetState,
} from '@/lib/scoresheet'
import {
  createScoringState,
  deriveScoreboard,
  type MatchEnding,
  type MatchScoringConfig,
  type ScoringSide,
} from '@/lib/scoring'
import type { ScoresheetStatus } from '@/lib/supabase/types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const T0 = 1_765_600_000_000

function config(pointsToWin = 15): MatchScoringConfig {
  return {
    matchId: 'match-1',
    rules: { pointsToWin, deuce: false },
    teamA: {
      id: 'team-a',
      name: 'Tinsel Smashers',
      players: [
        { id: 'p1', name: 'Aroha Ngata' },
        { id: 'p2', name: 'Béa Lefèvre' },
      ],
    },
    teamB: {
      id: 'team-b',
      name: 'Jingle Rally',
      players: [
        { id: 'p3', name: 'Carlos Ruiz' },
        { id: 'p4', name: 'Dee Okafor' },
      ],
    },
    baseline: {
      scoreA: 0,
      scoreB: 0,
      servingSide: 'a',
      positionsA: null,
      positionsB: null,
    },
  }
}

const CONTEXT = { matchComplete: true }

function apply(state: SheetState, command: ScoresheetCommand, matchComplete = true): SheetState {
  const result = applyScoresheetCommand(state, command, { matchComplete })
  if (!result.ok) throw new Error(`unexpected refusal: ${result.code} — ${result.message}`)
  return result.state
}

function refuse(state: SheetState, command: ScoresheetCommand, matchComplete = true) {
  const result = applyScoresheetCommand(state, command, { matchComplete })
  if (result.ok) throw new Error(`expected refusal, got ${result.state.status}`)
  return result
}

const sign = (side: ScoringSide, at: number): ScoresheetCommand =>
  side === 'a'
    ? { kind: 'sign', side: 'a', playerId: 'p1', playerName: 'Aroha Ngata', at }
    : { kind: 'sign', side: 'b', playerId: 'p3', playerName: 'Carlos Ruiz', at }

const open = (at = T0): ScoresheetCommand => ({ kind: 'open', actor: 'Umpire', at })
const submit = (at = T0): ScoresheetCommand => ({
  kind: 'submit',
  actor: 'Keeper',
  actorId: 'p9',
  at,
})
const verify = (at = T0): ScoresheetCommand => ({
  kind: 'verify',
  actor: 'Tabby',
  actorId: 'p8',
  at,
})
const dispute = (reason: string, at = T0): ScoresheetCommand => ({
  kind: 'dispute',
  reason,
  actor: 'Carlos Ruiz',
  actorId: 'p3',
  side: 'b',
  at,
})
const reopen = (at = T0): ScoresheetCommand => ({ kind: 'reopen', actor: 'Umpire', at })

/** A sheet with both pairs signed, ready to submit. */
function signedSheet(): SheetState {
  let state = apply(createSheetState('match-1'), open(T0))
  state = apply(state, sign('a', T0 + 1000))
  return apply(state, sign('b', T0 + 2000))
}

// ---------------------------------------------------------------------------
// The transition table itself
// ---------------------------------------------------------------------------

describe('SCORESHEET_TRANSITIONS', () => {
  it('covers every status in the enum', () => {
    expect(Object.keys(SCORESHEET_TRANSITIONS).sort()).toEqual(
      [...SCORESHEET_STATUS_ORDER].sort(),
    )
  })

  it('only ever points at real statuses', () => {
    for (const targets of Object.values(SCORESHEET_TRANSITIONS)) {
      for (const target of targets) {
        expect(SCORESHEET_STATUS_ORDER).toContain(target)
      }
    }
  })

  it('has no self-transitions — a status change must change something', () => {
    for (const [from, targets] of Object.entries(SCORESHEET_TRANSITIONS)) {
      expect(targets).not.toContain(from as ScoresheetStatus)
    }
  })

  it('agrees with canTransition for every pair of statuses', () => {
    for (const from of SCORESHEET_STATUS_ORDER) {
      for (const to of SCORESHEET_STATUS_ORDER) {
        expect(canTransition(from, to)).toBe(SCORESHEET_TRANSITIONS[from].includes(to))
      }
    }
  })

  it('allows exactly the legal moves and nothing else', () => {
    const legal = new Set([
      'draft>awaiting_signature',
      'awaiting_signature>submitted',
      'awaiting_signature>disputed',
      'submitted>verified',
      'submitted>disputed',
      'verified>disputed',
      'disputed>awaiting_signature',
    ])
    for (const from of SCORESHEET_STATUS_ORDER) {
      for (const to of SCORESHEET_STATUS_ORDER) {
        expect([`${from}>${to}`, canTransition(from, to)]).toEqual([
          `${from}>${to}`,
          legal.has(`${from}>${to}`),
        ])
      }
    }
  })

  it('cannot dispute a draft — there is no declared result to disagree with', () => {
    expect(canTransition('draft', 'disputed')).toBe(false)
  })

  it('can dispute a verified sheet — mistakes surface after the fact', () => {
    expect(canTransition('verified', 'disputed')).toBe(true)
  })

  it('has no way out of verified except a dispute', () => {
    expect(SCORESHEET_TRANSITIONS.verified).toEqual(['disputed'])
  })
})

// ---------------------------------------------------------------------------
// Legal moves
// ---------------------------------------------------------------------------

describe('applyScoresheetCommand — the happy path', () => {
  it('walks draft → awaiting → submitted → verified', () => {
    let state = createSheetState('match-1')
    expect(state.status).toBe('draft')

    state = apply(state, open(T0))
    expect(state.status).toBe('awaiting_signature')

    state = apply(state, sign('a', T0 + 1000))
    expect(state.status).toBe('awaiting_signature')
    expect(bothPairsSigned(state)).toBe(false)

    state = apply(state, sign('b', T0 + 2000))
    expect(bothPairsSigned(state)).toBe(true)

    state = apply(state, submit(T0 + 3000))
    expect(state.status).toBe('submitted')
    expect(state.submittedAt).toBe(T0 + 3000)
    expect(state.submittedBy).toBe('p9')

    state = apply(state, verify(T0 + 4000))
    expect(state.status).toBe('verified')
    expect(state.verifiedBy).toBe('p8')
    expect(countsTowardsStandings(state)).toBe(true)
  })

  it('records every step in the chain-of-custody trail, oldest first', () => {
    const state = apply(apply(signedSheet(), submit(T0 + 3000)), verify(T0 + 4000))
    expect(state.trail.map((entry) => entry.kind)).toEqual([
      'open',
      'sign',
      'sign',
      'submit',
      'verify',
    ])
    expect(state.trail[0].from).toBe('draft')
    expect(state.trail[0].to).toBe('awaiting_signature')
    expect(state.trail.at(-1)?.to).toBe('verified')
  })

  it('attributes each signature to a named player and a time', () => {
    const state = signedSheet()
    expect(signatureFor(state, 'a')).toMatchObject({
      playerId: 'p1',
      playerName: 'Aroha Ngata',
      signedAt: T0 + 1000,
    })
    expect(signatureFor(state, 'b')?.playerName).toBe('Carlos Ruiz')
    expect(missingSignatureSides(state)).toEqual([])
  })

  it('lets a signer take their signature back before submission', () => {
    let state = signedSheet()
    state = apply(state, { kind: 'withdraw_signature', side: 'b', actor: 'Carlos Ruiz', at: T0 })
    expect(state.status).toBe('awaiting_signature')
    expect(missingSignatureSides(state)).toEqual(['b'])
    expect(bothPairsSigned(state)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Illegal moves — every one of them
// ---------------------------------------------------------------------------

describe('applyScoresheetCommand — illegal transitions', () => {
  const at = T0

  it('refuses draft → submitted', () => {
    const result = refuse(createSheetState('m'), submit(at))
    expect(result.code).toBe('illegal_transition')
  })

  it('refuses draft → verified', () => {
    expect(refuse(createSheetState('m'), verify(at)).code).toBe('illegal_transition')
  })

  it('refuses draft → disputed', () => {
    expect(refuse(createSheetState('m'), dispute('wrong score', at)).code).toBe(
      'illegal_transition',
    )
  })

  it('refuses draft → reopened — reopening is only for a disputed sheet', () => {
    expect(refuse(createSheetState('m'), reopen(at)).code).toBe('illegal_transition')
  })

  it('refuses awaiting_signature → verified, even with both signatures', () => {
    const result = refuse(signedSheet(), verify(at))
    expect(result.code).toBe('illegal_transition')
    expect(result.message).toContain('cannot go straight to')
  })

  it('refuses awaiting_signature → reopened', () => {
    expect(refuse(signedSheet(), reopen(at)).code).toBe('illegal_transition')
  })

  it('refuses submitted → awaiting_signature (no un-submitting)', () => {
    const state = apply(signedSheet(), submit(at))
    expect(refuse(state, reopen(at)).code).toBe('illegal_transition')
  })

  it('refuses submitted → submitted', () => {
    const state = apply(signedSheet(), submit(at))
    expect(refuse(state, submit(at)).code).toBe('illegal_transition')
  })

  it('refuses verified → submitted and verified → verified', () => {
    const state = apply(apply(signedSheet(), submit(at)), verify(at))
    expect(refuse(state, submit(at)).code).toBe('illegal_transition')
    expect(refuse(state, verify(at)).code).toBe('illegal_transition')
  })

  it('refuses verified → reopened without a dispute in between', () => {
    const state = apply(apply(signedSheet(), submit(at)), verify(at))
    expect(refuse(state, reopen(at)).code).toBe('illegal_transition')
  })

  it('refuses disputed → submitted and disputed → verified', () => {
    const state = apply(apply(signedSheet(), submit(at)), dispute('score is wrong', at))
    expect(refuse(state, submit(at)).code).toBe('illegal_transition')
    expect(refuse(state, verify(at)).code).toBe('illegal_transition')
  })

  it('refuses disputed → disputed — one dispute at a time', () => {
    const state = apply(apply(signedSheet(), submit(at)), dispute('score is wrong', at))
    expect(refuse(state, dispute('and another thing', at)).code).toBe('illegal_transition')
  })

  it('refuses opening a sheet twice', () => {
    const state = apply(createSheetState('m'), open(at))
    expect(refuse(state, open(at)).code).toBe('illegal_transition')
  })

  it('never mutates the state it refused', () => {
    const before = signedSheet()
    const snapshot = JSON.stringify(before)
    refuse(before, verify(T0))
    expect(JSON.stringify(before)).toBe(snapshot)
  })
})

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

describe('applyScoresheetCommand — guards', () => {
  it('will not open a sheet for a match that is still being played', () => {
    const result = refuse(createSheetState('m'), open(T0), false)
    expect(result.code).toBe('match_incomplete')
  })

  it('refuses a submit with no signatures at all', () => {
    const state = apply(createSheetState('m'), open(T0))
    const result = refuse(state, submit(T0))
    expect(result.code).toBe('missing_signature')
    expect(result.message).toContain('Neither pair')
  })

  it('refuses a submit with one signature missing', () => {
    const state = apply(apply(createSheetState('m'), open(T0)), sign('a', T0))
    const result = refuse(state, submit(T0))
    expect(result.code).toBe('missing_signature')
    expect(result.message).toContain('One pair')
  })

  it('refuses a verify when a signature is missing', () => {
    // A sheet can only reach `submitted` with two signatures, so this models a
    // row that lost one — the guard is the backstop, not the happy path.
    const doctored = createSheetState('m', {
      status: 'submitted',
      signatures: [{ side: 'a', playerId: 'p1', playerName: 'Aroha Ngata', signedAt: T0 }],
    })
    const result = refuse(doctored, verify(T0))
    expect(result.code).toBe('missing_signature')
    expect(result.message).toContain('disputed')
  })

  it('refuses a verify on a sheet with no signatures at all', () => {
    const doctored = createSheetState('m', { status: 'submitted' })
    expect(refuse(doctored, verify(T0)).code).toBe('missing_signature')
  })

  it('refuses a second signature from the same pair', () => {
    const state = apply(apply(createSheetState('m'), open(T0)), sign('a', T0))
    const result = refuse(state, {
      kind: 'sign',
      side: 'a',
      playerId: 'p2',
      playerName: 'Béa Lefèvre',
      at: T0,
    })
    expect(result.code).toBe('already_signed')
  })

  it('refuses a signature on a draft sheet', () => {
    expect(refuse(createSheetState('m'), sign('a', T0)).code).toBe('not_open_for_signature')
  })

  it('refuses a signature on a submitted sheet', () => {
    const state = apply(signedSheet(), submit(T0))
    expect(refuse(state, sign('a', T0)).code).toBe('not_open_for_signature')
  })

  it('refuses withdrawing a signature that was never given', () => {
    const state = apply(createSheetState('m'), open(T0))
    const result = refuse(state, {
      kind: 'withdraw_signature',
      side: 'a',
      actor: 'Aroha',
      at: T0,
    })
    expect(result.code).toBe('not_signed')
  })

  it('refuses withdrawing once the sheet has been submitted', () => {
    const state = apply(signedSheet(), submit(T0))
    const result = refuse(state, {
      kind: 'withdraw_signature',
      side: 'a',
      actor: 'Aroha',
      at: T0,
    })
    expect(result.code).toBe('not_open_for_signature')
  })

  it('refuses a dispute with no reason', () => {
    const state = apply(signedSheet(), submit(T0))
    expect(refuse(state, dispute('   ', T0)).code).toBe('reason_required')
  })
})

// ---------------------------------------------------------------------------
// Disputes
// ---------------------------------------------------------------------------

describe('disputes', () => {
  it('can be raised after one pair has signed, without forcing the other to sign', () => {
    const oneSigned = apply(apply(createSheetState('m'), open(T0)), sign('a', T0 + 1000))
    const state = apply(oneSigned, dispute('We had it 14–13, not 13–14.', T0 + 2000))

    expect(state.status).toBe('disputed')
    expect(state.disputeReason).toBe('We had it 14–13, not 13–14.')
    expect(state.disputedBy).toBe('p3')
    // The signature that was given is kept — it is a fact about what happened.
    expect(state.signatures).toHaveLength(1)
    expect(countsTowardsStandings(state)).toBe(false)
  })

  it('trims the reason but keeps the words', () => {
    const state = apply(apply(signedSheet(), submit(T0)), dispute('  rally 27 is wrong  ', T0))
    expect(state.disputeReason).toBe('rally 27 is wrong')
  })

  it('strips a verification when a verified sheet is disputed', () => {
    const verified = apply(apply(signedSheet(), submit(T0)), verify(T0 + 1000))
    expect(verified.verifiedAt).toBe(T0 + 1000)

    const disputed = apply(verified, dispute('the winner is the wrong way round', T0 + 2000))
    expect(disputed.status).toBe('disputed')
    expect(disputed.verifiedAt).toBeNull()
    expect(disputed.verifiedBy).toBeNull()
    expect(countsTowardsStandings(disputed)).toBe(false)
  })

  it('clears every signature when the sheet is reopened, so a correction must be re-signed', () => {
    const disputed = apply(apply(signedSheet(), submit(T0)), dispute('wrong score', T0))
    const reopened = apply(disputed, reopen(T0 + 1000))

    expect(reopened.status).toBe('awaiting_signature')
    expect(reopened.signatures).toEqual([])
    expect(reopened.disputeReason).toBeNull()
    expect(reopened.submittedAt).toBeNull()
    expect(refuse(reopened, submit(T0 + 2000)).code).toBe('missing_signature')
  })

  it('re-verifies after a correction, end to end', () => {
    let state = apply(apply(signedSheet(), submit(T0)), verify(T0 + 1000))
    state = apply(state, dispute('rally 27 went the other way', T0 + 2000))
    state = apply(state, reopen(T0 + 3000))
    state = apply(state, sign('a', T0 + 4000))
    state = apply(state, sign('b', T0 + 5000))
    state = apply(state, submit(T0 + 6000))
    state = apply(state, verify(T0 + 7000))

    expect(state.status).toBe('verified')
    expect(state.verifiedAt).toBe(T0 + 7000)
    expect(state.disputeReason).toBeNull()
    expect(countsTowardsStandings(state)).toBe(true)
    expect(state.trail.map((e) => e.kind)).toEqual([
      'open',
      'sign',
      'sign',
      'submit',
      'verify',
      'dispute',
      'reopen',
      'sign',
      'sign',
      'submit',
      'verify',
    ])
  })
})

// ---------------------------------------------------------------------------
// Signature identity
// ---------------------------------------------------------------------------

describe('signature identity', () => {
  it('ignores case, accents, punctuation and stray whitespace', () => {
    expect(normaliseSignerName('  Béa   Lefèvre ')).toBe('bea lefevre')
    expect(normaliseSignerName("O'Brien-Smith")).toBe('o brien smith')
  })

  it('accepts a full name typed any which way', () => {
    const player = { id: 'p2', name: 'Béa Lefèvre' }
    expect(isSignatureNameMatch('bea lefevre', player)).toBe(true)
    expect(isSignatureNameMatch('  BÉA  LEFÈVRE ', player)).toBe(true)
  })

  it('rejects an initial, a surname alone, or an empty string', () => {
    const player = { id: 'p1', name: 'Aroha Ngata' }
    expect(isSignatureNameMatch('A. Ngata', player)).toBe(false)
    expect(isSignatureNameMatch('Ngata', player)).toBe(false)
    expect(isSignatureNameMatch('', player)).toBe(false)
    expect(isSignatureNameMatch('   ', player)).toBe(false)
  })

  it('rejects a player with no name at all rather than matching everything', () => {
    expect(isSignatureNameMatch('', { id: 'x', name: '' })).toBe(false)
  })

  it('finds which player of a pair typed their name', () => {
    const players = config().teamA.players
    expect(findSigner('bea lefevre', players)?.id).toBe('p2')
    expect(findSigner('Carlos Ruiz', players)).toBeNull()
  })

  it('builds a slot per pair, carrying the signature when there is one', () => {
    const slots = signatureSlots(config(), signedSheet())
    expect(slots.map((s) => s.side)).toEqual(['a', 'b'])
    expect(slots[0].teamName).toBe('Tinsel Smashers')
    expect(slots[0].players).toHaveLength(2)
    expect(slots[1].signature?.playerName).toBe('Carlos Ruiz')
  })
})

// ---------------------------------------------------------------------------
// Status presentation
// ---------------------------------------------------------------------------

describe('scoresheetStatusView', () => {
  it('describes every status without falling through', () => {
    for (const status of SCORESHEET_STATUS_ORDER) {
      const view = scoresheetStatusView(status)
      expect(view.status).toBe(status)
      expect(view.label.length).toBeGreaterThan(0)
      expect(view.blurb.length).toBeGreaterThan(0)
    }
  })

  it('marks exactly the statuses that need someone to act as outstanding', () => {
    const outstanding = SCORESHEET_STATUS_ORDER.filter(
      (status) => scoresheetStatusView(status).outstanding,
    )
    expect(outstanding).toEqual(['awaiting_signature', 'submitted', 'disputed'])
  })

  it('only counts a verified sheet towards the standings', () => {
    for (const status of SCORESHEET_STATUS_ORDER) {
      expect(countsTowardsStandings(createSheetState('m', { status }))).toBe(status === 'verified')
    }
  })
})

describe('chainOfCustody', () => {
  it('shows the umpire still scoring when the match is not finished', () => {
    const steps = chainOfCustody(createSheetState('m'), false)
    expect(steps[0].state).toBe('current')
    expect(steps.map((s) => s.key)).toEqual(['recorded', 'signed', 'submitted', 'verified'])
  })

  it('points at signatures once the result is in', () => {
    const steps = chainOfCustody(apply(createSheetState('m'), open(T0)), true)
    expect(steps[0].state).toBe('done')
    expect(steps[1].state).toBe('current')
  })

  it('names the pair still to sign', () => {
    const oneSigned = apply(apply(createSheetState('m'), open(T0)), sign('a', T0))
    expect(chainOfCustody(oneSigned, true)[1].detail).toContain('one pair still to go')
  })

  it('marks everything downstream as blocked while disputed', () => {
    const disputed = apply(apply(signedSheet(), submit(T0)), dispute('wrong', T0))
    const steps = chainOfCustody(disputed, true)
    expect(steps[1].state).toBe('done')
    expect(steps[2].state).toBe('blocked')
    expect(steps[3].state).toBe('blocked')
  })

  it('is all done once verified', () => {
    const verified = apply(apply(signedSheet(), submit(T0)), verify(T0))
    expect(chainOfCustody(verified, true).every((s) => s.state === 'done')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Endings — retirement is not a forfeit
// ---------------------------------------------------------------------------

function boardWith(ending: MatchEnding | null, scoreA: number, scoreB: number) {
  const cfg = config(15)
  const rallies = reconstructRallies(scoreA, scoreB, 'seed')
  return { cfg, board: deriveScoreboard(createScoringState(cfg, { rallies, ending })) }
}

describe('describeEnding', () => {
  it('describes a match played out to the target score', () => {
    const { cfg, board } = boardWith(null, 15, 9)
    const ending = describeEnding(board, cfg)
    expect(ending.kind).toBeNull()
    expect(ending.label).toBe('Played out')
    expect(ending.scoreWasPlayed).toBe(true)
    expect(ending.tone).toBe('ok')
    expect(ending.headline).toContain('Tinsel Smashers')
  })

  it('keeps the score actually played for a retirement, and says it is not a forfeit', () => {
    const { cfg, board } = boardWith(
      { kind: 'retired', side: 'b', reason: 'rolled an ankle', at: T0 },
      11,
      8,
    )
    const ending = describeEnding(board, cfg)

    expect(ending.kind).toBe('retired')
    expect(ending.scoreWasPlayed).toBe(true)
    expect(board.awardedA).toBe(11)
    expect(board.awardedB).toBe(8)
    expect(ending.headline).toContain('Jingle Rally retired')
    expect(ending.headline).toContain('Tinsel Smashers win')
    expect(ending.scoreNote).toContain('11–8')
    expect(ending.scoreNote).toContain('not recorded as a forfeit')
    expect(ending.reason).toBe('rolled an ankle')
    expect(ending.tone).toBe('warn')
  })

  it('normalises a forfeit to pointsToWin–0 and says the score was not played', () => {
    const { cfg, board } = boardWith(
      { kind: 'forfeit', side: 'b', reason: 'no players', at: T0 },
      11,
      8,
    )
    const ending = describeEnding(board, cfg)

    expect(ending.kind).toBe('forfeit')
    expect(ending.scoreWasPlayed).toBe(false)
    expect(board.awardedA).toBe(15)
    expect(board.awardedB).toBe(0)
    expect(ending.headline).toContain('Forfeit by Jingle Rally')
    expect(ending.scoreNote).toContain('15–0')
    expect(ending.tone).toBe('danger')
  })

  it('distinguishes a walkover from a forfeit in words, not just in the score', () => {
    const { cfg, board } = boardWith(
      { kind: 'walkover', side: 'a', reason: 'never arrived', at: T0 },
      0,
      0,
    )
    const ending = describeEnding(board, cfg)

    expect(ending.kind).toBe('walkover')
    expect(ending.headline).toContain('Walkover')
    expect(ending.scoreNote).toContain('never came to court')
    expect(board.awardedA).toBe(0)
    expect(board.awardedB).toBe(15)
  })

  it('reads pointsToWin off the match rather than assuming 15 or 21', () => {
    const cfg = config(21)
    const board = deriveScoreboard(
      createScoringState(cfg, {
        rallies: [],
        ending: { kind: 'forfeit', side: 'a', reason: '', at: null },
      }),
    )
    expect(describeEnding(board, cfg).scoreNote).toContain('21–0')
  })

  it('gives the three endings three different labels', () => {
    const labels = (['retired', 'forfeit', 'walkover'] as const).map((kind) => {
      const { cfg, board } = boardWith({ kind, side: 'b', reason: '', at: null }, 5, 3)
      return describeEnding(board, cfg).label
    })
    expect(new Set(labels).size).toBe(3)
  })
})

describe('resolveMatchEnding', () => {
  it('prefers the match status over a stale rally-log ending', () => {
    const ending = resolveMatchEnding({
      fromRallyLog: { kind: 'forfeit', side: 'a', reason: 'old note', at: null },
      matchStatus: 'retired',
      forfeitReason: 'Retired: rolled an ankle',
      endingSide: 'b',
    })
    expect(ending).toMatchObject({ kind: 'retired', side: 'b', reason: 'rolled an ankle' })
  })

  it('falls back to the rally log when the status says nothing terminal', () => {
    const fromLog: MatchEnding = { kind: 'retired', side: 'a', reason: 'cramp', at: null }
    expect(
      resolveMatchEnding({
        fromRallyLog: fromLog,
        matchStatus: 'completed',
        forfeitReason: null,
        endingSide: null,
      }),
    ).toBe(fromLog)
  })

  it('returns nothing for a match that simply finished', () => {
    expect(
      resolveMatchEnding({
        fromRallyLog: null,
        matchStatus: 'completed',
        forfeitReason: null,
        endingSide: null,
      }),
    ).toBeNull()
  })

  it('needs a side before it will trust a terminal status', () => {
    expect(
      resolveMatchEnding({
        fromRallyLog: null,
        matchStatus: 'forfeited',
        forfeitReason: 'no show',
        endingSide: null,
      }),
    ).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// The rally record
// ---------------------------------------------------------------------------

describe('reconstructRallies', () => {
  it('produces exactly the recorded score', () => {
    const rallies = reconstructRallies(15, 9, 'match-1')
    expect(rallies).toHaveLength(24)
    expect(rallies.filter((r) => r.side === 'a')).toHaveLength(15)
    expect(rallies.filter((r) => r.side === 'b')).toHaveLength(9)
  })

  it('is deterministic — the same sheet prints the same way twice', () => {
    expect(reconstructRallies(15, 9, 'match-1')).toEqual(reconstructRallies(15, 9, 'match-1'))
  })

  it('differs between matches, so two sheets do not read identically', () => {
    const a = reconstructRallies(15, 9, 'match-1').map((r) => r.side).join('')
    const b = reconstructRallies(15, 9, 'match-2').map((r) => r.side).join('')
    expect(a).not.toBe(b)
  })

  it('ends on the winning pair’s rally, so the log never runs past match point', () => {
    expect(reconstructRallies(21, 19, 'match-1').at(-1)?.side).toBe('a')
    expect(reconstructRallies(9, 15, 'match-1').at(-1)?.side).toBe('b')
    // A tied score never happens under no-deuce rules, but must not crash.
    expect(reconstructRallies(5, 5, 'x')).toHaveLength(10)
  })

  it('numbers rallies from 1 with no gaps and never reads a clock', () => {
    const rallies = reconstructRallies(6, 4, 'seed')
    expect(rallies.map((r) => r.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(rallies.every((r) => r.at === null)).toBe(true)
  })

  it('returns nothing for a 0–0 match, and treats negatives as zero', () => {
    expect(reconstructRallies(0, 0, 'seed')).toEqual([])
    expect(reconstructRallies(-4, 0, 'seed')).toEqual([])
  })

  it('replays through the scoring engine to the same final score', () => {
    const cfg = config(15)
    const board = deriveScoreboard(
      createScoringState(cfg, { rallies: reconstructRallies(15, 13, 'x') }),
    )
    expect([board.awardedA, board.awardedB]).toEqual([15, 13])
    expect(board.complete).toBe(true)
  })
})

describe('rallySourceNote', () => {
  it('does not flag the umpire’s own log as advisory', () => {
    expect(rallySourceNote('log').advisory).toBe(false)
  })

  it('warns loudly that a reconstructed order is not the record', () => {
    const note = rallySourceNote('reconstructed')
    expect(note.advisory).toBe(true)
    expect(note.blurb).toContain('final score is the record')
  })

  it('has something to say about a sheet with no rallies', () => {
    expect(rallySourceNote('none').label).toBe('No rallies')
  })
})

// ---------------------------------------------------------------------------
// Durations and stamps — pure, so server and browser agree
// ---------------------------------------------------------------------------

describe('formatAge / formatWaiting', () => {
  it('reads no clock — the same inputs always give the same string', () => {
    expect(formatAge(T0, T0 + 30_000)).toBe('just now')
    expect(formatAge(T0, T0 + 18 * 60_000)).toBe('18 min ago')
    expect(formatAge(T0, T0 + 125 * 60_000)).toBe('2 hr 05 min ago')
  })

  it('never goes backwards when a client clock is ahead of the server', () => {
    expect(formatAge(T0 + 60_000, T0)).toBe('just now')
    expect(formatWaiting(T0 + 60_000, T0)).toBe('waiting under a minute')
  })

  it('says so when there is no timestamp at all', () => {
    expect(formatAge(null, T0)).toBe('time not recorded')
    expect(formatWaiting(null, T0)).toBe('waiting')
  })

  it('formats the tabulator queue age', () => {
    expect(formatWaiting(T0, T0 + 42 * 60_000)).toBe('waiting 42 min')
    expect(formatWaiting(T0, T0 + 61 * 60_000)).toBe('waiting 1 hr 01 min')
  })
})

describe('formatStamp', () => {
  it('formats in the zone it is given, not the machine running the test', () => {
    const utc = formatStamp(T0, 'UTC')
    const sydney = formatStamp(T0, 'Australia/Sydney')
    expect(utc).not.toBe(sydney)
    expect(sydney).toMatch(/\d{4}/)
  })

  it('has something to print for a missing timestamp', () => {
    expect(formatStamp(null, 'UTC')).toBe('—')
  })
})

// ---------------------------------------------------------------------------
// The tabulator inbox
// ---------------------------------------------------------------------------

function item(id: string, sheet: SheetState, slotIndex = 0, resultAt: number | null = T0): InboxItem {
  return {
    matchId: id,
    divisionName: 'Men’s Doubles',
    stageLabel: 'Round robin',
    court: 'Court 1',
    slotLabel: '9:00 am',
    teamAName: 'Tinsel Smashers',
    teamBName: 'Jingle Rally',
    scoreLine: '15–9',
    outcomeLabel: 'Played out',
    endingKind: null,
    sheet,
    resultAt,
    slotIndex,
  }
}

function sheetAt(id: string, status: ScoresheetStatus): SheetState {
  return demoSheetState({ matchId: id, status, config: config(), finishedAt: T0 })
}

describe('groupInbox', () => {
  const items = [
    item('m1', sheetAt('m1', 'verified'), 1),
    item('m2', sheetAt('m2', 'submitted'), 2),
    item('m3', sheetAt('m3', 'disputed'), 3),
    item('m4', sheetAt('m4', 'awaiting_signature'), 4),
    item('m5', sheetAt('m5', 'draft'), 5),
  ]

  it('files each sheet under its own status and loses none', () => {
    const groups = groupInbox(items)
    expect(groups.verified.map((i) => i.matchId)).toEqual(['m1'])
    expect(groups.toVerify.map((i) => i.matchId)).toEqual(['m2'])
    expect(groups.disputed.map((i) => i.matchId)).toEqual(['m3'])
    expect(groups.awaitingSignature.map((i) => i.matchId)).toEqual(['m4'])
    expect(groups.notStarted.map((i) => i.matchId)).toEqual(['m5'])
  })

  it('queues the longest-waiting sheet first', () => {
    const old = item(
      'old',
      demoSheetState({ matchId: 'old', status: 'submitted', config: config(), finishedAt: T0 - 3_600_000 }),
      9,
      T0 - 3_600_000,
    )
    const fresh = item('fresh', sheetAt('fresh', 'submitted'), 1, T0)
    expect(groupInbox([fresh, old]).toVerify.map((i) => i.matchId)).toEqual(['old', 'fresh'])
  })

  it('reads the status off the sheet, so an overlaid sheet re-files itself', () => {
    const overlaid = { ...items[1], sheet: sheetAt('m2', 'verified') }
    const groups = groupInbox([overlaid])
    expect(groups.toVerify).toEqual([])
    expect(groups.verified.map((i) => i.matchId)).toEqual(['m2'])
  })

  it('handles an empty desk', () => {
    const groups = groupInbox([])
    expect(Object.values(groups).every((list) => list.length === 0)).toBe(true)
  })
})

describe('inboxCounts and inboxHeadline', () => {
  const items = [
    item('m1', sheetAt('m1', 'verified'), 1),
    item('m2', sheetAt('m2', 'submitted'), 2),
    item('m3', sheetAt('m3', 'submitted'), 3),
    item('m4', sheetAt('m4', 'awaiting_signature'), 4),
  ]

  it('counts each status and everything not yet counting', () => {
    const counts = inboxCounts(items)
    expect(counts).toMatchObject({
      total: 4,
      verified: 1,
      toVerify: 2,
      awaitingSignature: 1,
      disputed: 0,
      notStarted: 0,
      outstanding: 3,
    })
  })

  it('leads with disputes when there are any', () => {
    const withDispute = [...items, item('m5', sheetAt('m5', 'disputed'), 5)]
    expect(inboxHeadline(inboxCounts(withDispute))).toContain('disputed')
  })

  it('leads with the verify queue when there are no disputes', () => {
    expect(inboxHeadline(inboxCounts(items))).toContain('2 sheets signed and waiting')
  })

  it('mentions chasing signatures when the desk is otherwise clear', () => {
    const chase = [item('m1', sheetAt('m1', 'awaiting_signature'), 1)]
    expect(inboxHeadline(inboxCounts(chase))).toContain('still out on court')
  })

  it('says the desk is clear when everything is verified', () => {
    const done = [item('m1', sheetAt('m1', 'verified'), 1)]
    expect(inboxHeadline(inboxCounts(done))).toContain('desk is clear')
  })

  it('has something to say for an empty inbox', () => {
    expect(inboxHeadline(inboxCounts([]))).toContain('Nothing on the desk')
  })
})

describe('waitingSince', () => {
  it('ages a submitted sheet from when it was submitted', () => {
    const state = apply(signedSheet(), submit(T0 + 5000))
    expect(waitingSince(state, T0)).toBe(T0 + 5000)
  })

  it('ages a verified sheet from when it was verified', () => {
    const state = apply(apply(signedSheet(), submit(T0)), verify(T0 + 9000))
    expect(waitingSince(state, T0)).toBe(T0 + 9000)
  })

  it('falls back to the last thing that happened, then to the result time', () => {
    expect(waitingSince(apply(createSheetState('m'), open(T0 + 700)), T0)).toBe(T0 + 700)
    expect(waitingSince(createSheetState('m'), T0)).toBe(T0)
    expect(waitingSince(createSheetState('m'), null)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Demo fixtures
// ---------------------------------------------------------------------------

describe('demo fixtures', () => {
  it('verifies everything except the most recent handful', () => {
    expect(demoSheetStatus(0, 20)).toBe('verified')
    expect(demoSheetStatus(13, 20)).toBe('verified')
    expect(demoSheetStatus(19, 20)).toBe('submitted')
  })

  it('gives the tabulator a real queue to look at', () => {
    const statuses = Array.from({ length: 20 }, (_, i) => demoSheetStatus(i, 20))
    expect(statuses).toContain('submitted')
    expect(statuses).toContain('disputed')
    expect(statuses).toContain('awaiting_signature')
    expect(statuses).toContain('verified')
  })

  it('only ever produces real statuses', () => {
    for (let i = 0; i < 30; i++) {
      expect(SCORESHEET_STATUS_ORDER).toContain(demoSheetStatus(i, 30))
    }
  })

  it('builds each demo sheet by driving the real state machine', () => {
    for (const status of SCORESHEET_STATUS_ORDER) {
      const state = sheetAt('m', status)
      expect(state.status).toBe(status)
    }
  })

  it('makes a demo sheet internally consistent — signatures match the status', () => {
    expect(sheetAt('m', 'draft').signatures).toHaveLength(0)
    expect(sheetAt('m', 'awaiting_signature').signatures).toHaveLength(0)
    expect(sheetAt('m', 'submitted').signatures).toHaveLength(2)
    expect(sheetAt('m', 'verified').signatures).toHaveLength(2)

    const disputed = sheetAt('m', 'disputed')
    expect(disputed.signatures).toHaveLength(1)
    expect(disputed.disputeReason).toBeTruthy()
  })

  it('names real players from the pair on each demo signature', () => {
    const state = sheetAt('m', 'verified')
    expect(state.signatures.map((s) => s.playerName)).toEqual(['Aroha Ngata', 'Carlos Ruiz'])
  })

  it('never reads a clock — timestamps come from the injected finishedAt', () => {
    const state = demoSheetState({
      matchId: 'm',
      status: 'verified',
      config: config(),
      finishedAt: T0,
    })
    expect(state.verifiedAt).toBe(T0 + 400_000)
    for (const entry of state.trail) {
      expect(entry.at).not.toBeNull()
      expect(entry.at as number).toBeGreaterThanOrEqual(T0)
    }
  })

  it('copes with a pair whose roster is empty', () => {
    const bare: MatchScoringConfig = {
      ...config(),
      teamA: { id: null, name: 'Pair A', players: [] },
      teamB: { id: null, name: 'Pair B', players: [] },
    }
    const state = demoSheetState({
      matchId: 'm',
      status: 'submitted',
      config: bare,
      finishedAt: T0,
    })
    expect(state.status).toBe('submitted')
    expect(state.signatures.map((s) => s.playerName)).toEqual(['Pair A', 'Pair B'])
  })
})

describe('createSheetState', () => {
  it('starts a fresh sheet as a draft with nothing on it', () => {
    const state = createSheetState('m')
    expect(state).toMatchObject({
      matchId: 'm',
      status: 'draft',
      signatures: [],
      disputeReason: null,
      submittedAt: null,
      verifiedAt: null,
      trail: [],
    })
  })

  it('accepts a stored row without inventing anything', () => {
    const state = createSheetState('m', { status: 'submitted', submittedAt: T0 })
    expect(state.status).toBe('submitted')
    expect(state.submittedAt).toBe(T0)
    expect(state.signatures).toEqual([])
  })
})

describe('applyScoresheetCommand — context is respected everywhere', () => {
  it('does not block a signature just because matchComplete was passed false', () => {
    // Only `open` gates on completeness: once a sheet is open, the umpire has
    // already declared the result, and a stale flag must not strand a signer.
    const state = apply(createSheetState('m'), open(T0), true)
    const result = applyScoresheetCommand(state, sign('a', T0), { matchComplete: false })
    expect(result.ok).toBe(true)
  })

  it('CONTEXT fixture is the shape the machine expects', () => {
    expect(CONTEXT).toEqual({ matchComplete: true })
  })
})

describe('attributeSignatures — the side comes from the roster, never the row order', () => {
  const ROSTERS = { a: ['a1', 'a2'], b: ['b1', 'b2'] }

  function stored(...playerIds: string[]): SheetState {
    return createSheetState('m', {
      status: 'awaiting_signature',
      // Every stored row arrives on the placeholder side, because
      // `scoresheet_signatures` has no side column to read.
      signatures: playerIds.map((playerId) => ({
        side: 'a' as ScoringSide,
        playerId,
        playerName: playerId,
        signedAt: T0,
      })),
    })
  }

  it('puts the second pair on side b even when they signed first', () => {
    const result = attributeSignatures(stored('b1'), ROSTERS)
    expect(result.signatures).toHaveLength(1)
    expect(result.signatures[0]).toMatchObject({ side: 'b', playerId: 'b1' })
  })

  it('attributes both pairs correctly when b signed before a', () => {
    const result = attributeSignatures(stored('b2', 'a1'), ROSTERS)
    expect(result.signatures.map((s) => [s.playerId, s.side])).toEqual([
      ['b2', 'b'],
      ['a1', 'a'],
    ])
    expect(bothPairsSigned(result)).toBe(true)
  })

  it('drops a signature from someone on neither roster rather than guessing', () => {
    const result = attributeSignatures(stored('stranger', 'a2'), ROSTERS)
    expect(result.signatures.map((s) => s.playerId)).toEqual(['a2'])
  })

  it('keeps only the first signature per side', () => {
    const result = attributeSignatures(stored('a1', 'a2'), ROSTERS)
    expect(result.signatures.map((s) => s.playerId)).toEqual(['a1'])
  })

  it('drops everything when the rosters are unknown', () => {
    expect(attributeSignatures(stored('a1', 'b1'), { a: [], b: [] }).signatures).toEqual([])
  })

  it('leaves the rest of the sheet untouched', () => {
    const sheet = stored('b1')
    const result = attributeSignatures(sheet, ROSTERS)
    expect(result.status).toBe(sheet.status)
    expect(result.matchId).toBe(sheet.matchId)
    expect(result.trail).toEqual(sheet.trail)
  })
})
