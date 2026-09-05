'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Badge, Button, Card, Confetti } from '@/components/ui'
import { AlertBanner } from '@/components/auth'
import { FieldWrapper, TextField } from '@/components/auth/FormField'
import { GiftIcon, HollyIcon, ShuttlecockIcon, SparkleIcon, TrophyIcon } from '@/components/icons'
import { cn } from '@/lib/cn'
import {
  decideRegistrationOutcome,
  divisionCapacity,
  EMPTY_REGISTRATION_FORM,
  MAX_NOTES_LENGTH,
  SKILL_LEVELS,
  isDuplicateRegistration,
  type RegistrationFormValues,
  type RegistrationWindow,
  type ValidationContext,
} from '@/lib/registration'
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
} from '@/lib/registration-wizard'
import type { SiteCopy } from '@/lib/site-copy'
import { DivisionPicker } from './DivisionPicker'
import { WizardGarland } from './WizardGarland'
import { submitRegistration, type RegistrationContext, type SubmitRegistrationResult } from './data'

/**
 * The radio in each option card is `sr-only`, so the global `:focus-visible`
 * outline lands on a clipped 1×1 box and a keyboard or switch user sees no
 * focus indicator at all on the two busiest steps of registration. `peer` on
 * the input plus this on the label moves the ring onto the card people can
 * actually see. WCAG 2.4.7.
 */
const FOCUS_RING =
  ' peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--color-brand-lilac-dark)]'

/**
 * How long a cheer stays on screen, in milliseconds. Must match the
 * `ss-cheer-toast` keyframes in `globals.css`: those fade the pill out at the
 * end of their own run, and if this timer fired first the pill would be
 * unmounted mid-fade — exactly the snap this is here to avoid.
 */
const CHEER_MS = 1400

export interface RegistrationWizardProps {
  context: RegistrationContext
  /** Committee-editable disclaimers shown alongside the questions. */
  copy: SiteCopy
  window: RegistrationWindow
  onSubmitted: (result: SubmitRegistrationResult) => void
}

/**
 * Registration, asked one question at a time.
 *
 * This replaced a single long form. The form worked, but it opened as a wall
 * of eleven fields, which is the moment a casual club player decides to "do it
 * later" and never comes back. One question per screen, a garland that lights
 * up, and a word of encouragement after each answer turns the same data entry
 * into something closer to opening advent doors.
 *
 * All the *rules* still live in `@/lib/registration`; the step model in
 * `@/lib/registration-wizard` only decides which fields appear together and
 * selects that step's errors out of the whole-form validation. Nothing here
 * re-implements a validation rule.
 */
export function RegistrationWizard({ context, copy, window: registrationWindow, onSubmitted }: RegistrationWizardProps) {
  const profile = context.profile

  // Every open division is selectable. The wizard used to filter this list by
  // the gender on the player's profile and silently pre-select the survivor,
  // which meant anyone who had answered "prefer not to say" — or whose profile
  // simply disagreed with the draw they meant to enter — was quietly entered
  // into the wrong one. The committee reviews every entry anyway, so guessing
  // buys nothing and costs a wrong division nobody notices until the draw.
  const eligibleDivisions = context.divisions

  const [values, setValues] = useState<RegistrationFormValues>(() => ({
    ...EMPTY_REGISTRATION_FORM,
    skillLevel: profile?.skill_level ?? '',
    phone: profile?.phone ?? '',
    emergencyContactName: profile?.emergency_contact_name ?? '',
    emergencyContactPhone: profile?.emergency_contact_phone ?? '',
  }))

  const [index, setIndex] = useState(0)
  // High-water mark of questions actually shown. The stepper uses this rather
  // than "which steps look answered", because several steps arrive pre-filled
  // from the player's profile and would otherwise be jumpable before they had
  // ever been seen.
  const [furthestIndex, setFurthestIndex] = useState(0)
  /**
   * Errors are only shown once the player has *tried* to move on. Validating
   * as they type would put a red message under a question they have not
   * finished answering yet, which reads as being told off.
   */
  const [showErrors, setShowErrors] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  /**
   * The cheer shown after each answer. `id` increments per cheer so two
   * identical cheers in a row still restart the animation, and so the
   * dismissal effect re-arms rather than reusing a timer that is already
   * halfway through.
   */
  const [cheer, setCheer] = useState<{ text: string; id: number } | null>(null)

  const headingRef = useRef<HTMLHeadingElement>(null)
  const firstRender = useRef(true)

  const validationContext: ValidationContext = useMemo(
    () => ({
      eligibleDivisionIds: eligibleDivisions.map((division) => division.id),
      selfEmail: context.userEmail,
      selfHandle: profile?.nickname ?? null,
    }),
    [eligibleDivisions, context.userEmail, profile?.nickname]
  )

  const selectedDivisionGender =
    context.divisions.find((division) => division.id === values.divisionId)?.gender ?? null
  const steps = useMemo(
    () => buildWizardSteps({ askPartnerNomination: selectedDivisionGender === 'mens' }),
    [selectedDivisionGender],
  )
  // Switching to "find me a partner" removes a step, which can leave the index
  // past the end of the list.
  const safeIndex = Math.min(index, steps.length - 1)
  if (safeIndex > furthestIndex) setFurthestIndex(safeIndex)
  // Choosing "find me a partner" removes a step, which would otherwise slide an
  // unseen question underneath the high-water mark and make it jumpable.
  const safeFurthest = Math.min(furthestIndex, steps.length - 1)
  const step = steps[safeIndex]
  const isReview = step.id === REVIEW_STEP_ID

  const completedIds = useMemo(
    () => new Set(steps.filter((s) => isStepComplete(s, values, validationContext)).map((s) => s.id)),
    [steps, values, validationContext]
  )
  const progress = wizardProgress(steps, safeIndex, values, validationContext)
  const errors = showErrors ? stepErrors(step, values, validationContext) : {}

  const selectedDivision = context.divisions.find((division) => division.id === values.divisionId) ?? null
  const capacity = selectedDivision ? divisionCapacity(selectedDivision) : null
  const outcome = decideRegistrationOutcome({
    window: registrationWindow,
    divisionFull: capacity?.isFull ?? false,
    alreadyRegistered: values.divisionId ? isDuplicateRegistration(context.myRegistrations, values.divisionId) : false,
  })

  // Move focus to the new question so a keyboard or screen-reader user is
  // taken with the wizard instead of being left at the bottom of the page.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    headingRef.current?.focus()
  }, [safeIndex])

  // Clearing the cheer from an effect rather than a bare `setTimeout` in the
  // click handler. The old version leaked: tapping Next twice in quick
  // succession left the first timer running, so it fired mid-way through the
  // second cheer and cut it short — and a timer still pending when the wizard
  // unmounted set state on a dead component.
  useEffect(() => {
    if (!cheer) return
    const timer = globalThis.setTimeout(() => setCheer(null), CHEER_MS)
    return () => globalThis.clearTimeout(timer)
  }, [cheer])

  function update<K extends keyof RegistrationFormValues>(key: K, value: RegistrationFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
    setShowErrors(false)
    setServerError(null)
  }

  const goNext = useCallback(() => {
    if (!canAdvance(step, values, validationContext)) {
      setShowErrors(true)
      return
    }
    setShowErrors(false)
    if (step.cheer) {
      const text = step.cheer
      setCheer((current) => ({ text, id: (current?.id ?? 0) + 1 }))
    }
    setIndex((current) => Math.min(current + 1, steps.length - 1))
  }, [step, values, validationContext, steps.length])

  const goBack = useCallback(() => {
    setShowErrors(false)
    setIndex((current) => Math.max(0, current - 1))
  }, [])

  async function handleSubmit() {
    setServerError(null)

    if (!isWizardComplete(values, validationContext)) {
      // Take them to the exact question they missed rather than showing a
      // summary error they then have to hunt through.
      setShowErrors(true)
      setIndex(firstIncompleteStepIndex(steps, values, validationContext))
      return
    }

    if (!outcome.allowed) {
      setServerError(outcome.reason)
      return
    }

    setSaving(true)
    const result = await submitRegistration({
      context,
      values,
      status: outcome.status,
      intent: outcome.intent,
    })
    setSaving(false)

    if (!result.ok) {
      setServerError(result.error ?? 'Something went sideways. Give it another go in a moment.')
      return
    }

    onSubmitted(result)
  }

  return (
    <Card variant="frosted" className="border-candy-stripe relative overflow-hidden">
      <Confetti active={cheer !== null} count={18} />

      <div className="p-1 sm:p-2">
        <WizardGarland
          furthestIndex={safeFurthest}
          steps={steps}
          currentIndex={safeIndex}
          completedIds={completedIds}
          percent={progress.percent}
          onJump={(target) => {
            setShowErrors(false)
            setIndex(target)
          }}
        />

        {serverError && <AlertBanner>{serverError}</AlertBanner>}

        {/* Announces each new question, and each cheer, to screen readers. */}
        <p aria-live="polite" className="sr-only">
          {cheer ? `${cheer.text} ` : ''}
          Question {progress.current} of {progress.total}: {step.question}
        </p>

        <div className="mb-1 flex items-center gap-2 text-xs font-bold tracking-wide text-[var(--color-brand-lilac-dark)] uppercase">
          <HollyIcon size={14} aria-hidden="true" />
          <span aria-hidden="true">
            Question {progress.current} of {progress.total}
          </span>
          {step.optional && <span className="font-semibold normal-case opacity-80">· optional</span>}
        </div>

        <h2
          ref={headingRef}
          tabIndex={-1}
          className="font-[family-name:var(--font-heading)] text-2xl leading-tight font-bold text-balance text-[var(--color-plum)] outline-none sm:text-3xl"
        >
          {step.question}
        </h2>
        <p className="mt-1.5 mb-5 text-[var(--color-ink-soft)]">{step.blurb}</p>

        {cheer && (
          // Overlaid, not in the flow. This used to be a block above the
          // question, so every "Next" pushed the whole form down and then —
          // 1.6s later, long after the player had started reading the next
          // question — snatched it back up. Two unannounced reflows per step
          // is what made the wizard feel like it was struggling to keep up.
          // As a floating pill it costs no layout, and it fades itself out
          // instead of disappearing between frames.
          <div
            key={cheer.id}
            aria-hidden="true"
            className="animate-cheer-toast pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center px-4"
          >
            <span className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--color-success-bg)] px-4 py-2 font-[family-name:var(--font-heading)] font-bold text-[var(--color-success)] shadow-[var(--shadow-lift)]">
              <SparkleIcon size={18} />
              {cheer.text}
            </span>
          </div>
        )}

        <div className="min-h-[9rem]">
          <StepFields
            step={step}
            copy={copy}
            values={values}
            errors={errors}
            update={update}
            context={context}
            steps={steps}
            onJump={(target) => {
              setShowErrors(false)
              setIndex(target)
            }}
            outcomeLabel={outcome.intent === 'waitlist' ? 'Waitlist entry' : null}
          />
        </div>

        <div className="mt-6 flex items-center gap-3 border-t border-[var(--color-brand-lilac-light)] pt-5">
          {safeIndex > 0 && (
            <Button type="button" variant="ghost" onClick={goBack} disabled={saving}>
              Back
            </Button>
          )}

          <div className="flex-1" />

          {isReview ? (
            <Button
              type="button"
              size="lg"
              loading={saving}
              disabled={!outcome.allowed}
              variant={outcome.intent === 'waitlist' ? 'festive' : 'primary'}
              onClick={handleSubmit}
            >
              <GiftIcon size={20} aria-hidden="true" />
              {outcome.submitLabel}
            </Button>
          ) : (
            <Button type="button" size="lg" onClick={goNext}>
              {step.optional && !String(values[step.fields[0]] ?? '').trim() ? 'Skip' : 'Next'}
              <ShuttlecockIcon size={18} aria-hidden="true" />
            </Button>
          )}
        </div>

        {isReview && !outcome.allowed && (
          <p className="mt-3 text-sm text-[var(--color-ink-soft)]">{outcome.reason}</p>
        )}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// The fields for whichever step is on screen
// ---------------------------------------------------------------------------

interface StepFieldsProps {
  step: WizardStep
  copy: SiteCopy
  steps: WizardStep[]
  values: RegistrationFormValues
  errors: Partial<Record<keyof RegistrationFormValues, string>>
  update: <K extends keyof RegistrationFormValues>(key: K, value: RegistrationFormValues[K]) => void
  context: RegistrationContext
  onJump: (index: number) => void
  outcomeLabel: string | null
}

function StepFields({
  step,
  copy,
  steps,
  values,
  errors,
  update,
  context,
  onJump,
  outcomeLabel,
}: StepFieldsProps) {
  switch (step.id) {
    case 'division':
      return (
        <>
          <DivisionPicker
            divisions={context.divisions}
            value={values.divisionId}
            onChange={(divisionId) => update('divisionId', divisionId)}
            error={errors.divisionId}
          />
          <Disclaimer>{copy.partnerDisclaimer}</Disclaimer>
        </>
      )

    case 'partner':
      return (
        <>
          <TextField
            label="Nominated partner"
            name="nominated-partner"
            autoComplete="off"
            value={values.nominatedPartner}
            onChange={(event) => update('nominatedPartner', event.target.value)}
            error={errors.nominatedPartner}
            hint="Their name is enough. Leave it blank and the committee will find you a partner."
          />
          <Disclaimer>
            This is a nomination, not a confirmed pair — the committee groups every pair itself, so
            please don’t assume you’re playing together until it shows on your dashboard.
          </Disclaimer>
        </>
      )

    case 'skill':
      return (
        <div className="grid gap-2.5">
          {SKILL_LEVELS.map((level) => {
            const selected = values.skillLevel === level.value
            return (
              <label
                key={level.value}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-[var(--radius-lg)] border-2 bg-white p-3.5 shadow-[var(--shadow-soft)] transition' +
                    FOCUS_RING,
                  selected
                    ? 'border-[var(--color-brand-mint-dark)] shadow-[var(--shadow-glow-mint)]'
                    : 'border-[var(--color-brand-lilac-light)]'
                )}
              >
                <input
                  type="radio"
                  name="skill-level"
                  className="peer sr-only"
                  value={level.value}
                  checked={selected}
                  onChange={() => update('skillLevel', level.value)}
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white',
                    selected ? 'bg-[image:var(--gradient-mint-sky)]' : 'bg-[var(--color-brand-lilac)]'
                  )}
                >
                  <TrophyIcon size={17} />
                </span>
                <span className="font-[family-name:var(--font-heading)] font-bold text-[var(--color-plum)]">
                  {level.label}
                </span>
              </label>
            )
          })}
          {errors.skillLevel && (
            <p role="alert" className="text-xs font-semibold text-[var(--color-danger)]">
              {errors.skillLevel}
            </p>
          )}
          <Disclaimer>{copy.skillPairingDisclaimer}</Disclaimer>
        </div>
      )

    case 'contact':
      return (
        <TextField
          label="Your phone number"
          type="tel"
          required
          autoFocus
          value={values.phone}
          onChange={(event) => update('phone', event.target.value)}
          error={errors.phone}
          placeholder="04XX XXX XXX"
          autoComplete="tel"
        />
      )

    case 'emergency':
      return (
        <div className="grid gap-x-4 sm:grid-cols-2">
          <TextField
            label="Emergency contact name"
            required
            autoFocus
            autoComplete="name"
            value={values.emergencyContactName}
            onChange={(event) => update('emergencyContactName', event.target.value)}
            error={errors.emergencyContactName}
            placeholder="Mrs Claus"
          />
          <TextField
            label="Emergency contact phone"
            type="tel"
            required
            autoComplete="tel"
            value={values.emergencyContactPhone}
            onChange={(event) => update('emergencyContactPhone', event.target.value)}
            error={errors.emergencyContactPhone}
            placeholder="04XX XXX XXX"
          />
        </div>
      )

    case 'notes': {
      const remaining = MAX_NOTES_LENGTH - values.dietaryNotes.length
      return (
        <FieldWrapper
          label="Dietary needs, injuries, anything else"
          htmlFor="registration-notes"
          error={errors.dietaryNotes}
          hint={`${Math.max(0, remaining)} characters left. Leave it blank if there’s nothing.`}
        >
          <textarea
            id="registration-notes"
            rows={4}
            value={values.dietaryNotes}
            onChange={(event) => update('dietaryNotes', event.target.value)}
            aria-invalid={!!errors.dietaryNotes}
            placeholder="Vegetarian, nut allergy, dodgy knee…"
            className={cn(
              'w-full rounded-[var(--radius-md)] border border-[var(--color-brand-lilac-light)] bg-white px-4 py-2.5 text-[var(--color-plum)] shadow-[var(--shadow-soft)] transition placeholder:text-[var(--color-ink-soft)]/60 focus:border-[var(--color-brand-pink)] focus:ring-2 focus:ring-[var(--color-brand-pink-light)] focus:outline-none',
              errors.dietaryNotes && 'border-[var(--color-danger)]'
            )}
          />
        </FieldWrapper>
      )
    }

    case 'pledge':
      return (
        <div>
          <label
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-[var(--radius-lg)] border-2 bg-white p-4 shadow-[var(--shadow-soft)] transition',
              errors.codeOfConductAccepted
                ? 'border-[var(--color-danger)]'
                : values.codeOfConductAccepted
                  ? 'border-[var(--color-brand-mint-dark)]'
                  : 'border-[var(--color-brand-lilac-light)]'
            )}
          >
            <input
              type="checkbox"
              checked={values.codeOfConductAccepted}
              onChange={(event) => update('codeOfConductAccepted', event.target.checked)}
              aria-invalid={!!errors.codeOfConductAccepted}
              className="mt-1 h-6 w-6 shrink-0 accent-[var(--color-brand-pink-dark)]"
            />
            <span className="text-sm text-[var(--color-ink-soft)]">
              <span className="block font-[family-name:var(--font-heading)] font-bold text-[var(--color-plum)]">
                I accept the code of conduct
              </span>
              Play fair, call your own faults, respect the umpire and the duty officials, and keep it merry on and off
              court. Read the full{' '}
              <a href="/rules" target="_blank" className="font-semibold text-[var(--color-brand-pink-dark)] underline">
                tournament rules
              </a>
              .
            </span>
          </label>
          {errors.codeOfConductAccepted && (
            <p role="alert" className="mt-1.5 text-xs font-semibold text-[var(--color-danger)]">
              {errors.codeOfConductAccepted}
            </p>
          )}
        </div>
      )

    case REVIEW_STEP_ID:
      return (
        <ReviewList
          steps={steps}
          values={values}
          context={context}
          onJump={onJump}
          outcomeLabel={outcomeLabel}
        />
      )

    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// The read-back before submitting
// ---------------------------------------------------------------------------

/**
 * Reads every answer back, each one a button that returns to the question that
 * set it. A wizard hides earlier answers by design, so without this the player
 * would be asked to submit something they can no longer see.
 */
function ReviewList({
  steps,
  values,
  context,
  onJump,
  outcomeLabel,
}: {
  steps: WizardStep[]
  values: RegistrationFormValues
  context: RegistrationContext
  onJump: (index: number) => void
  outcomeLabel: string | null
}) {
  const division = context.divisions.find((item) => item.id === values.divisionId)
  const skill = SKILL_LEVELS.find((level) => level.value === values.skillLevel)

  const answers: Record<string, string> = {
    division: division?.name ?? '—',
    partner: values.nominatedPartner.trim() || 'Committee to pair me',
    skill: skill?.label ?? '—',
    contact: values.phone || '—',
    emergency: [values.emergencyContactName, values.emergencyContactPhone].filter(Boolean).join(' · ') || '—',
    notes: values.dietaryNotes.trim() || 'Nothing to report',
    pledge: values.codeOfConductAccepted ? 'Accepted' : 'Not yet accepted',
  }

  return (
    <div>
      {outcomeLabel && (
        <div className="mb-3">
          <Badge status="pending">{outcomeLabel}</Badge>
        </div>
      )}
      <ul className="divide-y divide-[var(--color-brand-lilac-light)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-brand-lilac-light)] bg-white">
        {steps
          .filter((step) => step.id !== REVIEW_STEP_ID)
          .map((step) => {
            const target = steps.findIndex((item) => item.id === step.id)
            return (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => onJump(target)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[var(--color-brand-lilac-light)]/40"
                >
                  <span className="w-20 shrink-0 text-xs font-bold tracking-wide text-[var(--color-brand-lilac-dark)] uppercase">
                    {step.badge}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-[var(--color-plum)]">
                    {answers[step.id] ?? '—'}
                  </span>
                  <span aria-hidden="true" className="text-sm font-semibold text-[var(--color-brand-pink-dark)]">
                    Change
                  </span>
                  <span className="sr-only">Change your answer to: {step.question}</span>
                </button>
              </li>
            )
          })}
      </ul>
    </div>
  )
}

/**
 * A quiet, committee-authored note under a question.
 *
 * Deliberately not an `AlertBanner`: these are reassurances and expectations
 * ("we'll find you a partner", "you'll be paired on this answer"), and dressing
 * them as warnings would make a friendly form feel like it was telling players
 * off.
 */
function Disclaimer({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 rounded-[var(--radius-md)] bg-[var(--color-brand-lilac-light)]/40 px-3 py-2 text-sm text-[var(--color-ink-soft)]">
      {children}
    </p>
  )
}
