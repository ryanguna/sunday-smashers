import { unstable_cache } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/public'
import type { SiteContentRow } from '@/lib/supabase/types'

/**
 * Cached loader for published `site_content` rows (the rules page, the FAQ).
 *
 * ## Why this isn't just `createClient()`
 *
 * These rows are *published* content — the same bytes for every visitor,
 * signed in or not. Reading them through the cookie-backed server client made
 * `/rules` a dynamic route, so every single visit re-rendered on the server and
 * waited on a Supabase round trip. Measured at 1.3s to navigate to.
 *
 * The `anon` client reads no cookies, so this can be cached and the route can
 * be prerendered. RLS still applies, and the `is_published` filter here is
 * belt-and-braces on top of the policy — an unpublished draft must never leak
 * into a cache that is shared by every visitor.
 *
 * Writes from `/admin/settings` call `revalidateTag(SITE_CONTENT_TAG)`, so an
 * edit shows up immediately rather than after the TTL.
 */

export const SITE_CONTENT_TAG = 'site-content'

/** Seconds before a cached copy is refetched, if nothing has invalidated it. */
const REVALIDATE_SECONDS = 60

async function fetchSiteContent(slug: string): Promise<SiteContentRow | null> {
  const supabase = createPublicClient()
  if (!supabase) return null

  try {
    const { data, error } = await supabase
      .from('site_content')
      .select('*')
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle()

    if (error) return null
    return (data as SiteContentRow | null) ?? null
  } catch {
    return null
  }
}

const cachedSiteContent = unstable_cache(fetchSiteContent, ['site-content'], {
  revalidate: REVALIDATE_SECONDS,
  tags: [SITE_CONTENT_TAG],
})

export async function loadSiteContent(slug: string): Promise<SiteContentRow | null> {
  return cachedSiteContent(slug)
}
