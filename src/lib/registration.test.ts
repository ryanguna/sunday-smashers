import { describe, expect, it } from 'vitest'
import {
  buildRegistrationNotes,
  buildTeamName,
  confirmationCopy,
  decideRegistrationOutcome,
  divisionCapacity,
  divisionEligibilityHint,
  EMPTY_REGISTRATION_FORM,
  getRegistrationWindow,
  hasErrors,
  isDivisionEligible,
  isDuplicateRegistration,
  isValidPhone,
  MAX_NOTES_LENGTH,
  validateRegistrationForm,
  type RegistrationFormValues,
} from './registration'
import {
  PRE_REGISTRATION_OPENS_AT,
  REGISTRATION_CLOSES_AT,
  TOURNAMENT_DATE,
} from './tournament'

const VALID_FORM: RegistrationFormValues = {
  divisionId: 'div-mens',
  nominatedPartner: '',
  skillLevel: 'intermediate',
  phone: '0412 345 678',
  emergencyContactName: 'Mrs Claus',
  emergencyContactPhone: '+61 400 000 000',
  dietaryNotes: 'No nuts please',
  codeOfConductAccepted: true,
}

const CONTEXT = { eligibleDivisionIds: ['div-mens', 'div-womens'] }

describe('getRegistrationWindow', () => {
  it('is not open before pre-registration opens', () => {
    const info = getRegistrationWindow(new Date('2026-08-31T00:00:00+10:00'))
    expect(info.window).toBe('not-open-yet')
    expect(info.phase).toBe('before-pre-registration')
    expect(info.countdownTarget).toBe(PRE_REGISTRATION_OPENS_AT)
    expect(info.acceptsSubmissions).toBe(false)
  })

  it('opens exactly at the pre-registration timestamp', () => {
    const info = getRegistrationWindow(new Date(PRE_REGISTRATION_OPENS_AT))
    expect(info.window).toBe('open')
    expect(info.countdownTarget).toBe(REGISTRATION_CLOSES_AT)
    expect(info.acceptsSubmissions).toBe(true)
  })

  it('stays open the day before closing', () => {
    expect(getRegistrationWindow(new Date('2026-12-05T09:00:00+11:00')).window).toBe('open')
  })

  it('closes (waitlist only) once the close date passes', () => {
    const info = getRegistrationWindow(new Date('2026-12-07T09:00:00+11:00'))
    expect(info.window).toBe('closed')
    expect(info.countdownTarget).toBe(TOURNAMENT_DATE)
    expect(info.acceptsSubmissions).toBe(true)
  })

  it('stops accepting submissions on tournament day', () => {
    const info = getRegistrationWindow(new Date('2026-12-13T10:00:00+11:00'))
    expect(info.window).toBe('closed')
    expect(info.acceptsSubmissions).toBe(false)
    expect(info.countdownTarget).toBeNull()
  })

  it('never returns empty copy', () => {
    for (const iso of [
      '2026-01-01T00:00:00+11:00',
      '2026-10-01T00:00:00+10:00',
      '2026-12-08T00:00:00+11:00',
      '2027-01-01T00:00:00+11:00',
    ]) {
      const info = getRegistrationWindow(new Date(iso))
      expect(info.heading.length).toBeGreaterThan(0)
      expect(info.message.length).toBeGreaterThan(0)
    }
  })
})

describe('isDivisionEligible', () => {
  it('matches gendered divisions to the profile gender', () => {
    expect(isDivisionEligible('mens', 'male')).toBe(true)
    expect(isDivisionEligible('mens', 'female')).toBe(false)
    expect(isDivisionEligible('womens', 'female')).toBe(true)
    expect(isDivisionEligible('womens', 'male')).toBe(false)
  })

  it('never blocks players who did not disclose a gender', () => {
    for (const gender of [null, undefined, 'other', 'prefer_not_to_say'] as const) {
      expect(isDivisionEligible('mens', gender)).toBe(true)
      expect(isDivisionEligible('womens', gender)).toBe(true)
    }
  })

  it('allows everyone into mixed/open divisions', () => {
    expect(isDivisionEligible('mixed', 'male')).toBe(true)
    expect(isDivisionEligible('open', 'female')).toBe(true)
  })

  it('explains why a division is unavailable', () => {
    expect(divisionEligibilityHint('mens')).toMatch(/Men/)
    expect(divisionEligibilityHint('womens')).toMatch(/Women/)
    expect(divisionEligibilityHint('open')).toMatch(/Not available/)
  })
})

describe('divisionCapacity', () => {
  it('converts a team cap into player slots', () => {
    const info = divisionCapacity({ maxTeams: 12, registeredPlayers: 18 })
    expect(info.playerCapacity).toBe(24)
    expect(info.spotsRemaining).toBe(6)
    expect(info.isFull).toBe(false)
    expect(info.percentFull).toBe(75)
    expect(info.label).toBe('6 spots left of 24')
  })

  it('is full at exactly the cap and never reports negative spots', () => {
    expect(divisionCapacity({ maxTeams: 4, registeredPlayers: 8 }).isFull).toBe(true)
    const over = divisionCapacity({ maxTeams: 4, registeredPlayers: 11 })
    expect(over.spotsRemaining).toBe(0)
    expect(over.isFull).toBe(true)
    expect(over.percentFull).toBe(100)
    expect(over.label).toMatch(/waitlist/i)
  })

  it('singularises the last spot', () => {
    expect(divisionCapacity({ maxTeams: 4, registeredPlayers: 7 }).label).toBe('1 spot left of 8')
  })

  it('treats a missing cap as uncapped', () => {
    const info = divisionCapacity({ maxTeams: null, registeredPlayers: 1 })
    expect(info.playerCapacity).toBeNull()
    expect(info.isFull).toBe(false)
    expect(info.spotsRemaining).toBeNull()
    expect(info.label).toBe('1 player signed up so far')
  })

  it('clamps negative/garbage registration counts', () => {
    expect(divisionCapacity({ maxTeams: 4, registeredPlayers: -5 }).registeredPlayers).toBe(0)
  })
})

describe('decideRegistrationOutcome', () => {
  it('creates a pending entry when open with room', () => {
    const outcome = decideRegistrationOutcome({
      window: 'open',
      divisionFull: false,
      alreadyRegistered: false,
    })
    expect(outcome.allowed).toBe(true)
    expect(outcome.intent).toBe('register')
    expect(outcome.status).toBe('pending')
  })

  it('waitlists when the division is full', () => {
    const outcome = decideRegistrationOutcome({
      window: 'open',
      divisionFull: true,
      alreadyRegistered: false,
    })
    expect(outcome.allowed).toBe(true)
    expect(outcome.intent).toBe('waitlist')
    expect(outcome.status).toBe('waitlisted')
    expect(outcome.submitLabel).toMatch(/waitlist/i)
  })

  it('waitlists when registration has closed', () => {
    const outcome = decideRegistrationOutcome({
      window: 'closed',
      divisionFull: false,
      alreadyRegistered: false,
    })
    expect(outcome.status).toBe('waitlisted')
  })

  it('blocks before the window opens', () => {
    const outcome = decideRegistrationOutcome({
      window: 'not-open-yet',
      divisionFull: false,
      alreadyRegistered: false,
    })
    expect(outcome.allowed).toBe(false)
    expect(outcome.intent).toBe('blocked')
  })

  it('blocks a double registration ahead of every other rule', () => {
    const outcome = decideRegistrationOutcome({
      window: 'open',
      divisionFull: false,
      alreadyRegistered: true,
    })
    expect(outcome.allowed).toBe(false)
    expect(outcome.reason).toMatch(/already/i)
  })
})

describe('isValidPhone', () => {
  it('accepts realistic AU/international numbers', () => {
    expect(isValidPhone('0412 345 678')).toBe(true)
    expect(isValidPhone('+61 (0)400 000 000')).toBe(true)
  })

  it('rejects too-short and absurdly long input', () => {
    expect(isValidPhone('1234')).toBe(false)
    expect(isValidPhone('')).toBe(false)
    expect(isValidPhone('1'.repeat(16))).toBe(false)
  })
})

describe('validateRegistrationForm', () => {
  it('passes a complete, valid form', () => {
    expect(validateRegistrationForm(VALID_FORM, CONTEXT)).toEqual({})
    expect(hasErrors(validateRegistrationForm(VALID_FORM, CONTEXT))).toBe(false)
  })

  it('flags every missing field on an empty form', () => {
    const errors = validateRegistrationForm(EMPTY_REGISTRATION_FORM, CONTEXT)
    expect(Object.keys(errors).sort()).toEqual(
      [
        'codeOfConductAccepted',
        'divisionId',
        'emergencyContactName',
        'emergencyContactPhone',
        'phone',
        'skillLevel',
      ].sort()
    )
  })

  it('rejects an ineligible division', () => {
    const errors = validateRegistrationForm({ ...VALID_FORM, divisionId: 'div-womens-x' }, CONTEXT)
    expect(errors.divisionId).toMatch(/isn’t open to you/)
  })

  it('never asks for a partner, so it can never withhold an entry over one', () => {
    // The committee pairs players. An entry that named no partner used to be
    // rejected unless the player had also ticked "find me a partner"; there is
    // now no way to express either, so a complete form must simply pass.
    expect(validateRegistrationForm(VALID_FORM, CONTEXT)).toEqual({})
  })

  it('rejects an unknown skill level', () => {
    expect(validateRegistrationForm({ ...VALID_FORM, skillLevel: 'pro' }, CONTEXT).skillLevel).toBeDefined()
  })

  it('rejects an over-long notes field', () => {
    const errors = validateRegistrationForm(
      { ...VALID_FORM, dietaryNotes: 'a'.repeat(MAX_NOTES_LENGTH + 1) },
      CONTEXT
    )
    expect(errors.dietaryNotes).toMatch(/under 500 characters/)
  })

  it('requires the code of conduct', () => {
    const errors = validateRegistrationForm({ ...VALID_FORM, codeOfConductAccepted: false }, CONTEXT)
    expect(errors.codeOfConductAccepted).toMatch(/code of conduct/i)
  })
})

describe('buildRegistrationNotes', () => {
  it('records a nominated partner as a nomination, not a pairing', () => {
    const notes = buildRegistrationNotes({
      nominatedPartner: '  Rudolph Reyes ',
      dietaryNotes: 'Vegetarian',
      codeOfConductAcceptedAt: '2026-09-10T00:00:00.000Z',
      intent: 'register',
    })
    expect(notes).toContain('Partner nominated: Rudolph Reyes (committee to confirm)')
    expect(notes).not.toContain('FREE AGENT')
    expect(notes).toContain('Dietary / notes: Vegetarian')
    expect(notes).toContain('Code of conduct accepted: 2026-09-10T00:00:00.000Z')
    expect(notes).not.toContain('Waitlist entry')
  })

  it('flags free agents and waitlist entries', () => {
    const notes = buildRegistrationNotes({
      dietaryNotes: '   ',
      codeOfConductAcceptedAt: '2026-09-10T00:00:00.000Z',
      intent: 'waitlist',
    })
    expect(notes).toContain('FREE AGENT')
    expect(notes).toContain('Waitlist entry')
    expect(notes).toContain('Dietary / notes: none')
  })

  it('treats a blank nomination as no nomination', () => {
    expect(
      buildRegistrationNotes({
        nominatedPartner: '   ',
        dietaryNotes: '',
        codeOfConductAcceptedAt: 'now',
        intent: 'register',
      })
    ).toContain('FREE AGENT')
  })
})

describe('isDuplicateRegistration', () => {
  it('detects an existing entry in the same division', () => {
    const existing = [{ division_id: 'div-mens' }]
    expect(isDuplicateRegistration(existing, 'div-mens')).toBe(true)
    expect(isDuplicateRegistration(existing, 'div-womens')).toBe(false)
    expect(isDuplicateRegistration([], 'div-mens')).toBe(false)
  })
})

describe('buildTeamName', () => {
  it('joins both names', () => {
    expect(buildTeamName('Holly', 'Rudolph')).toBe('Holly & Rudolph')
  })

  it('degrades gracefully when a name is missing', () => {
    expect(buildTeamName('Holly', '  ')).toBe('Holly')
    expect(buildTeamName('', 'Rudolph')).toBe('Rudolph')
    expect(buildTeamName('', '')).toBe('Mystery Pair')
  })
})

describe('confirmationCopy', () => {
  it('never claims a waitlisted player is in the draw', () => {
    const waitlisted = confirmationCopy('waitlisted')
    expect(waitlisted.title).toMatch(/Waitlist/i)
    expect(waitlisted.nextSteps.length).toBeGreaterThan(0)
  })

  it('celebrates a pending entry', () => {
    const pending = confirmationCopy('pending')
    expect(pending.eyebrow).toMatch(/Ho ho ho/)
    expect(pending.nextSteps.some((step) => step.includes('committee'))).toBe(true)
  })

  it('promises no email it cannot send', () => {
    // There is no mailer in this project, so a player told "we'll email you"
    // waits for a message that never arrives and misses their spot.
    for (const status of ['pending', 'waitlisted'] as const) {
      const copy = confirmationCopy(status)
      const text = [copy.eyebrow, copy.title, copy.message, ...copy.nextSteps].join(' ')
      expect(text).not.toMatch(/email/i)
    }
  })
})

describe('the organiser switch overrides the calendar (audit B4)', () => {
  const beforeOpen = new Date('2026-08-31T00:00:00+10:00')
  const duringOpen = new Date('2026-10-01T00:00:00+11:00')
  const afterClose = new Date('2026-12-10T00:00:00+11:00')
  const onTheDay = new Date('2026-12-13T12:00:00+11:00')

  it('leaves the calendar in charge when the organisers have no opinion', () => {
    expect(getRegistrationWindow(beforeOpen).window).toBe('not-open-yet')
    expect(getRegistrationWindow(beforeOpen, { isRegistrationOpen: null }).window).toBe(
      'not-open-yet',
    )
  })

  it('opens the sheet early when the organisers say so — the whole point for a test run', () => {
    const info = getRegistrationWindow(beforeOpen, { isRegistrationOpen: true })
    expect(info.window).toBe('open')
    expect(info.acceptsSubmissions).toBe(true)
  })

  it('closes the sheet mid-window when the organisers say so', () => {
    expect(getRegistrationWindow(duringOpen).window).toBe('open')
    const info = getRegistrationWindow(duringOpen, { isRegistrationOpen: false })
    expect(info.window).toBe('closed')
    // Still accepts waitlist entries — closing is not the same as vanishing.
    expect(info.acceptsSubmissions).toBe(true)
  })

  it('re-opens a date-closed window when the organisers flip it back on', () => {
    expect(getRegistrationWindow(afterClose).window).toBe('closed')
    expect(getRegistrationWindow(afterClose, { isRegistrationOpen: true }).window).toBe('open')
  })

  it('cannot resurrect registration once the tournament has begun', () => {
    const info = getRegistrationWindow(onTheDay, { isRegistrationOpen: true })
    expect(info.window).toBe('closed')
    expect(info.acceptsSubmissions).toBe(false)
  })

  it('honours dates supplied by the tournament row instead of the constants', () => {
    const dates = {
      preRegistrationOpensAt: '2026-01-01T00:00:00+11:00',
      registrationClosesAt: '2026-02-01T00:00:00+11:00',
      tournamentDate: '2026-03-01T00:00:00+11:00',
    }
    // A moment that is "before pre-registration" under the defaults but wide
    // open under the organisers' own dates.
    const info = getRegistrationWindow(new Date('2026-01-15T00:00:00+11:00'), { dates })
    expect(info.window).toBe('open')
  })

  it('still accepts a bare TournamentDates for older call sites', () => {
    const dates = {
      preRegistrationOpensAt: '2026-01-01T00:00:00+11:00',
      registrationClosesAt: '2026-02-01T00:00:00+11:00',
      tournamentDate: '2026-03-01T00:00:00+11:00',
    }
    expect(getRegistrationWindow(new Date('2026-01-15T00:00:00+11:00'), dates).window).toBe('open')
  })

  it('quotes the configured opening date, never a hardcoded one', () => {
    const info = getRegistrationWindow(new Date('2025-12-01T00:00:00+11:00'), {
      dates: {
        preRegistrationOpensAt: '2026-01-09T00:00:00+11:00',
        registrationClosesAt: '2026-02-01T00:00:00+11:00',
        tournamentDate: '2026-03-01T00:00:00+11:00',
      },
    })
    expect(info.message).toContain('9 January 2026')
    expect(info.message).not.toContain('6 September')
  })
})
