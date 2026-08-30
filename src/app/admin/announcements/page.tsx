import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/auth'
import { getAllAnnouncements, getAnnouncementTournamentId } from '@/lib/announcements'
import { announcementsClient } from '@/app/announcements/client'
import { AnnouncementsAdmin } from './AnnouncementsAdminClient'

export const metadata: Metadata = {
  title: 'Announcements · Admin',
  robots: { index: false, follow: false },
}

// Reads cookies (auth) — never prerender.
export const dynamic = 'force-dynamic'

export default async function AdminAnnouncementsPage() {
  await requireAdmin('/admin/announcements')

  const client = await announcementsClient()
  const [announcements, tournamentId] = await Promise.all([
    getAllAnnouncements(client),
    getAnnouncementTournamentId(client),
  ])

  return <AnnouncementsAdmin initialAnnouncements={announcements} tournamentId={tournamentId} />
}
