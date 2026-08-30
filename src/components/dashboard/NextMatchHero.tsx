import Link from 'next/link'
import { Badge } from '@/components/ui'
import { RacketIcon, ShuttlecockIcon, SnowflakeIcon, SparkleIcon } from '@/components/icons'
import { cn } from '@/lib/cn'
import {
  ARRIVE_BEFORE_MINUTES,
  pointsToWinLabel,
  stageLabel,
  type CountdownView,
  type PlayerFixture,
} from '@/lib/dashboard'
import { MatchCountdown } from './MatchCountdown'

export interface NextMatchHeroProps {
  fixture: PlayerFixture | null
  countdown: (CountdownView & { targetIso: string }) | null
  /** The fixture after the current one, so players can plan ahead. */
  thenNext?: PlayerFixture | null
  className?: string
}

function DetailTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] bg-white/85 px-3 py-2.5 text-center shadow-[var(--shadow-soft)]">
      <p className="text-[0.65rem] font-extrabold tracking-[0.14em] text-[var(--color-ink-muted)] uppercase">
        {label}
      </p>
      <p className="font-[family-name:var(--font-heading)] text-lg font-extrabold text-[var(--color-plum)] sm:text-xl">
        {value}
      </p>
      {hint && <p className="text-[0.7rem] font-semibold text-[var(--color-ink-muted)]">{hint}</p>}
    </div>
  )
}

/**
 * The single most prominent element on the dashboard: who you play next,
 * where, when, under which stage's rules — plus the forfeit warning, since
 * a late arrival is an automatic loss.
 */
export function NextMatchHero({ fixture, countdown, thenNext, className }: NextMatchHeroProps) {
  const live = fixture?.outcome === 'live'

  return (
    <section
      aria-labelledby="next-match-heading"
      className={cn(
        'relative overflow-hidden rounded-[var(--radius-xl)] p-5 shadow-[var(--shadow-lift)] sm:p-7',
        'bg-[image:var(--gradient-candy)]',
        className,
      )}
    >
      <SnowflakeIcon
        size={190}
        className="pointer-events-none absolute -top-12 -right-10 text-white/20"
        aria-hidden="true"
      />

      <div className="relative flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-white/95 px-3 py-1 text-xs font-extrabold tracking-wide text-[var(--color-brand-pink-dark)] uppercase">
          <RacketIcon size={14} />
          {live ? 'You are on court now' : 'Your next match'}
        </span>
        {live && (
          <Badge status="live" className="bg-white/95">
            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-current" aria-hidden="true" />
            Live
          </Badge>
        )}
        {countdown && !live && (
          <MatchCountdown initialMsUntil={countdown.msUntil} className="ml-auto" />
        )}
      </div>

      {!fixture ? (
        <div className="relative mt-4 rounded-[var(--radius-lg)] bg-white/90 p-5 text-center">
          <ShuttlecockIcon size={34} className="mx-auto text-[var(--color-brand-lilac)]" />
          <h2 id="next-match-heading" className="mt-2 text-xl font-extrabold" style={{ color: 'var(--color-plum)' }}>
            No match on your court sheet right now
          </h2>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Once the draw is published your next opponent, court and time will appear right here — big,
            bold and impossible to miss. 🎄
          </p>
          <Link
            href="/schedule"
            className="mt-3 inline-block text-sm font-extrabold text-[var(--color-brand-lilac-dark)] underline-offset-4 hover:underline"
          >
            See the full schedule →
          </Link>
        </div>
      ) : (
        <>
          <div className="relative mt-4">
            <p className="font-[family-name:var(--font-script)] text-xl text-white/95">
              {live ? 'Currently playing' : 'You play'}
            </p>
            <h2
              id="next-match-heading"
              className="font-[family-name:var(--font-heading)] text-3xl leading-tight font-extrabold sm:text-5xl"
              style={{ color: '#ffffff' }}
            >
              {fixture.opponentName}
            </h2>
            {fixture.opponent && (
              <p className="mt-1 text-sm font-semibold text-white/95">
                {fixture.opponent.players.map((p) => p.name).join(' & ')}
              </p>
            )}
          </div>

          {live && (
            <div className="relative mt-4 flex items-center justify-center gap-4 rounded-[var(--radius-lg)] bg-white/95 px-4 py-3">
              <span className="text-center">
                <span className="block text-[0.65rem] font-extrabold tracking-widest text-[var(--color-ink-muted)] uppercase">
                  You
                </span>
                <span className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[var(--color-brand-pink-dark)] tabular-nums">
                  {fixture.yourScore}
                </span>
              </span>
              <span className="text-2xl font-extrabold text-[var(--color-ink-muted)]" aria-hidden="true">
                –
              </span>
              <span className="text-center">
                <span className="block text-[0.65rem] font-extrabold tracking-widest text-[var(--color-ink-muted)] uppercase">
                  Them
                </span>
                <span className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[var(--color-plum)] tabular-nums">
                  {fixture.theirScore}
                </span>
              </span>
            </div>
          )}

          <div className="relative mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <DetailTile label="Court" value={fixture.match.court ?? 'TBC'} />
            <DetailTile label="Time" value={fixture.match.slotLabel ?? 'TBC'} />
            <DetailTile label="Stage" value={stageLabel(fixture.match.stage)} />
            <DetailTile
              label="To win"
              value={`${fixture.match.pointsToWin} pts`}
              hint={fixture.match.deuce ? 'with deuce' : 'no deuce'}
            />
          </div>

          <p className="relative mt-3 text-xs font-semibold text-white/95">
            {pointsToWinLabel(fixture.match)} · {stageLabel(fixture.match.stage)}
          </p>

          <p className="relative mt-3 flex items-start gap-2 rounded-[var(--radius-lg)] bg-[var(--color-danger)] px-4 py-3 text-sm font-bold text-white">
            <span aria-hidden="true">⚠️</span>
            <span>
              Be at your court at least {ARRIVE_BEFORE_MINUTES} minutes before the call — late arrival or a
              no-show is an <span className="underline">automatic forfeit</span>.
            </span>
          </p>

          {thenNext && (
            <p className="relative mt-3 flex flex-wrap items-center gap-1.5 text-sm font-semibold text-white/95">
              <SparkleIcon size={14} aria-hidden="true" />
              After that: {thenNext.opponentName} · {thenNext.match.court ?? 'court TBC'} ·{' '}
              {thenNext.match.slotLabel ?? 'time TBC'}
            </p>
          )}
        </>
      )}
    </section>
  )
}
