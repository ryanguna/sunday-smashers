import { describe, expect, it } from 'vitest'

import {
  buildWizardSteps,
  canAdvance,
  firstIncompleteStepIndex,
  isStepComplete,
  isWizardComplete,
  REVIEW_STEP_ID,
  stepErrors,
  wizardProgress,
  type WizardStep,
  isStepReachable,
} from './registration-wizard'
import { EMPTY_REGISTRATION_FORM, type RegistrationFormValues, type ValidationContext } from './registration'

const CONTEXT: ValidationContext = {
  eligibleDivisionIds: ['div-mens'],
  selfEmail: 'me@example.com',
  selfHandle: 'mesmash',
}

const COMPLETE: RegistrationFormValues = {
  divisionId: 'div-mens',
  partnerMode: 'partner',
  partnerIdentifier: 'rudolph@example.com',
  shirtSize: 'L',
  skillLevel: 'intermediate',
  phone: '0412 345 678',
  emergencyContactName: 'Mrs Claus',
  emergencyContactPhone: '0412 999 888',
  dietaryNotes: '',
  codeOfConductAccepted: true,
}

function stepById(steps: WizardStep[], id: string): WizardStep {
  const found = steps.find((step) => step.id === id)
  if (!found) throw new Error(`no step ${id}`)
  return found
}

describe('buildWizardSteps', () => {
  it('asks who the partner is when the player says they have one', () => {
    const ids = buildWizardSteps({ ...COMPLETE, partnerMode: 'partner' }).map((step) => step.id)
    expect(ids).toContain('partner-details')
  })

  it('skips the partner question entirely for a free agent', () => {
    const ids = buildWizardSteps({ ...COMPLETE, partnerMode: 'solo' }).map((step) => step.id)
    expect(ids).not.toContain('partner-details')
  })

  it('gets shorter when the player switches to solo, so the count is honest', () => {
    const withPartner = buildWizardSteps({ ...COMPLETE, partnerMode: 'partner' })
    const solo = buildWizardSteps({ ...COMPLETE, partnerMode: 'solo' })
    expect(solo.length).toBe(withPartner.length - 1)
  })

  it('always finishes on the review step', () => {
    for (const mode of ['partner', 'solo'] as const) {
      const steps = buildWizardSteps({ ...COMPLETE, partnerMode: mode })
      expect(steps[steps.length - 1].id).toBe(REVIEW_STEP_ID)
    }
  })

  it('covers every field on the form exactly once', () => {
    // Guards the defect this project keeps hitting: a field quietly belonging
    // to no step (unreachable, blocks submit forever) or to two (asked twice).
    const steps = buildWizardSteps({ ...COMPLETE, partnerMode: 'partner' })
    const seen = steps.flatMap((step) => step.fields)
    expect(new Set(seen).size).toBe(seen.length)
    expect([...seen].sort()).toEqual(Object.keys(EMPTY_REGISTRATION_FORM).sort())
  })
})

describe('stepErrors', () => {
  it('reports only the errors for the step on screen', () => {
    const steps = buildWizardSteps(EMPTY_REGISTRATION_FORM)
    const errors = stepErrors(stepById(steps, 'division'), EMPTY_REGISTRATION_FORM, CONTEXT)
    expect(errors.divisionId).toBeDefined()
    // The rest of the form is empty too, but that is not this step's business.
    expect(errors.shirtSize).toBeUndefined()
    expect(errors.phone).toBeUndefined()
  })

  it('uses the same message the whole-form validator produces', () => {
    const steps = buildWizardSteps(EMPTY_REGISTRATION_FORM)
    const errors = stepErrors(stepById(steps, 'shirt'), EMPTY_REGISTRATION_FORM, CONTEXT)
    expect(errors.shirtSize).toContain('loot bag')
  })

  it('rejects partnering with yourself, on the step that asks', () => {
    const values = { ...COMPLETE, partnerIdentifier: 'me@example.com' }
    const errors = stepErrors(stepById(buildWizardSteps(values), 'partner-details'), values, CONTEXT)
    expect(errors.partnerIdentifier).toBeDefined()
  })
})

describe('canAdvance', () => {
  it('holds the player on an unanswered question', () => {
    const steps = buildWizardSteps(EMPTY_REGISTRATION_FORM)
    expect(canAdvance(stepById(steps, 'division'), EMPTY_REGISTRATION_FORM, CONTEXT)).toBe(false)
  })

  it('lets them through once it is answered', () => {
    const steps = buildWizardSteps(COMPLETE)
    expect(canAdvance(stepById(steps, 'division'), COMPLETE, CONTEXT)).toBe(true)
  })

  it('lets them straight past the optional notes question', () => {
    const steps = buildWizardSteps(EMPTY_REGISTRATION_FORM)
    expect(canAdvance(stepById(steps, 'notes'), EMPTY_REGISTRATION_FORM, CONTEXT)).toBe(true)
  })

  it('still stops them if the optional answer is too long', () => {
    const values = { ...COMPLETE, dietaryNotes: 'x'.repeat(501) }
    expect(canAdvance(stepById(buildWizardSteps(values), 'notes'), values, CONTEXT)).toBe(false)
  })

  it('requires both halves of the emergency contact', () => {
    const steps = buildWizardSteps(COMPLETE)
    const half = { ...COMPLETE, emergencyContactPhone: '' }
    expect(canAdvance(stepById(steps, 'emergency'), half, CONTEXT)).toBe(false)
  })

  it('will not accept an ineligible division even if one is chosen', () => {
    const values = { ...COMPLETE, divisionId: 'div-womens' }
    expect(canAdvance(stepById(buildWizardSteps(values), 'division'), values, CONTEXT)).toBe(false)
  })
})

describe('isStepComplete', () => {
  it('does not count a step the player has not filled in', () => {
    const steps = buildWizardSteps(EMPTY_REGISTRATION_FORM)
    expect(isStepComplete(stepById(steps, 'contact'), EMPTY_REGISTRATION_FORM, CONTEXT)).toBe(false)
  })

  it('counts the optional notes step as done even when left blank', () => {
    const steps = buildWizardSteps(EMPTY_REGISTRATION_FORM)
    expect(isStepComplete(stepById(steps, 'notes'), EMPTY_REGISTRATION_FORM, CONTEXT)).toBe(true)
  })

  it('treats the unticked pledge as incomplete rather than answered-false', () => {
    const steps = buildWizardSteps(COMPLETE)
    const unticked = { ...COMPLETE, codeOfConductAccepted: false }
    expect(isStepComplete(stepById(steps, 'pledge'), unticked, CONTEXT)).toBe(false)
  })

  it('never counts the review step, so the garland cannot read 100% early', () => {
    const steps = buildWizardSteps(COMPLETE)
    expect(isStepComplete(stepById(steps, REVIEW_STEP_ID), COMPLETE, CONTEXT)).toBe(false)
  })

  it('counts the partner-mode step, which is pre-filled but genuinely answered', () => {
    const steps = buildWizardSteps(COMPLETE)
    expect(isStepComplete(stepById(steps, 'partner'), COMPLETE, CONTEXT)).toBe(true)
  })
})

describe('wizardProgress', () => {
  it('starts empty', () => {
    const steps = buildWizardSteps(EMPTY_REGISTRATION_FORM)
    const progress = wizardProgress(steps, 0, EMPTY_REGISTRATION_FORM, CONTEXT)
    expect(progress.current).toBe(1)
    expect(progress.total).toBe(steps.length)
    // Only the optional notes step is "done" on a blank form.
    expect(progress.percent).toBeGreaterThanOrEqual(0)
    expect(progress.percent).toBeLessThan(50)
  })

  it('reaches 100% when every real question is answered', () => {
    const steps = buildWizardSteps(COMPLETE)
    // Every step except the review step can be complete, so the garland fills
    // exactly as the player lands on the review screen.
    const progress = wizardProgress(steps, steps.length - 1, COMPLETE, CONTEXT)
    expect(progress.answered).toBe(steps.length - 1)
  })

  it('does not go backwards when the player steps back to change an answer', () => {
    const steps = buildWizardSteps(COMPLETE)
    const atReview = wizardProgress(steps, steps.length - 1, COMPLETE, CONTEXT)
    const steppedBack = wizardProgress(steps, 1, COMPLETE, CONTEXT)
    expect(steppedBack.answered).toBe(atReview.answered)
    expect(steppedBack.percent).toBe(atReview.percent)
  })

  it('never reports a current step beyond the total', () => {
    const steps = buildWizardSteps(COMPLETE)
    expect(wizardProgress(steps, 999, COMPLETE, CONTEXT).current).toBe(steps.length)
  })
})

describe('firstIncompleteStepIndex', () => {
  it('points at the very first question on a blank form', () => {
    const steps = buildWizardSteps(EMPTY_REGISTRATION_FORM)
    expect(firstIncompleteStepIndex(steps, EMPTY_REGISTRATION_FORM, CONTEXT)).toBe(0)
  })

  it('points at the one question the player missed', () => {
    const values = { ...COMPLETE, phone: '' }
    const steps = buildWizardSteps(values)
    const index = firstIncompleteStepIndex(steps, values, CONTEXT)
    expect(steps[index].id).toBe('contact')
  })

  it('lands on the review step when everything is answered', () => {
    const steps = buildWizardSteps(COMPLETE)
    const index = firstIncompleteStepIndex(steps, COMPLETE, CONTEXT)
    expect(steps[index].id).toBe(REVIEW_STEP_ID)
  })

  it('skips the partner question for a free agent rather than getting stuck on it', () => {
    const values: RegistrationFormValues = { ...COMPLETE, partnerMode: 'solo', partnerIdentifier: '' }
    const steps = buildWizardSteps(values)
    const index = firstIncompleteStepIndex(steps, values, CONTEXT)
    expect(steps[index].id).toBe(REVIEW_STEP_ID)
  })
})

describe('isWizardComplete', () => {
  it('is true for a fully answered form', () => {
    expect(isWizardComplete(COMPLETE, CONTEXT)).toBe(true)
  })

  it('is true for a free agent who never names a partner', () => {
    expect(isWizardComplete({ ...COMPLETE, partnerMode: 'solo', partnerIdentifier: '' }, CONTEXT)).toBe(true)
  })

  it('is false while any question is unanswered', () => {
    expect(isWizardComplete({ ...COMPLETE, shirtSize: '' }, CONTEXT)).toBe(false)
  })

  it('agrees with the step model about whether we are done', () => {
    // If these two ever disagree the player gets a wizard that says "all done"
    // and a submit button that refuses — the exact trap this guards.
    const cases: RegistrationFormValues[] = [
      COMPLETE,
      { ...COMPLETE, partnerMode: 'solo', partnerIdentifier: '' },
      { ...COMPLETE, phone: '' },
      { ...COMPLETE, codeOfConductAccepted: false },
      EMPTY_REGISTRATION_FORM,
    ]
    for (const values of cases) {
      const steps = buildWizardSteps(values)
      const allStepsDone = steps
        .filter((step) => step.id !== REVIEW_STEP_ID)
        .every((step) => isStepComplete(step, values, CONTEXT))
      expect(allStepsDone).toBe(isWizardComplete(values, CONTEXT))
    }
  })
})

describe('isStepReachable', () => {
  it('offers steps the player has already been shown', () => {
    expect(isStepReachable(0, 3, 3)).toBe(true)
    expect(isStepReachable(2, 3, 3)).toBe(true)
  })

  it('never offers the step you are already on', () => {
    expect(isStepReachable(3, 3, 5)).toBe(false)
  })

  it('lets a player who jumped back move forward again to where they had reached', () => {
    expect(isStepReachable(4, 1, 5)).toBe(true)
  })

  it('refuses to skip past a question that has never been displayed', () => {
    // The regression this exists for: skill/shirt/phone/emergency all arrive
    // pre-filled from the profile, so a completeness-based rule let someone on
    // question 1 jump to question 7 and reach a review with no division.
    expect(isStepReachable(6, 0, 0)).toBe(false)
    expect(isStepReachable(1, 0, 0)).toBe(false)
  })
})
