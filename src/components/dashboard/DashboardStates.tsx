import Link from 'next/link'
import { Button, Card, CardBody, Countdown } from '@/components/ui'
import { BaubleIcon, GiftIcon, ShuttlecockIcon, TrophyIcon } from '@/components/icons'
import { cn } from '@/lib/cn'
import { formatTournamentDateLabel, getTournamentPhase, type TournamentDates } from '@/lib/tournament'
import type { DashboardStage } from '@/lib/dashboard'

export interface DashboardGreetingProps {
  name: string
  stage: DashboardStage
  divisionName: string | null
  demo: boolean
  /** Server-resolved clock, so phase copy never depends on a client Date. */
  now: number
  /**
   * The organiser's dates. Optional so existing callers and tests keep
   * working, but always passed in the app: without it both the countdown
   * phase and the date beside it silently fall back to the seeded defaults,
   * so moving the tournament in Settings would leave the dashboard behind.
   */
  dates?: TournamentDates
  className?: string
}

const STAGE_EYEBROW: Record<DashboardStage, string> = {
  'not-registered': 'Welcome to the clubhouse',
  'awaiting-draw': 'You’re on the list',
  'tournament-day': 'It’s tournament day',
  finished: 'What a day',
}

const STAGE_BLURB: Record<DashboardStage, string> = {
  'not-registered':
    'Everything you need for the Christmas Mini Tournament lives here — as soon as you enter, your matches, duties and standings appear on this page.',
  'awaiting-draw':
    'Your entry is in. The moment the committee publishes the draw, your court, times and duty roster land right here.',
  'tournament-day': 'Your court sheet, your duties and your standing — all in one place. Good luck out there!',
  finished:
    'The shuttles have settled. Here’s how your day went — thanks for playing, and see you next Christmas. 🎄',
}

/** Festive page header: greeting, phase-aware copy and a countdown to the day. */
export function DashboardGreeting({
  name,
  stage,
  divisionName,
  demo,
  now,
  dates,
  className,
}: DashboardGreetingProps) {
  const phase = getTournamentPhase(new Date(now), dates)
  const dateLabel = formatTournamentDateLabel(dates?.tournamentDate)
  const firstName = name.trim().split(/\s+/)[0] || 'Smasher'

  return (
    <header className={cn('relative', className)}>
      {demo && (
        <p className="mb-3 inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--color-brand-gold-light)] px-3 py-1 text-xs font-extrabold text-[var(--color-brand-gold-dark)]">
          <BaubleIcon size={14} aria-hidden="true" />
          Demo mode — showing a sample player mid-tournament. Sign in to see your own dashboard.
        </p>
      )}

      <p className="font-[family-name:var(--font-script)] text-2xl text-[var(--color-brand-pink-dark)]">
        {STAGE_EYEBROW[stage]}
      </p>
      <h1 className="font-[family-name:var(--font-heading)] text-3xl font-extrabold sm:text-5xl" style={{ color: 'var(--color-plum)' }}>
        Kia ora, {firstName}! 🎄
      </h1>
      <p className="mt-2 max-w-2xl text-[var(--color-ink-soft)]">
        {STAGE_BLURB[stage]}
        {divisionName ? ` You’re in ${divisionName}.` : ''}
      </p>

      {phase.countdownTarget && (
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-sm font-extrabold tracking-wide text-[var(--color-brand-lilac-dark)] uppercase">
            {phase.countdownLabel} · {dateLabel}
          </p>
          <Countdown target={phase.countdownTarget} className="justify-start" />
        </div>
      )}
    </header>
  )
}

/** Big friendly call to action for a player who hasn't entered yet. */
export function NotRegisteredPanel({ className }: { className?: string }) {
  return (
    <Card variant="candy-stripe" className={cn(className)}>
      <CardBody className="flex flex-col items-center gap-3 p-6 text-center sm:p-8">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[image:var(--gradient-candy)] text-[var(--color-plum)]">
          <GiftIcon size={30} />
        </span>
        <h2 className="text-2xl font-extrabold" style={{ color: 'var(--color-plum)' }}>
          You haven&rsquo;t entered yet!
        </h2>
        <p className="max-w-md text-[var(--color-ink-soft)]">
          Men&rsquo;s and Women&rsquo;s Doubles, a single round robin where you play every other pair, semis for
          the top 4 — plus a loot bag for every player. Grab a partner (or come as a free agent) and we&rsquo;ll
          do the rest.
        </p>
        <Button href="/register" variant="primary" size="lg">
          Register to play
        </Button>
        <Link href="/rules" className="text-sm font-extrabold text-[var(--color-brand-lilac-dark)] inline-flex min-h-[24px] items-center underline-offset-4 hover:underline">
          Read the tournament rules first →
        </Link>
      </CardBody>
    </Card>
  )
}

/** Reassuring holding pattern between "registered" and "draw published". */
export function AwaitingDrawPanel({ className }: { className?: string }) {
  return (
    <Card variant="frosted" className={cn(className)}>
      <CardBody className="flex flex-col items-center gap-3 p-6 text-center sm:p-8">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[image:var(--gradient-mint-sky)] text-white">
          <ShuttlecockIcon size={30} className="animate-float" />
        </span>
        <h2 className="text-2xl font-extrabold" style={{ color: 'var(--color-plum)' }}>
          The draw is still wrapped up
        </h2>
        <p className="max-w-md text-[var(--color-ink-soft)]">
          You&rsquo;re on the list — nice work. Courts, times and your duty roster get published closer to
          tournament day, and they&rsquo;ll appear on this page the moment they do.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button href="/players" variant="secondary" size="sm">
            See who else is playing
          </Button>
          <Button href="/rules" variant="secondary" size="sm">
            Read the rules
          </Button>
        </div>
      </CardBody>
    </Card>
  )
}

/** End-of-day wrap for a player whose tournament is over. */
export function FinishedPanel({ summary, className }: { summary: string; className?: string }) {
  return (
    <Card variant="frosted" className={cn('border-2 border-[var(--color-brand-gold)]', className)}>
      <CardBody className="flex flex-col items-center gap-3 p-6 text-center sm:p-8">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[image:var(--gradient-gold)] text-[var(--color-plum)]">
          <TrophyIcon size={30} />
        </span>
        <h2 className="text-2xl font-extrabold" style={{ color: 'var(--color-plum)' }}>
          That&rsquo;s a wrap on your tournament!
        </h2>
        <p className="max-w-md text-[var(--color-ink-soft)]">{summary}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button href="/gallery" variant="primary" size="sm">
            See the photos
          </Button>
          <Button href="/standings" variant="secondary" size="sm">
            Final standings
          </Button>
        </div>
      </CardBody>
    </Card>
  )
}
