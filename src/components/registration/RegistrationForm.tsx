'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { Badge, Button, Card } from '@/components/ui'
import { AlertBanner } from '@/components/auth'
import { FieldWrapper, SelectField, TextField } from '@/components/auth/FormField'
import { GiftIcon, HollyIcon, ShuttlecockIcon, SparkleIcon } from '@/components/icons'
import { cn } from '@/lib/cn'
import {
  decideRegistrationOutcome,
  divisionCapacity,
  EMPTY_REGISTRATION_FORM,
  hasErrors,
  isDivisionEligible,
  isDuplicateRegistration,
  MAX_NOTES_LENGTH,
  SHIRT_SIZES,
  SKILL_LEVELS,
  validateRegistrationForm,
  type RegistrationFormErrors,
  type RegistrationFormValues,
  type RegistrationWindow,
} from '@/lib/registration'
import { DivisionPicker } from './DivisionPicker'
import { submitRegistration, type RegistrationContext, type SubmitRegistrationResult } from './data'

export interface RegistrationFormProps {
  context: RegistrationContext
  window: RegistrationWindow
  onSubmitted: (result: SubmitRegistrationResult) => void
}

/** Simple festive section divider with a motif in the middle. */
function SectionRule({ label }: { label: string }) {
  return (
    <div className="mt-8 mb-4 flex items-center gap-3">
      <span className="h-px flex-1 bg-[var(--color-brand-lilac-light)]" aria-hidden="true" />
      <span className="flex items-center gap-1.5 font-[family-name:var(--font-heading)] text-sm font-bold tracking-wide text-[var(--color-brand-lilac-dark)] uppercase">
        <HollyIcon size={16} aria-hidden="true" />
        {label}
      </span>
      <span className="h-px flex-1 bg-[var(--color-brand-lilac-light)]" aria-hidden="true" />
    </div>
  )
}

/**
 * The main registration form. Everything it decides — eligibility, capacity,
 * whether this submission becomes a real entry or a waitlist entry, and every
 * validation message — comes from the pure helpers in `@/lib/registration`,
 * so the behaviour is unit tested rather than trapped in the JSX.
 */
export function RegistrationForm({ context, window: registrationWindow, onSubmitted }: RegistrationFormProps) {
  const profile = context.profile

  const eligibleDivisions = useMemo(
    () => context.divisions.filter((division) => isDivisionEligible(division.gender, profile?.gender)),
    [context.divisions, profile?.gender]
  )

  const [values, setValues] = useState<RegistrationFormValues>(() => ({
    ...EMPTY_REGISTRATION_FORM,
    // Pre-select when there's only one division the player can actually enter.
    divisionId: eligibleDivisions.length === 1 ? eligibleDivisions[0].id : '',
    shirtSize: profile?.shirt_size ?? '',
    skillLevel: profile?.skill_level ?? '',
    phone: profile?.phone ?? '',
    emergencyContactName: profile?.emergency_contact_name ?? '',
    emergencyContactPhone: profile?.emergency_contact_phone ?? '',
  }))
  const [errors, setErrors] = useState<RegistrationFormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const selectedDivision = context.divisions.find((division) => division.id === values.divisionId) ?? null
  const capacity = selectedDivision ? divisionCapacity(selectedDivision) : null

  const outcome = decideRegistrationOutcome({
    window: registrationWindow,
    divisionFull: capacity?.isFull ?? false,
    alreadyRegistered: values.divisionId
      ? isDuplicateRegistration(context.myRegistrations, values.divisionId)
      : false,
  })

  function update<K extends keyof RegistrationFormValues>(key: K, value: RegistrationFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setServerError(null)

    const validation = validateRegistrationForm(values, {
      eligibleDivisionIds: eligibleDivisions.map((division) => division.id),
      selfEmail: context.userEmail,
      selfHandle: profile?.nickname ?? null,
    })
    setErrors(validation)
    if (hasErrors(validation)) return

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

  const notesRemaining = MAX_NOTES_LENGTH - values.dietaryNotes.length

  return (
    <Card variant="frosted" className="border-candy-stripe">
      <form onSubmit={handleSubmit} noValidate className="p-1 sm:p-2">
        {serverError && <AlertBanner>{serverError}</AlertBanner>}

        <SectionRule label="Pick your court" />
        <DivisionPicker
          divisions={context.divisions}
          value={values.divisionId}
          onChange={(divisionId) => update('divisionId', divisionId)}
          profileGender={profile?.gender}
          error={errors.divisionId}
        />

        <SectionRule label="Partner up" />
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          {(
            [
              {
                mode: 'partner' as const,
                title: 'I have a partner',
                blurb: 'Invite them by email or handle — they confirm and you’re a pair.',
                icon: <ShuttlecockIcon size={19} />,
              },
              {
                mode: 'solo' as const,
                title: 'Find me a partner',
                blurb: 'Join the free-agent pool and the committee will match you up.',
                icon: <SparkleIcon size={19} />,
              },
            ]
          ).map((option) => {
            const selected = values.partnerMode === option.mode
            return (
              <label
                key={option.mode}
                className={cn(
                  'flex cursor-pointer flex-col gap-1 rounded-[var(--radius-lg)] border-2 bg-white p-4 shadow-[var(--shadow-soft)] transition hover-lift',
                  selected
                    ? 'border-[var(--color-brand-mint-dark)] shadow-[var(--shadow-glow-mint)]'
                    : 'border-[var(--color-brand-lilac-light)]'
                )}
              >
                <input
                  type="radio"
                  name="partner-mode"
                  className="sr-only"
                  value={option.mode}
                  checked={selected}
                  onChange={() => update('partnerMode', option.mode)}
                />
                <span className="flex items-center gap-2 font-[family-name:var(--font-heading)] font-bold text-[var(--color-plum)]">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full text-white',
                      selected ? 'bg-[image:var(--gradient-mint-sky)]' : 'bg-[var(--color-brand-lilac)]'
                    )}
                  >
                    {option.icon}
                  </span>
                  {option.title}
                </span>
                <span className="text-sm text-[var(--color-ink-soft)]">{option.blurb}</span>
              </label>
            )
          })}
        </div>

        {values.partnerMode === 'partner' ? (
          <TextField
            label="Partner’s email or player handle"
            required
            value={values.partnerIdentifier}
            onChange={(event) => update('partnerIdentifier', event.target.value)}
            error={errors.partnerIdentifier}
            hint="We’ll send them an invite — your pair is locked in once they accept. Try “holly@example.com” or “@hollysmash”."
            placeholder="rudolph@example.com"
            autoComplete="off"
          />
        ) : (
          <div className="mb-4 rounded-[var(--radius-md)] bg-[var(--color-info-bg)] p-4 text-sm text-[var(--color-info)]">
            <p className="font-[family-name:var(--font-heading)] font-bold">You’re joining the free-agent pool 🎅</p>
            <p className="mt-1">
              No partner, no problem — we&rsquo;ll pair you with another solo smasher of a similar level before the
              draw, and let you both know by email.
            </p>
          </div>
        )}

        <SectionRule label="Loot bag & safety" />
        <div className="grid gap-x-4 sm:grid-cols-2">
          <SelectField
            label="Shirt size (for your loot bag 🎁)"
            required
            value={values.shirtSize}
            onChange={(event) => update('shirtSize', event.target.value)}
            error={errors.shirtSize}
            options={SHIRT_SIZES.map((size) => ({ value: size, label: size }))}
          />
          <SelectField
            label="Skill level"
            required
            value={values.skillLevel}
            onChange={(event) => update('skillLevel', event.target.value)}
            error={errors.skillLevel}
            options={SKILL_LEVELS.map((level) => ({ value: level.value, label: level.label }))}
          />
          <TextField
            label="Your phone number"
            type="tel"
            required
            value={values.phone}
            onChange={(event) => update('phone', event.target.value)}
            error={errors.phone}
            placeholder="04XX XXX XXX"
            autoComplete="tel"
          />
          <TextField
            label="Emergency contact name"
            required
            value={values.emergencyContactName}
            onChange={(event) => update('emergencyContactName', event.target.value)}
            error={errors.emergencyContactName}
            placeholder="Mrs Claus"
          />
          <TextField
            label="Emergency contact phone"
            type="tel"
            required
            value={values.emergencyContactPhone}
            onChange={(event) => update('emergencyContactPhone', event.target.value)}
            error={errors.emergencyContactPhone}
            placeholder="04XX XXX XXX"
            className="sm:col-span-1"
          />
        </div>

        <FieldWrapper
          label="Dietary needs or anything else we should know"
          htmlFor="registration-notes"
          error={errors.dietaryNotes}
          hint={`Allergies, injuries, “please don’t schedule me before 10am” — ${Math.max(0, notesRemaining)} characters left.`}
        >
          <textarea
            id="registration-notes"
            rows={3}
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

        <SectionRule label="The festive fine print" />
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
            className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-brand-pink-dark)]"
          />
          <span className="text-sm text-[var(--color-ink-soft)]">
            <span className="block font-[family-name:var(--font-heading)] font-bold text-[var(--color-plum)]">
              I accept the code of conduct
            </span>
            Play fair, call your own faults, respect the umpire and the duty officials, and keep it merry on and off
            court. Read the full{' '}
            <a href="/rules" className="font-semibold text-[var(--color-brand-pink-dark)] underline">
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

        <div className="mt-6 rounded-[var(--radius-lg)] bg-white/70 p-4">
          <div className="mb-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center">
            <Badge status={outcome.intent === 'waitlist' ? 'pending' : outcome.allowed ? 'approved' : 'unpaid'}>
              {outcome.intent === 'waitlist'
                ? 'Waitlist entry'
                : outcome.allowed
                  ? 'Goes to the committee'
                  : 'Can’t submit yet'}
            </Badge>
            <p className="flex-1 text-sm text-[var(--color-ink-soft)]">{outcome.reason}</p>
          </div>
          <Button
            type="submit"
            size="lg"
            className="w-full"
            loading={saving}
            disabled={!outcome.allowed}
            variant={outcome.intent === 'waitlist' ? 'festive' : 'primary'}
          >
            <GiftIcon size={20} aria-hidden="true" />
            {outcome.submitLabel}
          </Button>
        </div>
      </form>
    </Card>
  )
}
