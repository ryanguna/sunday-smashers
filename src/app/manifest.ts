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
    icons: [
      {
        src: '/sunday-smashers-logo.jpg',
        sizes: '1024x1536',
        type: 'image/jpeg',
      },
    ],
  }
}
