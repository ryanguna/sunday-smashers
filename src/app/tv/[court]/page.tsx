import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getAllCourtOverviews, getCourtSnapshot } from '@/lib/tv/data'
import { getPublishedAnnouncements } from '@/lib/announcements'
import { loadPublicTournamentConfig } from '@/lib/tournament-config'
import { Scoreboard } from '@/components/tv/Scoreboard'
import type { TvUpcomingMatch } from '@/lib/tv/types'

interface PageProps {
  params: Promise<{ court: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { court } = await params
  const snapshot = await getCourtSnapshot(court)
  return {
    title: `${snapshot.courtLabel} — Courtside TV`,
    description: `Live scoreboard for ${snapshot.courtLabel} at the Sunday Smashers Christmas Mini Tournament.`,
  }
}

export const dynamic = 'force-dynamic'

/**
 * `/tv/[court]` — the full-screen unattended courtside scoreboard for one
 * court. Server-fetches an initial snapshot (so the first paint is never
 * blank) then hands off to the client `Scoreboard` for live updates,
 * animation and panel rotation.
 */
export default async function TvCourtPage({ params }: PageProps) {
  const { court } = await params
  const [snapshot, overviews, announcements, { dates }] = await Promise.all([
    getCourtSnapshot(court),
    getAllCourtOverviews(),
    getPublishedAnnouncements(),
    loadPublicTournamentConfig(),
  ])

  const venueUpcoming: TvUpcomingMatch[] = overviews
    .filter((o) => o.court !== court && o.upNext)
    .map((o) => o.upNext as TvUpcomingMatch)

  return (
    <Suspense fallback={null}>
      <Scoreboard
        initial={snapshot}
        venueUpcoming={venueUpcoming}
        announcements={announcements}
        countdownTarget={dates.tournamentDate}
      />
    </Suspense>
  )
}
