import type { Metadata } from 'next'
import { ScrollLock } from '@/components/tv/ScrollLock'

export const metadata: Metadata = {
  title: 'Courtside TV — Sunday Smashers',
  description: 'Live courtside scoreboard for the Sunday Smashers Christmas Mini Tournament.',
  robots: { index: false, follow: false },
}

/**
 * Dedicated layout for the `/tv/*` routes: a full-bleed, unattended display
 * with no site chrome (no header/nav/footer, no scrollbars). Deliberately
 * does not import SiteHeader/SiteFooter — this tree is meant to run on a
 * courtside monitor for hours, independent of the rest of the site.
 */
export default function TvLayout({ children }: { children: React.ReactNode }) {
  // z-[999] deliberately outranks the site header's sticky z-40 (and its
  // mobile-menu overlay's z-30) from the root layout — this view must fully
  // cover any site chrome rendered above it, since the root layout is shared
  // across every route and is owned by another agent.
  return (
    <div className="fixed inset-0 z-[999] overflow-hidden bg-[#1c0f2e]">
      <ScrollLock />
      {children}
    </div>
  )
}
