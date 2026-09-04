'use client'

import { useEffect, useMemo, useState } from 'react'
import { Badge, EmptyState } from '@/components/ui'
import { GiftIcon, ShuttlecockIcon } from '@/components/icons'
import { MatchCard } from '@/components/results'
import {
  subscribeToLiveMatches,
  type LiveConnectionStatus,
  type PublicMatch,
} from '@/lib/public-data'

interface LiveScoresProps {
  initial: PublicMatch[]
  divisionNames: Record<string, string>
}

const STATUS_LABEL: Record<LiveConnectionStatus, string> = {
  demo: 'Demo data',
  connecting: 'Connecting…',
  live: 'Live',
  reconnecting: 'Reconnecting…',
  polling: 'Refreshing periodically',
}

export function LiveScores({ initial, divisionNames }: LiveScoresProps) {
  const [matches, setMatches] = useState<PublicMatch[]>(initial)
  const [status, setStatus] = useState<LiveConnectionStatus>('connecting')

  useEffect(() => {
    const unsubscribe = subscribeToLiveMatches({
      onMatches: setMatches,
      onStatus: setStatus,
    })
    return unsubscribe
  }, [])

  const grouped = useMemo(() => {
    const byDivision = new Map<string, PublicMatch[]>()
    for (const match of matches) {
      const bucket = byDivision.get(match.division)
      if (bucket) bucket.push(match)
      else byDivision.set(match.division, [match])
    }
    return [...byDivision.entries()]
  }, [matches])

  const isLive = status === 'live'

  /**
   * Screen-reader announcement for the live board.
   *
   * Scores arrive over Realtime and re-render the cards silently, so a
   * screen-reader user had no way of knowing a point had been scored or that
   * the connection had dropped — `/tv` and the scoring console both announce
   * their changes, this page did not. One terse summary line beats making
   * every card a live region, which would read the whole board out on every
   * point.
   */
  const announcement = useMemo(
    () =>
      matches
        .map((m) => {
          const where = m.court ?? divisionNames[m.division] ?? m.division
          const a = m.teamA?.name ?? m.sourceA ?? 'TBC'
          const b = m.teamB?.name ?? m.sourceB ?? 'TBC'
          return `${where}: ${a} ${m.scoreA}, ${b} ${m.scoreB}.`
        })
        .join(' '),
    [matches, divisionNames],
  )

  return (
    <div className="flex flex-col gap-6">
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {matches.length === 0 ? 'No matches are live right now.' : announcement}
      </p>
      <div
        role="status"
        className="flex items-center justify-center gap-2 text-xs font-semibold text-[var(--color-ink-muted)]"
      >
        <span
          className={
            isLive
              ? 'h-2 w-2 animate-pulse rounded-full bg-[var(--color-brand-pink-dark)]'
              : 'h-2 w-2 rounded-full bg-[var(--color-ink-muted)]'
          }
          aria-hidden="true"
        />
        {STATUS_LABEL[status]}
      </div>

      {matches.length === 0 ? (
        <EmptyState
          icon={<GiftIcon size={30} />}
          title="Nothing live right now"
          description="Check back once a match kicks off — this page updates itself, no refresh needed."
        />
      ) : (
        <div className="flex flex-col gap-8">
          {grouped.map(([division, divisionMatches]) => (
            <section key={division}>
              <div className="mb-3 flex items-center gap-2">
                <ShuttlecockIcon size={20} className="text-[var(--color-brand-pink-dark)]" />
                <h3 className="text-xl font-extrabold text-[var(--color-plum)]">
                  {divisionNames[division] ?? division}
                </h3>
                <Badge status="live">{divisionMatches.length} live</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {divisionMatches.map((m) => (
                  <MatchCard key={m.id} match={m} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
