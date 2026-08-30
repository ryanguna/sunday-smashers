/**
 * Digital scoresheets: the chain of custody from the umpire's rally log to a
 * verified result in the standings.
 *
 * Four ideas hold this module together:
 *
 *  1. **The rally log is still the state.** Nothing here re-derives a score.
 *     `@/lib/scoring` replays the log (`restoreFromScoreEvents` →
 *     `deriveScoreboard`) and this module presents what comes out. If the two
 *     ever disagree, `@/lib/scoring` is right.
 *  2. **The status enum is the contract.** `scoresheet_status`
 *     (`draft | awaiting_signature | submitted | verified | disputed`) is the
 *     only place a sheet's progress lives. Every move between those values
 *     goes through `applyScoresheetCommand`, which refuses the illegal ones
 *     and says why — a sheet cannot be verified with a signature missing, and
 *     it cannot skip the pairs' agreement on its way to the tabulator.
 *  3. **A dispute is a first-class outcome, not a failure.** A pair that
 *     disagrees records *why*, in their own words, and the sheet stops moving
 *     until someone corrects it. Being forced to sign, or to abandon the
 *     sheet, is exactly the argument this feature exists to prevent.
 *  4. **No clocks, no locale.** Every timestamp is injected by the caller
 *     (`react-hooks/purity` forbids reading a clock during render) and every
 *     duration is formatted with plain arithmetic, so a string rendered on the
 *     server matches the one React re-renders in a browser in another
 *     timezone.
 *
 * Pure and dependency-light on purpose: no `next/headers`, no Supabase server
 * client, so Client Components can import it without breaking `npm run build`.
 */

import type {
  MatchEndKind,
  MatchEnding,
  MatchScoringConfig,
  RallyEvent,
  ScoreboardState,
  ScoringPlayer,
  ScoringSide,
} from '@/lib/scoring'
import { endKindLabel, otherSide, sideName } from '@/lib/scoring'
import type { MatchStatus, ScoresheetStatus } from '@/lib/supabase/types'
import type { BadgeStatus } from '@/components/ui'

// ---------------------------------------------------------------------------
// Sheet state
// ---------------------------------------------------------------------------

/** One pair's agreement to the result, attributed to a named player. */
export interface SheetSignature {
  side: ScoringSide
  /** `profiles.id` of the player who signed. Empty only in demo fixtures. */
  playerId: string
  /** The name as it appears on the roster — what the signer had to type. */
  playerName: string
  /** Injected by the caller. `null` when the source row had no timestamp. */
  signedAt: number | null
}

/** Every command the sheet accepts. Anything not listed here cannot happen. */
export type ScoresheetCommandKind =
  | 'open'
  | 'sign'
  | 'withdraw_signature'
  | 'submit'
  | 'verify'
  | 'dispute'
  | 'reopen'

/** One line of the chain of custody, oldest first. */
export interface SheetTrailEntry {
  kind: ScoresheetCommandKind
  from: ScoresheetStatus
  to: ScoresheetStatus
  /** Display name of whoever did it. */
  actor: string
  /** Human sentence for the audit trail. */
  detail: string
  at: number | null
}

export interface SheetState {
  matchId: string
  status: ScoresheetStatus
  signatures: readonly SheetSignature[]
  /** The words the disputing pair used. Cleared when the sheet is reopened. */
  disputeReason: string | null
  disputedBy: string | null
  submittedBy: string | null
  submittedAt: number | null
  verifiedBy: string | null
  verifiedAt: number | null
  trail: readonly SheetTrailEntry[]
}

export function createSheetState(matchId: string, init?: Partial<SheetState>): SheetState {
  return {
    matchId,
    status: 'draft',
    signatures: [],
    disputeReason: null,
    disputedBy: null,
    submittedBy: null,
    submittedAt: null,
    verifiedBy: null,
    verifiedAt: null,
    trail: [],
    ...init,
  }
}

// ---------------------------------------------------------------------------
// The state machine
// ---------------------------------------------------------------------------

/**
 * Which statuses each status may move to. Everything absent is illegal and
 * `applyScoresheetCommand` will refuse it.
 *
 * `draft` cannot be disputed: there is no declared result to disagree with
 * yet, and a sheet nobody has been asked to sign is simply an unfinished
 * match. `verified` *can* be disputed, because errors are found after the
 * fact and a verified-but-wrong result is the worst thing on this page.
 */
export const SCORESHEET_TRANSITIONS: Readonly<Record<ScoresheetStatus, readonly ScoresheetStatus[]>> =
  {
    draft: ['awaiting_signature'],
    awaiting_signature: ['submitted', 'disputed'],
    submitted: ['verified', 'disputed'],
    verified: ['disputed'],
    disputed: ['awaiting_signature'],
  }

export function canTransition(from: ScoresheetStatus, to: ScoresheetStatus): boolean {
  return SCORESHEET_TRANSITIONS[from].includes(to)
}

export type ScoresheetCommand =
  /** Result is in — open the sheet for the pairs to sign. */
  | { kind: 'open'; actor: string; at: number | null }
  | {
      kind: 'sign'
      side: ScoringSide
      playerId: string
      playerName: string
      at: number | null
    }
  /** Take a signature back before submission — a signer who changed their mind. */
  | { kind: 'withdraw_signature'; side: ScoringSide; actor: string; at: number | null }
  | { kind: 'submit'; actor: string; actorId: string | null; at: number | null }
  | { kind: 'verify'; actor: string; actorId: string | null; at: number | null }
  | {
      kind: 'dispute'
      reason: string
      actor: string
      actorId: string | null
      /** The pair raising it, when a pair rather than the tabulator did. */
      side?: ScoringSide
      at: number | null
    }
  /** Corrected — collect signatures again. Clears the old ones deliberately. */
  | { kind: 'reopen'; actor: string; at: number | null }

export type ScoresheetFailureCode =
  | 'illegal_transition'
  | 'match_incomplete'
  | 'already_signed'
  | 'not_signed'
  | 'missing_signature'
  | 'reason_required'
  | 'not_open_for_signature'

export type ScoresheetCommandResult =
  | { ok: true; state: SheetState; message: string }
  | { ok: false; code: ScoresheetFailureCode; message: string }

/** What the sheet needs to know about the match it belongs to. */
export interface SheetContext {
  /** True once the rally log says the match is finished, however it finished. */
  matchComplete: boolean
}

function fail(code: ScoresheetFailureCode, message: string): ScoresheetCommandResult {
  return { ok: false, code, message }
}

function withTrail(
  state: SheetState,
  patch: Partial<SheetState>,
  entry: Omit<SheetTrailEntry, 'from' | 'to'> & { to: ScoresheetStatus },
): SheetState {
  return {
    ...state,
    ...patch,
    status: entry.to,
    trail: [
      ...state.trail,
      { from: state.status, to: entry.to, kind: entry.kind, actor: entry.actor, detail: entry.detail, at: entry.at },
    ],
  }
}

/**
 * The single door every status change goes through.
 *
 * Returns a refusal rather than throwing, because every caller — a Server
 * Action, the tabulator inbox, a test — wants to show the reason to a human
 * standing on a gym floor, not a stack trace.
 */
export function applyScoresheetCommand(
  state: SheetState,
  command: ScoresheetCommand,
  context: SheetContext,
): ScoresheetCommandResult {
  switch (command.kind) {
    case 'open': {
      if (!context.matchComplete) {
        return fail(
          'match_incomplete',
          'The match is still being played — there is no result to sign for yet.',
        )
      }
      if (!canTransition(state.status, 'awaiting_signature')) {
        return fail('illegal_transition', illegalMessage(state.status, 'awaiting_signature'))
      }
      return {
        ok: true,
        message: 'Sheet opened for signatures.',
        state: withTrail(state, {}, {
          kind: 'open',
          to: 'awaiting_signature',
          actor: command.actor,
          detail: 'Result recorded — sheet opened for both pairs to sign.',
          at: command.at,
        }),
      }
    }

    case 'sign': {
      if (state.status !== 'awaiting_signature') {
        return fail(
          'not_open_for_signature',
          state.status === 'draft'
            ? 'The umpire has not finished the match yet, so there is nothing to sign.'
            : `This sheet is ${scoresheetStatusView(state.status).label.toLowerCase()} — it is not open for signatures.`,
        )
      }
      if (state.signatures.some((s) => s.side === command.side)) {
        return fail('already_signed', 'That pair has already signed this sheet.')
      }
      const signature: SheetSignature = {
        side: command.side,
        playerId: command.playerId,
        playerName: command.playerName,
        signedAt: command.at,
      }
      return {
        ok: true,
        message: `${command.playerName} signed.`,
        state: withTrail(state, { signatures: [...state.signatures, signature] }, {
          kind: 'sign',
          to: 'awaiting_signature',
          actor: command.playerName,
          detail: `${command.playerName} signed for their pair.`,
          at: command.at,
        }),
      }
    }

    case 'withdraw_signature': {
      if (state.status !== 'awaiting_signature') {
        return fail(
          'not_open_for_signature',
          'Signatures can only be taken back while the sheet is still awaiting signatures.',
        )
      }
      const existing = state.signatures.find((s) => s.side === command.side)
      if (!existing) return fail('not_signed', 'That pair has not signed yet.')
      return {
        ok: true,
        message: `${existing.playerName}'s signature removed.`,
        state: withTrail(
          state,
          { signatures: state.signatures.filter((s) => s.side !== command.side) },
          {
            kind: 'withdraw_signature',
            to: 'awaiting_signature',
            actor: command.actor,
            detail: `${existing.playerName}'s signature was taken back.`,
            at: command.at,
          },
        ),
      }
    }

    case 'submit': {
      if (!canTransition(state.status, 'submitted')) {
        return fail('illegal_transition', illegalMessage(state.status, 'submitted'))
      }
      const missing = state.signatures.length
      if (missing < 2) {
        return fail(
          'missing_signature',
          missing === 0
            ? 'Neither pair has signed yet — a sheet goes to the tabulator only once both agree.'
            : 'One pair still has to sign before this sheet can go to the tabulator.',
        )
      }
      return {
        ok: true,
        message: 'Sent to the tabulator.',
        state: withTrail(
          state,
          { submittedBy: command.actorId, submittedAt: command.at },
          {
            kind: 'submit',
            to: 'submitted',
            actor: command.actor,
            detail: `Both pairs signed — ${command.actor} sent the sheet to the tabulator.`,
            at: command.at,
          },
        ),
      }
    }

    case 'verify': {
      if (!canTransition(state.status, 'verified')) {
        return fail('illegal_transition', illegalMessage(state.status, 'verified'))
      }
      if (state.signatures.length < 2) {
        return fail(
          'missing_signature',
          'This sheet is missing a signature. Send it back as disputed rather than verifying it.',
        )
      }
      return {
        ok: true,
        message: 'Verified — the result now counts towards the standings.',
        state: withTrail(
          state,
          { verifiedBy: command.actorId, verifiedAt: command.at, disputeReason: null, disputedBy: null },
          {
            kind: 'verify',
            to: 'verified',
            actor: command.actor,
            detail: `${command.actor} verified the sheet — the result counts towards the standings.`,
            at: command.at,
          },
        ),
      }
    }

    case 'dispute': {
      if (!canTransition(state.status, 'disputed')) {
        return fail('illegal_transition', illegalMessage(state.status, 'disputed'))
      }
      const reason = command.reason.trim()
      if (!reason) {
        return fail(
          'reason_required',
          'Say what is wrong with the sheet — a dispute with no reason cannot be resolved.',
        )
      }
      return {
        ok: true,
        message: 'Dispute recorded.',
        state: withTrail(
          state,
          {
            disputeReason: reason,
            disputedBy: command.actorId,
            verifiedBy: null,
            verifiedAt: null,
          },
          {
            kind: 'dispute',
            to: 'disputed',
            actor: command.actor,
            detail: `${command.actor} disputed the sheet: ${reason}`,
            at: command.at,
          },
        ),
      }
    }

    case 'reopen': {
      // Only a disputed sheet reopens. `draft → awaiting_signature` is a legal
      // edge, but it belongs to `open`; reaching it with `reopen` would wipe a
      // sheet nobody has disagreed with.
      if (state.status !== 'disputed') {
        return fail('illegal_transition', illegalMessage(state.status, 'awaiting_signature'))
      }
      if (!canTransition(state.status, 'awaiting_signature')) {
        return fail('illegal_transition', illegalMessage(state.status, 'awaiting_signature'))
      }
      return {
        ok: true,
        message: 'Sheet reopened — both pairs need to sign the corrected result.',
        state: withTrail(
          state,
          { signatures: [], disputeReason: null, disputedBy: null, submittedBy: null, submittedAt: null },
          {
            kind: 'reopen',
            to: 'awaiting_signature',
            actor: command.actor,
            detail: `${command.actor} corrected the sheet — earlier signatures cleared, both pairs must sign again.`,
            at: command.at,
          },
        ),
      }
    }
  }
}

function illegalMessage(from: ScoresheetStatus, to: ScoresheetStatus): string {
  const a = scoresheetStatusView(from).label.toLowerCase()
  const b = scoresheetStatusView(to).label.toLowerCase()
  return `A sheet that is ${a} cannot go straight to ${b}.`
}

// ---------------------------------------------------------------------------
// Signatures
// ---------------------------------------------------------------------------

export function signatureFor(state: SheetState, side: ScoringSide): SheetSignature | null {
  return state.signatures.find((s) => s.side === side) ?? null
}

export function bothPairsSigned(state: SheetState): boolean {
  return signatureFor(state, 'a') != null && signatureFor(state, 'b') != null
}

export function missingSignatureSides(state: SheetState): ScoringSide[] {
  return (['a', 'b'] as const).filter((side) => signatureFor(state, side) == null)
}

export interface SignatureSlot {
  side: ScoringSide
  teamName: string
  players: readonly ScoringPlayer[]
  signature: SheetSignature | null
}

export function signatureSlots(config: MatchScoringConfig, state: SheetState): SignatureSlot[] {
  return (['a', 'b'] as const).map((side) => ({
    side,
    teamName: sideName(config, side),
    players: side === 'a' ? config.teamA.players : config.teamB.players,
    signature: signatureFor(state, side),
  }))
}

/**
 * Case, accent and punctuation insensitive, whitespace collapsed — so
 * "aroha  ngata" and "Aroha Ngata" are the same person, but "A. Ngata" is not.
 */
export function normaliseSignerName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * A signature is only accepted when the signer picked their own name from the
 * pair *and* typed it out. Two deliberate acts, so a sheet cannot be agreed to
 * by someone's thumb brushing the screen, and the row that lands in
 * `scoresheet_signatures` names a specific player.
 */
export function isSignatureNameMatch(typed: string, player: ScoringPlayer): boolean {
  const wanted = normaliseSignerName(player.name)
  return wanted.length > 0 && normaliseSignerName(typed) === wanted
}

/** The player of `players` whose name was typed, or `null`. */
export function findSigner(typed: string, players: readonly ScoringPlayer[]): ScoringPlayer | null {
  return players.find((p) => isSignatureNameMatch(typed, p)) ?? null
}

// ---------------------------------------------------------------------------
// Status presentation
// ---------------------------------------------------------------------------

export const SCORESHEET_STATUS_ORDER: readonly ScoresheetStatus[] = [
  'draft',
  'awaiting_signature',
  'submitted',
  'verified',
  'disputed',
]

export interface ScoresheetStatusView {
  status: ScoresheetStatus
  label: string
  badge: BadgeStatus
  /** One sentence a player or tabulator can act on. */
  blurb: string
  /** True when someone has to do something before the result can count. */
  outstanding: boolean
}

const STATUS_VIEWS: Readonly<Record<ScoresheetStatus, Omit<ScoresheetStatusView, 'status'>>> = {
  draft: {
    label: 'Draft',
    badge: 'info',
    blurb: 'The umpire is still recording this match. Nothing to sign yet.',
    outstanding: false,
  },
  awaiting_signature: {
    label: 'Awaiting signatures',
    badge: 'pending',
    blurb: 'The result is recorded. Both pairs need to read it and sign.',
    outstanding: true,
  },
  submitted: {
    label: 'With the tabulator',
    badge: 'live',
    blurb: 'Signed by both pairs and waiting for the tabulator to verify it.',
    outstanding: true,
  },
  verified: {
    label: 'Verified',
    badge: 'approved',
    blurb: 'Checked by the tabulator. This result counts towards the standings.',
    outstanding: false,
  },
  disputed: {
    label: 'Disputed',
    badge: 'unpaid',
    blurb: 'Someone disagrees with this sheet. It does not count until it is corrected.',
    outstanding: true,
  },
}

export function scoresheetStatusView(status: ScoresheetStatus): ScoresheetStatusView {
  return { status, ...STATUS_VIEWS[status] }
}

/** True when a verified sheet's result may be counted in the standings. */
export function countsTowardsStandings(state: SheetState): boolean {
  return state.status === 'verified'
}

// ---------------------------------------------------------------------------
// Chain of custody — the visual rail on the sheet
// ---------------------------------------------------------------------------

export type ChainStepState = 'done' | 'current' | 'todo' | 'blocked'

export interface ChainStep {
  key: 'recorded' | 'signed' | 'submitted' | 'verified'
  label: string
  detail: string
  state: ChainStepState
}

/**
 * The four things that have to happen, in order, with the one that is holding
 * everything up called out. A disputed sheet marks the step it is stuck on as
 * blocked rather than pretending the chain is still moving.
 */
export function chainOfCustody(state: SheetState, matchComplete: boolean): ChainStep[] {
  const signed = state.signatures.length
  const disputed = state.status === 'disputed'
  const past = (...statuses: ScoresheetStatus[]) => statuses.includes(state.status)

  const recorded: ChainStep = {
    key: 'recorded',
    label: 'Result recorded',
    detail: matchComplete
      ? 'The umpire finished the match and the rally log is closed.'
      : 'The umpire is still scoring this match.',
    state: matchComplete ? 'done' : 'current',
  }

  const signedStep: ChainStep = {
    key: 'signed',
    label: 'Both pairs signed',
    detail:
      signed === 2
        ? state.signatures.map((s) => s.playerName).join(' and ')
        : signed === 1
          ? `${state.signatures[0].playerName} has signed — one pair still to go.`
          : 'Neither pair has signed yet.',
    state:
      signed === 2
        ? 'done'
        : disputed
          ? 'blocked'
          : state.status === 'awaiting_signature'
            ? 'current'
            : 'todo',
  }

  const submittedStep: ChainStep = {
    key: 'submitted',
    label: 'Sent to the tabulator',
    detail: past('submitted', 'verified')
      ? 'The scoresheet keeper handed it over.'
      : 'The scoresheet keeper sends it once both pairs have signed.',
    state: past('submitted', 'verified')
      ? 'done'
      : disputed
        ? 'blocked'
        : signed === 2
          ? 'current'
          : 'todo',
  }

  const verifiedStep: ChainStep = {
    key: 'verified',
    label: 'Verified',
    detail:
      state.status === 'verified'
        ? 'Counted towards the standings.'
        : disputed
          ? 'Blocked until the dispute is resolved.'
          : 'The tabulator checks the sheet against the score before it counts.',
    state:
      state.status === 'verified'
        ? 'done'
        : disputed
          ? 'blocked'
          : state.status === 'submitted'
            ? 'current'
            : 'todo',
  }

  return [recorded, signedStep, submittedStep, verifiedStep]
}

// ---------------------------------------------------------------------------
// How the match ended — forfeit vs walkover vs retirement
// ---------------------------------------------------------------------------

/**
 * The authoritative ending for a match.
 *
 * `matches.status` wins where it is one of the three terminal values, because
 * since migration 0006 it is a real enum member rather than prose in
 * `forfeit_reason`. The rally log's ending (parsed out of the `score_events`
 * note by `restoreFromScoreEvents`) is the fallback for rows written before
 * that migration, and for demo mode where there is no database at all.
 */
export function resolveMatchEnding(input: {
  fromRallyLog: MatchEnding | null
  matchStatus: MatchStatus | null
  forfeitReason: string | null
  /** The pair that forfeited/withdrew/retired, if the match row names one. */
  endingSide: ScoringSide | null
}): MatchEnding | null {
  const kind = endKindFromStatus(input.matchStatus)
  if (kind && input.endingSide) {
    return {
      kind,
      side: input.endingSide,
      reason: stripEndingLabel(input.forfeitReason ?? input.fromRallyLog?.reason ?? ''),
      at: input.fromRallyLog?.at ?? null,
    }
  }
  return input.fromRallyLog
}

function endKindFromStatus(status: MatchStatus | null): MatchEndKind | null {
  if (status === 'forfeited') return 'forfeit'
  if (status === 'walkover') return 'walkover'
  if (status === 'retired') return 'retired'
  return null
}

/** `matches.forfeit_reason` is written as "Retired: rolled an ankle" by the console. */
function stripEndingLabel(reason: string): string {
  const index = reason.indexOf(':')
  return index === -1 ? reason.trim() : reason.slice(index + 1).trim()
}

export interface EndingPresentation {
  kind: MatchEndKind | null
  /** "Retired", "Forfeit", "Walkover (no-show)" or "Played out". */
  label: string
  /** The sentence at the top of the sheet. */
  headline: string
  /** Exactly what the numbers on this sheet mean. */
  scoreNote: string
  /** The pair's own words, if any were recorded. */
  reason: string
  /** False for a forfeit/walkover, where the score is an award, not a result. */
  scoreWasPlayed: boolean
  tone: 'ok' | 'warn' | 'danger'
}

/**
 * Says what happened in the words the pairs would use.
 *
 * The three not-played-out endings are deliberately not interchangeable. A
 * pair carried off with a rolled ankle has retired, and their score stands as
 * played; labelling that a forfeit is both wrong and insulting, and the people
 * signing the sheet are exactly the people who will notice.
 */
export function describeEnding(board: ScoreboardState, config: MatchScoringConfig): EndingPresentation {
  const ending = board.ending
  if (!ending) {
    return {
      kind: null,
      label: 'Played out',
      headline: board.complete && board.winner ? `${sideName(config, board.winner)} win` : 'Match in progress',
      scoreNote: board.complete
        ? 'The full score as played, rally by rally.'
        : 'The score so far — this match has not finished.',
      reason: '',
      scoreWasPlayed: true,
      tone: 'ok',
    }
  }

  const loser = sideName(config, ending.side)
  const winner = sideName(config, otherSide(ending.side))
  const label = endKindLabel(ending.kind)

  if (ending.kind === 'retired') {
    return {
      kind: 'retired',
      label,
      headline: `${loser} retired — ${winner} win`,
      scoreNote: `Retirement keeps the score actually played: ${board.awardedA}–${board.awardedB} at the moment play stopped. It is not recorded as a forfeit.`,
      reason: ending.reason,
      scoreWasPlayed: true,
      tone: 'warn',
    }
  }

  if (ending.kind === 'walkover') {
    return {
      kind: 'walkover',
      label,
      headline: `Walkover — ${winner} win`,
      scoreNote: `${loser} never came to court, so the game was never started. The score is normalised to ${board.pointsToWin}–0.`,
      reason: ending.reason,
      scoreWasPlayed: false,
      tone: 'danger',
    }
  }

  return {
    kind: 'forfeit',
    label,
    headline: `Forfeit by ${loser} — ${winner} win`,
    scoreNote: `A forfeit is not played out, so the score is normalised to ${board.pointsToWin}–0 whatever was on the board.`,
    reason: ending.reason,
    scoreWasPlayed: false,
    tone: 'danger',
  }
}

// ---------------------------------------------------------------------------
// The rally log the sheet prints
// ---------------------------------------------------------------------------

/** Where the rally-by-rally record on a sheet came from. */
export type RallySource =
  /** Straight from `score_events` — the umpire's own log. */
  | 'log'
  /** No log exists (paper fallback, or demo mode): a plausible order only. */
  | 'reconstructed'
  /** Nothing at all — a 0–0 or walkover sheet. */
  | 'none'

export interface RallySourceNote {
  source: RallySource
  label: string
  blurb: string
  /** True when the sheet must not claim the sequence is authoritative. */
  advisory: boolean
}

export function rallySourceNote(source: RallySource): RallySourceNote {
  if (source === 'log') {
    return {
      source,
      label: 'Umpire’s rally log',
      blurb: 'Every rally below was recorded on the console as it was played.',
      advisory: false,
    }
  }
  if (source === 'reconstructed') {
    return {
      source,
      label: 'Reconstructed order',
      blurb:
        'No rally-by-rally log was recorded for this match, so the order below is a plausible reconstruction from the final score. The final score is the record; the sequence is not.',
      advisory: true,
    }
  }
  return {
    source,
    label: 'No rallies',
    blurb: 'This match produced no rallies — there is nothing to list.',
    advisory: false,
  }
}

/**
 * A deterministic, plausible rally order for a known final score.
 *
 * Used only when there is no `score_events` log (demo mode, or a result an
 * admin typed in from a paper sheet). Deterministic so the same match always
 * prints the same sequence — a scoresheet that reshuffles itself between two
 * prints of the same match is worse than useless — and clearly labelled by
 * `rallySourceNote('reconstructed')` so nobody mistakes it for the real thing.
 */
export function reconstructRallies(scoreA: number, scoreB: number, seedKey: string): RallyEvent[] {
  const finalA = Math.max(0, scoreA)
  const finalB = Math.max(0, scoreB)
  const total = finalA + finalB
  if (total === 0) return []

  // The last rally must belong to whoever finished ahead, or the printed log
  // shows play carrying on past the winning point — the first thing a pair
  // querying a sheet would notice.
  const winner: ScoringSide | null = finalA === finalB ? null : finalA > finalB ? 'a' : 'b'
  let remainingA = winner === 'a' ? finalA - 1 : finalA
  let remainingB = winner === 'b' ? finalB - 1 : finalB
  const body = total - (winner ? 1 : 0)

  let seed = hashString(seedKey) || 1
  const rallies: RallyEvent[] = []

  for (let i = 0; i < body; i++) {
    // xorshift32 — small, deterministic, no dependency.
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    seed >>>= 0

    let side: ScoringSide
    if (remainingA === 0) side = 'b'
    else if (remainingB === 0) side = 'a'
    else side = seed / 0xffffffff < remainingA / (remainingA + remainingB) ? 'a' : 'b'

    if (side === 'a') remainingA--
    else remainingB--
    rallies.push({ seq: i + 1, side, at: null })
  }

  if (winner) rallies.push({ seq: body + 1, side: winner, at: null })

  return rallies
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

// ---------------------------------------------------------------------------
// Durations — arithmetic only, so server and browser agree
// ---------------------------------------------------------------------------

/** "just now" / "18 min ago" / "2 hr 05 min ago". Never reads a clock itself. */
export function formatAge(fromMs: number | null, now: number): string {
  if (fromMs == null) return 'time not recorded'
  const seconds = Math.max(0, Math.round((now - fromMs) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return `${hours} hr ${String(rest).padStart(2, '0')} min ago`
}

/** "waiting 18 min" — the tabulator's queue-age label. */
export function formatWaiting(sinceMs: number | null, now: number): string {
  if (sinceMs == null) return 'waiting'
  const minutes = Math.max(0, Math.floor((now - sinceMs) / 60000))
  if (minutes < 1) return 'waiting under a minute'
  if (minutes < 60) return `waiting ${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `waiting ${hours} hr ${String(minutes % 60).padStart(2, '0')} min`
}

/**
 * An absolute wall-clock string for the printed sheet.
 *
 * Only ever called from a Server Component with an explicit IANA zone, so the
 * value that is rendered is the value that is printed — a browser in another
 * timezone never gets the chance to disagree with it.
 */
export function formatStamp(ms: number | null, timeZone: string): string {
  if (ms == null) return '—'
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(new Date(ms))
}

// ---------------------------------------------------------------------------
// The tabulator inbox
// ---------------------------------------------------------------------------

export interface InboxItem {
  matchId: string
  divisionName: string
  stageLabel: string
  court: string
  slotLabel: string
  teamAName: string
  teamBName: string
  /** "15–9", already reflecting forfeit/walkover normalisation. */
  scoreLine: string
  /** "Played out", "Forfeit", "Walkover (no-show)", "Retired". */
  outcomeLabel: string
  endingKind: MatchEndKind | null
  /**
   * The sheet itself, so the inbox can re-run the state machine rather than
   * trust a status copied out of it — and so demo mode can overlay a locally
   * advanced sheet onto the server's copy without the two disagreeing.
   */
  sheet: SheetState
  /** When the result was declared — the clock a sheet ages from. */
  resultAt: number | null
  /** Ordering hint — earlier slots first, so the queue reads like the day. */
  slotIndex: number
}

/** How long the sheet has been waiting on whoever it is currently waiting on. */
export function waitingSince(sheet: SheetState, resultAt: number | null): number | null {
  if (sheet.status === 'submitted') return sheet.submittedAt ?? resultAt
  if (sheet.status === 'verified') return sheet.verifiedAt ?? resultAt
  const last = sheet.trail.length > 0 ? sheet.trail[sheet.trail.length - 1].at : null
  return last ?? resultAt
}

export interface InboxGroups {
  /** Signed and sitting in the queue. The tabulator's actual job. */
  toVerify: InboxItem[]
  /** Disagreements. Jumped to the top because they block a result entirely. */
  disputed: InboxItem[]
  /** Out on court waiting for a pair to sign — chase these. */
  awaitingSignature: InboxItem[]
  verified: InboxItem[]
  /** Matches that have finished but whose sheet was never opened. */
  notStarted: InboxItem[]
}

export function groupInbox(items: readonly InboxItem[]): InboxGroups {
  const queuedAt = (item: InboxItem) => waitingSince(item.sheet, item.resultAt) ?? Number.MAX_SAFE_INTEGER
  const byQueueOrder = (a: InboxItem, b: InboxItem) =>
    queuedAt(a) - queuedAt(b) || a.slotIndex - b.slotIndex || a.court.localeCompare(b.court)

  const pick = (status: ScoresheetStatus) =>
    items.filter((i) => i.sheet.status === status).sort(byQueueOrder)

  return {
    disputed: pick('disputed'),
    toVerify: pick('submitted'),
    awaitingSignature: pick('awaiting_signature'),
    notStarted: pick('draft'),
    verified: items
      .filter((i) => i.sheet.status === 'verified')
      .sort((a, b) => b.slotIndex - a.slotIndex || a.court.localeCompare(b.court)),
  }
}

export interface InboxCounts {
  total: number
  toVerify: number
  disputed: number
  awaitingSignature: number
  verified: number
  notStarted: number
  /** Everything that is not yet counted towards the standings. */
  outstanding: number
}

export function inboxCounts(items: readonly InboxItem[]): InboxCounts {
  const count = (status: ScoresheetStatus) => items.filter((i) => i.sheet.status === status).length
  const verified = count('verified')
  return {
    total: items.length,
    toVerify: count('submitted'),
    disputed: count('disputed'),
    awaitingSignature: count('awaiting_signature'),
    verified,
    notStarted: count('draft'),
    outstanding: items.length - verified,
  }
}

/** The one-line headline for the top of `/tabulator`. */
export function inboxHeadline(counts: InboxCounts): string {
  if (counts.total === 0) return 'Nothing on the desk yet — the shuttles are still warming up.'
  if (counts.disputed > 0) {
    return `${counts.disputed} disputed sheet${counts.disputed === 1 ? '' : 's'} to sort out first.`
  }
  if (counts.toVerify > 0) {
    return `${counts.toVerify} sheet${counts.toVerify === 1 ? '' : 's'} signed and waiting for you.`
  }
  if (counts.awaitingSignature > 0) {
    return `Nothing to verify — ${counts.awaitingSignature} sheet${counts.awaitingSignature === 1 ? ' is' : 's are'} still out on court collecting signatures.`
  }
  return 'The desk is clear. Every sheet is verified.'
}

// ---------------------------------------------------------------------------
// Demo fixtures
// ---------------------------------------------------------------------------

/**
 * A believable spread of sheet statuses for demo mode.
 *
 * The story: the day's earlier matches have been verified and are in the
 * standings; the most recent handful are mid-chain — a couple on the
 * tabulator's desk, one still chasing a signature, one disputed. That gives
 * `/tabulator` a real queue to look at with no database, which is the only
 * mode CI ever runs in.
 *
 * `index` is the match's position in play order (0 = first of the day), and
 * `pending` is how many of the most recent finished matches are still moving.
 */
export function demoSheetStatus(index: number, finishedCount: number, pending = 6): ScoresheetStatus {
  const fromEnd = finishedCount - 1 - index
  if (fromEnd >= pending) return 'verified'
  const pattern: ScoresheetStatus[] = [
    'submitted',
    'awaiting_signature',
    'submitted',
    'disputed',
    'submitted',
    'verified',
  ]
  return pattern[fromEnd % pattern.length]
}

export interface DemoSheetInput {
  matchId: string
  status: ScoresheetStatus
  config: MatchScoringConfig
  /** Injected — this module never reads a clock. */
  finishedAt: number
}

/**
 * A sheet in a consistent state for a demo status: signatures, dispute text
 * and trail all agreeing with each other, so nothing on screen contradicts
 * anything else.
 */
export function demoSheetState(input: DemoSheetInput): SheetState {
  const { matchId, status, config, finishedAt } = input
  const base = createSheetState(matchId, { status: 'draft' })
  const context: SheetContext = { matchComplete: true }
  const playerOf = (side: ScoringSide) =>
    (side === 'a' ? config.teamA.players : config.teamB.players)[0] ?? {
      id: `${matchId}-${side}`,
      name: sideName(config, side),
    }

  if (status === 'draft') return base

  const run = (state: SheetState, command: ScoresheetCommand): SheetState => {
    const result = applyScoresheetCommand(state, command, context)
    return result.ok ? result.state : state
  }

  let state = run(base, { kind: 'open', actor: 'Umpire', at: finishedAt })
  if (status === 'awaiting_signature') return state

  const signA = playerOf('a')
  const signB = playerOf('b')

  if (status === 'disputed') {
    state = run(state, {
      kind: 'sign',
      side: 'a',
      playerId: signA.id,
      playerName: signA.name,
      at: finishedAt + 60_000,
    })
    return run(state, {
      kind: 'dispute',
      reason: 'We had it 14–13 at the change of ends, not 13–14. Please check the log around rally 27.',
      actor: signB.name,
      actorId: signB.id,
      side: 'b',
      at: finishedAt + 150_000,
    })
  }

  state = run(state, {
    kind: 'sign',
    side: 'a',
    playerId: signA.id,
    playerName: signA.name,
    at: finishedAt + 60_000,
  })
  state = run(state, {
    kind: 'sign',
    side: 'b',
    playerId: signB.id,
    playerName: signB.name,
    at: finishedAt + 95_000,
  })
  state = run(state, {
    kind: 'submit',
    actor: 'Scoresheet keeper',
    actorId: null,
    at: finishedAt + 130_000,
  })
  if (status === 'submitted') return state

  return run(state, {
    kind: 'verify',
    actor: 'Tabulator',
    actorId: null,
    at: finishedAt + 400_000,
  })
}
