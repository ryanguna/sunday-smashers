import type { Metadata } from 'next'
import { Baloo_2, Nunito, Pacifico } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { loadSitePageVisibility } from '@/lib/site-pages-server'
import { SITE_URL } from '@/lib/site'
import { loadPublicTournamentConfig } from '@/lib/tournament-config'
import { formatTournamentDateLabel } from '@/lib/tournament'
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

// Purpose-built 1200x630 card (see gen-brand-images.mjs). The teaser poster
// is 1024x1536 portrait, which every social platform letterboxes or centre-
// crops into an unreadable slice of the artwork.
const OG_IMAGE = '/brand/og-card.png'

/**
 * Dynamic because the description and the Open Graph card both name the
 * tournament date, and that card is what people see when the link is pasted
 * into a group chat. Hardcoded, it would keep advertising the seeded date
 * after an organiser moved the tournament in Settings.
 *
 * `loadPublicTournamentConfig` is cached and tag-revalidated, so this does not
 * add a database round trip per request.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { dates } = await loadPublicTournamentConfig()
  const label = formatTournamentDateLabel(dates.tournamentDate)

  return {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Sunday Smashers — Christmas Mini Tournament',
    template: '%s · Sunday Smashers',
  },
  description:
    `Smash. Compete. Celebrate. The Sunday Smashers Christmas Mini Tournament — ${label}. Men\u2019s & Women\u2019s Doubles, cash prizes, trophies & medals, and loot bags for everyone.`,
  applicationName: 'Sunday Smashers',
  openGraph: {
    title: 'Sunday Smashers — Christmas Mini Tournament',
    description:
      `Something BIG is smashing this Christmas. ${label} — Men\u2019s & Women\u2019s Doubles, cash prizes, trophies & medals, loot bags for everyone.`,
    url: SITE_URL,
    siteName: 'Sunday Smashers',
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: 'Sunday Smashers Christmas Mini Tournament' }],
    locale: 'en_AU',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sunday Smashers — Christmas Mini Tournament',
    description: `Smash. Compete. Celebrate. ${label}.`,
    images: [OG_IMAGE],
  },
  icons: {
    icon: [
      { url: '/brand/favicon.ico', sizes: 'any' },
      { url: '/brand/favicon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/brand/favicon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    // iOS ignores transparency and composites onto black, so the Apple icon
    // points at the same opaque-background artwork used for Android maskables.
    apple: '/brand/icon-maskable-512.png',
  },
}
}

/**
 * The layout is `async` so it can read the committee's page-visibility
 * switches once, on the server, and hand the same answer to the header and the
 * footer. `loadSitePageVisibility` is cached and reads no cookies, so this does
 * **not** make every route dynamic — see `src/lib/site-pages-server.ts`.
 *
 * Resolving it here rather than in the header means the nav is correct in the
 * server-rendered HTML: a hidden link never flashes up and then disappears.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const visibility = await loadSitePageVisibility()

  return (
    <html lang="en" className={`${baloo.variable} ${nunito.variable} ${pacifico.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-[var(--radius-md)] focus:bg-white focus:px-4 focus:py-2 focus:text-[var(--color-plum)] focus:shadow-[var(--shadow-lift)]"
        >
          Skip to main content
        </a>
        <SiteHeader visibility={visibility} />
        <div id="main-content" className="flex-1">
          {children}
        </div>
        <SiteFooter visibility={visibility} />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
