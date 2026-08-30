'use client'

import { useState, useTransition } from 'react'
import { Button, Card, CardBody, Modal } from '@/components/ui'
import { SparkleIcon } from '@/components/icons'
import { cn } from '@/lib/cn'
import { createClient } from '@/lib/supabase/client'
import type { ProfileRow } from '@/lib/supabase/types'

export interface ProfileCardProps {
  profile: ProfileRow | null
  /** Demo mode — saving is simulated rather than written to Supabase. */
  demo: boolean
  className?: string
}

const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'] as const

interface FormValues {
  full_name: string
  nickname: string
  avatar_url: string
  shirt_size: string
  phone: string
  emergency_contact_name: string
  emergency_contact_phone: string
}

function toForm(profile: ProfileRow | null): FormValues {
  return {
    full_name: profile?.full_name ?? '',
    nickname: profile?.nickname ?? '',
    avatar_url: profile?.avatar_url ?? '',
    shirt_size: profile?.shirt_size ?? '',
    phone: profile?.phone ?? '',
    emergency_contact_name: profile?.emergency_contact_name ?? '',
    emergency_contact_phone: profile?.emergency_contact_phone ?? '',
  }
}

function Field({
  label,
  id,
  value,
  onChange,
  type = 'text',
  hint,
  autoComplete,
}: {
  label: string
  id: string
  value: string
  onChange: (value: string) => void
  type?: string
  hint?: string
  autoComplete?: string
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="text-sm font-extrabold text-[var(--color-plum)]">{label}</span>
      {hint && <span className="block text-xs text-[var(--color-ink-muted)]">{hint}</span>}
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-[var(--radius-md)] border-2 border-[var(--color-brand-lilac-light)] bg-white px-3 py-2 text-[var(--color-ink)] focus:border-[var(--color-brand-lilac)] focus:outline-none"
      />
    </label>
  )
}

/**
 * Your details, plus the edit form. Contact details (phone, emergency
 * contact) are private to the player and admins — `profiles` has no public
 * read policy — so they are labelled as such and never rendered on any
 * public page.
 */
export function ProfileCard({ profile, demo, className }: ProfileCardProps) {
  const [values, setValues] = useState<FormValues>(() => toForm(profile))
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const set = (key: keyof FormValues) => (value: string) => setValues((current) => ({ ...current, [key]: value }))

  const save = () => {
    setError(null)
    if (!values.full_name.trim()) {
      setError('We need a name to put on the scoresheet.')
      return
    }

    startTransition(async () => {
      if (demo || !profile) {
        setMessage('Demo mode — in the real app your details would be saved. 🎄')
        setOpen(false)
        return
      }
      try {
        const supabase = createClient()
        const { error: saveError } = await supabase
          .from('profiles')
          .update({
            full_name: values.full_name.trim(),
            nickname: values.nickname.trim() || null,
            avatar_url: values.avatar_url.trim() || null,
            shirt_size: (values.shirt_size || null) as ProfileRow['shirt_size'],
            phone: values.phone.trim() || null,
            emergency_contact_name: values.emergency_contact_name.trim() || null,
            emergency_contact_phone: values.emergency_contact_phone.trim() || null,
          } as never)
          .eq('id', profile.id)
        if (saveError) {
          setError(`We couldn’t save that: ${saveError.message}`)
          return
        }
        setMessage('Saved! Your details are up to date. ✨')
        setOpen(false)
      } catch {
        setError('Something went wrong saving your details. Try again in a moment.')
      }
    })
  }

  const initials = (values.full_name || 'Smasher')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <Card variant="frosted" className={cn(className)}>
      <CardBody className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-[image:var(--gradient-candy)] font-[family-name:var(--font-heading)] text-lg font-extrabold text-white">
            {values.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={values.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold" style={{ color: 'var(--color-plum)' }}>
              {values.full_name || 'Your details'}
            </h2>
            <p className="text-sm text-[var(--color-ink-muted)]">
              {values.nickname ? `@${values.nickname}` : 'No nickname yet'}
              {values.shirt_size ? ` · Shirt ${values.shirt_size}` : ''}
            </p>
          </div>
          <Button size="sm" variant="secondary" className="ml-auto" onClick={() => setOpen(true)}>
            Edit details
          </Button>
        </div>

        <dl className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="rounded-[var(--radius-lg)] bg-white/85 px-3 py-2">
            <dt className="text-[0.65rem] font-extrabold tracking-widest text-[var(--color-ink-muted)] uppercase">
              Phone (private)
            </dt>
            <dd className="text-sm font-semibold text-[var(--color-plum)]">{values.phone || 'Not provided'}</dd>
          </div>
          <div className="rounded-[var(--radius-lg)] bg-white/85 px-3 py-2">
            <dt className="text-[0.65rem] font-extrabold tracking-widest text-[var(--color-ink-muted)] uppercase">
              Emergency contact (private)
            </dt>
            <dd className="text-sm font-semibold text-[var(--color-plum)]">
              {values.emergency_contact_name || 'Not provided'}
              {values.emergency_contact_phone ? ` · ${values.emergency_contact_phone}` : ''}
            </dd>
          </div>
        </dl>

        <p className="mt-3 flex items-start gap-2 text-xs text-[var(--color-ink-muted)]">
          <SparkleIcon size={14} className="mt-0.5 shrink-0 text-[var(--color-brand-gold-dark)]" />
          Your phone number and emergency contact are visible only to you and the tournament committee — never
          on the public players page.
        </p>

        {message && (
          <p role="status" className="mt-3 rounded-[var(--radius-lg)] bg-[var(--color-success-bg)] px-3 py-2 text-sm font-semibold text-[var(--color-success)]">
            {message}
          </p>
        )}

        <Modal open={open} onClose={() => setOpen(false)} title="Edit your details" description="Keep your name, shirt size and emergency contact up to date for tournament day.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" id="profile-full-name" value={values.full_name} onChange={set('full_name')} autoComplete="name" />
            <Field label="Nickname" id="profile-nickname" value={values.nickname} onChange={set('nickname')} hint="Shown on the scoreboard" />
            <Field label="Avatar URL" id="profile-avatar" value={values.avatar_url} onChange={set('avatar_url')} hint="A link to your photo" />
            <label htmlFor="profile-shirt" className="block">
              <span className="text-sm font-extrabold text-[var(--color-plum)]">Shirt size</span>
              <select
                id="profile-shirt"
                value={values.shirt_size}
                onChange={(event) => set('shirt_size')(event.target.value)}
                className="mt-1 w-full rounded-[var(--radius-md)] border-2 border-[var(--color-brand-lilac-light)] bg-white px-3 py-2 text-[var(--color-ink)] focus:border-[var(--color-brand-lilac)] focus:outline-none"
              >
                <option value="">Pick a size</option>
                {SHIRT_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <Field label="Phone" id="profile-phone" value={values.phone} onChange={set('phone')} type="tel" hint="Private" autoComplete="tel" />
            <Field
              label="Emergency contact"
              id="profile-emergency-name"
              value={values.emergency_contact_name}
              onChange={set('emergency_contact_name')}
              hint="Private"
            />
            <Field
              label="Emergency contact phone"
              id="profile-emergency-phone"
              value={values.emergency_contact_phone}
              onChange={set('emergency_contact_phone')}
              type="tel"
              hint="Private"
            />
          </div>

          {error && (
            <p role="alert" className="mt-3 rounded-[var(--radius-lg)] bg-[var(--color-danger-bg)] px-3 py-2 text-sm font-semibold text-[var(--color-danger)]">
              {error}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="festive" onClick={save} disabled={pending}>
              {pending ? 'Saving…' : 'Save details'}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </Modal>
      </CardBody>
    </Card>
  )
}
