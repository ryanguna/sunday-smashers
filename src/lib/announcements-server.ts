import { unstable_cache } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/public'
import {
  getPublishedAnnouncements,
  type Announcement,
  type AnnouncementsClient,
} from '@/lib/announcements'

/**
 * Cached, cookie-free loader for the **published** announcements feed.
 *
 * The landing page and `/announcements` both render this, and both were paying
 * for it twice over: the cookie-backed server client forced the whole route to
 * be dynamic, and then every visit made a fresh Supabase round trip. The
 * landing page measured at 2.4s to navigate to.
 *
 * Only published, in-window notices come back here — the same rows an
 * anonymous visitor is entitled to under RLS — so a cache shared across all
 * visitors is correct. The admin composer keeps using the cookie client via
 * `announcementsClient()`, because it needs drafts and the caller's identity.
 *
 * Posting or pinning from the console calls `revalidateTag(ANNOUNCEMENTS_TAG)`,
 * so a notice put up mid-tournament appears immediately rather than after the
 * TTL.
 */

export const ANNOUNCEMENTS_TAG = 'public-announcements'

/**
 * Short, because announcements are the committee's megaphone on the day: a
 * "Court 3 is free, next pair up" notice that takes minutes to appear is worse
 * than useless.
 */
const REVALIDATE_SECONDS = 30

async function fetchPublishedAnnouncements(now: number): Promise<Announcement[]> {
  const supabase = createPublicClient() as AnnouncementsClient | null
  return getPublishedAnnouncements(supabase, now)
}

const cachedAnnouncements = unstable_cache(
  fetchPublishedAnnouncements,
  ['public-announcements'],
  { revalidate: REVALIDATE_SECONDS, tags: [ANNOUNCEMENTS_TAG] },
)

export async function loadPublicAnnouncementsFeed(): Promise<{
  now: number
  announcements: Announcement[]
}> {
  const now = Date.now()
  // Bucketed to the TTL so the cache key is stable within a window. Passing a
  // raw `Date.now()` would mint a fresh cache entry on every single request,
  // which is an unbounded cache that never hits.
  const bucket = Math.floor(now / (REVALIDATE_SECONDS * 1000)) * REVALIDATE_SECONDS * 1000
  return { now, announcements: await cachedAnnouncements(bucket) }
}
