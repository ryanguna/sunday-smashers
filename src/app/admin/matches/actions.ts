'use server'

import { revalidatePath } from 'next/cache'

import { getCurrentUser, isAdmin } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/supabase/types'
import { DECIDED_MATCH_STATUSES } from '@/lib/supabase/types'
import { advanceKnockoutForMatch } from '@/lib/knockout-advance'
import type { MatchResultPatch, ReschedulePatch } from '@/lib/match-admin'

/**
 * Audit actions. Deliberately declared here rather than imported from
 * `./data`: this module is reachable from a Client Component (Next compiles
 * the import to an RPC stub), and `./data` pulls in `@/lib/supabase/server`,
 * which imports `next/headers`. Keeping the dependency out entirely means the
 * client graph can never accidentally acquire it.
 */
const MATCH_RESULT_AUDIT_ACTION = 'match.result_overridden'
const MATCH_RESCHEDULE_AUDIT_ACTION = 'match.rescheduled'

/**
 * Write actions behind `/admin/matches`.
 *
 * These are the only place in the app that can rewrite a result after the
 * fact, so they are deliberately paranoid:
 *
 *   - Demo mode short-circuits **before** `createClient()`, so the page is
 *     fully reviewable with no Supabase env vars and CI can build it.
 *   - `isAdmin()` is re-checked server-side. A Server Action is a public POST
 *     endpoint; the `/admin` layout only stops people *navigating* here, and
 *     RLS is the final backstop rather than the first.
 *   - Every write is mirrored into `audit_log` with the before/after values.
 *     An override that nobody can trace is how a tournament ends in an
 *     argument, and the whole point of this page is overriding.
 *
 * The patch itself is computed by `resolveResult()` / `reschedulePatch()` in
 * `@/lib/match-admin` — pure, unit-tested, and shared with the confirm dialog
 * so the admin approves exactly the values that get written.
 */

export interface MatchActionResult {
  ok: boolean
  message: string
  /** True when nothing was written because Supabase isn't configured. */
  demo?: boolean
}

const DEMO_RESULT: MatchActionResult = {
  ok: false,
  demo: true,
  message: 'Demo mode — no database is connected, so that was previewed but not saved. 🎄',
}

const DENIED: MatchActionResult = {
  ok: false,
  message: 'You need to be signed in as an admin to change a result.',
}

async function writeAudit(
  action: string,
  matchId: string,
  metadata: Record<string, Json>,
): Promise<void> {
  try {
    const supabase = await createClient()
    const actor = await getCurrentUser()
    await supabase.from('audit_log').insert({
      actor_id: actor?.id ?? null,
      action,
      entity_type: 'match',
      entity_id: matchId,
      metadata,
    })
  } catch {
    // Audit logging must never block the operational change it describes.
  }
}

/**
 * Everything a changed result touches.
 *
 * Standings, the bracket, the live board and the courtside TV are all derived
 * from `matches`, so a correction has to reach all of them at once — an admin
 * fixing a score at 2pm should not find `/live` still showing the old one.
 */
function revalidateMatches() {
  revalidatePath('/admin/matches')
  revalidatePath('/admin/schedule')
  revalidatePath('/admin/duty-roster')
  revalidatePath('/schedule')
  revalidatePath('/standings')
  revalidatePath('/live')
  revalidatePath('/tv')
  revalidatePath('/results')
  revalidatePath('/players')
}

function friendlyError(message: string): string {
  if (/row-level security|permission denied/i.test(message)) {
    return 'The database refused that change — your account may not have admin rights.'
  }
  if (/violates check constraint/i.test(message)) {
    return 'That combination of status and score is not one the database will accept.'
  }
  return `Could not save that: ${message}`
}

// ---------------------------------------------------------------------------
// Correcting or replacing a result
// ---------------------------------------------------------------------------

export interface SaveResultInput {
  matchId: string
  patch: MatchResultPatch
  /** Shown in the confirm dialog and stored on the audit row. */
  summary: string
  /** The admin acknowledged overwriting a verified scoresheet. */
  confirmOverwriteVerified?: boolean
}

export async function saveMatchResult(input: SaveResultInput): Promise<MatchActionResult> {
  if (!isSupabaseConfigured()) return DEMO_RESULT
  if (!(await isAdmin())) return DENIED

  const { matchId, patch } = input

  try {
    const supabase = await createClient()

    const { data: before } = await supabase
      .from('matches')
      .select('status, score_a, score_b, winner_team_id, forfeited_by_team_id, forfeit_reason')
      .eq('id', matchId)
      .maybeSingle()

    // Derived from the one canonical list, never restated here. An earlier
    // inline copy silently omitted statuses whenever the enum grew.
    const decided = (DECIDED_MATCH_STATUSES as readonly string[]).includes(patch.status ?? '')

    const { error } = await supabase
      .from('matches')
      .update({
        ...patch,
        // A cleared or cancelled match has not finished; a decided one has.
        completed_at: decided ? new Date().toISOString() : null,
        // Clearing a result also clears the fact that it ever started, so the
        // match reads as genuinely untouched rather than half-played.
        ...(patch.status === 'scheduled' ? { started_at: null } : {}),
      })
      .eq('id', matchId)

    if (error) return { ok: false, message: friendlyError(error.message) }

    await writeAudit(MATCH_RESULT_AUDIT_ACTION, matchId, {
      summary: input.summary,
      overwrote_verified_scoresheet: input.confirmOverwriteVerified ?? false,
      before: (before ?? null) as Json,
      after: patch as unknown as Json,
    })

    // Correcting a semi-final result has to move the finalists too, otherwise
    // the Final keeps whoever the original (wrong) result put there. The result
    // itself is already saved, so a failure here is reported but not fatal.
    let advanceWarning: string | null = null
    if (decided) {
      const advanced = await advanceKnockoutForMatch(supabase, matchId)
      if (!advanced.ok) {
        advanceWarning = advanced.message ?? 'the bracket could not be updated'
      } else if (advanced.updated > 0) {
        revalidatePath('/bracket')
      }
    }

    revalidateMatches()
    return advanceWarning
      ? { ok: true, message: `Result saved, but the next round was not updated: ${advanceWarning}` }
      : { ok: true, message: 'Result saved. 🎄' }
  } catch (error) {
    return { ok: false, message: friendlyError((error as Error).message) }
  }
}

// ---------------------------------------------------------------------------
// Moving a match
// ---------------------------------------------------------------------------

export interface RescheduleInput {
  matchId: string
  patch: ReschedulePatch
  summary: string
  /** The admin accepted moving it despite a clash the preview reported. */
  overrideConflicts?: boolean
  /** Conflict headlines recorded alongside an override, for the audit trail. */
  conflictSummary?: string[]
}

export async function rescheduleMatch(input: RescheduleInput): Promise<MatchActionResult> {
  if (!isSupabaseConfigured()) return DEMO_RESULT
  if (!(await isAdmin())) return DENIED

  try {
    const supabase = await createClient()

    const { data: before } = await supabase
      .from('matches')
      .select('court_id, time_slot_id')
      .eq('id', input.matchId)
      .maybeSingle()

    const { error } = await supabase
      .from('matches')
      .update(input.patch)
      .eq('id', input.matchId)

    if (error) return { ok: false, message: friendlyError(error.message) }

    await writeAudit(MATCH_RESCHEDULE_AUDIT_ACTION, input.matchId, {
      summary: input.summary,
      overrode_conflicts: input.overrideConflicts ?? false,
      conflicts: (input.conflictSummary ?? []) as Json,
      before: (before ?? null) as Json,
      after: input.patch as unknown as Json,
    })

    revalidateMatches()
    return {
      ok: true,
      message: 'Match moved. The duty roster for that court may need a fresh look. 🔔',
    }
  } catch (error) {
    return { ok: false, message: friendlyError((error as Error).message) }
  }
}
