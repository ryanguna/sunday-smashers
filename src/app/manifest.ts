import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Sunday Smashers — Christmas Mini Tournament',
    short_name: 'Sunday Smashers',
    description:
      'Smash. Compete. Celebrate. The Sunday Smashers Christmas Mini Tournament — Sunday 13 December 2026.',
    start_url: '/',
    display: 'standalone',
    background_color: '#fbfbff',
    theme_color: '#ff8fc7',
    // Square PNGs cropped from the badge in the teaser poster. The poster
    // itself is 480x720 — a portrait image can't be an app icon, and every
    // launcher would have letterboxed or rejected it.
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Padded so the badge sits inside the inner 80% safe zone Android
      // crops to when it applies its own mask shape.
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
