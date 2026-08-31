'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { AlertBanner } from '@/components/auth'
import { FieldWrapper, TextField } from '@/components/auth/FormField'
import { Badge, Button, Card, Confetti } from '@/components/ui'
import { GiftIcon, ShuttlecockIcon, SparkleIcon, TrophyIcon } from '@/components/icons'
import {
  deriveSetupStage,
  slugify,
  validateSetupForm,
  canSubmitSetupForm,
  type SetupFormValues,
  type SetupStatus,
} from '@/lib/setup'
import type { SettingsIssue } from '@/lib/settings'
import {
  PRE_REGISTRATION_OPENS_AT,
  REGISTRATION_CLOSES_AT,
  TOURNAMENT_DATE,
} from '@/lib/tournament'
import { claimFirstAdminAction, createTournamentAction } from './actions'

/** Converts an ISO instant to the `YYYY-MM-DDTHH:mm` a datetime-local wants. */
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Seeded from the teaser poster, which is the only thing about this event
 * that is actually confirmed. Everything else is a starting point the
 * committee is expected to change — nothing here is treated as fact.
 */
const INITIAL_VALUES: SetupFormValues = {
  name: 'Sunday Smashers Christmas Mini Tournament',
  slug: 'sunday-smashers-christmas-2026',
  tournamentDate: toLocalInput(TOURNAMENT_DATE),
  venueName: '',
  venueAddress: '',
  description: '',
  registrationOpensAt: toLocalInput(PRE_REGISTRATION_OPENS_AT),
  registrationClosesAt: toLocalInput(REGISTRATION_CLOSES_AT),
  registrationCloseConfirmed: false,
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  entryFee: '',
  paymentInstructions: '',
  doorsOpenAt: '',
}

function issueFor(issues: readonly SettingsIssue[], path: string, severity: 'error' | 'warning') {
  return issues.find((i) => i.path === path && i.severity === severity)?.message
}

interface StepShellProps {
  step: number
  totalSteps: number
  heading: string
  blurb: string
  children: React.ReactNode
}

function StepShell({ step, totalSteps, heading, blurb, children }: StepShellProps) {
  return (
    <Card className="mx-auto w-full max-w-2xl p-6 sm:p-8">
      <div className="mb-6 flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-pink-light)] text-[var(--color-plum)]"
          aria-hidden="true"
        >
          <ShuttlecockIcon className="h-5 w-5" />
        </span>
        <div>
          <Badge>
            Step {step} of {totalSteps}
          </Badge>
          <h2 className="mt-1 text-2xl font-black text-[var(--color-plum)]">{heading}</h2>
        </div>
      </div>
      <p className="mb-6 text-[var(--color-ink-soft)]">{blurb}</p>
      {children}
    </Card>
  )
}

export function SetupClient({ status }: { status: SetupStatus }) {
  const router = useRouter()
  const info = deriveSetupStage(status)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [celebrating, setCelebrating] = useState(false)
  const [values, setValues] = useState<SetupFormValues>(INITIAL_VALUES)
  const [slugTouched, setSlugTouched] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const issues = useMemo(() => validateSetupForm(values), [values])
  const showIssues = submitted
  const err = (path: string) => (showIssues ? issueFor(issues, path, 'error') : undefined)
  const hint = (path: string) => issueFor(issues, path, 'warning')

  const set = <K extends keyof SetupFormValues>(key: K, value: SetupFormValues[K]) => {
    setValues((prev) => {
      const next = { ...prev, [key]: value }
      // Keep the shareable link in step with the name until someone edits it
      // by hand — then it is theirs and we stop touching it.
      if (key === 'name' && !slugTouched) next.slug = slugify(String(value))
      return next
    })
  }

  if (info.stage === 'unconfigured') {
    return (
      <StepShell {...info}>
        <ol className="ml-5 list-decimal space-y-2 text-sm text-[var(--color-ink-soft)]">
          <li>
            Create a Supabase project and run the migrations in{' '}
            <code className="rounded bg-black/5 px-1">supabase/migrations</code>.
          </li>
          <li>
            Set <code className="rounded bg-black/5 px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
            <code className="rounded bg-black/5 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, then redeploy.
          </li>
          <li>Return here to claim the first organiser account and create the tournament.</li>
        </ol>
        <p className="mt-4 text-sm text-[var(--color-ink-soft)]">
          The full sequence is written up in <code className="rounded bg-black/5 px-1">docs/GO-LIVE.md</code>.
        </p>
      </StepShell>
    )
  }

  if (info.stage === 'complete') {
    return (
      <StepShell {...info}>
        <div className="flex flex-wrap gap-3">
          <Button href="/admin">Open the admin console</Button>
          <Button href="/admin/settings" variant="secondary">
            Divisions, courts &amp; time slots
          </Button>
        </div>
      </StepShell>
    )
  }

  if (info.stage === 'needs-account') {
    return (
      <StepShell {...info}>
        <div className="flex flex-wrap gap-3">
          <Button href="/signup?next=/setup">Create the committee account</Button>
          <Button href="/login?next=/setup" variant="secondary">
            I already have one
          </Button>
        </div>
      </StepShell>
    )
  }

  if (info.stage === 'claim-admin') {
    return (
      <StepShell {...info}>
        <Confetti active={celebrating} count={40} />
        {error && (
          <AlertBanner variant="danger">
            {error}
          </AlertBanner>
        )}
        <Button
          disabled={pending}
          onClick={() => {
            if (pending) return
            setError(null)
            startTransition(async () => {
              const result = await claimFirstAdminAction()
              if (!result.ok) {
                setError(result.message)
                return
              }
              setCelebrating(true)
              router.refresh()
            })
          }}
        >
          <TrophyIcon className="mr-2 h-4 w-4" aria-hidden="true" />
          {pending ? 'Cutting the keys…' : 'Take the organiser seat'}
        </Button>
        <p className="mt-4 text-xs text-[var(--color-ink-soft)]">
          Only offered while the tournament has no organiser at all. Once you claim it, this
          screen stops offering — further organisers are added from Settings › Roles.
        </p>
      </StepShell>
    )
  }

  // stage === 'create-tournament'
  return (
    <StepShell {...info}>
      <Confetti active={celebrating} count={60} />
      {error && (
        <AlertBanner variant="danger">
          {error}
        </AlertBanner>
      )}
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          if (pending) return
          setSubmitted(true)
          setError(null)
          if (!canSubmitSetupForm(values)) return
          startTransition(async () => {
            const result = await createTournamentAction(values)
            if (!result.ok) {
              setError(result.message)
              return
            }
            setCelebrating(true)
            router.push('/admin/settings')
          })
        }}
      >
        <TextField
          label="Tournament name"
          required
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          error={err('details.name')}
        />
        <TextField
          label="Web address"
          required
          value={values.slug}
          onChange={(e) => {
            setSlugTouched(true)
            set('slug', e.target.value)
          }}
          error={err('slug')}
          hint="Becomes part of the link you share with players."
        />

        <div className="grid gap-x-4 sm:grid-cols-2">
          <TextField
            label="First serve"
            type="datetime-local"
            required
            value={values.tournamentDate}
            onChange={(e) => set('tournamentDate', e.target.value)}
            error={err('details.tournamentDate')}
          />
          <TextField
            label="Doors open"
            type="datetime-local"
            value={values.doorsOpenAt}
            onChange={(e) => set('doorsOpenAt', e.target.value)}
            error={err('doorsOpenAt')}
            hint={hint('doorsOpenAt')}
          />
          <TextField
            label="Registration opens"
            type="datetime-local"
            required
            value={values.registrationOpensAt}
            onChange={(e) => set('registrationOpensAt', e.target.value)}
            error={err('details.registrationOpensAt')}
          />
          <TextField
            label="Registration closes"
            type="datetime-local"
            required
            value={values.registrationClosesAt}
            onChange={(e) => set('registrationClosesAt', e.target.value)}
            error={err('details.registrationClosesAt')}
            hint={hint('details.registrationClosesAt')}
          />
        </div>

        <label className="mb-4 flex items-start gap-2 text-sm text-[var(--color-ink-soft)]">
          <input
            type="checkbox"
            className="mt-1"
            checked={values.registrationCloseConfirmed}
            onChange={(e) => set('registrationCloseConfirmed', e.target.checked)}
          />
          <span>
            The committee has agreed this closing date. (Leave unticked and the console keeps
            reminding you it is still a guess.)
          </span>
        </label>

        <div className="grid gap-x-4 sm:grid-cols-2">
          <TextField
            label="Venue"
            value={values.venueName}
            onChange={(e) => set('venueName', e.target.value)}
            hint={hint('details.venueName')}
          />
          <TextField
            label="Address"
            value={values.venueAddress}
            onChange={(e) => set('venueAddress', e.target.value)}
          />
          <TextField
            label="Entry fee per player"
            inputMode="decimal"
            placeholder="25"
            value={values.entryFee}
            onChange={(e) => set('entryFee', e.target.value)}
            error={err('entryFee')}
            hint={hint('entryFee') ?? 'Shown to players and pre-filled when you record payments.'}
          />
          <TextField
            label="Organiser name"
            value={values.contactName}
            onChange={(e) => set('contactName', e.target.value)}
          />
          <TextField
            label="Organiser email"
            type="email"
            value={values.contactEmail}
            onChange={(e) => set('contactEmail', e.target.value)}
            error={err('details.contactEmail')}
            hint={hint('details.contactEmail')}
          />
          <TextField
            label="Organiser phone"
            value={values.contactPhone}
            onChange={(e) => set('contactPhone', e.target.value)}
          />
        </div>

        <FieldWrapper
          label="How to pay"
          htmlFor="setup-payment"
          hint={hint('paymentInstructions') ?? 'Bank or PayID details, and what reference to use.'}
        >
          <textarea
            id="setup-payment"
            rows={3}
            value={values.paymentInstructions}
            onChange={(e) => set('paymentInstructions', e.target.value)}
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-brand-lilac-light)] bg-white px-4 py-2.5 text-[var(--color-plum)] shadow-[var(--shadow-soft)] focus:border-[var(--color-brand-pink)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-pink-light)]"
          />
        </FieldWrapper>

        <FieldWrapper label="Anything else players should know" htmlFor="setup-description">
          <textarea
            id="setup-description"
            rows={3}
            value={values.description}
            onChange={(e) => set('description', e.target.value)}
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-brand-lilac-light)] bg-white px-4 py-2.5 text-[var(--color-plum)] shadow-[var(--shadow-soft)] focus:border-[var(--color-brand-pink)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-pink-light)]"
          />
        </FieldWrapper>

        {showIssues && !canSubmitSetupForm(values) && (
          <AlertBanner variant="danger">
            A few answers need another look — they are marked above.
          </AlertBanner>
        )}

        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          <GiftIcon className="mr-2 h-4 w-4" aria-hidden="true" />
          {pending ? 'Wrapping it up…' : 'Create the tournament'}
        </Button>
        <p className="mt-3 flex items-start gap-1.5 text-xs text-[var(--color-ink-soft)]">
          <SparkleIcon className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span>
            Saved as a draft — nothing appears on the public site until you publish it and open
            registration from Settings.
          </span>
        </p>
      </form>
    </StepShell>
  )
}
