import type { Metadata } from 'next'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { getRegistrationWindow } from '@/lib/registration'
import { loadPublicTournamentConfig } from '@/lib/tournament-config'
import { PRE_REGISTRATION_OPENS_AT, REGISTRATION_CLOSES_AT } from '@/lib/tournament'
import { Countdown } from '@/components/ui'
import { RegistrationShell } from '@/components/registration/RegistrationShell'
import { RegisterExperience, type RegisterPreview } from '@/components/registration/RegisterExperience'
import { PageGate } from '@/components/PageGate'

export const metadata: Metadata = {
  title: 'Register',
  description:
    'Register for the Sunday Smashers Christmas Mini Tournament — Sunday 13 December 2026. Men’s and Women’s Doubles, loot bags for every player.',
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
  // Dates and the open/closed switch come from the tournament row, so the
  // committee can open the sheet for a test run without a redeploy (audit B4).
  const config = await loadPublicTournamentConfig()
  const info = getRegistrationWindow(previewNow(preview), {
    dates: config.dates,
    isRegistrationOpen: config.isRegistrationOpen,
  })
  const waitingRoom = info.window === 'not-open-yet'

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
        <RegisterExperience info={info} preview={preview} />

        {!isSupabaseConfigured() && (
          <nav
            aria-label="Demo preview states"
            className="mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-[var(--radius-lg)] bg-white/70 px-4 py-3 text-sm text-[var(--color-ink-muted)]"
          >
            <span className="font-semibold text-[var(--color-plum)]">Demo preview:</span>
            <a className="underline hover:text-[var(--color-brand-pink-dark)]" href="/register">
              Live state
            </a>
            <a className="underline hover:text-[var(--color-brand-pink-dark)]" href="/register?preview=open">
              Registration open
            </a>
            <a className="underline hover:text-[var(--color-brand-pink-dark)]" href="/register?preview=full">
              Division full
            </a>
            <a className="underline hover:text-[var(--color-brand-pink-dark)]" href="/register?preview=closed">
              Closed (waitlist)
            </a>
          </nav>
        )}
      </RegistrationShell>
    </PageGate>
  )
}
