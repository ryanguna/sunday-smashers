'use server'

import { revalidatePath, revalidateTag, updateTag } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/supabase/types'
import { buildAuditEntry, type SettingsChange } from '@/lib/settings'
import { normaliseSiteCopy, SITE_COPY_FIELDS, SITE_COPY_SLUG, type SiteCopy } from '@/lib/site-copy'
import { loadSiteCopy, SITE_COPY_TAG } from '@/lib/site-copy-server'
import type { ActionResult } from '../actions'
import { withDemoHint } from '@/lib/demo-mode'

const COPY_PATH = '/admin/settings/copy'

/**
 * Save the committee's own wording.
 *
 * The row is written `is_published: true` deliberately. The public loader
 * reads through the `anon` client, and the `site_content` RLS policy only
 * exposes published rows — an unpublished blob would silently fall back to the
 * built-in defaults, so the committee would save a decline message and watch
 * the site keep showing the old one.
 */
export async function saveSiteCopyAction(next: SiteCopy): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return {
      ok: true,
      demo: true,
      message: withDemoHint('Demo mode — the words change on screen, but there is no database to keep them in.'),
      changes: [],
    }
  }

  const user = await requireAdmin(COPY_PATH)
  const current = await loadSiteCopy()
  const clean = normaliseSiteCopy(next)

  const changes: SettingsChange[] = []
  for (const field of SITE_COPY_FIELDS) {
    const before = String(current[field.key])
    const after = String(clean[field.key])
    if (before !== after) {
      changes.push({ path: `copy.${field.key}`, label: field.label, before, after })
    }
  }

  if (changes.length === 0) {
    return { ok: true, message: 'Nothing to save — everything already matches.', changes: [] }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('site_content').upsert(
    {
      slug: SITE_COPY_SLUG,
      title: 'Site copy',
      body_markdown: JSON.stringify(clean),
      is_published: true,
      updated_by: user.id,
    },
    { onConflict: 'slug' },
  )

  if (error) {
    return { ok: false, message: `Couldn't save that: ${error.message}` }
  }

  const entry = buildAuditEntry('settings.copy.update', 'site_content', SITE_COPY_SLUG, changes)
  await supabase.from('audit_log').insert({
    actor_id: user.id,
    action: entry.action,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    metadata: entry.metadata as unknown as Json,
  })

  // Same two-call dance as the page switches: `updateTag` so the console shows
  // the new words straight away, `revalidateTag` to purge the cache the public
  // pages share, and a layout revalidate because the copy reaches surfaces
  // rendered above the page.
  updateTag(SITE_COPY_TAG)
  revalidateTag(SITE_COPY_TAG, 'max')
  revalidatePath('/', 'layout')

  return {
    ok: true,
    message: `Saved — ${changes.length} message${changes.length === 1 ? '' : 's'} updated 🎄`,
    changes,
  }
}
