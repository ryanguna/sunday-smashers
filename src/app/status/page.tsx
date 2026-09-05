import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Button, Card, Snowfall } from '@/components/ui'
import { HollyIcon, ShuttlecockIcon, SparkleIcon } from '@/components/icons'
import { requireAuth } from '@/lib/auth'
import { viewerGateOutcome } from '@/lib/registration-gate-server'
import { loadSiteCopy } from '@/lib/site-copy-server'
import { loadPublicTournamentConfig } from '@/lib/tournament-config'
import { formatSydney } from '@/lib/settings'

export const metadata: Metadata = {
  title: 'Your entry',
  description: 'Where your Sunday Smashers entry stands.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/**
 * Where a player lands while the committee decides.
 *
 * Everything a not-yet-approved player is allowed to see lives on this one
 * page, and every word of it is the committee's — see `src/lib/site-copy.ts`.
 * An approved player has no business here, so they are sent back to the
 * dashboard rather than shown a page congratulating them on being approved.
 */
export default async function RegistrationStatusPage() {
  await requireAuth('/status')
  const outcome = await viewerGateOutcome()
  if (outcome === 'allow') redirect('/dashboard')

  const [copy, config] = await Promise.all([loadSiteCopy(), loadPublicTournamentConfig()])

  const view = {
    pending: {
      eyebrow: 'In review',
      heading: 'Your entry is with the committee',
      message: copy.pendingMessage,
      icon: <ShuttlecockIcon size={32} />,
      tone: 'var(--gradient-mint)',
    },
    waitlisted: {
      eyebrow: 'Waitlisted',
      heading: "You're on the waitlist",
      message: copy.waitlistedMessage,
      icon: <SparkleIcon size={32} />,
      tone: 'var(--gradient-gold)',
    },
    declined: {
      eyebrow: 'Not this time',
      heading: 'We could not accept your entry',
      message: copy.declinedMessage,
      icon: <HollyIcon size={32} />,
      tone: 'var(--gradient-gold)',
    },
  }[outcome]

  return (
    <main className="relative overflow-hidden px-4 py-16 sm:py-20">
      <Snowfall />
      <div className="relative z-10 mx-auto max-w-xl">
        <Card className="p-6 text-center sm:p-10">
          <span
            aria-hidden="true"
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-[var(--color-plum)] shadow-[var(--shadow-glow-mint)]"
            style={{ backgroundImage: view.tone }}
          >
            {view.icon}
          </span>
          <p className="font-[family-name:var(--font-script)] text-2xl text-[var(--color-brand-pink-dark)]">
            {view.eyebrow}
          </p>
          <h1 className="mt-1 text-3xl font-extrabold text-[var(--color-plum)] sm:text-4xl">
            {view.heading}
          </h1>
          <p className="mx-auto mt-4 max-w-prose whitespace-pre-line text-[var(--color-ink-soft)]">
            {view.message}
          </p>

          {outcome !== 'declined' && (
            <p className="mt-6 text-sm text-[var(--color-ink-muted)]">
              Tournament day is {formatSydney(config.dates.tournamentDate, { withTime: false })}.
            </p>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button href="/">Back to home court</Button>
            {outcome !== 'declined' && (
              <Button href="/rules" variant="secondary">
                Read the rules
              </Button>
            )}
          </div>
        </Card>
      </div>
    </main>
  )
}
