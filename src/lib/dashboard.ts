/**
 * Pure logic for the player dashboard (`/dashboard`).
 *
 * Everything a player needs to answer "when and where am I next on court,
 * and what am I officiating?" is derived here — deliberately free of any
 * Supabase / `next/headers` import so it can be unit tested (see
 * `./dashboard.test.ts`) and safely bundled into Client Components.
 *
 * Two rules from the draft tournament rules drive most of this file:
 *
 *   1. **Late arrival / no-show is an automatic forfeit**, so the next
 *      fixture (and the countdown to it) is the single most important value
 *      the dashboard computes.
 *   2. **The next match's players officiate the current match**, so a player
 *      has *duty* assignments as well as their own matches — and must never
 *      be double-booked (`isDoubleBooked`).
 *
 * Data always arrives as the `Public*` shapes from `@/lib/public-data`, so
 * demo mode and Supabase mode share one code path.
 */

import {
  computeStandings,
  DEFAULT_ELIMS_RULES,
  type MatchStage,
  type PlayedMatch,
  type StandingRow,
  type TeamId,
} from '@/lib/draw'
import type {
  PublicDivisionInfo,
  PublicDutyAssignment,
  PublicMatch,
  PublicTeam,
} from '@/lib/public-data'
import { isMatchDecided } from '@/lib/public-data'
import { TOURNAMENT_DATE } from '@/lib/tournament'
import type { PaymentStatus, RegistrationStatus } from '@/lib/supabase/types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How many pairs from each round robin go through to the semi finals. */
export const TOP_FOUR_CUT = 4

/** Length of one scheduling slot, matching `src/lib/schedule.ts`. */
export const SLOT_MINUTES = 15

/** The first slot of the day starts at 9:00am on tournament day. */
export const FIRST_SLOT_HOUR = 9

/** Players are asked to be at their court this many minutes before the call. */
export const ARRIVE_BEFORE_MINUTES = 10

// ---------------------------------------------------------------------------
// Identity + fixtures
// ---------------------------------------------------------------------------

export interface PlayerIdentity {
  id: string
  /** Display name — for rendering only; never used to match duty rows. */
  name: string
}

export type FixtureOutcome = 'upcoming' | 'live' | 'win' | 'loss' | 'forfeit_win' | 'forfeit_loss'

/**
 * *How* a decided match ended, carried alongside the outcome rather than
 * folded into it. A player should be able to tell "we beat them" from "they
 * went home injured" or "they never showed up", but the outcome union is
 * consumed elsewhere (`/players`) with exhaustive `Record<FixtureOutcome, …>`
 * maps, so the nuance rides on its own field instead of widening that union.
 */
export type FixtureEndKind = 'normal' | 'forfeit' | 'walkover' | 'retired'

const WIN_OUTCOMES: readonly FixtureOutcome[] = ['win', 'forfeit_win']
const LOSS_OUTCOMES: readonly FixtureOutcome[] = ['loss', 'forfeit_loss']

/** A win by any route — played out or awarded. */
export function isWinOutcome(outcome: FixtureOutcome): boolean {
  return WIN_OUTCOMES.includes(outcome)
}

/** Anything that isn't still to come or in play. Never re-list statuses inline. */
export function isDecidedOutcome(outcome: FixtureOutcome): boolean {
  return isWinOutcome(outcome) || LOSS_OUTCOMES.includes(outcome)
}

/** Reads a match's end kind off its public status. */
export function endKindFor(match: Pick<PublicMatch, 'status' | 'forfeitedBy'>): FixtureEndKind {
  if (match.status === 'retired') return 'retired'
  if (match.status === 'walkover') return 'walkover'
  if (match.status === 'forfeited' || match.forfeitedBy != null) return 'forfeit'
  return 'normal'
}

export interface PlayerFixture {
  match: PublicMatch
  /** Which side of the match card the player's pair sits on. */
  side: 'A' | 'B'
  opponent: PublicTeam | null
  opponentName: string
  yourScore: number
  theirScore: number
  outcome: FixtureOutcome
  /** Why the match ended the way it did — 'normal' unless something unusual happened. */
  endKind: FixtureEndKind
}

export type DutyRole = PublicDutyAssignment['role']

export interface PlayerDuty {
  match: PublicMatch
  role: DutyRole
  /** True when this duty overlaps a match the player is also playing. */
  clash: boolean
}

const STAGE_LABELS: Record<MatchStage, string> = {
  elims: 'Round Robin',
  semi: 'Semi-Final',
  third_place: 'Battle for 3rd',
  final: 'Championship',
}

const DUTY_ROLE_LABELS: Record<DutyRole, string> = {
  umpire_scorer: 'Umpire / Scorer',
  scoresheet: 'Scoresheet',
  line_judge: 'Line judge',
}

const DUTY_ROLE_BLURBS: Record<DutyRole, string> = {
  umpire_scorer: 'Call the score, run the game and keep it moving.',
  scoresheet: 'Record every point on the scoresheet and get it signed.',
  line_judge: 'Watch your line and call in or out — loud and clear.',
}

export function stageLabel(stage: MatchStage): string {
  return STAGE_LABELS[stage]
}

export function dutyRoleLabel(role: DutyRole): string {
  return DUTY_ROLE_LABELS[role]
}

export function dutyRoleBlurb(role: DutyRole): string {
  return DUTY_ROLE_BLURBS[role]
}

/**
 * Roles the live-scoring console lets you drive. Line judges have no console
 * permission, so linking them through would only end in a rejection.
 */
export const SCORING_DUTY_ROLES: readonly DutyRole[] = ['umpire_scorer', 'scoresheet']

export function canDriveScoring(role: DutyRole): boolean {
  return SCORING_DUTY_ROLES.includes(role)
}

/**
 * Deep link to the live-scoring console for a duty, or `null` when the duty
 * isn't actionable (wrong role, or the match is already done — nobody should
 * be invited into a console for a finished game).
 *
 * Match ids contain `#` in demo data (`Court 5#16`), so the id MUST be
 * percent-encoded or the link 404s.
 */
export function scoringConsoleHref(duty: PlayerDuty | null | undefined): string | null {
  if (!duty) return null
  if (!canDriveScoring(duty.role)) return null
  if (isMatchDecided(duty.match.status)) return null
  const id = duty.match.id.trim()
  if (!id) return null
  return `/scoring/${encodeURIComponent(id)}`
}

/** "First to 15 — no deuce", the rule that applies to this match's stage. */
export function pointsToWinLabel(match: Pick<PublicMatch, 'pointsToWin' | 'deuce'>): string {
  return `First to ${match.pointsToWin}${match.deuce ? '' : ' — no deuce'}`
}

/** Finds the pair a player belongs to by scanning every team in the schedule. */
export function findPlayerTeam(
  matches: readonly PublicMatch[],
  player: PlayerIdentity,
): PublicTeam | null {
  const name = player.name.trim().toLowerCase()
  for (const match of matches) {
    for (const team of [match.teamA, match.teamB]) {
      if (!team) continue
      const hit = team.players.some(
        (p) => p.id === player.id || (name.length > 0 && p.name.trim().toLowerCase() === name),
      )
      if (hit) return team
    }
  }
  return null
}

/** Chronological order: slot index first, then court, so the day reads top to bottom. */
export function compareByStartTime(a: PublicMatch, b: PublicMatch): number {
  const slotA = a.slotIndex ?? Number.MAX_SAFE_INTEGER
  const slotB = b.slotIndex ?? Number.MAX_SAFE_INTEGER
  if (slotA !== slotB) return slotA - slotB
  return (a.court ?? '').localeCompare(b.court ?? '')
}

function outcomeFor(match: PublicMatch, teamId: TeamId, side: 'A' | 'B'): FixtureOutcome {
  if (!isMatchDecided(match.status)) {
    return match.status === 'in_progress' ? 'live' : 'upcoming'
  }
  const forfeited = match.status === 'forfeited' || match.forfeitedBy != null
  // `winnerTeamId` is the authority. A retirement stops short of the target
  // score and the retiring pair can even be ahead when they pull out, so the
  // scoreline cannot decide the match. Fall back to it only when nothing
  // better was recorded.
  const won =
    match.winnerTeamId != null
      ? match.winnerTeamId === teamId
      : forfeited && match.forfeitedBy != null
        ? match.forfeitedBy !== teamId
        : side === 'A'
          ? match.scoreA > match.scoreB
          : match.scoreB > match.scoreA
  // A walkover is awarded, never contested, so it reads as a forfeit result.
  // A retirement was played out up to the point someone stopped, so it keeps
  // the plain win/loss shape — `endKind` carries the reason.
  if (forfeited || match.status === 'walkover') return won ? 'forfeit_win' : 'forfeit_loss'
  return won ? 'win' : 'loss'
}

/** Every match the player's pair appears in, in playing order. */
export function playerFixtures(matches: readonly PublicMatch[], teamId: TeamId | null): PlayerFixture[] {
  if (!teamId) return []
  return matches
    .filter((m) => m.teamA?.id === teamId || m.teamB?.id === teamId)
    .sort(compareByStartTime)
    .map((match) => {
      const side: 'A' | 'B' = match.teamA?.id === teamId ? 'A' : 'B'
      const opponent = side === 'A' ? match.teamB : match.teamA
      const opponentSource = side === 'A' ? match.sourceB : match.sourceA
      return {
        match,
        side,
        opponent,
        opponentName: opponent?.name ?? opponentSource ?? 'To be decided',
        yourScore: side === 'A' ? match.scoreA : match.scoreB,
        theirScore: side === 'A' ? match.scoreB : match.scoreA,
        outcome: outcomeFor(match, teamId, side),
        endKind: endKindFor(match),
      }
    })
}

/**
 * The fixture the player must show up for right now: a match already in
 * progress beats an upcoming one, otherwise the earliest scheduled match.
 */
export function nextFixture(fixtures: readonly PlayerFixture[]): PlayerFixture | null {
  const live = fixtures.find((f) => f.outcome === 'live')
  if (live) return live
  return fixtures.find((f) => f.outcome === 'upcoming') ?? null
}

/** The player's currently-in-progress match, if any. */
export function liveFixture(fixtures: readonly PlayerFixture[]): PlayerFixture | null {
  return fixtures.find((f) => f.outcome === 'live') ?? null
}

/**
 * Duty assignments for this player, matched on `playerId` only. Display names
 * are `nickname || full_name` and are not unique, so name matching would merge
 * two same-named players' rosters and leave a court unstaffed. A blank id on
 * either side matches nothing.
 */
export function playerDuties(
  matches: readonly PublicMatch[],
  player: PlayerIdentity,
  playingTeamId: TeamId | null = null,
): PlayerDuty[] {
  const playerId = player.id.trim()
  if (!playerId) return []
  const duties: PlayerDuty[] = []
  for (const match of [...matches].sort(compareByStartTime)) {
    for (const duty of match.duties) {
      if (duty.playerId.trim() !== playerId) continue
      duties.push({
        match,
        role: duty.role,
        clash:
          playingTeamId != null &&
          matches.some(
            (m) =>
              m.id !== match.id &&
              m.slotIndex != null &&
              m.slotIndex === match.slotIndex &&
              (m.teamA?.id === playingTeamId || m.teamB?.id === playingTeamId),
          ),
      })
    }
  }
  return duties
}

/** The next duty still to be served (a match in progress counts — they're on it now). */
export function nextDuty(duties: readonly PlayerDuty[]): PlayerDuty | null {
  return (
    duties.find((d) => d.match.status === 'in_progress') ??
    duties.find((d) => d.match.status === 'scheduled') ??
    null
  )
}

/**
 * True when a player's own match and a duty land in the same time slot —
 * the roster must never do this, so the dashboard shouts about it.
 */
export function isDoubleBooked(fixture: PlayerFixture | null, duty: PlayerDuty | null): boolean {
  if (!fixture || !duty) return false
  if (fixture.match.id === duty.match.id) return false
  const a = fixture.match.slotIndex
  const b = duty.match.slotIndex
  if (a != null && b != null) return a === b
  return (
    fixture.match.slotLabel != null &&
    duty.match.slotLabel != null &&
    fixture.match.slotLabel === duty.match.slotLabel
  )
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** Parses "2:15pm" / "9:00 AM" into minutes past midnight, or `null`. */
export function parseSlotLabel(label: string | null): number | null {
  if (!label) return null
  const match = /^\s*(\d{1,2})[:.](\d{2})\s*(am|pm)?/i.exec(label)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2])
  const meridiem = match[3]?.toLowerCase()
  if (hour > 23 || minute > 59) return null
  if (meridiem === 'pm' && hour < 12) hour += 12
  if (meridiem === 'am' && hour === 12) hour = 0
  return hour * 60 + minute
}

/**
 * Resolves a match's start moment on tournament day. Slot indexes are
 * 15-minute steps from 9:00am; where only a label is known ("2:15pm") it is
 * converted to the same offset, so both data sources land on one timeline.
 */
export function matchStartIso(
  match: Pick<PublicMatch, 'slotIndex' | 'slotLabel'>,
  tournamentDateIso: string = TOURNAMENT_DATE,
): string | null {
  const base = new Date(tournamentDateIso)
  if (Number.isNaN(base.getTime())) return null

  let offsetMinutes: number | null = null
  if (match.slotIndex != null) {
    offsetMinutes = match.slotIndex * SLOT_MINUTES
  } else {
    const minutes = parseSlotLabel(match.slotLabel)
    if (minutes != null) offsetMinutes = minutes - FIRST_SLOT_HOUR * 60
  }
  if (offsetMinutes == null) return null
  return new Date(base.getTime() + offsetMinutes * 60_000).toISOString()
}

export interface CountdownView {
  /** Milliseconds until the target; negative once it has passed. */
  msUntil: number
  /** Short human label, e.g. "22 min", "2h 15m", "104 days". */
  text: string
  /** Inside the arrive-by window (or already started) — show the red warning. */
  urgent: boolean
  started: boolean
}

/** Formats a duration for the "you're on in…" badge. Never returns a bare number. */
export function formatCountdown(msUntil: number): CountdownView {
  const started = msUntil <= 0
  const abs = Math.abs(msUntil)
  const minutes = Math.floor(abs / 60_000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  let text: string
  if (minutes < 1) text = started ? 'now' : 'under a minute'
  else if (minutes < 60) text = `${minutes} min`
  else if (hours < 24) text = `${hours}h ${minutes % 60}m`
  else text = `${days} day${days === 1 ? '' : 's'}`

  if (started && minutes >= 1) text = `${text} ago`

  return {
    msUntil,
    text,
    urgent: msUntil <= ARRIVE_BEFORE_MINUTES * 60_000,
    started,
  }
}

/** Countdown to a fixture, resolved against tournament day. */
export function fixtureCountdown(
  match: Pick<PublicMatch, 'slotIndex' | 'slotLabel'>,
  now: number,
  tournamentDateIso: string = TOURNAMENT_DATE,
): (CountdownView & { targetIso: string }) | null {
  const iso = matchStartIso(match, tournamentDateIso)
  if (!iso) return null
  return { ...formatCountdown(new Date(iso).getTime() - now), targetIso: iso }
}

// ---------------------------------------------------------------------------
// Standings / record / the top-4 cut
// ---------------------------------------------------------------------------

export interface PlayerRecord {
  played: number
  wins: number
  losses: number
  pointsFor: number
  pointsAgainst: number
  pointDiff: number
}

export const EMPTY_RECORD: PlayerRecord = {
  played: 0,
  wins: 0,
  losses: 0,
  pointsFor: 0,
  pointsAgainst: 0,
  pointDiff: 0,
}

/**
 * Round-robin standings recomputed from the fixtures the dashboard is
 * showing, so the table can never disagree with the match list above it.
 */
export function standingsFromMatches(
  matches: readonly PublicMatch[],
  divisionSlug: string,
): StandingRow[] {
  const teamIds: TeamId[] = []
  const played: PlayedMatch[] = []

  for (const match of matches) {
    if (match.division !== divisionSlug) continue
    for (const team of [match.teamA, match.teamB]) {
      if (team && !teamIds.includes(team.id)) teamIds.push(team.id)
    }
    if (match.stage !== 'elims') continue
    if (!match.teamA || !match.teamB) continue
    // Anything with a result counts. This deliberately includes retirements
    // and walkovers: they have a winner, and dropping them would understate a
    // pair's win count — the very number that decides the top four.
    if (!isMatchDecided(match.status)) continue
    played.push({
      teamA: match.teamA.id,
      teamB: match.teamB.id,
      pointsA: match.scoreA,
      pointsB: match.scoreB,
      forfeitedBy: match.forfeitedBy,
      // Essential for a retirement, whose score stops short of the target and
      // so cannot decide itself. Also covers the case where the pair that
      // retired was ahead at the time.
      winner: match.winnerTeamId,
    })
  }

  if (teamIds.length === 0) return []
  return computeStandings(teamIds, played, DEFAULT_ELIMS_RULES)
}

/** The player's own W–L / point-difference line. */
export function recordFor(standings: readonly StandingRow[], teamId: TeamId | null): PlayerRecord {
  const row = standings.find((r) => r.teamId === teamId)
  if (!row) return EMPTY_RECORD
  return {
    played: row.played,
    wins: row.wins,
    losses: row.losses,
    pointsFor: row.pointsFor,
    pointsAgainst: row.pointsAgainst,
    pointDiff: row.pointDiff,
  }
}

export interface CutView {
  rank: number
  /** Currently inside the top 4. */
  inCut: boolean
  wins: number
  /** Wins needed to draw level with the last qualifying pair (0 when inside). */
  winsBehind: number
  /** Wins in hand over the first pair outside the cut (0 when outside). */
  winsClear: number
  /** Round-robin games this pair still has to play. */
  gamesRemaining: number
  /** Festive, plain-English summary for the card. */
  message: string
}

/**
 * How far the player is from the semi-final cut: their rank, the gap in
 * wins to (or over) the cut line, and what that means with the games they
 * have left.
 */
export function distanceToCut(
  standings: readonly StandingRow[],
  teamId: TeamId | null,
  gamesRemaining: number,
  cut: number = TOP_FOUR_CUT,
): CutView | null {
  const row = standings.find((r) => r.teamId === teamId)
  if (!row) return null

  const lastIn = standings[Math.min(cut, standings.length) - 1]
  const firstOut = standings[cut]
  const inCut = row.rank <= cut

  const winsBehind = inCut ? 0 : Math.max(0, (lastIn?.wins ?? 0) - row.wins)
  const winsClear = inCut ? Math.max(0, row.wins - (firstOut?.wins ?? 0)) : 0

  let message: string
  if (inCut && gamesRemaining === 0) {
    message = `Rank ${row.rank} — you're through to the semis! 🎄`
  } else if (inCut) {
    message =
      winsClear > 0
        ? `Rank ${row.rank} — ${winsClear} win${winsClear === 1 ? '' : 's'} clear of 5th with ${gamesRemaining} to play.`
        : `Rank ${row.rank} — level on wins with 5th, so every point counts.`
  } else if (gamesRemaining === 0) {
    message = `Rank ${row.rank} — no semis this year, but what a day of badminton.`
  } else if (winsBehind === 0) {
    message = `Rank ${row.rank} — level on wins with 4th, split by the tiebreakers. Win out!`
  } else if (winsBehind > gamesRemaining) {
    message = `Rank ${row.rank} — ${winsBehind} wins off the top 4 with only ${gamesRemaining} to play. Play for pride and point difference!`
  } else {
    message = `Rank ${row.rank} — ${winsBehind} win${winsBehind === 1 ? '' : 's'} off the top 4 with ${gamesRemaining} still to play.`
  }

  return { rank: row.rank, inCut, wins: row.wins, winsBehind, winsClear, gamesRemaining, message }
}

/** Round-robin games this pair has not yet played. */
export function gamesRemaining(fixtures: readonly PlayerFixture[]): number {
  return fixtures.filter((f) => f.match.stage === 'elims' && f.outcome === 'upcoming').length
}

export type Podium = 'champion' | 'runner_up' | 'third' | 'fourth' | null

/** Final placing for this pair, derived from their knockout results. */
export function podiumFor(fixtures: readonly PlayerFixture[], teamId: TeamId | null): Podium {
  if (!teamId) return null
  const decided = (stage: MatchStage) =>
    fixtures.find((f) => f.match.stage === stage && isDecidedOutcome(f.outcome))
  const final = decided('final')
  if (final) return isWinOutcome(final.outcome) ? 'champion' : 'runner_up'
  const third = decided('third_place')
  if (third) return isWinOutcome(third.outcome) ? 'third' : 'fourth'
  return null
}

// ---------------------------------------------------------------------------
// Registration + payment status
// ---------------------------------------------------------------------------

export interface RegistrationSnapshot {
  status: RegistrationStatus | null
  payment: PaymentStatus | null
  amountDueCents: number
  amountPaidCents: number
  divisionName: string | null
}

export type StatusTone = 'success' | 'pending' | 'warn' | 'danger' | 'info'

export interface StatusView {
  tone: StatusTone
  label: string
  message: string
  /** Call-to-action copy, when there is something for the player to do. */
  nudge: string | null
  href: string | null
  actionLabel: string | null
}

/** The "are you actually in?" line: approved / pending / waitlisted / not registered. */
export function registrationStatusView(status: RegistrationStatus | null): StatusView {
  switch (status) {
    case 'approved':
      return {
        tone: 'success',
        label: 'Approved',
        message: 'You’re in! Your spot on the draw is locked in. 🎄',
        nudge: null,
        href: null,
        actionLabel: null,
      }
    case 'pending':
      return {
        tone: 'pending',
        label: 'Pending review',
        message: 'The committee has your entry and is checking it over.',
        // No mailer exists, so nothing here may promise one. This page is
        // where the answer appears.
        nudge: 'Nothing to do — this card updates as soon as the committee decides.',
        href: '/register',
        actionLabel: 'Review your entry',
      }
    case 'waitlisted':
      return {
        tone: 'warn',
        label: 'Waitlisted',
        message: 'Your division filled up, so you’re first in line if a spot opens.',
        nudge: 'Keep your Sunday free and check back here — waitlist spots often come good.',
        href: '/register',
        actionLabel: 'Check your entry',
      }
    case 'rejected':
      return {
        tone: 'danger',
        label: 'Not accepted',
        message: 'This entry wasn’t accepted. Have a chat with the organisers.',
        // "Try again" pointed at /register, where `unique (division_id,
        // player_id)` refuses a second entry and the submit button is
        // permanently disabled. Only the committee can reopen the existing
        // row, so send the player to the people who can actually do it.
        nudge: 'Only the committee can reopen this entry — a fresh one for the same division is refused.',
        href: '/#contact',
        actionLabel: 'Contact the committee',
      }
    default:
      return {
        tone: 'info',
        label: 'Not registered yet',
        message: 'You haven’t entered the Christmas Mini Tournament yet.',
        nudge: 'Grab your partner and claim a spot before they’re gone!',
        href: '/register',
        actionLabel: 'Register now',
      }
  }
}

export function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`
}

/** The "have you paid?" line, including part-payments. */
export function paymentStatusView(snapshot: RegistrationSnapshot): StatusView {
  const { payment, amountDueCents, amountPaidCents } = snapshot
  const outstanding = Math.max(0, amountDueCents - amountPaidCents)

  if (payment === 'paid') {
    return {
      tone: 'success',
      label: 'Paid',
      message: `Entry fee received — thank you! ${formatMoney(amountPaidCents)} all squared away.`,
      nudge: null,
      href: null,
      actionLabel: null,
    }
  }
  if (payment === 'partial') {
    return {
      tone: 'warn',
      label: 'Part paid',
      message: `${formatMoney(amountPaidCents)} received, ${formatMoney(outstanding)} still to go.`,
      nudge: 'Settle the balance before tournament day so you’re on the draw.',
      href: '/pay',
      actionLabel: 'Payment details',
    }
  }
  return {
    tone: 'danger',
    label: 'Unpaid',
    message:
      amountDueCents > 0
        ? `${formatMoney(amountDueCents)} entry fee is still outstanding.`
        : 'Your entry fee hasn’t been recorded yet.',
    nudge: 'Pay the organisers to confirm your spot — unpaid entries can be released.',
    href: '/pay',
    actionLabel: 'How to pay',
  }
}

// ---------------------------------------------------------------------------
// Whole-page state
// ---------------------------------------------------------------------------

export type DashboardStage =
  | 'not-registered'
  | 'awaiting-draw'
  | 'tournament-day'
  | 'finished'

/**
 * Which of the four festive dashboard treatments to render. Each state gets
 * its own hero copy — no blank pages.
 */
export function dashboardStage(input: {
  registered: boolean
  hasTeam: boolean
  fixtures: readonly PlayerFixture[]
}): DashboardStage {
  if (!input.registered && !input.hasTeam) return 'not-registered'
  if (input.fixtures.length === 0) return 'awaiting-draw'
  const anyPending = input.fixtures.some((f) => !isDecidedOutcome(f.outcome))
  return anyPending ? 'tournament-day' : 'finished'
}

export interface PlayerDashboard {
  stage: DashboardStage
  team: PublicTeam | null
  partnerNames: string[]
  division: PublicDivisionInfo | null
  fixtures: PlayerFixture[]
  next: PlayerFixture | null
  live: PlayerFixture | null
  countdown: (CountdownView & { targetIso: string }) | null
  duties: PlayerDuty[]
  duty: PlayerDuty | null
  dutyCountdown: (CountdownView & { targetIso: string }) | null
  doubleBooked: boolean
  standings: StandingRow[]
  record: PlayerRecord
  cut: CutView | null
  gamesLeft: number
  podium: Podium
  celebrate: boolean
  registrationView: StatusView
  paymentView: StatusView | null
}

export interface DashboardInput {
  player: PlayerIdentity
  matches: readonly PublicMatch[]
  divisions: readonly PublicDivisionInfo[]
  registration: RegistrationSnapshot | null
  /** Resolved by the caller (never `Date.now()` inside a component). */
  now: number
  tournamentDateIso?: string
}

/** One call that turns raw public data into everything `/dashboard` renders. */
export function buildPlayerDashboard(input: DashboardInput): PlayerDashboard {
  const { player, matches, divisions, registration, now } = input
  const tournamentDateIso = input.tournamentDateIso ?? TOURNAMENT_DATE

  const team = findPlayerTeam(matches, player)
  const division = team ? (divisions.find((d) => d.slug === team.division) ?? null) : null
  const fixtures = playerFixtures(matches, team?.id ?? null)
  const next = nextFixture(fixtures)
  const live = liveFixture(fixtures)
  const duties = playerDuties(matches, player, team?.id ?? null)
  const duty = nextDuty(duties)
  const standings = team ? standingsFromMatches(matches, team.division) : []
  const gamesLeft = gamesRemaining(fixtures)
  const podium = podiumFor(fixtures, team?.id ?? null)

  const partnerNames = (team?.players ?? [])
    .filter((p) => p.id !== player.id && p.name.trim().toLowerCase() !== player.name.trim().toLowerCase())
    .map((p) => p.name)

  const lastResult = [...fixtures].reverse().find((f) => isWinOutcome(f.outcome))
  const celebrate =
    podium === 'champion' ||
    podium === 'third' ||
    (lastResult != null && fixtures.every((f) => isDecidedOutcome(f.outcome)))

  return {
    stage: dashboardStage({ registered: registration?.status != null, hasTeam: team != null, fixtures }),
    team,
    partnerNames,
    division,
    fixtures,
    next,
    live,
    countdown: next ? fixtureCountdown(next.match, now, tournamentDateIso) : null,
    duties,
    duty,
    dutyCountdown: duty ? fixtureCountdown(duty.match, now, tournamentDateIso) : null,
    doubleBooked: isDoubleBooked(next, duty),
    standings,
    record: recordFor(standings, team?.id ?? null),
    cut: distanceToCut(standings, team?.id ?? null, gamesLeft),
    gamesLeft,
    podium,
    celebrate,
    registrationView: registrationStatusView(registration?.status ?? null),
    paymentView: registration ? paymentStatusView(registration) : null,
  }
}

// ---------------------------------------------------------------------------
// Demo mode helpers
// ---------------------------------------------------------------------------

/**
 * Demo-only: replays the bundled demo schedule as it looked earlier in the
 * day, so a reviewer sees a *live* dashboard (a match in progress, upcoming
 * fixtures and a pending duty) instead of a finished one.
 *
 * Matches before `cursorSlot` keep their real result; the match on the
 * cursor becomes "in progress" with a plausible partial score; everything
 * after is reset to a clean upcoming fixture. Never used when Supabase is
 * configured.
 */
export function rewindSchedule(matches: readonly PublicMatch[], cursorSlot: number): PublicMatch[] {
  return matches.map((match) => {
    const slot = match.slotIndex
    if (slot == null || slot < cursorSlot) return match

    if (slot === cursorSlot) {
      const cap = Math.max(0, match.pointsToWin - 2)
      return {
        ...match,
        status: 'in_progress' as const,
        scoreA: Math.min(match.scoreA, cap),
        scoreB: Math.min(match.scoreB, cap),
        forfeitedBy: null,
        winnerTeamId: null,
      }
    }

    return {
      ...match,
      status: 'scheduled' as const,
      scoreA: 0,
      scoreB: 0,
      forfeitedBy: null,
      winnerTeamId: null,
    }
  })
}

/** Demo-only: the wall clock that matches `rewindSchedule(matches, cursorSlot)`. */
export function demoClock(
  cursorSlot: number,
  minutesIntoSlot = 8,
  tournamentDateIso: string = TOURNAMENT_DATE,
): number {
  return (
    new Date(tournamentDateIso).getTime() + (cursorSlot * SLOT_MINUTES + minutesIntoSlot) * 60_000
  )
}
