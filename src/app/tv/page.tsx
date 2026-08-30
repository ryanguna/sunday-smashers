import type { Metadata } from 'next'
import { getAllCourtOverviews } from '@/lib/tv/data'
import { CourtTile } from '@/components/tv/CourtTile'
import { ShuttlecockIcon, SnowflakeIcon } from '@/components/icons'

export const metadata: Metadata = {
  title: 'Court Overview — Courtside TV',
}

export const dynamic = 'force-dynamic'

/**
 * `/tv` — an overview grid of every court's live mini-scoreboard. Useful on
 * a big lobby screen before play starts, or to pick which single court to
 * throw up on the main monitor via `/tv/[court]`.
 */
export default async function TvOverviewPage() {
  const courts = await getAllCourtOverviews()

  return (
    <main className="relative h-full w-full overflow-y-auto bg-gradient-to-br from-[#1c0f2e] via-[#2a1745] to-[#3a1f4d] px-[4vw] py-[4vh] text-frost">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden opacity-40">
        {Array.from({ length: 14 }).map((_, i) => (
          <SnowflakeIcon
            key={i}
            className="animate-snowfall absolute h-6 w-6 text-white/70"
            style={{
              left: `${(i * 7.3) % 100}%`,
              animationDuration: `${10 + (i % 5) * 2}s`,
              animationDelay: `${i * 0.6}s`,
            }}
          />
        ))}
      </div>

      <header className="relative mb-[3vh] flex items-center justify-between">
        <div className="flex items-center gap-4">
          <ShuttlecockIcon className="h-12 w-12 text-[var(--color-brand-gold)]" />
          <div>
            {/* Inline color: globals.css sets an unlayered `h1 { color }`
                rule that always beats Tailwind's layered utility classes. */}
            <h1
              className="font-[family-name:var(--font-heading)] text-[clamp(1.75rem,3vw,2.75rem)] font-extrabold"
              style={{ color: 'var(--color-frost)' }}
            >
              Sunday Smashers · Courtside TV
            </h1>
            <p className="text-frost/60">Christmas Mini Tournament · 13 December 2026</p>
          </div>
        </div>
      </header>

      <div className="relative grid grid-cols-1 gap-[2vw] sm:grid-cols-2 xl:grid-cols-3">
        {courts.map((court) => (
          <CourtTile key={court.court} initial={court} />
        ))}
      </div>

      <p className="relative mt-[3vh] text-center text-sm text-frost/50">
        Select a court to open its full-screen scoreboard for the monitor.
      </p>
    </main>
  )
}
