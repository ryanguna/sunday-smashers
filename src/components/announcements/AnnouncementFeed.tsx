import { EmptyState } from '@/components/ui'
import { ShuttlecockIcon, SnowflakeIcon } from '@/components/icons'
import { cn } from '@/lib/cn'
import { sortAnnouncements, type Announcement } from '@/lib/announcements'
import { AnnouncementCard } from './AnnouncementCard'

export interface AnnouncementFeedProps {
  announcements: readonly Announcement[]
  /** Reference time for relative timestamps. Omit in client trees. */
  now?: Date | number
  /** Shows Draft/Published chips — admin surfaces only. */
  showStatus?: boolean
  emptyTitle?: string
  emptyDescription?: string
  className?: string
}

/**
 * The full announcements list: pinned notices in their own festive
 * "Pinned to the noticeboard" group, then everything else newest-first.
 * Hook-free, so it works in Server and Client Components alike.
 */
export function AnnouncementFeed({
  announcements,
  now,
  showStatus = false,
  emptyTitle = 'Quiet on the court — no announcements yet 🎄',
  // Deliberately says "tournament day" rather than naming a date: this is a
  // default on a shared component with many callers, and a hardcoded date
  // would go stale the moment an organiser moves the tournament in Settings.
  emptyDescription = 'When the organisers post match-day news, parking tips or draw updates, they will land right here. Check back closer to tournament day.',
  className,
}: AnnouncementFeedProps) {
  const sorted = sortAnnouncements(announcements)
  const pinned = sorted.filter((a) => a.isPinned)
  const rest = sorted.filter((a) => !a.isPinned)

  if (sorted.length === 0) {
    return (
      <EmptyState
        className={className}
        icon={<ShuttlecockIcon size={40} className="text-[var(--color-brand-lilac)]" />}
        title={emptyTitle}
        description={emptyDescription}
      />
    )
  }

  return (
    <div className={cn('space-y-8', className)}>
      {pinned.length > 0 && (
        <section aria-labelledby="pinned-announcements-heading">
          {/* Inline colour: globals.css's unlayered `h1-h6 { color }` rule
              outranks Tailwind's layered text-colour utilities. */}
          <h2
            id="pinned-announcements-heading"
            style={{ color: 'var(--color-brand-pink-dark)' }}
            className="flex items-center gap-2 text-sm font-extrabold tracking-[0.14em] uppercase"
          >
            <SnowflakeIcon size={16} className="animate-twinkle [animation-duration:4s]" />
            Pinned to the noticeboard
          </h2>
          <div className="mt-4 space-y-5">
            {pinned.map((announcement) => (
              <AnnouncementCard
                key={announcement.id}
                announcement={announcement}
                now={now}
                headingLevel="h3"
                showStatus={showStatus}
              />
            ))}
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section aria-labelledby="latest-announcements-heading">
          <h2
            id="latest-announcements-heading"
            style={{ color: 'var(--color-brand-lilac-dark)' }}
            className="flex items-center gap-2 text-sm font-extrabold tracking-[0.14em] uppercase"
          >
            <ShuttlecockIcon size={16} />
            {pinned.length > 0 ? 'More from the organisers' : 'Latest news'}
          </h2>
          <div className="mt-4 space-y-5">
            {rest.map((announcement) => (
              <AnnouncementCard
                key={announcement.id}
                announcement={announcement}
                now={now}
                headingLevel="h3"
                showStatus={showStatus}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
