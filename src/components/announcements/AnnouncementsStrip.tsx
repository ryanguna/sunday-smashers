import Link from 'next/link'
import { Card, CardBody } from '@/components/ui'
import { BaubleIcon, HollyIcon, ShuttlecockIcon } from '@/components/icons'
import { cn } from '@/lib/cn'
import {
  accentForAnnouncement,
  excerpt,
  latestAnnouncements,
  type Announcement,
} from '@/lib/announcements'
import { ACCENT_STYLES } from './accents'
import { AnnouncementTimestamp } from './AnnouncementCard'

export interface AnnouncementsStripProps {
  announcements: readonly Announcement[]
  /** Reference time for relative timestamps. Omit in client trees. */
  now?: Date | number
  /** How many published notices to show. Defaults to 3. */
  limit?: number
  heading?: string
  /** Where "See all" points. Defaults to `/announcements`. */
  href?: string
  className?: string
}

/**
 * Compact "latest from the organisers" strip, sized for embedding on the
 * landing page (or any other surface). Shows published notices only, pinned
 * first, each as a one-line excerpt linking through to the full feed.
 * Hook-free — safe in Server and Client Components.
 */
export function AnnouncementsStrip({
  announcements,
  now,
  limit = 3,
  heading = 'Latest from the organisers',
  href = '/announcements',
  className,
}: AnnouncementsStripProps) {
  const items = latestAnnouncements(announcements, limit)

  return (
    <Card variant="frosted" className={cn('overflow-hidden', className)}>
      <CardBody className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[image:var(--gradient-candy)] text-white shadow-[var(--shadow-glow-pink)]">
            <HollyIcon size={18} />
          </span>
          <h2 className="text-lg font-extrabold text-[var(--color-plum)]">{heading}</h2>
          <Link
            href={href}
            className="ml-auto text-sm font-extrabold text-[var(--color-brand-lilac-dark)] inline-flex min-h-[24px] items-center underline-offset-4 hover:underline"
          >
            See all →
          </Link>
        </div>

        {items.length === 0 ? (
          <p className="mt-4 flex items-center gap-2 rounded-[var(--radius-lg)] bg-white/70 px-4 py-5 text-sm font-semibold text-[var(--color-ink-soft)]">
            <ShuttlecockIcon size={18} className="text-[var(--color-brand-lilac)]" />
            Quiet on the court — no announcements yet 🎄
          </p>
        ) : (
          <ul className="mt-4 space-y-2.5">
            {items.map((announcement) => {
              const accent = ACCENT_STYLES[accentForAnnouncement(announcement.id)]
              return (
                <li key={announcement.id}>
                  <Link
                    href={href}
                    className={cn(
                      'hover-lift flex gap-3 rounded-[var(--radius-lg)] border-2 bg-white/80 p-3.5 transition-colors hover:bg-white',
                      announcement.isPinned
                        ? 'border-[var(--color-brand-pink)]'
                        : 'border-transparent',
                    )}
                  >
                    <BaubleIcon
                      size={20}
                      className={cn('mt-0.5 shrink-0', accent.text)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-extrabold text-[var(--color-plum)]">
                          {announcement.title}
                        </span>
                        {announcement.isPinned && (
                          <span className="rounded-[var(--radius-pill)] bg-[var(--color-brand-pink-light)] px-2 py-0.5 text-[0.65rem] font-extrabold tracking-wide text-[var(--color-brand-pink-dark)] uppercase">
                            Pinned
                          </span>
                        )}
                        <AnnouncementTimestamp
                          announcement={announcement}
                          now={now}
                          className="text-xs font-semibold text-[var(--color-ink-muted)]"
                        />
                      </span>
                      <span className="mt-1 block text-sm leading-snug text-[var(--color-ink-soft)]">
                        {excerpt(announcement.body, 96)}
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}
