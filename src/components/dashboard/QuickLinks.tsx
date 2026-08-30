import Link from 'next/link'
import { Card, CardBody } from '@/components/ui'
import { cn } from '@/lib/cn'

export interface QuickLinksProps {
  /** The player's public profile/pair page, when they have a team. */
  profileHref?: string | null
  className?: string
}

const LINKS: Array<{ href: string; label: string; emoji: string; blurb: string }> = [
  { href: '/schedule', label: 'Schedule', emoji: '🗓️', blurb: 'Every court, every slot' },
  { href: '/standings', label: 'Standings', emoji: '📊', blurb: 'Who is on top' },
  { href: '/bracket', label: 'Bracket', emoji: '🏆', blurb: 'The road to the final' },
  { href: '/live', label: 'Live scores', emoji: '🔴', blurb: 'Points as they land' },
  { href: '/players', label: 'Players', emoji: '🏸', blurb: 'All the pairs' },
  { href: '/gallery', label: 'Gallery', emoji: '📸', blurb: 'Smashes in pictures' },
  { href: '/rules', label: 'Rules', emoji: '📜', blurb: 'First to 15, no deuce' },
]

/** Fast, thumb-sized jumps to everywhere else a player might want to go. */
export function QuickLinks({ profileHref, className }: QuickLinksProps) {
  const links = profileHref
    ? [...LINKS, { href: profileHref, label: 'Your pair page', emoji: '⭐', blurb: 'How others see you' }]
    : LINKS

  return (
    <Card variant="frosted" className={cn(className)}>
      <CardBody className="p-5 sm:p-6">
        <h2 className="text-lg font-extrabold" style={{ color: 'var(--color-plum)' }}>
          Quick links
        </h2>
        <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="hover-lift flex h-full flex-col gap-0.5 rounded-[var(--radius-lg)] bg-white/85 px-3 py-3 shadow-[var(--shadow-soft)] transition-colors hover:bg-white"
              >
                <span className="text-xl" aria-hidden="true">
                  {link.emoji}
                </span>
                <span className="font-[family-name:var(--font-heading)] text-sm font-extrabold text-[var(--color-plum)]">
                  {link.label}
                </span>
                <span className="text-xs text-[var(--color-ink-muted)]">{link.blurb}</span>
              </Link>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  )
}
