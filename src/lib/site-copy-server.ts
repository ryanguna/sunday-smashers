import { unstable_cache } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/public'
import { DEFAULT_SITE_COPY, parseSiteCopy, SITE_COPY_SLUG, type SiteCopy } from '@/lib/site-copy'

/**
 * Cached, cookie-free loader for the committee-editable copy blob.
 *
 * Same reasoning as `site-pages-server`: this is read by the rules page, the
 * entry form and every gated player surface, so it has to be shareable across
 * requests and must not drag those routes into dynamic rendering. Saving from
 * the console calls `revalidateTag(SITE_COPY_TAG)` so an edit lands
 * immediately.
 *
 * The row is read through the `anon` client, which means the copy has to be a
 * **published** `site_content` row. That is fine — none of it is secret, and
 * the alternative (an unpublished row) would silently render defaults.
 */

export const SITE_COPY_TAG = 'site-copy'

const REVALIDATE_SECONDS = 30

async function fetchSiteCopy(): Promise<SiteCopy> {
  const supabase = createPublicClient()
  if (!supabase) return DEFAULT_SITE_COPY

  try {
    const { data, error } = await supabase
      .from('site_content')
      .select('body_markdown')
      .eq('slug', SITE_COPY_SLUG)
      .maybeSingle()

    if (error) return DEFAULT_SITE_COPY
    return parseSiteCopy((data as { body_markdown?: unknown } | null)?.body_markdown)
  } catch {
    return DEFAULT_SITE_COPY
  }
}

const cachedSiteCopy = unstable_cache(fetchSiteCopy, ['site-copy'], {
  revalidate: REVALIDATE_SECONDS,
  tags: [SITE_COPY_TAG],
})

export async function loadSiteCopy(): Promise<SiteCopy> {
  return cachedSiteCopy()
}
