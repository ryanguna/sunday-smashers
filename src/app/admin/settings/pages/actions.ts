'use server'

import { revalidatePath, revalidateTag, updateTag } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/supabase/types'
import { buildAuditEntry, type SettingsChange } from '@/lib/settings'
import { isSitePageKey, sitePageByKey, type SitePageVisibility } from '@/lib/site-pages'
import { loadSitePageVisibility, SITE_PAGE_VISIBILITY_TAG } from '@/lib/site-pages-server'
import type { ActionResult } from '../actions'

const PAGES_PATH = '/admin/settings/pages'

/**
 * Save which public pages are revealed.
 *
 * Same shape as every other action in `../actions.ts`: re-check admin
 * server-side, diff against what's stored, write, then append an `audit_log`
 * row. Someone will absolutely ask "who hid the standings?" on tournament
 * morning, and the audit trail is the only honest answer.
 */
export async function saveSitePageVisibilityAction(
  next: SitePageVisibility,
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return {
      ok: true,
      demo: true,
      message: 'Demo mode — the switches work, but there is no database to remember them in.',
      changes: [],
    }
  }

  const user = await requireAdmin(PAGES_PATH)
  const current = await loadSitePageVisibility()

  // Only keys in the catalogue, and only ones that actually moved. Upserting
  // the whole map every time would rewrite `updated_by` on pages nobody
  // touched, making the audit trail lie about who changed what.
  const changes: SettingsChange[] = []
  const rows: { page_key: string; is_visible: boolean }[] = []

  for (const [key, value] of Object.entries(next)) {
    if (!isSitePageKey(key) || typeof value !== 'boolean') continue
    const before = current[key] !== false
    if (before === value) continue
    rows.push({ page_key: key, is_visible: value })
    changes.push({
      path: `pages.${key}`,
      label: sitePageByKey(key)?.label ?? key,
      before: before ? 'visible' : 'hidden',
      after: value ? 'visible' : 'hidden',
    })
  }

  if (rows.length === 0) {
    return { ok: true, message: 'Nothing to save — everything already matches.', changes: [] }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('site_page_visibility')
    .upsert(rows, { onConflict: 'page_key' })

  if (error) {
    return { ok: false, message: `Couldn't save that: ${error.message}` }
  }

  const entry = buildAuditEntry('settings.pages.update', 'site_page_visibility', null, changes)
  await supabase.from('audit_log').insert({
    actor_id: user.id,
    action: entry.action,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    metadata: entry.metadata as unknown as Json,
  })

  // The public site reads this through a cached loader. Without these the
  // committee would flip a switch, reload, see nothing change for up to 30
  // seconds, and reasonably conclude the feature is broken.
  //
  // Both calls are needed on Next 16: `updateTag` gives this Server Action
  // read-your-own-writes so the redirect back to the console shows the new
  // state, while `revalidateTag` purges the `unstable_cache` entry the public
  // pages share. `revalidatePath('/', 'layout')` then drops the rendered
  // header and footer, which is where the nav links actually live.
  updateTag(SITE_PAGE_VISIBILITY_TAG)
  revalidateTag(SITE_PAGE_VISIBILITY_TAG, 'max')
  revalidatePath('/', 'layout')

  return { ok: true, message: revealMessage(changes), changes }
}

/** Festive, and specific about what just happened to the site. */
function revealMessage(changes: SettingsChange[]): string {
  const revealed = changes.filter((change) => change.after === 'visible').length
  const hidden = changes.length - revealed
  if (revealed && hidden) {
    return `Saved — ${revealed} page${revealed === 1 ? '' : 's'} unwrapped, ${hidden} tucked away.`
  }
  if (revealed) {
    return `Unwrapped ${revealed} page${revealed === 1 ? '' : 's'} — live on the site now 🎁`
  }
  return `Tucked ${hidden} page${hidden === 1 ? '' : 's'} out of sight. Nobody sees them until you say so.`
}
