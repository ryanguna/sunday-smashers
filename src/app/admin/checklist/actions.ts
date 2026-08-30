'use server'

import { revalidatePath } from 'next/cache'

import { getCurrentUser, isAdmin } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import type { CommitteeChecklistRow, Json } from '@/lib/supabase/types'
import {
  checklistAuditEntry,
  checklistSeedAuditEntry,
  checklistSeedRows,
  checklistUpdatePatch,
  duplicateChecklistRowIds,
  isChecklistCategory,
  type ChecklistAuditEntry,
  type ChecklistItem,
} from '@/lib/checklist'

/**
 * Committee checklist mutations — one row per job in
 * `public.committee_checklist`.
 *
 * Row-per-job is the whole point: a blob save was last-write-wins, so two
 * committee members ticking different jobs at the same time silently lost
 * one another's edits. Each action here touches exactly the row (and, for
 * ticks, the single column) that changed.
 *
 * `done_at` / `done_by` are never written from here — the
 * `sync_committee_checklist_done` trigger owns them.
 */

const CHECKLIST_PATH = '/admin/checklist'

export interface ChecklistActionResult {
  ok: boolean
  message: string
  demo?: boolean
  /** Server-assigned row id, returned when a job is added. */
  id?: string
}

const DEMO_RESULT: ChecklistActionResult = {
  ok: false,
  demo: true,
  message: 'Demo mode — no database is connected, so ticks are previewed but not saved.',
}

type SupabaseLike = Awaited<ReturnType<typeof createClient>>

async function guard(): Promise<ChecklistActionResult | null> {
  if (!isSupabaseConfigured()) return DEMO_RESULT
  if (!(await isAdmin())) {
    return { ok: false, message: 'Only admins can edit the committee checklist.' }
  }
  return null
}

async function writeAudit(supabase: SupabaseLike, entry: ChecklistAuditEntry): Promise<void> {
  try {
    const actor = await getCurrentUser()
    await supabase.from('audit_log').insert({
      actor_id: actor?.id ?? null,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      metadata: entry.metadata as unknown as Json,
    })
  } catch {
    // An audit failure must never lose the tick itself.
  }
}

function refresh(): void {
  revalidatePath(CHECKLIST_PATH)
  revalidatePath(`${CHECKLIST_PATH}/print`)
}

/** Ticks or un-ticks one job. Writes `is_done` only; the trigger does the rest. */
export async function toggleChecklistItemAction(
  id: string,
  done: boolean,
  label: string,
  category: string,
): Promise<ChecklistActionResult> {
  const blocked = await guard()
  if (blocked) return blocked

  const supabase = await createClient()
  const { error } = await supabase.from('committee_checklist').update({ is_done: done }).eq('id', id)
  if (error) return { ok: false, message: `Could not update that job: ${error.message}` }

  await writeAudit(
    supabase,
    checklistAuditEntry('checklist.toggle', {
      id,
      label,
      category: isChecklistCategory(category) ? category : 'venue',
      done,
    }),
  )
  refresh()
  return { ok: true, message: done ? 'Ticked off. 🎄' : 'Put back on the list.' }
}

/** Edits owner / due date / notes / label for one job. */
export async function updateChecklistItemAction(
  id: string,
  patch: Partial<Pick<ChecklistItem, 'owner' | 'notes' | 'dueDate' | 'label' | 'category'>>,
  label: string,
): Promise<ChecklistActionResult> {
  const blocked = await guard()
  if (blocked) return blocked

  const columns = checklistUpdatePatch(patch)
  if (Object.keys(columns).length === 0) {
    return { ok: true, message: 'Nothing changed.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('committee_checklist').update(columns).eq('id', id)
  if (error) return { ok: false, message: `Could not save that change: ${error.message}` }

  await writeAudit(
    supabase,
    checklistAuditEntry('checklist.update', {
      id,
      label,
      category: patch.category ?? 'venue',
      done: false,
    }),
  )
  refresh()
  return { ok: true, message: 'Saved.' }
}

export async function addChecklistItemAction(input: {
  tournamentId: string
  category: ChecklistItem['category']
  label: string
  position: number
}): Promise<ChecklistActionResult> {
  const blocked = await guard()
  if (blocked) return blocked
  if (input.label.trim() === '') {
    return { ok: false, message: 'Give the job a name first.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('committee_checklist')
    .insert({
      tournament_id: input.tournamentId,
      category: input.category,
      label: input.label.trim(),
      position: input.position,
    })
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, message: `Could not add that job: ${error.message}` }

  const id = (data as { id: string } | null)?.id ?? null
  await writeAudit(
    supabase,
    checklistAuditEntry('checklist.add', {
      id: id ?? input.label,
      label: input.label.trim(),
      category: input.category,
      done: false,
    }),
  )
  refresh()
  return { ok: true, message: 'Added to the board.', id: id ?? undefined }
}

export async function deleteChecklistItemAction(
  id: string,
  label: string,
  category: string,
): Promise<ChecklistActionResult> {
  const blocked = await guard()
  if (blocked) return blocked

  const supabase = await createClient()
  const { error } = await supabase.from('committee_checklist').delete().eq('id', id)
  if (error) return { ok: false, message: `Could not remove that job: ${error.message}` }

  await writeAudit(
    supabase,
    checklistAuditEntry('checklist.delete', {
      id,
      label,
      category: isChecklistCategory(category) ? category : 'venue',
      done: false,
    }),
  )
  refresh()
  return { ok: true, message: 'Removed from the board.' }
}

/**
 * Fills an empty board with the 29 standard jobs.
 *
 * Deliberately explicit — an admin presses a button — rather than seeding on
 * page load, so a job the committee deleted on purpose can never reappear
 * and an ordinary page view never writes.
 *
 * Two admins pressing it in the same instant would both see an empty board,
 * so the insert is followed by a dedupe pass keeping the oldest row for each
 * job. There is no unique index to lean on, and a silently doubled checklist
 * would be worse than a self-healing one.
 */
export async function seedChecklistAction(tournamentId: string): Promise<ChecklistActionResult> {
  const blocked = await guard()
  if (blocked) return blocked

  const supabase = await createClient()

  const { data: existing, error: readError } = await supabase
    .from('committee_checklist')
    .select('*')
    .eq('tournament_id', tournamentId)
  if (readError) return { ok: false, message: `Could not read the board: ${readError.message}` }
  if (((existing as CommitteeChecklistRow[] | null) ?? []).length > 0) {
    return { ok: false, message: 'The board already has jobs on it — nothing was added.' }
  }

  const rows = checklistSeedRows(tournamentId)
  const { error } = await supabase.from('committee_checklist').insert(rows)
  if (error) return { ok: false, message: `Could not set up the board: ${error.message}` }

  const { data: after } = await supabase
    .from('committee_checklist')
    .select('*')
    .eq('tournament_id', tournamentId)
  const duplicates = duplicateChecklistRowIds((after as CommitteeChecklistRow[] | null) ?? [])
  if (duplicates.length > 0) {
    await supabase.from('committee_checklist').delete().in('id', duplicates)
  }

  await writeAudit(supabase, checklistSeedAuditEntry(rows.length, tournamentId))
  refresh()
  return { ok: true, message: `Standard checklist added — ${rows.length} jobs to work through.` }
}
