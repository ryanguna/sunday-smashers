'use server'

import { revalidatePath } from 'next/cache'

import { getCurrentUser, isAdmin } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/supabase/types'
import {
  canAssignOfficial,
  type DutyAssignmentInsert,
  type SchedulePatch,
} from '@/lib/schedule-admin'
import { DUTY_AUDIT_ACTION, loadScheduleContext, SCHEDULE_AUDIT_ACTION } from './data'

/**
 * Write actions behind the schedule builder and the duty roster.
 *
 * Every action re-checks `isAdmin()` server-side — the `/admin` layout only
 * stops people *navigating* here; a Server Action is a public POST endpoint
 * and must defend itself, with RLS as the final backstop.
 *
 * The duty save additionally re-validates the "nobody officiates a match
 * they play in" invariant against freshly loaded rows, because the client
 * could be a stale tab (or not our UI at all).
 *
 * ATOMICITY: supabase-js has no client-side transactions, so the roster save
 * is a scoped delete followed by one multi-row insert. The insert is atomic;
 * the worst case is an empty roster for the affected matches, which the
 * "Derive from schedule" button rebuilds in one click.
 */

export interface ScheduleActionResult {
  ok: boolean
  message: string
  /** True when nothing was written because Supabase isn't configured. */
  demo?: boolean
  count?: number
}

const DEMO_RESULT: ScheduleActionResult = {
  ok: false,
  demo: true,
  message: 'Demo mode — no database is connected, so that was previewed but not saved. 🎄',
}

async function writeAudit(
  action: string,
  entityId: string,
  metadata: Record<string, Json>,
): Promise<void> {
  try {
    const supabase = await createClient()
    const actor = await getCurrentUser()
    await supabase.from('audit_log').insert({
      actor_id: actor?.id ?? null,
      action,
      entity_type: 'match',
      entity_id: entityId,
      metadata,
    })
  } catch {
    // Audit logging must never block the operational change it describes.
  }
}

function revalidateSchedule() {
  revalidatePath('/admin/schedule')
  revalidatePath('/admin/duty-roster')
  revalidatePath('/schedule')
  revalidatePath('/tv')
  revalidatePath('/live')
  revalidatePath('/players')
}

// ---------------------------------------------------------------------------
// Publish the schedule
// ---------------------------------------------------------------------------

export interface PublishScheduleInput {
  patches: SchedulePatch[]
  /** The admin accepted publishing with unresolved hard conflicts. */
  overrideConflicts?: boolean
  /** The admin accepted moving matches that already have a result. */
  confirmMoveResults?: boolean
  /** Conflict headlines recorded alongside an override, for the audit trail. */
  conflictSummary?: string[]
}

/** Writes court + time slot onto every match whose placement changed. */
export async function publishScheduleAction(
  input: PublishScheduleInput,
): Promise<ScheduleActionResult> {
  if (input.patches.length === 0) {
    return { ok: false, message: 'Nothing has moved, so there is nothing to publish.' }
  }
  if (!isSupabaseConfigured()) return DEMO_RESULT
  if (!(await isAdmin())) {
    return { ok: false, message: 'Only admins can publish the schedule.' }
  }

  const context = await loadScheduleContext()
  if (!context) {
    return { ok: false, message: 'Could not read the current schedule — try again in a moment.' }
  }

  const byId = new Map(context.matches.map((match) => [match.id, match]))
  const unknown = input.patches.filter((patch) => !byId.has(patch.id))
  if (unknown.length > 0) {
    return { ok: false, message: 'That schedule is out of date — reload the page and try again.' }
  }

  const movedWithResults = input.patches.filter((patch) => byId.get(patch.id)?.hasResult)
  if (movedWithResults.length > 0 && !input.confirmMoveResults) {
    return {
      ok: false,
      message: `${movedWithResults.length} match(es) already have a result — confirm the move before publishing.`,
    }
  }

  const supabase = await createClient()
  const results = await Promise.all(
    input.patches.map((patch) =>
      supabase
        .from('matches')
        .update({ court_id: patch.court_id, time_slot_id: patch.time_slot_id })
        .eq('id', patch.id),
    ),
  )
  const failed = results.find((result) => result.error)
  if (failed?.error) {
    return { ok: false, message: `Could not publish the schedule: ${failed.error.message}` }
  }

  await writeAudit(SCHEDULE_AUDIT_ACTION, input.patches[0].id, {
    matches_moved: input.patches.length,
    moved_with_results: movedWithResults.map((patch) => patch.id),
    override_conflicts: Boolean(input.overrideConflicts),
    conflicts: input.conflictSummary ?? [],
  })

  revalidateSchedule()
  return {
    ok: true,
    count: input.patches.length,
    message: `Ho ho ho — ${input.patches.length} match${input.patches.length === 1 ? '' : 'es'} now have a court and a time. 🎄`,
  }
}

// ---------------------------------------------------------------------------
// Save the duty roster
// ---------------------------------------------------------------------------

export interface SaveDutyRosterInput {
  /** Every match the save covers — their existing rows are replaced. */
  matchIds: string[]
  rows: DutyAssignmentInsert[]
}

/**
 * Replaces the duty roster for the given matches.
 *
 * The persisted shape is exactly what `getSchedule()` in
 * `src/lib/public-data.ts` reads: `source_match_id` set for derived seats
 * (which it surfaces as `source: 'derived'`) and null for admin-assigned
 * ones (`source: 'manual'`), so the player dashboard, `/schedule` and `/tv`
 * pick this up with no extra mapping.
 */
export async function saveDutyRosterAction(
  input: SaveDutyRosterInput,
): Promise<ScheduleActionResult> {
  if (input.matchIds.length === 0) {
    return { ok: false, message: 'There are no scheduled matches to roster yet.' }
  }
  if (!isSupabaseConfigured()) return DEMO_RESULT
  if (!(await isAdmin())) {
    return { ok: false, message: 'Only admins can publish the duty roster.' }
  }

  const context = await loadScheduleContext()
  if (!context) {
    return { ok: false, message: 'Could not read the current schedule — try again in a moment.' }
  }

  // Re-run the invariant server-side: a stale tab must never be able to
  // roster someone onto a match they are playing in.
  for (const row of input.rows) {
    const verdict = canAssignOfficial({
      matchId: row.match_id,
      playerId: row.player_id,
      matches: context.matches,
      placements: context.savedPlacements,
      courts: context.courts,
      slots: context.slots,
      teams: context.teams,
    })
    if (!verdict.allowed) {
      return { ok: false, message: `Blocked: ${verdict.reason}` }
    }
  }

  const supabase = await createClient()
  const { error: deleteError } = await supabase
    .from('duty_assignments')
    .delete()
    .in('match_id', input.matchIds)
  if (deleteError) {
    return { ok: false, message: `Could not clear the old roster: ${deleteError.message}` }
  }

  if (input.rows.length > 0) {
    const { error: insertError } = await supabase.from('duty_assignments').insert(input.rows)
    if (insertError) {
      return { ok: false, message: `Could not save the roster: ${insertError.message}` }
    }
  }

  await writeAudit(DUTY_AUDIT_ACTION, input.matchIds[0], {
    matches: input.matchIds.length,
    duties: input.rows.length,
  })

  revalidateSchedule()
  return {
    ok: true,
    count: input.rows.length,
    message: `${input.rows.length} duty seats are locked in — umpires, scoresheets and lines. 🏸`,
  }
}
