import { GiftIcon, HollyIcon, ShuttlecockIcon } from '@/components/icons'
import { cn } from '@/lib/cn'
import {
  accentForAnnouncement,
  excerpt,
  formatAnnouncementDateTime,
  latestAnnouncements,
  type Announcement,
} from '@/lib/announcements'
import { ACCENT_STYLES } from './accents'

export interface AnnouncementsTvPanelProps {
  announcements: readonly Announcement[]
  /** How many published notices to show. Defaults to 3. */
  limit?: number
  title?: string
  /** Character budget per notice before the excerpt is truncated. */
  excerptChars?: number
  className?: string
}

/**
 * Courtside TV variant: light-on-dark, very large type, legible from the far
 * side of a gym. Designed to drop straight into the `/tv` rotation
 * (`bg-[#1c0f2e]` full-bleed layout) — it renders its own translucent panel
 * chrome and does not depend on any `@/components/tv` internals.
 *
 * Deliberately hook-free and free of `Date.now()`: timestamps are absolute
 * and timezone-stable, so the panel can live inside the TV's client tree
 * without any hydration drift. All sizes use `clamp()` so one component
 * covers 1366×768 through 4K.
 */
export function AnnouncementsTvPanel({
  announcements,
  limit = 3,
  title = 'Announcements',
  excerptChars = 150,
  className,
}: AnnouncementsTvPanelProps) {
  const items = latestAnnouncements(announcements, limit)

  return (
    <section
      aria-label={title}
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-[var(--radius-xl)] border border-white/15 bg-white/[0.06] p-[clamp(1rem,2vw,2.25rem)]',
        className,
      )}
    >
      {/* Inline colour: globals.css sets an unlayered `h1-h6 { color }` rule
          that beats Tailwind's layered utilities, so headings need it. */}
      <h2
        style={{ color: 'var(--color-brand-gold)' }}
        className="flex items-center gap-[0.6em] text-[clamp(1.1rem,2vw,2.1rem)] font-extrabold tracking-[0.12em] uppercase"
      >
        <HollyIcon className="h-[1.1em] w-[1.1em] text-[var(--color-brand-mint)]" />
        {title}
      </h2>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-[0.6em] text-center">
          <ShuttlecockIcon className="h-[clamp(2.5rem,5vw,5rem)] w-[clamp(2.5rem,5vw,5rem)] text-[var(--color-brand-pink-light)]" />
          <p className="text-[clamp(1.2rem,2.6vw,2.6rem)] font-extrabold text-white">
            Quiet on the court — no announcements yet 🎄
          </p>
        </div>
      ) : (
        <ul className="mt-[clamp(0.75rem,1.5vw,1.5rem)] flex min-h-0 flex-1 flex-col justify-start gap-[clamp(0.6rem,1.4vw,1.5rem)] overflow-hidden">
          {items.map((announcement) => {
            const accent = ACCENT_STYLES[accentForAnnouncement(announcement.id)]
            return (
              <li
                key={announcement.id}
                className={cn(
                  'rounded-[var(--radius-lg)] border-l-[0.4rem] bg-white/[0.09] px-[clamp(0.75rem,1.4vw,1.5rem)] py-[clamp(0.6rem,1.2vw,1.25rem)]',
                  announcement.isPinned
                    ? 'border-[var(--color-brand-gold)] bg-[var(--color-brand-gold)]/15'
                    : 'border-white/40',
                )}
              >
                <p className="flex items-center gap-[0.5em] text-[clamp(0.7rem,1.05vw,1.1rem)] font-extrabold tracking-[0.14em] uppercase">
                  {announcement.isPinned ? (
                    <>
                      <GiftIcon className="h-[1.2em] w-[1.2em] text-[var(--color-brand-gold)]" />
                      <span className="text-[var(--color-brand-gold)]">Pinned</span>
                    </>
                  ) : (
                    <ShuttlecockIcon className={cn('h-[1.2em] w-[1.2em]', accent.tvText)} />
                  )}
                  <span className="text-white/70">
                    {formatAnnouncementDateTime(announcement.createdAt)}
                  </span>
                </p>

                <p className="mt-[0.35em] text-[clamp(1.15rem,2.35vw,2.6rem)] leading-[1.15] font-extrabold text-white">
                  {announcement.title}
                </p>

                {excerptChars > 0 && (
                  <p className="mt-[0.3em] text-[clamp(0.85rem,1.5vw,1.6rem)] leading-snug font-semibold text-white/85">
                    {excerpt(announcement.body, excerptChars)}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
