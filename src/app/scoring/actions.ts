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
    const { error: matchError } = await supabase
      .from('matches')
      .update({
        ...patch,
        started_at: board.totalPoints > 0 ? new Date().toISOString() : null,
        completed_at: board.complete ? new Date().toISOString() : null,
      })
      .eq('id', matchId)

    if (matchError) {
      return { ok: false, message: friendlyError(matchError.message) }
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

    revalidatePath('/live')
    revalidatePath('/schedule')
    revalidatePath('/scoring')
    revalidatePath(`/scoring/${matchId}`)

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
    const { error } = await supabase
      .from('matches')
      .update({ status: 'in_progress', started_at: new Date().toISOString() })
      .eq('id', matchId)
    if (error) return { ok: false, message: friendlyError(error.message) }
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
  if (text.includes('fetch') || text.includes('network') || text.includes('timeout')) {
    return 'No answer from the server.'
  }
  return message || 'Unknown error.'
}
