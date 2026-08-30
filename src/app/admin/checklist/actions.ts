'use server'

import { revalidatePath } from 'next/cache'

import { getCurrentUser, isAdmin } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import type { Json, SiteContentRow } from '@/lib/supabase/types'
import {
  COMMITTEE_CHECKLIST_SLUG,
  checklistAuditEntry,
  checklistOrDefault,
  serialiseChecklist,
  type ChecklistItem,
} from '@/lib/checklist'

/**
 * Persists the committee readiness board.
 *
 * The whole board is saved in one blob: it is a handful of kilobytes and
 * the committee edits it collaboratively on a phone, so a single atomic
 * write is simpler and safer than per-row updates.
 */

const CHECKLIST_PATH = '/admin/checklist'

export interface ChecklistActionResult {
  ok: boolean
  message: string
  demo?: boolean
}

export async function saveChecklistAction(
  items: ChecklistItem[],
): Promise<ChecklistActionResult> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      demo: true,
      message: 'Demo mode — no database is connected, so ticks are previewed but not saved.',
    }
  }
  if (!(await isAdmin())) {
    return { ok: false, message: 'Only admins can edit the committee checklist.' }
  }

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('site_content')
    .select('*')
    .eq('slug', COMMITTEE_CHECKLIST_SLUG)
    .maybeSingle()
  const before = checklistOrDefault((existing as SiteContentRow | null)?.body_markdown ?? null)

  const { error } = await supabase.from('site_content').upsert(
    {
      slug: COMMITTEE_CHECKLIST_SLUG,
      title: 'Committee readiness checklist',
      body_markdown: serialiseChecklist(items, new Date().toISOString()),
      is_published: false,
    },
    { onConflict: 'slug' },
  )
  if (error) return { ok: false, message: `Could not save the checklist: ${error.message}` }

  try {
    const actor = await getCurrentUser()
    const entry = checklistAuditEntry(items, before)
    await supabase.from('audit_log').insert({
      actor_id: actor?.id ?? null,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      metadata: entry.metadata as unknown as Json,
    })
  } catch {
    // Never lose the save because the audit insert failed.
  }

  revalidatePath(CHECKLIST_PATH)
  revalidatePath(`${CHECKLIST_PATH}/print`)
  return { ok: true, message: 'Checklist saved. 🎄' }
}
