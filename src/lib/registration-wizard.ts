/**
 * The step model behind the registration wizard.
 *
 * `/register` used to be one long form. This turns it into one question at a
 * time so it feels like opening advent doors rather than filling in a tax
 * return — but the *rules* still live in exactly one place. Nothing here
 * re-implements a validation rule: `stepErrors()` runs the same
 * `validateRegistrationForm()` the old form used and simply selects the subset
 * of messages belonging to the step on screen.
 *
 * That matters because the single most repeated defect in this project has
 * been a list restated in a second place and then drifting. A step here owns
 * only *which fields it shows*; what counts as valid is never duplicated.
 */

import {
  hasErrors,
  validateRegistrationForm,
  type RegistrationFormErrors,
  type RegistrationFormValues,
  type ValidationContext,
} from './registration'

/** A field on the registration form that a step can be responsible for. */
export type RegistrationField = keyof RegistrationFormValues

export interface WizardStep {
  id: string
  /**
   * The fields this step collects. Used both to render the step and to select
   * that step's errors out of the whole-form validation result.
   */
  fields: RegistrationField[]
  /** The question itself, asked conversationally. */
  question: string
  /** One line of context under the question. */
  blurb: string
  /**
   * Short label for the progress garland. Kept to roughly one word so the
   * ornaments still fit across a narrow phone.
   */
  badge: string
  /**
   * Shown after the player answers, before they move on. Pure celebration —
   * this is the bit that makes it feel like a game rather than a form.
   */
  cheer: string
  /** True when the player may continue without answering. */
  optional?: boolean
}

/**
 * Every step in order.
 *
 * The committee builds every pair on `/admin/teams`, so the wizard does not
 * run an invite flow: there is no "invite your partner, wait for them to
 * accept, and be blocked until they do". What it does ask — on the men's
 * draw, where players habitually enter as an established pair — is who you
 * would *like* to be paired with. That answer is a note for the committee,
 * nothing more.
 *
 * The final `review` step deliberately owns no fields: it is a read-back of
 * everything before submitting, so a player is never asked to trust that we
 * recorded their answers correctly.
 */
const ALL_STEPS: WizardStep[] = [
  {
    id: 'division',
    fields: ['divisionId'],
    question: 'Which draw are you entering?',
    blurb: 'Pick the division you want to play in.',
    badge: 'Division',
    cheer: 'Locked in. 🏸',
  },
  {
    id: 'partner',
    fields: ['nominatedPartner'],
    question: 'Anyone you’d like to play with?',
    blurb: 'Name who you’d like as your partner. The committee still confirms every pair.',
    badge: 'Partner',
    cheer: 'We’ll pass it to the committee. 🎁',
    optional: true,
  },
  {
    id: 'skill',
    fields: ['skillLevel'],
    question: 'How would you rate your game?',
    blurb: 'This keeps the draw fair. Be honest — Santa is watching. 👀',
    badge: 'Level',
    cheer: 'Noted.',
  },
  {
    id: 'contact',
    fields: ['phone'],
    question: 'What’s the best number to reach you on?',
    blurb: 'We’ll text you your court and time on the day.',
    badge: 'Phone',
    cheer: 'Got it.',
  },
  {
    id: 'emergency',
    fields: ['emergencyContactName', 'emergencyContactPhone'],
    question: 'Who should we call in an emergency?',
    blurb: 'Standard club requirement — we hope never to use it.',
    badge: 'Safety',
    cheer: 'Thank you — that’s the boring bit done.',
  },
  {
    id: 'notes',
    fields: ['dietaryNotes'],
    question: 'Anything we should know?',
    blurb: 'Allergies, injuries, “please don’t schedule me before 10am”.',
    badge: 'Notes',
    cheer: 'We’ll pass it on.',
    optional: true,
  },
  {
    id: 'pledge',
    fields: ['codeOfConductAccepted'],
    question: 'One last thing — the festive fine print.',
    blurb: 'Play fair, call your own faults, keep it merry.',
    badge: 'Pledge',
    cheer: 'You’re a good egg. 🥚',
  },
  {
    id: 'review',
    fields: [],
    question: 'Ready to send it?',
    blurb: 'Have a quick read, then hand it to the committee.',
    badge: 'Send',
    cheer: '',
  },
]

/** The id of the step that reads everything back before submitting. */
export const REVIEW_STEP_ID = 'review'

/** The id of the optional partner-nomination step. */
export const PARTNER_STEP_ID = 'partner'

export interface WizardStepOptions {
  /**
   * Whether to ask who the player would like to be paired with. Driven by the
   * selected division, because it is only the men's draw that enters as
   * established pairs; the women's draw is paired on skill level, and asking
   * there would set an expectation the committee has said it will not meet.
   */
  askPartnerNomination?: boolean
}

/**
 * The steps the wizard shows, for the answers given so far.
 *
 * This must stay the single call site: the progress garland, the "are we
 * finished" check and the review screen all have to agree about which steps
 * exist, and a step that appears and disappears as the division changes is
 * exactly where they would otherwise drift apart.
 */
export function buildWizardSteps(options: WizardStepOptions = {}): WizardStep[] {
  return ALL_STEPS.filter(
    (step) => step.id !== PARTNER_STEP_ID || options.askPartnerNomination === true,
  )
}

/**
 * The errors belonging to one step, taken from a whole-form validation.
 *
 * Deliberately a *selection* rather than its own set of checks — a step must
 * never be able to disagree with the form about what is valid.
 */
export function stepErrors(
  step: WizardStep,
  values: RegistrationFormValues,
  context: ValidationContext
): RegistrationFormErrors {
  const all = validateRegistrationForm(values, context)
  const mine: RegistrationFormErrors = {}
  for (const field of step.fields) {
    if (all[field]) mine[field] = all[field]
  }
  return mine
}

/** True when the player has answered this step well enough to move on. */
export function canAdvance(
  step: WizardStep,
  values: RegistrationFormValues,
  context: ValidationContext
): boolean {
  return !hasErrors(stepErrors(step, values, context))
}

export interface WizardProgress {
  /** 1-based position of the step on screen. */
  current: number
  /** Total steps for the answers given so far. */
  total: number
  /** Steps fully answered. */
  answered: number
  /** 0-100, for the garland fill. */
  percent: number
}

/**
 * Progress is measured by steps actually *answered*, not by how far the player
 * has clicked. Someone who jumps back from the review screen should not see
 * the bar collapse, and someone who skipped the optional notes step should
 * still reach 100%.
 */
export function wizardProgress(
  steps: WizardStep[],
  currentIndex: number,
  values: RegistrationFormValues,
  context: ValidationContext
): WizardProgress {
  const answered = steps.filter((step) => isStepComplete(step, values, context)).length
  const total = steps.length
  return {
    current: Math.min(currentIndex + 1, total),
    total,
    answered,
    percent: total === 0 ? 0 : Math.round((answered / total) * 100),
  }
}

/**
 * Whether the stepper may offer a jump to `index`.
 *
 * Reachability is "have they been here", NOT "does this step look answered".
 * Completeness cannot stand in for it: skill, phone and emergency
 * contact are all pre-filled from the player's profile, so they read as
 * answered before the player has ever laid eyes on them. Gating on
 * completeness therefore let someone on question 1 jump straight to question 7,
 * skipping the division and partner questions the review screen depends on.
 *
 * `furthestIndex` is the high-water mark of steps actually displayed, so a
 * player can move freely around the part of the form they have seen and no
 * further.
 */
export function isStepReachable(index: number, currentIndex: number, furthestIndex: number): boolean {
  if (index === currentIndex) return false
  return index <= furthestIndex
}

/**
 * A step counts as complete when it has no errors AND the player has actually
 * put something in it. Without the second half, every optional or
 * already-prefilled step would read as "answered" before it was ever seen and
 * the garland would start half lit.
 */
export function isStepComplete(
  step: WizardStep,
  values: RegistrationFormValues,
  context: ValidationContext
): boolean {
  if (step.id === REVIEW_STEP_ID) return false
  if (!canAdvance(step, values, context)) return false
  if (step.optional) return true
  return step.fields.every((field) => {
    const value = values[field]
    if (typeof value === 'boolean') return value
    return String(value ?? '').trim().length > 0
  })
}

/**
 * The first step still needing an answer, or the review step when everything
 * is done. Used to send a player back to the exact question they missed when
 * they try to submit from the review screen.
 */
export function firstIncompleteStepIndex(
  steps: WizardStep[],
  values: RegistrationFormValues,
  context: ValidationContext
): number {
  const index = steps.findIndex((step) => step.id !== REVIEW_STEP_ID && !isStepComplete(step, values, context))
  return index === -1 ? Math.max(0, steps.length - 1) : index
}

/**
 * True when every question has an acceptable answer, so the form may be sent.
 * Reads the whole-form validator directly rather than combining step results,
 * so a field that somehow belongs to no step can still never slip through.
 */
export function isWizardComplete(values: RegistrationFormValues, context: ValidationContext): boolean {
  return !hasErrors(validateRegistrationForm(values, context))
}
