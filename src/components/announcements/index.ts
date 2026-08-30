/**
 * Reusable announcements surfaces.
 *
 * - `AnnouncementCard`      — one notice (full markdown body or compact excerpt).
 * - `AnnouncementFeed`      — the full pinned-first list + festive empty state.
 * - `AnnouncementsStrip`    — compact "latest from the organisers" strip for the landing page.
 * - `AnnouncementsTvPanel`  — courtside TV variant (light-on-dark, very large type).
 *
 * All four are hook-free, so they render in both Server and Client trees.
 * Data comes from `@/lib/announcements` (`getPublishedAnnouncements()`),
 * which falls back to demo fixtures whenever Supabase isn't configured.
 */
export * from './accents'
export * from './AnnouncementCard'
export * from './AnnouncementFeed'
export * from './AnnouncementsStrip'
export * from './AnnouncementsTvPanel'
