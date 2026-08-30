'use server'

import { revalidatePath } from 'next/cache'

import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import {
  createScoringConfig,
  createScoringState,
  deriveScoreboard,
  matchScorePatch,
  scoreEventInserts,
  type ScoringSnapshot,
  type ScoringTeam,
} from '@/lib/scoring'
import type { StageRules } from '@/lib/draw'
import { advanceKnockoutForMatch } from '@/lib/knockout-advance'

/**
 * Write actions behind the courtside scoring console.
 *
 * Two rules govern this file:
 *
 *   1. **Demo mode short-circuits before `createClient()`** (the pattern from
 *      `src/app/admin/draw/actions.ts`), so `npm run build` and CI, which run
 *      with no Supabase env vars, never touch the database.
 *   2. **A save is a full replace, not an append.** The umpire's phone holds
 *      the authoritative rally log; corrections can rewrite the middle of it,
 *      and venue wifi will retry the same payload more than once. Replacing
 *      `score_events` for the match and writing the derived `matches` row is
 *      idempotent, so a duplicate retry can never double-count a point.
 *
 * The action re-derives the score from the rally log server-side rather than
 * trusting numbers off the wire: a Server Action is a public POST endpoint,
 * and the score that lands on the TV must obey the match's own
 * `points_to_win` / `deuce_enabled` / `cap`. RLS
 * (`is_match_duty_official()`) is the final backstop.
 */

export interface ScoringActionResult {
  ok: boolean
  message: string
  /** True when nothing was written because Supabase isn't configured. */
  demo?: boolean
  /** Rallies accepted by the server — the console reconciles against this. */
  rallies?: number
}

const DEMO_RESULT: ScoringActionResult = {
  ok: false,
  demo: true,
  message: 'Demo mode — this score is kept on your device only.',
}

/** The payload the console posts. Deliberately small enough to survive 3G. */
export interface SaveScorePayload {
  matchId: string
  snapshot: ScoringSnapshot
  /** Sent so the server can re-derive the result under the real rules. */
  rules: StageRules
  teamA: ScoringTeam
  teamB: ScoringTeam
}

/**
 * Persists the whole rally log plus the derived match result.
 *
 * Called after every tap (debounced by the console). A failure is reported
 * honestly so the console can show the "not saved" banner and offer Retry —
 * the local log is never cleared on failure, so no point is ever lost.
 */
export async function saveScore(payload: SaveScorePayload): Promise<ScoringActionResult> {
  if (!isSupabaseConfigured()) return DEMO_RESULT

  const { matchId, snapshot } = payload
  if (!matchId || snapshot.matchId !== matchId) {
    return {
      ok: false,
      message: 'That score belongs to a different match — nothing was saved.',
    }
  }

  const config = createScoringConfig({
    matchId,
    rules: payload.rules,
    teamA: payload.teamA,
    teamB: payload.teamB,
    baseline: snapshot.baseline,
  })
  const state = createScoringState(config, {
    rallies: snapshot.rallies,
    ending: snapshot.ending,
  })
  const board = deriveScoreboard(state)

  try {
    const supabase = await createClient()
    const user = await getCurrentUser()
    if (!user)
      return {
        ok: false,
        message: 'You are signed out — sign in again to save the score.',
      }

    const patch = matchScorePatch(board, config)
    const { data: updatedRows, error: matchError } = await supabase
      .from('matches')
      .update({
        ...patch,
        // `started_at` is deliberately NOT written here. This runs after every
        // tap, so stamping it each time reset the courtside match clock to
        // zero on every point, and an undo back to 0-0 wiped it altogether. It
        // is owned solely by `startMatch()` below, which is the only moment
        // that actually means "this match started".
        completed_at: board.complete ? new Date().toISOString() : null,
      })
      .eq('id', matchId)
      .select('id')

    if (matchError) {
      return { ok: false, message: friendlyError(matchError.message) }
    }

    // PostgREST reports an RLS policy mismatch as zero rows affected with no
    // error at all, so checking `error` alone would show the umpire a saved
    // score that was never written.
    if (!updatedRows || updatedRows.length === 0) {
      return {
        ok: false,
        message:
          'Nothing was saved — you may no longer be on the duty roster for this match. Ask an admin.',
      }
    }

    // Full replace — see the note at the top of this file.
    const { error: deleteError } = await supabase
      .from('score_events')
      .delete()
      .eq('match_id', matchId)
    if (deleteError) return { ok: false, message: friendlyError(deleteError.message) }

    const rows = scoreEventInserts(state).map((row) => ({
      ...row,
      scored_by: user.id,
    }))
    if (rows.length > 0) {
      const { error: insertError } = await supabase.from('score_events').insert(rows)
      if (insertError) return { ok: false, message: friendlyError(insertError.message) }
    }

    // A decided semi final has to reach the Championship and the Battle for
    // 3rd, which are published with empty team slots. This is the moment the
    // result becomes final, so it is the moment to send the pairs through.
    // A failure here must not lose the score that was just saved — the result
    // stands and the umpire is told the bracket needs an admin.
    let advanceWarning: string | null = null
    if (board.complete) {
      const advance = await advanceKnockoutForMatch(supabase, matchId)
      if (!advance.ok) {
        advanceWarning = advance.message ?? 'The bracket could not be updated.'
      } else if (advance.updated > 0) {
        revalidatePath('/bracket')
        revalidatePath('/results')
        revalidatePath('/tv')
      }
    }

    revalidatePath('/live')
    revalidatePath('/schedule')
    revalidatePath('/scoring')
    revalidatePath(`/scoring/${matchId}`)

    if (advanceWarning) {
      return {
        ok: true,
        message: `Result saved, but the next round was not updated: ${advanceWarning}`,
        rallies: snapshot.rallies.length,
      }
    }

    return {
      ok: true,
      message: board.complete ? 'Result saved.' : 'Score saved.',
      rallies: snapshot.rallies.length,
    }
  } catch (error) {
    return {
      ok: false,
      message: friendlyError(error instanceof Error ? error.message : ''),
    }
  }
}

/**
 * Marks the match as under way so `/live` and the TV scoreboard pick it up
 * before the first rally is played.
 */
export async function startMatch(matchId: string): Promise<ScoringActionResult> {
  if (!isSupabaseConfigured()) return DEMO_RESULT

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('matches')
      .update({ status: 'in_progress', started_at: new Date().toISOString() })
      .eq('id', matchId)
      .select('id')
    if (error) return { ok: false, message: friendlyError(error.message) }
    // Zero rows and no error is what an RLS refusal looks like — treating it
    // as success would leave the match clock unstarted for the whole game.
    if (!data || data.length === 0) {
      return {
        ok: false,
        message: 'The match could not be started — you are not on its duty roster.',
      }
    }
    revalidatePath('/live')
    revalidatePath(`/scoring/${matchId}`)
    return { ok: true, message: 'Match started.' }
  } catch (error) {
    return {
      ok: false,
      message: friendlyError(error instanceof Error ? error.message : ''),
    }
  }
}

/** Turns a raw Postgres/PostgREST message into something an umpire can act on. */
function friendlyError(message: string): string {
  const text = message.toLowerCase()
  if (text.includes('row-level security') || text.includes('permission')) {
    return 'You are not on the duty roster for this match, so the score was refused.'
  }
  // A retried save that raced itself: the rally log is a full replace, so the
  // delete and re-insert of the same rows can collide. The umpire's own log is
  // authoritative and nothing was lost — say so instead of showing SQLSTATE
  // 23505 and a constraint name.
  if (
    text.includes('duplicate key') ||
    text.includes('already exists') ||
    text.includes('unique constraint') ||
    text.includes('23505')
  ) {
    return 'That score was already being saved — tap Retry and the console will catch up.'
  }
  if (text.includes('fetch') || text.includes('network') || text.includes('timeout')) {
    return 'No answer from the server.'
  }
  return message || 'Unknown error.'
}
