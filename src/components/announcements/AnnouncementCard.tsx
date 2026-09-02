import { Badge, Card, CardBody } from '@/components/ui'
import { BaubleIcon, HollyIcon, ShuttlecockIcon } from '@/components/icons'
import { Markdown } from '@/components/Markdown'
import { cn } from '@/lib/cn'
import {
  accentForAnnouncement,
  excerpt,
  formatAnnouncementDate,
  formatAnnouncementDateTime,
  formatRelativeTime,
  readingTimeMinutes,
  type Announcement,
} from '@/lib/announcements'
import { ACCENT_STYLES } from './accents'

/**
 * Presentational announcement card. Deliberately hook-free so it renders in
 * both Server and Client Components (the TV scoreboard tree is a client
 * tree).
 *
 * Timestamps: pass `now` to get a friendly relative time ("2 hours ago").
 * Omit it and the card falls back to an absolute, timezone-stable date —
 * which is what client trees should do, since a client-computed `Date.now()`
 * would drift from the server-rendered HTML and trip a hydration warning.
 */
export interface AnnouncementCardProps {
  announcement: Announcement
  /** Reference time for relative timestamps. Omit in client trees. */
  now?: Date | number
  /** `full` renders the markdown body; `compact` renders a one-line excerpt. */
  variant?: 'full' | 'compact'
  /** Heading element for the title, so pages keep a sane outline. */
  headingLevel?: 'h2' | 'h3'
  /** Shows a "Draft" chip (admin surfaces only). */
  showStatus?: boolean
  className?: string
}

export function AnnouncementTimestamp({
  announcement,
  now,
  className,
}: {
  announcement: Announcement
  now?: Date | number
  className?: string
}) {
  const absolute = formatAnnouncementDateTime(announcement.createdAt)
  const label =
    now === undefined
      ? formatAnnouncementDate(announcement.createdAt)
      : formatRelativeTime(announcement.createdAt, now)

  return (
    <time dateTime={announcement.createdAt} title={absolute} className={className}>
      {label}
    </time>
  )
}

export function AnnouncementCard({
  announcement,
  now,
  variant = 'full',
  headingLevel = 'h2',
  showStatus = false,
  className,
}: AnnouncementCardProps) {
  const accent = ACCENT_STYLES[accentForAnnouncement(announcement.id)]
  const Heading = headingLevel
  const pinned = announcement.isPinned

  return (
    <Card
      variant={pinned ? 'candy-stripe' : 'frosted'}
      className={cn('relative overflow-hidden', pinned && 'shadow-[var(--shadow-glow-pink)]', className)}
    >
      {!pinned && (
        <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1.5', accent.rail)} />
      )}

      <CardBody className={cn(pinned ? 'p-5 sm:p-6' : 'py-5 pr-5 pl-6 sm:py-6 sm:pr-6 sm:pl-7')}>
        <div className="flex flex-wrap items-center gap-2">
          {pinned && (
            <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-[image:var(--gradient-candy)] px-3 py-1 text-xs font-extrabold tracking-wide text-[var(--color-plum)] uppercase shadow-[var(--shadow-soft)]">
              <HollyIcon size={14} />
              Pinned
            </span>
          )}
          {showStatus && (
            <Badge status={announcement.isPublished ? 'approved' : 'pending'}>
              {announcement.isPublished ? 'Published' : 'Draft'}
            </Badge>
          )}
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-ink-muted)]">
            <BaubleIcon size={14} className={accent.text} />
            <AnnouncementTimestamp announcement={announcement} now={now} />
          </span>
        </div>

        <Heading
          className={cn(
            'mt-3 font-extrabold text-[var(--color-plum)]',
            variant === 'full' ? 'text-xl sm:text-2xl' : 'text-lg',
          )}
        >
          {announcement.title}
        </Heading>

        {variant === 'full' ? (
          <Markdown
            content={announcement.body}
            className="mt-2 text-[0.975rem] text-[var(--color-ink-soft)]"
          />
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-soft)]">
            {excerpt(announcement.body, 150)}
          </p>
        )}

        {variant === 'full' && (
          <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-ink-muted)]">
            <ShuttlecockIcon size={14} className={accent.text} />
            {readingTimeMinutes(announcement.body)} min read
          </p>
        )}
      </CardBody>
    </Card>
  )
}
