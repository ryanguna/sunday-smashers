import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { getRegistrationWindow } from '@/lib/registration'
import { loadPublicTournamentConfig } from '@/lib/tournament-config'
import { PRE_REGISTRATION_OPENS_AT, REGISTRATION_CLOSES_AT, formatTournamentDateLabel } from '@/lib/tournament'
import { Countdown } from '@/components/ui'
import { describeEntryFee } from '@/lib/setup'
import { RegistrationShell } from '@/components/registration/RegistrationShell'
import { RegisterExperience, type RegisterPreview } from '@/components/registration/RegisterExperience'
import { PageGate } from '@/components/PageGate'
import { loadSiteCopy } from '@/lib/site-copy-server'
import { loadViewerRegistrationStatus } from '@/lib/registration-gate-server'
import { REGISTRATION_STATUS_PATH } from '@/lib/registration-gate'

// The register link is the one most likely to be pasted into a group chat,
// so its description must name the date the organiser actually saved.
export async function generateMetadata(): Promise<Metadata> {
  const { dates } = await loadPublicTournamentConfig()

  return {
    title: 'Register',
    description: `Register for the Sunday Smashers Christmas Mini Tournament — ${formatTournamentDateLabel(
      dates.tournamentDate,
    )}. Men’s and Women’s Doubles, loot bags for every player.`,
  }
}

const PREVIEWS: RegisterPreview[] = ['open', 'closed', 'full']

/**
 * Demo-mode-only preview switch. It lets reviewers walk through the open
 * form, the "division full" waitlist path and the post-close state without
 * waiting for 6 September 2026, and is **ignored entirely** once Supabase is
 * configured, so it can never be used to open registration early in
 * production.
 */
function readPreview(raw: string | string[] | undefined): RegisterPreview | null {
  if (!isSupabaseConfigured()) {
    const value = Array.isArray(raw) ? raw[0] : raw
    if (value && (PREVIEWS as string[]).includes(value)) return value as RegisterPreview
  }
  return null
}

/** A representative `now` for each demo preview, so every derived value agrees. */
function previewNow(preview: RegisterPreview | null): Date {
  if (preview === 'open' || preview === 'full') {
    return new Date(new Date(PRE_REGISTRATION_OPENS_AT).getTime() + 24 * 60 * 60 * 1000)
  }
  if (preview === 'closed') {
    return new Date(new Date(REGISTRATION_CLOSES_AT).getTime() + 60 * 60 * 1000)
  }
  return new Date()
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const preview = readPreview(params.preview)
  // A player who has already entered has no use for a blank wizard, and
  // `/dashboard` now sends anyone *without* an entry here — so without this
  // the two pages would volley an entered player back and forth. `/status`
  // tells a pending or waitlisted player where they stand and forwards an
  // approved one to their dashboard.
  //
  // `?again=1` is the way out: entries are per division and the database
  // allows a second one, so this must be a redirect a player can decline
  // rather than a wall across a legitimate path.
  if (params.again == null && (await loadViewerRegistrationStatus()) !== null) {
    redirect(REGISTRATION_STATUS_PATH)
  }
  // Dates and the open/closed switch come from the tournament row, so the
  // committee can open the sheet for a test run without a redeploy (audit B4).
  const config = await loadPublicTournamentConfig()
  // The disclaimers are the committee's words, edited in /admin/settings/copy.
  const copy = await loadSiteCopy()
  const info = getRegistrationWindow(previewNow(preview), {
    dates: config.dates,
    isRegistrationOpen: config.isRegistrationOpen,
  })
  const waitingRoom = info.window === 'not-open-yet'
  const entryFee = describeEntryFee(config.entryFeeCents)

  return (
    <PageGate pageKey="register">
      <RegistrationShell
        eyebrow="Sign up &amp; smash"
        title={waitingRoom ? 'Pre-registration' : 'Register to play'}
        description={waitingRoom ? undefined : info.message}
        aside={
          !waitingRoom && info.countdownTarget ? (
            <div className="flex flex-col items-center gap-2">
              <p className="font-[family-name:var(--font-heading)] text-sm font-bold tracking-wide text-[var(--color-brand-lilac-dark)] uppercase">
                {info.countdownLabel}
              </p>
              <Countdown target={info.countdownTarget} />
            </div>
          ) : undefined
        }
      >
        {/* The form asked for a partner's name, a skill level and an
            emergency contact without once saying what entering costs, so it
            was possible to pre-register and only discover the fee afterwards.
            One figure and nothing else: how to pay is a question for after
            the committee approves an entry, and it was crowding out the
            number people came here to find. */}
        {entryFee && (
          <p className="mb-6 rounded-[var(--radius-lg)] bg-[var(--color-brand-gold-light)]/50 px-4 py-3 text-sm text-[var(--color-ink)]">
            <span className="font-extrabold text-[var(--color-plum)]">Entry is {entryFee}</span>
          </p>
        )}

        <RegisterExperience info={info} preview={preview} copy={copy} />

        {!isSupabaseConfigured() && (
          <nav
            aria-label="Demo preview states"
            className="mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-[var(--radius-lg)] bg-white/70 px-4 py-3 text-sm text-[var(--color-ink-muted)]"
          >
            <span className="font-semibold text-[var(--color-plum)]">Demo preview:</span>
            <a className="inline-flex min-h-[24px] items-center underline hover:text-[var(--color-brand-pink-dark)]" href="/register">
              Live state
            </a>
            <a className="inline-flex min-h-[24px] items-center underline hover:text-[var(--color-brand-pink-dark)]" href="/register?preview=open">
              Registration open
            </a>
            <a className="inline-flex min-h-[24px] items-center underline hover:text-[var(--color-brand-pink-dark)]" href="/register?preview=full">
              Division full
            </a>
            <a className="inline-flex min-h-[24px] items-center underline hover:text-[var(--color-brand-pink-dark)]" href="/register?preview=closed">
              Closed (waitlist)
            </a>
          </nav>
        )}
      </RegistrationShell>
    </PageGate>
  )
}
