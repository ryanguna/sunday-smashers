'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { subscribeToCourt } from '@/lib/tv/data'
import type { CourtOverview } from '@/lib/tv/types'
import { ShuttlecockIcon } from '@/components/icons'
import { ConnectionIndicator } from './ConnectionIndicator'
import type { TvConnectionStatus } from '@/lib/tv/types'

export interface CourtTileProps {
  initial: CourtOverview
}

/**
 * A single court's mini live-scoreboard, used on the `/tv` overview grid so
 * every court is visible at once on a big screen before/between rounds.
 */
export function CourtTile({ initial }: CourtTileProps) {
  const [overview, setOverview] = useState(initial)
  const [status, setStatus] = useState<TvConnectionStatus>('demo')

  useEffect(() => {
    const unsubscribe = subscribeToCourt(initial.court, {
      onSnapshot: (snapshot) =>
        setOverview({
          court: snapshot.court,
          courtLabel: snapshot.courtLabel,
          live: snapshot.live,
          upNext: snapshot.upNext,
        }),
      onStatus: setStatus,
    })
    return unsubscribe
  }, [initial.court])

  const { live, upNext, courtLabel, court } = overview

  return (
    <Link
      href={`/tv/${court}`}
      className="hover-lift group relative flex flex-col overflow-hidden rounded-[var(--radius-xl)] border border-white/10 bg-gradient-to-br from-[#2a1745] to-[#3a1f4d] p-6 text-frost shadow-[var(--shadow-lift)] focus-visible:outline-[var(--color-brand-gold)]"
    >
      <div className="mb-4 flex items-center justify-between">
        <span className="flex items-center gap-2 font-[family-name:var(--font-heading)] text-2xl font-extrabold">
          <ShuttlecockIcon className="h-7 w-7 text-[var(--color-brand-gold)]" />
          {courtLabel}
        </span>
        <ConnectionIndicator status={status} />
      </div>

      {live ? (
        <div className="flex flex-1 flex-col gap-3">
          <span className="w-fit rounded-[var(--radius-pill)] bg-[var(--color-brand-pink)]/20 px-3 py-1 text-sm font-bold uppercase tracking-wide text-[var(--color-brand-pink-light)]">
            ● Live · {live.stageLabel}
          </span>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <span className="truncate text-right text-lg font-bold">{live.teamA.name}</span>
            <span className="font-[family-name:var(--font-heading)] text-5xl font-black tabular-nums text-[var(--color-brand-gold)]">
              {live.pointsA}–{live.pointsB}
            </span>
            <span className="truncate text-lg font-bold">{live.teamB.name}</span>
          </div>
        </div>
      ) : upNext ? (
        <div className="flex flex-1 flex-col justify-center gap-2 text-center">
          <span className="text-sm font-semibold uppercase tracking-wide text-frost/60">
            Up next · {upNext.stageLabel}
          </span>
          <span className="text-xl font-bold">
            {upNext.teamA.name} <span className="text-frost/50">vs</span> {upNext.teamB.name}
          </span>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-frost/60">
          No match scheduled
        </div>
      )}
    </Link>
  )
}
