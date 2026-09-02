'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { ANNOUNCEMENTS_TAG } from '@/lib/announcements-server'

/**
 * Purge the cached public announcements feed.
 *
 * The composer writes straight to Supabase from the browser, so there is no
 * Server Action in the write path to hang cache invalidation off. Without this
 * an organiser posts "Court 3 is free" and the landing page keeps showing the
 * old list for up to 30 seconds — which, mid-tournament, is exactly when it
 * matters most.
 *
 * `updateTag` is deliberately *not* used: it is for read-your-own-writes inside
 * the action that made the change, and here the write already happened
 * client-side. There is nothing to authorise either — this only discards a
 * cache of rows that are public by definition, so the worst a stray call can
 * do is cause one extra query.
 */
export async function refreshPublicAnnouncementsAction(): Promise<void> {
  revalidateTag(ANNOUNCEMENTS_TAG, 'max')
  revalidatePath('/')
  revalidatePath('/announcements')
}
