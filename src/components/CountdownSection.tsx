'use client'

import { useEffect, useState } from 'react'
import { Countdown, Badge } from '@/components/ui'
import {
  getTournamentPhase,
  type TournamentDates,
  type TournamentPhaseInfo,
} from '@/lib/tournament'

/**
 * Renders the hero's countdown card. The active phase (pre-registration,
 * registration open, registration closed, or tournament day) depends on
 * "now", so — same hydration-safe pattern as `Countdown` itself — we render
 * a stable, phase-agnostic skeleton on the server and during the first
 * client render, then swap in the real phase after mount. This guarantees
 * the server-rendered markup and the client's first render are identical.
 */
export function CountdownSection({ dates }: { dates?: TournamentDates }) {
  const [info, setInfo] = useState<TournamentPhaseInfo | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInfo(getTournamentPhase(new Date(), dates))
  }, [dates])

  if (!info) {
    return (
      <div className="animate-fade-in rounded-[var(--radius-lg)] bg-frost-glass p-5 shadow-[var(--shadow-soft)]">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
          Loading countdown&hellip;
        </p>
        <div className="grid grid-flow-col gap-3 sm:gap-4" aria-hidden="true">
          {['Days', 'Hours', 'Mins', 'Secs'].map((label) => (
            <div
              key={label}
              className="flex min-w-[3.5rem] flex-col items-center rounded-[var(--radius-md)] bg-white px-3 py-2.5 shadow-[var(--shadow-soft)] sm:min-w-[4.5rem] sm:px-4 sm:py-3"
            >
              <span className="font-[family-name:var(--font-heading)] text-2xl font-extrabold text-[var(--color-plum)] sm:text-4xl">
                --
              </span>
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)] sm:text-sm">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (info.phase === 'tournament-day-or-later') {
    return (
      <div className="animate-pop-in rounded-[var(--radius-lg)] bg-frost-glass p-5 text-center shadow-[var(--shadow-soft)]">
        <Badge status="live" className="mb-2">
          Live now
        </Badge>
        <p className="font-[family-name:var(--font-heading)] text-xl font-extrabold text-[var(--color-plum)] sm:text-2xl">
          {info.heading}
        </p>
      </div>
    )
  }

  return (
    <div className="animate-fade-in rounded-[var(--radius-lg)] bg-frost-glass p-5 shadow-[var(--shadow-soft)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
          {info.countdownLabel}
        </p>
        {info.phase === 'registration-open' && <Badge status="approved">Registration open</Badge>}
      </div>
      {info.countdownTarget && <Countdown target={info.countdownTarget} />}
    </div>
  )
}
