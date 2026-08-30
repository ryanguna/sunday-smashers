/**
 * Pure registration logic for the Sunday Smashers Christmas Mini Tournament.
 *
 * Everything in this file is deterministic and dependency-free (no Supabase,
 * no `next/*`, no React) so it can be unit tested in `registration.test.ts`
 * *and* imported from both Server and Client Components. All Supabase reads
 * and writes live in `src/components/registration/data.ts`.
 *
 * Rules encoded here:
 *   - the registration window is derived from `getTournamentPhase()` — the
 *     dates are never re-hardcoded;
 *   - a division has a *team* cap (`divisions.max_teams`), which we convert
 *     into player slots (doubles ⇒ 2 players per team);
 *   - once the window closes OR the division is full, players may still
 *     register but land on the waitlist (`status: 'waitlisted'`);
 *   - the same player may never hold two registrations in one division.
 */

import { getTournamentPhase, type TournamentPhase } from '@/lib/tournament'
import type { DivisionGender, PartnerInviteStatus, RegistrationStatus } from '@/lib/supabase/types'

// ---------------------------------------------------------------------------
// Options / constants
// ---------------------------------------------------------------------------

export const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'] as const
export type ShirtSize = (typeof SHIRT_SIZES)[number]

export const SKILL_LEVELS = [
  { value: 'beginner', label: 'Beginner — here for the loot bag 🎁' },
  { value: 'intermediate', label: 'Intermediate — a solid rally merchant' },
  { value: 'advanced', label: 'Advanced — the smash is real' },
  { value: 'open', label: 'Open — sponsor me, Santa 🏆' },
] as const
export type SkillLevel = (typeof SKILL_LEVELS)[number]['value']

export type ProfileGender = 'male' | 'female' | 'other' | 'prefer_not_to_say' | null | undefined

/** Doubles pairs, so every team consumes two player slots. */
export const PLAYERS_PER_TEAM = 2

// ---------------------------------------------------------------------------
// Registration window
// ---------------------------------------------------------------------------

export type RegistrationWindow = 'not-open-yet' | 'open' | 'closed'

export interface RegistrationWindowInfo {
  window: RegistrationWindow
  phase: TournamentPhase
  /** Moment to count down to, or `null` when there is nothing left to await. */
  countdownTarget: string | null
  countdownLabel: string
  heading: string
  /** Festive supporting copy for the state card. */
  message: string
  /** True when players can still submit *something* (a real entry or a waitlist entry). */
  acceptsSubmissions: boolean
}

/**
 * Maps the site-wide tournament phase onto the three registration states the
 * `/register` page cares about. Pure — pass an explicit `now` in tests.
 */
export function getRegistrationWindow(now: Date): RegistrationWindowInfo {
  const phaseInfo = getTournamentPhase(now)

  switch (phaseInfo.phase) {
    case 'before-pre-registration':
      return {
        window: 'not-open-yet',
        phase: phaseInfo.phase,
        countdownTarget: phaseInfo.countdownTarget,
        countdownLabel: phaseInfo.countdownLabel,
        heading: 'The sign-up sheet is still in Santa’s sack',
        message:
          'Pre-registration opens on 6 September 2026. Set a reminder, stretch that wrist, and start sweet-talking a partner 🎄🏸',
        acceptsSubmissions: false,
      }
    case 'registration-open':
      return {
        window: 'open',
        phase: phaseInfo.phase,
        countdownTarget: phaseInfo.countdownTarget,
        countdownLabel: phaseInfo.countdownLabel,
        heading: 'Registration is OPEN — grab your spot!',
        message:
          'Fill in the form below, bring a partner (or let us find you one), and we’ll see you on court in December.',
        acceptsSubmissions: true,
      }
    case 'registration-closed':
      return {
        window: 'closed',
        phase: phaseInfo.phase,
        countdownTarget: phaseInfo.countdownTarget,
        countdownLabel: phaseInfo.countdownLabel,
        heading: 'Registration has closed — but the waitlist is open',
        message:
          'The draw is being finalised. Pop your name on the waitlist and we’ll call you in the moment a spot opens up 🎅',
        acceptsSubmissions: true,
      }
    case 'tournament-day-or-later':
    default:
      return {
        window: 'closed',
        phase: phaseInfo.phase,
        countdownTarget: null,
        countdownLabel: '',
        heading: 'The shuttles are already flying',
        message:
          'This year’s tournament is under way (or already in the highlight reel). Follow the live scores and we’ll see you next Christmas! 🏸',
        acceptsSubmissions: false,
      }
  }
}

// ---------------------------------------------------------------------------
// Divisions, eligibility and capacity
// ---------------------------------------------------------------------------

export interface DivisionSummary {
  id: string
  name: string
  gender: DivisionGender
  /** `null` means "no cap configured". */
  maxTeams: number | null
  /** How many players already hold a non-waitlisted registration. */
  registeredPlayers: number
}

/**
 * Whether a profile's gender makes them eligible for a division. `mixed` and
 * `open` divisions are always eligible; a missing/undisclosed gender is
 * treated as eligible for everything so nobody is ever blocked by a field
 * they chose not to answer (an admin reviews every entry anyway).
 */
export function isDivisionEligible(divisionGender: DivisionGender, profileGender: ProfileGender): boolean {
  if (divisionGender === 'mixed' || divisionGender === 'open') return true
  if (!profileGender || profileGender === 'other' || profileGender === 'prefer_not_to_say') return true
  if (divisionGender === 'mens') return profileGender === 'male'
  if (divisionGender === 'womens') return profileGender === 'female'
  return true
}

/** Friendly explanation for a division the player can't enter. */
export function divisionEligibilityHint(divisionGender: DivisionGender): string {
  if (divisionGender === 'mens') return 'Your profile says this isn’t your division — Men’s Doubles only.'
  if (divisionGender === 'womens') return 'Your profile says this isn’t your division — Women’s Doubles only.'
  return 'Not available for your profile.'
}

export interface CapacityInfo {
  /** Total player slots (`maxTeams × 2`), or `null` when uncapped. */
  playerCapacity: number | null
  registeredPlayers: number
  /** Slots left, clamped at 0. `null` when uncapped. */
  spotsRemaining: number | null
  isFull: boolean
  /** 0–100, or `null` when uncapped. */
  percentFull: number | null
  /** Ready-to-render festive label. */
  label: string
}

export function divisionCapacity(division: Pick<DivisionSummary, 'maxTeams' | 'registeredPlayers'>): CapacityInfo {
  const registeredPlayers = Math.max(0, Math.floor(division.registeredPlayers))

  if (division.maxTeams === null || division.maxTeams <= 0) {
    return {
      playerCapacity: null,
      registeredPlayers,
      spotsRemaining: null,
      isFull: false,
      percentFull: null,
      label: `${registeredPlayers} player${registeredPlayers === 1 ? '' : 's'} signed up so far`,
    }
  }

  const playerCapacity = division.maxTeams * PLAYERS_PER_TEAM
  const spotsRemaining = Math.max(0, playerCapacity - registeredPlayers)
  const isFull = spotsRemaining === 0
  const percentFull = Math.min(100, Math.round((registeredPlayers / playerCapacity) * 100))

  return {
    playerCapacity,
    registeredPlayers,
    spotsRemaining,
    isFull,
    percentFull,
    label: isFull
      ? 'Full — waitlist only 🎟️'
      : `${spotsRemaining} spot${spotsRemaining === 1 ? '' : 's'} left of ${playerCapacity}`,
  }
}

// ---------------------------------------------------------------------------
// Outcome (register vs waitlist vs blocked)
// ---------------------------------------------------------------------------

export type RegistrationIntent = 'register' | 'waitlist' | 'blocked'

export interface RegistrationOutcome {
  allowed: boolean
  intent: RegistrationIntent
  /** The `registrations.status` value to persist. */
  status: RegistrationStatus
  /** Festive explanation shown above the form / on the button. */
  reason: string
  /** Call-to-action label for the submit button. */
  submitLabel: string
}

export interface RegistrationOutcomeInput {
  window: RegistrationWindow
  /** True when the chosen division has no player slots left. */
  divisionFull: boolean
  /** True when this player already has a registration in the chosen division. */
  alreadyRegistered: boolean
}

/**
 * Decides what happens when this player submits: a normal pending entry, a
 * waitlist entry, or nothing at all.
 */
export function decideRegistrationOutcome(input: RegistrationOutcomeInput): RegistrationOutcome {
  if (input.alreadyRegistered) {
    return {
      allowed: false,
      intent: 'blocked',
      status: 'pending',
      reason: 'You’re already on the list for this division — one entry per player, even at Christmas 🎄',
      submitLabel: 'Already registered',
    }
  }

  if (input.window === 'not-open-yet') {
    return {
      allowed: false,
      intent: 'blocked',
      status: 'pending',
      reason: 'Registration hasn’t opened yet — the shuttles are still warming up.',
      submitLabel: 'Not open yet',
    }
  }

  if (input.window === 'closed' || input.divisionFull) {
    return {
      allowed: true,
      intent: 'waitlist',
      status: 'waitlisted',
      reason: input.divisionFull
        ? 'This division is full, but the waitlist is open — you’re first in line if someone drops out.'
        : 'Registration has closed, so this will be a waitlist entry.',
      submitLabel: 'Join the waitlist',
    }
  }

  return {
    allowed: true,
    intent: 'register',
    status: 'pending',
    reason: 'Your entry goes to the committee for approval — usually within a couple of days.',
    submitLabel: 'Send my registration 🎄',
  }
}

// ---------------------------------------------------------------------------
// Partner identifier parsing
// ---------------------------------------------------------------------------

export type PartnerMode = 'partner' | 'solo'

export type PartnerIdentifier =
  | { kind: 'empty' }
  | { kind: 'email'; email: string }
  | { kind: 'handle'; handle: string }
  | { kind: 'invalid' }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const HANDLE_PATTERN = /^[a-z0-9][a-z0-9._-]{1,29}$/

/**
 * Accepts either an email address or a player handle (the profile nickname,
 * optionally `@`-prefixed). Emails are lower-cased, handles stripped of the
 * leading `@` and lower-cased.
 */
export function parsePartnerIdentifier(raw: string): PartnerIdentifier {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return { kind: 'empty' }

  if (trimmed.includes('@') && !trimmed.startsWith('@')) {
    return EMAIL_PATTERN.test(trimmed) ? { kind: 'email', email: trimmed.toLowerCase() } : { kind: 'invalid' }
  }

  const handle = trimmed.replace(/^@+/, '').toLowerCase()
  return HANDLE_PATTERN.test(handle) ? { kind: 'handle', handle } : { kind: 'invalid' }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface RegistrationFormValues {
  divisionId: string
  partnerMode: PartnerMode
  partnerIdentifier: string
  shirtSize: string
  skillLevel: string
  phone: string
  emergencyContactName: string
  emergencyContactPhone: string
  dietaryNotes: string
  codeOfConductAccepted: boolean
}

export type RegistrationFormErrors = Partial<Record<keyof RegistrationFormValues, string>>

export const EMPTY_REGISTRATION_FORM: RegistrationFormValues = {
  divisionId: '',
  partnerMode: 'partner',
  partnerIdentifier: '',
  shirtSize: '',
  skillLevel: '',
  phone: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  dietaryNotes: '',
  codeOfConductAccepted: false,
}

/** Digits-only length check — tolerant of spaces, `+`, dashes and brackets. */
export function isValidPhone(raw: string): boolean {
  const digits = (raw ?? '').replace(/\D/g, '')
  return digits.length >= 8 && digits.length <= 15
}

export interface ValidationContext {
  /** Divisions the player may actually pick (already filtered for eligibility). */
  eligibleDivisionIds: string[]
  /** The signed-in player's own email — used to block self-invites. */
  selfEmail?: string | null
  /** The signed-in player's own handle/nickname — also blocked as a partner. */
  selfHandle?: string | null
  /** Maximum length of the free-text notes field. */
  maxNotesLength?: number
}

export const MAX_NOTES_LENGTH = 500

/**
 * Validates the whole form in one pass and returns festive, human error
 * messages keyed by field. An empty object means "good to go".
 */
export function validateRegistrationForm(
  values: RegistrationFormValues,
  context: ValidationContext
): RegistrationFormErrors {
  const errors: RegistrationFormErrors = {}
  const maxNotes = context.maxNotesLength ?? MAX_NOTES_LENGTH

  if (!values.divisionId) {
    errors.divisionId = 'Pick a division — Men’s or Women’s Doubles.'
  } else if (!context.eligibleDivisionIds.includes(values.divisionId)) {
    errors.divisionId = 'That division isn’t open to you. Pick one of the highlighted options.'
  }

  if (values.partnerMode === 'partner') {
    const partner = parsePartnerIdentifier(values.partnerIdentifier)
    if (partner.kind === 'empty') {
      errors.partnerIdentifier = 'Grab a partner — the shuttles are still warming up 🎄'
    } else if (partner.kind === 'invalid') {
      errors.partnerIdentifier = 'That doesn’t look like an email or a player handle. Try “holly@example.com” or “@hollysmash”.'
    } else if (partner.kind === 'email' && context.selfEmail && partner.email === context.selfEmail.trim().toLowerCase()) {
      errors.partnerIdentifier = 'Doubles needs two humans — you can’t partner with yourself 🏸'
    } else if (
      partner.kind === 'handle' &&
      context.selfHandle &&
      partner.handle === context.selfHandle.trim().toLowerCase().replace(/^@+/, '')
    ) {
      errors.partnerIdentifier = 'Doubles needs two humans — you can’t partner with yourself 🏸'
    }
  }

  if (!values.shirtSize) {
    errors.shirtSize = 'Pick a shirt size so your loot bag actually fits 🎁'
  } else if (!(SHIRT_SIZES as readonly string[]).includes(values.shirtSize)) {
    errors.shirtSize = 'That’s not a size we stock — pick one from the list.'
  }

  if (!values.skillLevel) {
    errors.skillLevel = 'Tell us your level so the draw is fair (be honest, Santa is watching 👀).'
  } else if (!SKILL_LEVELS.some((level) => level.value === values.skillLevel)) {
    errors.skillLevel = 'Pick a skill level from the list.'
  }

  if (!values.phone.trim()) {
    errors.phone = 'We need a number to text you your court time.'
  } else if (!isValidPhone(values.phone)) {
    errors.phone = 'That number looks a little short — try 04XX XXX XXX.'
  }

  if (values.emergencyContactName.trim().length < 2) {
    errors.emergencyContactName = 'Who should we call if you dive for a drop shot? 🎅'
  }

  if (!values.emergencyContactPhone.trim()) {
    errors.emergencyContactPhone = 'Add a number for your emergency contact.'
  } else if (!isValidPhone(values.emergencyContactPhone)) {
    errors.emergencyContactPhone = 'That emergency number looks a little short — try 04XX XXX XXX.'
  }

  if (values.dietaryNotes.length > maxNotes) {
    errors.dietaryNotes = `Keep it under ${maxNotes} characters — you can tell us the rest on the day.`
  }

  if (!values.codeOfConductAccepted) {
    errors.codeOfConductAccepted = 'Please accept the code of conduct — good vibes are compulsory 🎄'
  }

  return errors
}

export function hasErrors(errors: RegistrationFormErrors): boolean {
  return Object.keys(errors).length > 0
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

export interface RegistrationNotesInput {
  partnerMode: PartnerMode
  partnerIdentifier: string
  dietaryNotes: string
  codeOfConductAcceptedAt: string
  intent: RegistrationIntent
}

/**
 * `registrations` has a single free-text `notes` column, so the extras the
 * committee needs (partner preference, dietary notes, the code-of-conduct
 * timestamp) are serialised into a stable, human-readable block that admins
 * can read at a glance in the admin table.
 */
export function buildRegistrationNotes(input: RegistrationNotesInput): string {
  const lines: string[] = []

  if (input.partnerMode === 'solo') {
    lines.push('Partner: FREE AGENT — happy to be paired by the committee.')
  } else {
    const partner = parsePartnerIdentifier(input.partnerIdentifier)
    if (partner.kind === 'email') lines.push(`Partner: invited ${partner.email}`)
    else if (partner.kind === 'handle') lines.push(`Partner: invited @${partner.handle}`)
    else lines.push('Partner: requested (details pending)')
  }

  if (input.intent === 'waitlist') {
    lines.push('Waitlist entry — division full or registration closed at time of submission.')
  }

  const dietary = input.dietaryNotes.trim()
  lines.push(`Dietary / notes: ${dietary.length > 0 ? dietary : 'none'}`)
  lines.push(`Code of conduct accepted: ${input.codeOfConductAcceptedAt}`)

  return lines.join('\n')
}

/** True when this player already holds a registration in the given division. */
export function isDuplicateRegistration(
  existing: ReadonlyArray<{ division_id: string }>,
  divisionId: string
): boolean {
  return existing.some((row) => row.division_id === divisionId)
}

/** Doubles team display name, e.g. `Holly & Rudolph`. */
export function buildTeamName(playerA: string, playerB: string): string {
  const a = playerA.trim()
  const b = playerB.trim()
  if (!a && !b) return 'Mystery Pair'
  if (!a) return b
  if (!b) return a
  return `${a} & ${b}`
}

// ---------------------------------------------------------------------------
// Partner invites
// ---------------------------------------------------------------------------

export type InviteTone = 'pending' | 'approved' | 'unpaid' | 'info'

export interface InviteDescription {
  label: string
  tone: InviteTone
  /** True when the invitee can still accept/decline. */
  actionable: boolean
  blurb: string
}

export function describeInvite(status: PartnerInviteStatus): InviteDescription {
  switch (status) {
    case 'pending':
      return {
        label: 'Waiting on you',
        tone: 'pending',
        actionable: true,
        blurb: 'Say yes and you’re a pair — say no and we’ll let them down gently.',
      }
    case 'accepted':
      return {
        label: 'Accepted',
        tone: 'approved',
        actionable: false,
        blurb: 'You’re paired up! Your team is heading to the committee for approval 🎉',
      }
    case 'declined':
      return {
        label: 'Declined',
        tone: 'unpaid',
        actionable: false,
        blurb: 'No hard feelings — there are plenty of shuttles in the tube.',
      }
    case 'expired':
      return {
        label: 'Expired',
        tone: 'info',
        actionable: false,
        blurb: 'This invite timed out. Ask them to send a fresh one.',
      }
    case 'cancelled':
    default:
      return {
        label: 'Cancelled',
        tone: 'info',
        actionable: false,
        blurb: 'The inviter withdrew this one.',
      }
  }
}

/** Guards the accept/decline actions — only a pending invite can be answered. */
export function canRespondToInvite(invite: { status: PartnerInviteStatus }): boolean {
  return invite.status === 'pending'
}

/**
 * Copy for the confirmation screen, driven by the persisted status so the
 * waitlist path never claims the player is in the draw.
 */
export function confirmationCopy(status: RegistrationStatus): {
  eyebrow: string
  title: string
  message: string
  nextSteps: string[]
} {
  if (status === 'waitlisted') {
    return {
      eyebrow: 'You’re on the list',
      title: 'Waitlisted — and first in line',
      message:
        'The division is full (or registration has closed), so we’ve saved your details at the top of the waitlist.',
      nextSteps: [
        'We’ll email you the moment a spot opens up.',
        'Keep your phone handy in the week before 13 December.',
        'Your partner invite (if you sent one) still stands.',
      ],
    }
  }

  return {
    eyebrow: 'Ho ho ho!',
    title: 'You’re in the queue for the draw',
    message:
      'Your registration is in and pending committee approval — usually a couple of days, sometimes a mince pie or two.',
    nextSteps: [
      'The committee reviews and approves your entry.',
      'If you invited a partner, they need to accept before your pair is locked in.',
      'Once approved you’ll see your team, court times and duty roster on your dashboard.',
    ],
  }
}
