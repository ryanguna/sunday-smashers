import type { MetadataRoute } from 'next'
import { loadPublicTournamentConfig } from '@/lib/tournament-config'
import { formatTournamentDateLabel } from '@/lib/tournament'

// Async so the installed-app description follows the organiser's saved date.
// A PWA manifest is cached hard by the OS, so a stale date here outlives a
// deploy on anyone who has added the site to their home screen.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { dates } = await loadPublicTournamentConfig()

  return {
    name: 'Sunday Smashers — Christmas Mini Tournament',
    short_name: 'Sunday Smashers',
    description:
      `Smash. Compete. Celebrate. The Sunday Smashers Christmas Mini Tournament — ${formatTournamentDateLabel(dates.tournamentDate)}.`,
    start_url: '/',
    display: 'standalone',
    background_color: '#fbfbff',
    theme_color: '#ff8fc7',
    // Official brand-kit favicons. These are the circular shuttlecock badge.
    icons: [
      { src: '/brand/favicon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/favicon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Separate artwork, not the same file: Android keeps only the inner 80%
      // of a maskable icon, which would slice through the badge's outline ring.
      // This variant is the bare shuttlecock on an opaque brand tint.
      { src: '/brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
