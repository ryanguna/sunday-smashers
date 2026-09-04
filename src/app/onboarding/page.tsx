'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui'
import { GiftIcon } from '@/components/icons'
import { AuthShell } from '@/components/auth/AuthShell'
import { TextField, SelectField } from '@/components/auth/FormField'
import { AlertBanner, DemoModeNotice } from '@/components/auth/DemoModeNotice'
import { createClient } from '@/lib/supabase/client'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import type { ProfileRow } from '@/lib/supabase/types'

interface FormState {
  fullName: string
  nickname: string
  gender: string
  phone: string
  skillLevel: string
  emergencyContactName: string
  emergencyContactPhone: string
}

const EMPTY_FORM: FormState = {
  fullName: '',
  nickname: '',
  gender: '',
  phone: '',
  skillLevel: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
}

type FormErrors = Partial<Record<keyof FormState, string>>

function validate(form: FormState): FormErrors {
  const errors: FormErrors = {}
  if (form.fullName.trim().length < 2) errors.fullName = 'Please enter your full name.'
  if (!form.gender) errors.gender = 'Please select an option.'
  if (form.phone.trim().length < 6) errors.phone = 'Enter a contactable phone number.'
  if (!form.skillLevel) errors.skillLevel = 'Pick your skill level.'
  if (form.emergencyContactName.trim().length < 2) errors.emergencyContactName = 'Enter an emergency contact name.'
  if (form.emergencyContactPhone.trim().length < 6) errors.emergencyContactPhone = 'Enter an emergency contact phone.'
  return errors
}

export default function OnboardingPage() {
  const router = useRouter()
  const [loadingProfile, setLoadingProfile] = useState(isSupabaseConfigured())
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<FormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState<0 | 1>(0)

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      return
    }
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.replace('/login?next=%2Fonboarding')
        return
      }
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      const profile = data as ProfileRow | null
      if (profile) {
        setForm({
          fullName: profile.full_name ?? '',
          nickname: profile.nickname ?? '',
          gender: profile.gender ?? '',
          phone: profile.phone ?? '',
          skillLevel: profile.skill_level ?? '',
          emergencyContactName: profile.emergency_contact_name ?? '',
          emergencyContactPhone: profile.emergency_contact_phone ?? '',
        })
      }
      setLoadingProfile(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function handleNext(event: FormEvent) {
    event.preventDefault()
    const errs = validate(form)
    const step0Keys = ['fullName', 'gender', 'phone'] as const
    const relevant: FormErrors = {}
    for (const key of step0Keys) {
      if (errs[key]) relevant[key] = errs[key]
    }
    setErrors(relevant)
    if (Object.keys(relevant).length > 0) return
    setStep(1)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setServerError(null)
    const validation = validate(form)
    setErrors(validation)
    if (Object.keys(validation).length > 0) return

    setSaving(true)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setSaving(false)
      router.replace('/login?next=%2Fonboarding')
      return
    }

    const profileUpsert: Pick<
      ProfileRow,
      | 'id'
      | 'full_name'
      | 'nickname'
      | 'gender'
      | 'phone'
      | 'skill_level'
      | 'emergency_contact_name'
      | 'emergency_contact_phone'
    > = {
      id: user.id,
      full_name: form.fullName.trim(),
      nickname: form.nickname.trim() || null,
      gender: form.gender as ProfileRow['gender'],
      phone: form.phone.trim(),
      skill_level: form.skillLevel as ProfileRow['skill_level'],
      emergency_contact_name: form.emergencyContactName.trim(),
      emergency_contact_phone: form.emergencyContactPhone.trim(),
    }
    // Cast needed because `Database['public']['Tables']['profiles']['Insert']` resolves to
    // `never` — see the comment in `src/lib/auth.ts#getProfile` for why.
    const { error } = await supabase.from('profiles').upsert(profileUpsert as never)
    setSaving(false)
    if (error) {
      setServerError(error.message)
      return
    }
    // Full document load rather than `router.push` — see `/signup`. The
    // profile that was just written is what `/dashboard` renders, and the
    // router cache in front of it predates both the profile and the session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- discarding the client router cache is the point, not a side effect.
    window.location.assign('/dashboard')
  }

  if (!isSupabaseConfigured()) {
    return (
      <AuthShell icon={<GiftIcon size={26} />} eyebrow="Almost there" title="Set up your player profile">
        <DemoModeNotice what="Profile onboarding" />
      </AuthShell>
    )
  }

  if (loadingProfile) {
    return (
      <AuthShell icon={<GiftIcon size={26} />} eyebrow="Almost there" title="Set up your player profile">
        <p className="text-center text-sm text-[var(--color-ink-soft)]">Loading your details…</p>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      icon={<GiftIcon size={26} />}
      eyebrow="Almost there"
      title="Set up your player profile"
      subtitle={
        step === 0
          ? "Step 1 of 2 — the basics so we know who's smashing."
          : 'Step 2 of 2 — your game & safety details.'
      }
    >
      {serverError && <AlertBanner>{serverError}</AlertBanner>}
      <div className="mb-5 flex gap-2" aria-hidden="true">
        <span
          className={`h-1.5 flex-1 rounded-full ${step >= 0 ? 'bg-[image:var(--gradient-candy)]' : 'bg-[var(--color-brand-lilac-light)]'}`}
        />
        <span
          className={`h-1.5 flex-1 rounded-full ${step >= 1 ? 'bg-[image:var(--gradient-candy)]' : 'bg-[var(--color-brand-lilac-light)]'}`}
        />
      </div>

      {step === 0 ? (
        <form onSubmit={handleNext} noValidate>
          <TextField
            label="Full name"
            required
            value={form.fullName}
            onChange={(event) => update('fullName', event.target.value)}
            error={errors.fullName}
            placeholder="Holly Smasher"
          />
          <TextField
            label="Nickname"
            value={form.nickname}
            onChange={(event) => update('nickname', event.target.value)}
            hint="Optional — what we'll call you on the draw sheet."
            placeholder="Hollywood"
          />
          <SelectField
            label="Gender"
            required
            value={form.gender}
            onChange={(event) => update('gender', event.target.value)}
            error={errors.gender}
            options={[
              { value: 'male', label: 'Male' },
              { value: 'female', label: 'Female' },
              { value: 'other', label: 'Other' },
              { value: 'prefer_not_to_say', label: 'Prefer not to say' },
            ]}
          />
          <TextField
            label="Phone number"
            type="tel"
            required
            value={form.phone}
            onChange={(event) => update('phone', event.target.value)}
            error={errors.phone}
            placeholder="04XX XXX XXX"
          />
          <Button type="submit" className="mt-2 w-full">
            Next: your game & safety
          </Button>
        </form>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <SelectField
            label="Skill level"
            required
            value={form.skillLevel}
            onChange={(event) => update('skillLevel', event.target.value)}
            error={errors.skillLevel}
            options={[
              { value: 'beginner', label: 'Beginner' },
              { value: 'intermediate', label: 'Intermediate' },
              { value: 'advanced', label: 'Advanced' },
              { value: 'open', label: 'Open (competitive)' },
            ]}
          />
          <TextField
            label="Emergency contact name"
            required
            value={form.emergencyContactName}
            onChange={(event) => update('emergencyContactName', event.target.value)}
            error={errors.emergencyContactName}
            placeholder="Rudolph Reindeer"
          />
          <TextField
            label="Emergency contact phone"
            type="tel"
            required
            value={form.emergencyContactPhone}
            onChange={(event) => update('emergencyContactPhone', event.target.value)}
            error={errors.emergencyContactPhone}
            placeholder="04XX XXX XXX"
          />
          <div className="mt-2 flex gap-3">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button type="submit" className="flex-1" loading={saving}>
              Finish sign-up
            </Button>
          </div>
        </form>
      )}
    </AuthShell>
  )
}
