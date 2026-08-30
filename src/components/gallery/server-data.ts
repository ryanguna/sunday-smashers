import { createClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { getSchedule, type PublicMatch } from '@/lib/public-data'
import {
  getModerationQueue,
  type GalleryPhoto,
  type GallerySupabaseClient,
} from '@/lib/gallery'
import { buildMatchIndex } from './data'

/**
 * Server-only data loading for `/admin/gallery`.
 *
 * The moderation queue is fetched here, in the Server Component, and handed
 * to `<GalleryModeration>` as props. Doing it that way (rather than fetching
 * from an effect in the client) keeps the admin's cookie session doing the
 * RLS work, renders the queue in the first paint, and means the client
 * component holds no data-loading effect at all.
 *
 * This module imports `@/lib/supabase/server`, which pulls in `next/headers`,
 * so it must never be imported from a `'use client'` component — that is
 * exactly why it lives apart from `./data.ts` and is not re-exported from
 * `./index.ts`.
 */

export interface ModerationPageData {
  photos: GalleryPhoto[]
  matches: PublicMatch[]
  isDemo: boolean
}

export async function loadModerationQueue(): Promise<ModerationPageData> {
  const configured = isSupabaseConfigured()
  const client = configured
    ? ((await createClient()) as unknown as GallerySupabaseClient)
    : null

  let matches: PublicMatch[] = []
  try {
    matches = await getSchedule()
  } catch {
    matches = []
  }

  const photos = await getModerationQueue(client, { matches: buildMatchIndex(matches) })
  return { photos, matches, isDemo: !configured }
}
