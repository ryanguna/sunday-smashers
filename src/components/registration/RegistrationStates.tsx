'use client'

import { Button, Card, Countdown, EmptyState } from '@/components/ui'
import {
  BaubleIcon,
  GiftIcon,
  MedalIcon,
  RacketIcon,
  ShuttlecockIcon,
  SnowflakeIcon,
  TrophyIcon,
} from '@/components/icons'
import type { RegistrationWindowInfo } from '@/lib/registration'

/** The prep checklist shown while players wait for the window to open. */
const PREP_LIST = [
  { icon: <ShuttlecockIcon size={18} />, text: 'Find a partner (or plan to join the free-agent pool).' },
  { icon: <GiftIcon size={18} />, text: 'Bring festive spirit — every player goes home with a loot bag 🎁' },
  { icon: <MedalIcon size={18} />, text: 'Be honest about your level so the draw stays fair.' },
  { icon: <BaubleIcon size={18} />, text: 'Have an emergency contact handy.' },
]

/**
 * Entries are not open yet.
 *
 * `signedIn` is deliberately three-valued. This panel renders *before*
 * `RegisterExperience` has resolved the session, and it used to unconditionally
 * offer "Create your player account" — so a player who was already logged in
 * was told to sign up again, which reads as the site having forgotten them.
 * `null` means "we don't know yet": show only the neutral action rather than
 * flashing the wrong one and correcting it a moment later.
 */
export function NotOpenYetPanel({
  info,
  signedIn = null,
}: {
  info: RegistrationWindowInfo
  signedIn?: boolean | null
}) {
  return (
    <div className="grid gap-5">
      <Card variant="frosted" className="border-candy-stripe text-center">
        <p className="font-[family-name:var(--font-heading)] text-sm font-bold tracking-wide text-[var(--color-brand-lilac-dark)] uppercase">
          {info.countdownLabel}
        </p>
        {info.countdownTarget && (
          <div className="mt-4 flex justify-center">
            <Countdown target={info.countdownTarget} />
          </div>
        )}
        <p className="mx-auto mt-5 max-w-md text-[var(--color-ink-soft)]">{info.message}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {signedIn === true && (
            <Button href="/dashboard" variant="primary">
              Go to my dashboard
            </Button>
          )}
          {signedIn === false && (
            <Button href="/signup" variant="primary">
              Create your player account
            </Button>
          )}
          <Button href="/rules" variant={signedIn === null ? 'primary' : 'secondary'}>
            Read the rules first
          </Button>
        </div>
      </Card>

      <Card variant="default">
        <h2 className="mb-3 flex items-center gap-2 text-xl font-bold text-[var(--color-plum)]">
          <SnowflakeIcon size={20} className="text-[var(--color-brand-sky-dark)]" aria-hidden="true" />
          Get match-ready while you wait
        </h2>
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {PREP_LIST.map((item) => (
            <li key={item.text} className="flex items-start gap-2.5 text-sm text-[var(--color-ink-soft)]">
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[image:var(--gradient-mint-sky)] text-white"
              >
                {item.icon}
              </span>
              {item.text}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

export function SignInPromptPanel() {
  return (
    <Card variant="frosted" className="border-candy-stripe text-center">
      <span
        aria-hidden="true"
        className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[image:var(--gradient-candy)] text-[var(--color-plum)] shadow-[var(--shadow-glow-pink)]"
      >
        <RacketIcon size={28} />
      </span>
      <h2 className="text-2xl font-bold text-[var(--color-plum)]">Sign in to claim your spot</h2>
      <p className="mx-auto mt-2 max-w-md text-[var(--color-ink-soft)]">
        Registration is tied to your player account so we can text you your court times, track your loot bag and
        match you with a partner. It takes about 30 seconds 🎄
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <Button href="/login?next=%2Fregister" size="lg">
          Sign in
        </Button>
        <Button href="/signup" size="lg" variant="secondary">
          Create an account
        </Button>
      </div>
      <p className="mt-4 text-sm text-[var(--color-ink-muted)]">
        Already registered? Your entry lives on your{' '}
        <a href="/dashboard" className="font-semibold text-[var(--color-brand-pink-dark)] underline">
          player dashboard
        </a>
        .
      </p>
    </Card>
  )
}

export function TournamentOverPanel({ info }: { info: RegistrationWindowInfo }) {
  return (
    <EmptyState
      icon={<TrophyIcon size={30} />}
      title={info.heading}
      description={info.message}
      action={
        <div className="flex flex-wrap justify-center gap-3">
          <Button href="/live">Follow the live scores</Button>
          <Button href="/standings" variant="secondary">
            See the standings
          </Button>
        </div>
      }
    />
  )
}

export function NoDivisionsPanel() {
  return (
    <EmptyState
      icon={<ShuttlecockIcon size={30} />}
      title="No divisions are published yet"
      description="The committee is still setting the courts up. Check back shortly — Men’s and Women’s Doubles are on the way 🎄"
      action={
        <Button href="/rules" variant="secondary">
          Read the rules
        </Button>
      }
    />
  )
}
