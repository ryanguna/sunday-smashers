import type { Metadata } from 'next'
import { Baloo_2, Nunito, Pacifico } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import './globals.css'

// Heavy geometric sans for headings — bold, rounded, friendly.
const baloo = Baloo_2({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-heading',
  display: 'swap',
})

// Clean, highly legible sans for body copy.
const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-body',
  display: 'swap',
})

// Playful handwritten script for the "Sunday" style flourish.
const pacifico = Pacifico({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-script',
  display: 'swap',
})

const SITE_URL = 'https://sunday-smashers.vercel.app'
const OG_IMAGE = '/sunday-smashers-logo.jpg'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Sunday Smashers — Christmas Mini Tournament',
    template: '%s · Sunday Smashers',
  },
  description:
    'Smash. Compete. Celebrate. The Sunday Smashers Christmas Mini Tournament — Sunday 13 December 2026. Men\u2019s & Women\u2019s Doubles, cash prizes, trophies & medals, and loot bags for everyone.',
  applicationName: 'Sunday Smashers',
  openGraph: {
    title: 'Sunday Smashers — Christmas Mini Tournament',
    description:
      'Something BIG is smashing this Christmas. Sunday 13 December 2026 — Men\u2019s & Women\u2019s Doubles, cash prizes, trophies & medals, loot bags for everyone.',
    url: SITE_URL,
    siteName: 'Sunday Smashers',
    images: [{ url: OG_IMAGE, width: 1024, height: 1536, alt: 'Sunday Smashers Christmas Mini Tournament poster' }],
    locale: 'en_AU',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sunday Smashers — Christmas Mini Tournament',
    description: 'Smash. Compete. Celebrate. Sunday 13 December 2026.',
    images: [OG_IMAGE],
  },
  icons: {
    icon: '/sunday-smashers-logo.jpg',
    apple: '/sunday-smashers-logo.jpg',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${baloo.variable} ${nunito.variable} ${pacifico.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-[var(--radius-md)] focus:bg-white focus:px-4 focus:py-2 focus:text-[var(--color-plum)] focus:shadow-[var(--shadow-lift)]"
        >
          Skip to main content
        </a>
        <SiteHeader />
        <div id="main-content" className="flex-1">
          {children}
        </div>
        <SiteFooter />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
