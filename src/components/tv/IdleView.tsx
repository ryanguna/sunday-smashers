import { Countdown } from '@/components/ui/Countdown'
import { ShuttlecockIcon, SnowflakeIcon } from '@/components/icons'
import { TOURNAMENT_DATE } from '@/lib/tv/types'
import type { TvUpcomingMatch } from '@/lib/tv/types'

export interface IdleViewProps {
  courtLabel: string
  /** Upcoming matches across the venue, used for the schedule carousel. */
  upcoming: TvUpcomingMatch[]
  /**
   * Tournament day, from the organiser's settings. Falls back to the seeded
   * date so a court left running against an empty config still shows a
   * countdown rather than "Invalid Date" on a screen nobody is watching.
   */
  countdownTarget?: string
}

/**
 * Fallback shown whenever a court has no live match and nothing scheduled
 * next — most notably before the tournament starts. Never a blank screen:
 * always a countdown plus whatever schedule information is available.
 */
export function IdleView({ courtLabel, upcoming, countdownTarget }: IdleViewProps) {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-[4vh] overflow-hidden bg-gradient-to-br from-[#1c0f2e] via-[#2a1745] to-[#4a1f3d] px-[6vw] text-center text-frost">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden opacity-30">
        {Array.from({ length: 18 }).map((_, i) => (
          <SnowflakeIcon
            key={i}
            className="animate-snowfall absolute h-6 w-6 text-white"
            style={{
              left: `${(i * 5.5) % 100}%`,
              animationDuration: `${9 + (i % 6) * 2}s`,
              animationDelay: `${i * 0.5}s`,
            }}
          />
        ))}
      </div>

      <div className="relative flex flex-col items-center gap-4">
        <ShuttlecockIcon className="animate-bob h-[8vh] w-[8vh] text-[var(--color-brand-gold)]" />
        <h1
          className="font-[family-name:var(--font-heading)] text-[clamp(2rem,4.5vw,4rem)] font-extrabold"
          style={{ color: 'var(--color-frost)' }}
        >
          Sunday Smashers
        </h1>
        <p className="font-[family-name:var(--font-script)] text-[clamp(1.2rem,2.2vw,2rem)] text-[var(--color-brand-pink-light)]">
          Christmas Mini Tournament
        </p>
        <p className="text-[clamp(1rem,1.4vw,1.4rem)] font-semibold text-frost/70">
          {courtLabel} · No match in progress
        </p>
      </div>

      <Countdown target={countdownTarget ?? TOURNAMENT_DATE} className="relative" />

      {upcoming.length > 0 && (
        <div className="relative w-full max-w-3xl rounded-[var(--radius-xl)] bg-white/8 px-6 py-5 backdrop-blur">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-frost/50">
            Schedule
          </p>
          <ul className="grid grid-cols-1 gap-2 text-left sm:grid-cols-2">
            {upcoming.slice(0, 4).map((match) => (
              <li key={match.matchId} className="rounded-[var(--radius-md)] bg-white/8 px-4 py-2.5">
                <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-[var(--color-brand-gold)]">
                  {match.court} · {match.stageLabel}
                </p>
                <p className="font-bold">
                  {match.teamA.name} <span className="text-frost/50">vs</span> {match.teamB.name}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
