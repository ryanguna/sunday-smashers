import Link from 'next/link'
import { ShuttlecockIcon, HollyIcon } from '@/components/icons'
import { TOURNAMENT_DATE_LABEL } from '@/lib/tournament'

const FOOTER_LINKS = [
  { href: '/rules', label: 'Rules' },
  { href: '/schedule', label: 'Schedule' },
  { href: '/standings', label: 'Standings' },
  { href: '/players', label: 'Players' },
  { href: '/gallery', label: 'Gallery' },
]

export function SiteFooter() {
  return (
    <footer className="relative z-10 mt-16 border-t border-white/60 bg-frost-glass">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 md:flex-row md:justify-between">
        <div className="max-w-sm">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[image:var(--gradient-candy)] text-white"
            >
              <ShuttlecockIcon size={18} />
            </span>
            <span className="font-[family-name:var(--font-heading)] text-lg font-extrabold text-[var(--color-plum)]">
              Sunday Smashers
            </span>
          </div>
          <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
            The Christmas Mini Tournament — {TOURNAMENT_DATE_LABEL}. Smash. Compete. Celebrate.
          </p>
        </div>

        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-2 sm:flex sm:gap-6">
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-semibold text-[var(--color-ink-soft)] hover:text-[var(--color-brand-pink-dark)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="border-t border-white/60 px-4 py-4 sm:px-6">
        <p className="mx-auto flex max-w-6xl items-center justify-center gap-1.5 text-center text-xs text-[var(--color-ink-muted)]">
          <HollyIcon size={14} className="text-[var(--color-brand-holly)]" aria-hidden="true" />
          &copy; 2026 Sunday Smashers. Let the Christmas smashes begin!
        </p>
      </div>
    </footer>
  )
}
