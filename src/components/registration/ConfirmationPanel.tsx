'use client'

import { useEffect, useState } from 'react'
import { Badge, Button, Card, Confetti } from '@/components/ui'
import { GiftIcon, HollyIcon, SparkleIcon, TrophyIcon } from '@/components/icons'
import { confirmationCopy } from '@/lib/registration'
import type { RegistrationStatus } from '@/lib/supabase/types'

export interface ConfirmationPanelProps {
  status: RegistrationStatus
  divisionName?: string | null
  /** True when the committee will be pairing this player. */
  freeAgent?: boolean
  /**
   * The organiser's saved tournament date in day-and-month form, from
   * `formatTournamentDayMonth`. Empty degrades the waitlist advice to
   * "tournament day" rather than quoting a stale date.
   */
  tournamentDayMonth?: string
  /** Committee-editable note about refunds and cancellations. */
  refundPolicyNote?: string
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
  freeAgent = false,
  tournamentDayMonth = '',
  refundPolicyNote = '',
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
          {/* Every entry is a free agent now that the committee does the
              pairing, so this badge no longer *distinguishes* anyone — it
              just answers "where's my partner?" before the player asks. */}
          {freeAgent && <Badge status="info">Partner assigned by the committee</Badge>}
        </div>
      </Card>


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
          <Button href="/rules" variant="ghost" size="lg">
            Brush up on the rules
          </Button>
        </div>

        {refundPolicyNote && (
          <p className="mt-5 rounded-[var(--radius-md)] bg-[var(--color-brand-lilac-light)]/40 px-3 py-2 text-sm text-[var(--color-ink-soft)]">
            <span className="font-semibold text-[var(--color-plum)]">Refunds &amp; cancellations: </span>
            {refundPolicyNote}
          </p>
        )}
      </Card>
    </>
  )
}
