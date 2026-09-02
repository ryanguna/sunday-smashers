import { unstable_cache } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/public'
import { isSitePageKey, type SitePageKey, type SitePageVisibility } from '@/lib/site-pages'

/**
 * Server-side loader for the committee's page-visibility switches.
 *
 * ## Why this is cached
 *
 * The header and footer are on every page, so this value is needed by every
 * single render. An uncached Supabase round trip per navigation is exactly the
 * "the nav feels stuck for a second" problem — and unlike the tournament row,
 * this one is read even on pages that have no other database work to do.
 *
 * `unstable_cache` gives us a shared, cross-request cache with a short TTL. The
 * TTL is deliberately short: when the committee flips a switch mid-event they
 * expect the site to follow within seconds, not minutes. Writes also call
 * `revalidateSitePageVisibility()`, so the delay only ever applies to changes
 * made outside the app (a hand-written SQL update, say).
 *
 * Crucially the underlying client reads **no cookies**, so wrapping it here
 * keeps callers statically renderable instead of forcing every page dynamic.
 */

export const SITE_PAGE_VISIBILITY_TAG = 'site-page-visibility'

/** Seconds before a cached copy is refetched. */
const REVALIDATE_SECONDS = 30

async function fetchSitePageVisibility(): Promise<SitePageVisibility> {
  const supabase = createPublicClient()
  if (!supabase) return {}

  try {
    const { data, error } = await supabase
      .from('site_page_visibility')
      .select('page_key, is_visible')

    // An error here means we don't know what the committee wants. Returning an
    // empty map makes every page visible (see `isPageVisible`), which is the
    // deliberately safe direction: a blip that reveals a page early is a much
    // smaller problem than one that blanks the whole navigation.
    if (error || !data) return {}

    const visibility: SitePageVisibility = {}
    for (const row of data as { page_key: string; is_visible: boolean }[]) {
      // Unknown keys are inert rather than an error: a row can outlive the
      // catalogue entry that created it (a page removed in a later release),
      // and that must not break the site.
      if (isSitePageKey(row.page_key)) {
        visibility[row.page_key as SitePageKey] = row.is_visible
      }
    }
    return visibility
  } catch {
    return {}
  }
}

const cachedSitePageVisibility = unstable_cache(
  fetchSitePageVisibility,
  ['site-page-visibility'],
  { revalidate: REVALIDATE_SECONDS, tags: [SITE_PAGE_VISIBILITY_TAG] },
)

export async function loadSitePageVisibility(): Promise<SitePageVisibility> {
  return cachedSitePageVisibility()
}
