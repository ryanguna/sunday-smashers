import type { AnnouncementAccent } from '@/lib/announcements'

/**
 * Shared pastel accent palette for announcement surfaces. Keyed by the
 * deterministic accent `accentForAnnouncement()` derives from a notice id,
 * so the same notice always wears the same bauble colour on server and
 * client (no hydration mismatch).
 */
export interface AccentStyle {
  /** Soft tinted background for card headers/rails. */
  soft: string
  /** Solid-ish border colour. */
  border: string
  /** AA-contrast text colour on white / on the `soft` tint. */
  text: string
  /** Decorative gradient rail down the side of a card. */
  rail: string
  /** High-contrast (light-on-dark) text for the TV panel. */
  tvText: string
}

export const ACCENT_STYLES: Record<AnnouncementAccent, AccentStyle> = {
  pink: {
    soft: 'bg-[var(--color-brand-pink-light)]',
    border: 'border-[var(--color-brand-pink)]',
    text: 'text-[var(--color-brand-pink-dark)]',
    rail: 'bg-[linear-gradient(180deg,var(--color-brand-pink),var(--color-brand-lilac))]',
    tvText: 'text-[#ffd6ec]',
  },
  lilac: {
    soft: 'bg-[var(--color-brand-lilac-light)]',
    border: 'border-[var(--color-brand-lilac)]',
    text: 'text-[var(--color-brand-lilac-dark)]',
    rail: 'bg-[linear-gradient(180deg,var(--color-brand-lilac),var(--color-brand-sky))]',
    tvText: 'text-[#e3d8ff]',
  },
  mint: {
    soft: 'bg-[var(--color-brand-mint-light)]',
    border: 'border-[var(--color-brand-mint)]',
    text: 'text-[var(--color-brand-mint-dark)]',
    rail: 'bg-[linear-gradient(180deg,var(--color-brand-mint),var(--color-brand-sky))]',
    tvText: 'text-[#d3fbec]',
  },
  sky: {
    soft: 'bg-[var(--color-brand-sky-light)]',
    border: 'border-[var(--color-brand-sky)]',
    text: 'text-[var(--color-brand-sky-dark)]',
    rail: 'bg-[linear-gradient(180deg,var(--color-brand-sky),var(--color-brand-mint))]',
    tvText: 'text-[#d6efff]',
  },
}
