import type { TvAnnouncement } from '@/lib/tv/types'
import { PanelShell } from './UpNextPanel'
import { GiftIcon } from '@/components/icons'
import { cn } from '@/lib/cn'

const EMPHASIS: Record<NonNullable<TvAnnouncement['emphasis']>, string> = {
  info: 'text-[var(--color-brand-sky-light)]',
  gold: 'text-[var(--color-brand-gold)]',
  berry: 'text-[var(--color-brand-pink-light)]',
}

export function AnnouncementsPanel({ announcements }: { announcements: TvAnnouncement[] }) {
  if (announcements.length === 0) {
    return (
      <PanelShell title="Announcements">
        <p className="text-frost/60">No announcements right now.</p>
      </PanelShell>
    )
  }

  return (
    <PanelShell title="Announcements">
      <ul className="space-y-3">
        {announcements.map((a) => (
          <li key={a.id} className="flex items-start gap-2.5">
            <GiftIcon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-brand-pink)]" />
            <span
              className={cn(
                'text-[clamp(0.85rem,1.1vw,1.05rem)] font-semibold leading-snug',
                a.emphasis ? EMPHASIS[a.emphasis] : 'text-frost',
              )}
            >
              {a.message}
            </span>
          </li>
        ))}
      </ul>
    </PanelShell>
  )
}
