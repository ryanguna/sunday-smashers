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

import {
  getTournamentPhase,
  type TournamentDates,
  type TournamentPhase,
} from '@/lib/tournament'
import type { DivisionGender, RegistrationStatus } from '@/lib/supabase/types'

// ---------------------------------------------------------------------------
// Options / constants
// ---------------------------------------------------------------------------

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

export interface RegistrationWindowOptions {
  /** Dates from the tournament row; defaults to the seeded constants. */
  dates?: TournamentDates
  /**
   * The organiser's explicit switch (`tournaments.is_registration_open`).
   *
   * `null`/`undefined` means "no tournament row yet, or the organisers have
   * expressed no opinion" — the calendar alone decides, exactly as before.
   *
   * When set, it OVERRIDES the calendar. This is the whole point: the
   * committee needs to open the sheet early for a test run, or slam it shut
   * the moment the draw is built, without waiting for a date to roll around
   * or shipping a code change. The calendar is the default; the switch is the
   * organiser saying otherwise.
   *
   * Note it can only ever flip between "open" and "closed" — it cannot
   * resurrect registration once the tournament itself has started, because at
   * that point there is nothing left to register for.
   */
  isRegistrationOpen?: boolean | null
}

/**
 * Maps the site-wide tournament phase onto the three registration states the
 * `/register` page cares about. Pure — pass an explicit `now` in tests.
 */
export function getRegistrationWindow(
  now: Date,
  options: RegistrationWindowOptions | TournamentDates = {},
): RegistrationWindowInfo {
  // Accept a bare `TournamentDates` too, so existing callers keep working.
  const opts: RegistrationWindowOptions =
    'preRegistrationOpensAt' in options ? { dates: options } : options
  const phaseInfo = getTournamentPhase(now, opts.dates)
  const base = registrationWindowForPhase(phaseInfo)
  return applyOrganiserSwitch(base, phaseInfo, opts.isRegistrationOpen)
}

/**
 * Lets the organiser's switch override the calendar, in the one place the
 * window is decided so the page, the form guard and the server action can
 * never disagree about whether the sheet is open.
 */
function applyOrganiserSwitch(
  info: RegistrationWindowInfo,
  phaseInfo: ReturnType<typeof getTournamentPhase>,
  isRegistrationOpen: boolean | null | undefined,
): RegistrationWindowInfo {
  if (isRegistrationOpen == null) return info
  if (phaseInfo.phase === 'tournament-day-or-later') return info

  if (isRegistrationOpen && info.window !== 'open') {
    return {
      ...info,
      window: 'open',
      heading: 'Registration is OPEN — grab your spot!',
      message:
        'The organisers have opened the sheet early. Fill in the form below — the committee sorts out the pairs — and we’ll see you on court in December.',
      acceptsSubmissions: true,
    }
  }

  if (!isRegistrationOpen && info.window === 'open') {
    return {
      ...info,
      window: 'closed',
      heading: 'Registration is paused',
      message:
        'The organisers have closed the sheet for now — the draw may be being built. Pop your name on the waitlist and we’ll call you in the moment a spot opens up 🎅',
      acceptsSubmissions: true,
    }
  }

  return info
}

/** "6 September 2026", in Sydney time, from an ISO instant. */
function formatOpeningDate(iso: string | null): string {
  if (!iso) return 'soon'
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return 'soon'
  return parsed.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Australia/Sydney',
  })
}

function registrationWindowForPhase(
  phaseInfo: ReturnType<typeof getTournamentPhase>,
): RegistrationWindowInfo {
  switch (phaseInfo.phase) {
    case 'before-pre-registration':
      return {
        window: 'not-open-yet',
        phase: phaseInfo.phase,
        countdownTarget: phaseInfo.countdownTarget,
        countdownLabel: phaseInfo.countdownLabel,
        heading: 'The sign-up sheet is still in Santa’s sack',
        // Derived, never written out: the opening date is configurable, so
        // quoting a fixed one here would start lying the moment an organiser
        // changed it in the admin console.
        message: `Pre-registration opens on ${formatOpeningDate(phaseInfo.countdownTarget)}. Set a reminder, stretch that wrist, and start sweet-talking a partner 🎄🏸`,
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
          'Fill in the form below — the committee sorts out the pairs — and we’ll see you on court in December.',
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
// Validation
// ---------------------------------------------------------------------------

/**
 * What the registration wizard collects.
 *
 * `nominatedPartner` is a **nomination, not an invitation**. Nothing is sent,
 * nobody has to accept, and the pairing is not created by it: the committee
 * still builds every pair on `/admin/teams`. It exists because men entering
 * together want to say so, and writing a name into the notes the committee
 * already reads is the whole of that requirement. The `partner_invites` flow
 * that used to do this — with acceptances, expiry and a second player blocked
 * on the first — is gone.
 */
export interface RegistrationFormValues {
  divisionId: string
  /** Free text: who this player would like to be paired with. Optional. */
  nominatedPartner: string
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
  nominatedPartner: '',
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

/** Long enough for "Rudolph Reindeer (0400 000 000)", short enough to stay one line in the admin table. */
export const MAX_NOMINATED_PARTNER_LENGTH = 80

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

  if (values.nominatedPartner.trim().length > MAX_NOMINATED_PARTNER_LENGTH) {
    errors.nominatedPartner = `Just their name is plenty — keep it under ${MAX_NOMINATED_PARTNER_LENGTH} characters.`
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
  /**
   * Free-text nomination from the entry form. Optional — an entry without one
   * is a free agent, which is the normal case.
   */
  nominatedPartner?: string
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

  const nominated = (input.nominatedPartner ?? '').trim()
  if (nominated.length > 0) {
    // A nomination, not a confirmed pairing — the committee still decides.
    lines.push(`Partner nominated: ${nominated} (committee to confirm)`)
  } else {
    lines.push('Partner: FREE AGENT — happy to be paired by the committee.')
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

/**
 * Copy for the confirmation screen, driven by the persisted status so the
 * waitlist path never claims the player is in the draw.
 *
 * `tournamentDayMonth` is the organiser's saved date already formatted in
 * day-and-month form. It used to be typed straight in here, which
 * meant moving the tournament in Settings left this screen telling players to
 * watch their phone in the wrong week. Empty falls back to "tournament day",
 * which is vaguer but never wrong.
 */
export function confirmationCopy(
  status: RegistrationStatus,
  tournamentDayMonth = '',
): {
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
        // There is no mailer in this project, so the waitlist cannot be
        // announced by email. The dashboard is the honest channel.
        'Watch your dashboard — your status changes there the moment a spot opens.',
        `Keep your phone handy in the week before ${tournamentDayMonth || 'tournament day'}.`,
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
      'The committee pairs you up behind the scenes — your partner appears on your dashboard once they do.',
      'Once approved you’ll be added to the group chat on Messenger, and your team, court times and duty roster show up on your dashboard.',
    ],
  }
}
