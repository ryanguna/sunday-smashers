'use client'

import { useEffect, useState } from 'react'
import { Badge, Button, Card, Confetti } from '@/components/ui'
import { GiftIcon, HollyIcon, SparkleIcon, TrophyIcon } from '@/components/icons'
import { confirmationCopy } from '@/lib/registration'
import { SharePartnerInvitePrompt } from './SharePartnerInvitePrompt'
import type { RegistrationStatus } from '@/lib/supabase/types'

export interface ConfirmationPanelProps {
  status: RegistrationStatus
  divisionName?: string | null
  /** True when a partner invite was saved as part of this registration. */
  invitedPartner?: boolean
  /** True when the player joined the free-agent pool instead. */
  freeAgent?: boolean
  /**
   * The organiser's saved tournament date in day-and-month form, from
   * `formatTournamentDayMonth`. Empty degrades the waitlist advice to
   * "tournament day" rather than quoting a stale date.
   */
  tournamentDayMonth?: string
  /**
   * Player-facing copy explaining why the partner invite did not go out, when
   * the entry itself saved. Already resolved from a whitelisted code by
   * `describePartnerWarning`, so it is never raw text from the URL.
   */
  partnerWarning?: string | null
}

/**
 * The festive "you're in" screen: confetti, what happens next, and the way
 * through to the player dashboard.
 *
 * Confetti is only switched on after mount so the celebratory burst never
 * differs between the server and client render, and `Confetti` itself
 * bails out entirely under `prefers-reduced-motion`.
 */
export function ConfirmationPanel({
  status,
  divisionName,
  invitedPartner = false,
  freeAgent = false,
  tournamentDayMonth = '',
  partnerWarning = null,
}: ConfirmationPanelProps) {
  const [celebrate, setCelebrate] = useState(false)
  const copy = confirmationCopy(status, tournamentDayMonth)

  useEffect(() => {
    // Intentional: the burst is a client-only flourish, started after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCelebrate(true)
    const timer = setTimeout(() => setCelebrate(false), 5000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <>
      <Confetti active={celebrate} count={56} />

      <Card variant="frosted" className="border-candy-stripe text-center">
        <span
          aria-hidden="true"
          className="animate-pop-in mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[image:var(--gradient-candy)] text-[var(--color-plum)] shadow-[var(--shadow-glow-pink)]"
        >
          {status === 'waitlisted' ? <HollyIcon size={32} /> : <TrophyIcon size={32} />}
        </span>
        <p className="font-[family-name:var(--font-script)] text-2xl text-[var(--color-brand-pink-dark)]">
          {copy.eyebrow}
        </p>
        <h2 className="mt-1 text-3xl font-extrabold text-[var(--color-plum)]">{copy.title}</h2>
        <p className="mx-auto mt-3 max-w-lg text-[var(--color-ink-soft)]">{copy.message}</p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {/* Same mapping the admin queue uses, so the player and the
              committee see the same colour for the same row. */}
          <Badge status={status === 'waitlisted' ? 'info' : 'pending'}>
            {status === 'waitlisted' ? 'Waitlisted' : 'Pending admin approval'}
          </Badge>
          {divisionName && <Badge status="info">{divisionName}</Badge>}
          {/* "sent" would be a lie — there is no mailer. The invite is saved
              and waits for the partner to sign up; the prompt below is what
              actually gets it to them. */}
          {invitedPartner && <Badge status="info">Partner invite saved</Badge>}
          {/* Every entry is a free agent now that the committee does the
              pairing, so this badge no longer *distinguishes* anyone — it
              just answers "where's my partner?" before the player asks. */}
          {freeAgent && <Badge status="info">Partner assigned by the committee</Badge>}
        </div>
      </Card>

      {/* The partner's email is deliberately not in the URL, so the nudge
          cannot name them here. It does on /register/invites, which reads the
          invite from the database. */}
      {invitedPartner && <SharePartnerInvitePrompt />}

      {partnerWarning && (
        <Card variant="default" className="mt-5 border-2 border-[var(--color-brand-gold-dark)] bg-[var(--color-brand-gold-light)]/30">
          <h3 className="flex items-center gap-2 text-lg font-bold text-[var(--color-plum)]">
            <span aria-hidden="true">🎯</span>
            Your partner hasn’t been invited yet
          </h3>
          <p className="mt-2 text-[var(--color-ink-soft)]">{partnerWarning}</p>
          <div className="mt-4">
            <Button href="/register/invites" variant="secondary">
              Manage partner invites
            </Button>
          </div>
        </Card>
      )}

      <Card variant="default" className="mt-5">
        <h3 className="mb-3 flex items-center gap-2 text-xl font-bold text-[var(--color-plum)]">
          <SparkleIcon size={20} className="text-[var(--color-brand-gold-dark)]" aria-hidden="true" />
          What happens next
        </h3>
        <ol className="grid gap-3">
          {copy.nextSteps.map((step, index) => (
            <li key={step} className="flex items-start gap-3 text-[var(--color-ink-soft)]">
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[image:var(--gradient-mint-sky)] font-[family-name:var(--font-heading)] text-sm font-bold text-white"
              >
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button href="/dashboard" size="lg">
            <GiftIcon size={20} aria-hidden="true" />
            Go to my dashboard
          </Button>
          {invitedPartner && (
            <Button href="/register/invites" variant="secondary" size="lg">
              Track my partner invite
            </Button>
          )}
          <Button href="/rules" variant="ghost" size="lg">
            Brush up on the rules
          </Button>
        </div>
      </Card>
    </>
  )
}
