/**
 * Knockout progression: feeding the semi final results into the Championship
 * and the Battle for 3rd.
 *
 * The bracket is published with the FINAL and THIRD rows holding `null` teams
 * — they cannot hold anything else, because who plays them is not known until
 * M1 and M2 have been played. Nothing used to fill them in, so the Final was
 * permanently unplayable: the console showed "TBC v TBC", the saved result
 * carried `winner_team_id = null`, and `finalPlacings()` therefore never
 * produced a champion for the results or awards pages.
 *
 * This module closes that loop. It is deliberately split in two:
 *
 *   - `planKnockoutAdvance()` is pure. Given the four knockout rows it returns
 *     the *minimal* set of column updates required. No rows to change means an
 *     empty plan, which is what makes re-running the advancement free.
 *   - `advanceKnockoutBracket()` applies that plan with a **targeted UPDATE of
 *     `team_a_id` / `team_b_id` on one row**. It must never go anywhere near
 *     `publish_draw()` / `replaceStage()`, which delete and re-insert the whole
 *     stage and would wipe results that have already been recorded.
 *
 * Slot convention — fixed, and identical to `generateKnockout()` in
 * `src/lib/draw.ts` so the preview and the database can never disagree:
 *
 *   | Source          | Destination        |
 *   |-----------------|--------------------|
 *   | Winner of M1    | FINAL `team_a_id`  |
 *   | Winner of M2    | FINAL `team_b_id`  |
 *   | Loser of M1     | THIRD `team_a_id`  |
 *   | Loser of M2     | THIRD `team_b_id`  |
 *
 * A semi that ends in a forfeit, walkover or retirement still has a winner and
 * still advances — the decided-status list is imported from
 * `@/lib/supabase/types`, never restated here.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import { matchWinner, type StageRules, type TeamId } from './draw'
import {
  DECIDED_MATCH_STATUSES,
  type Database,
  type MatchStatus,
} from './supabase/types'

/** The knockout stages, in the order they are played. */
export const KNOCKOUT_STAGES = ['semi', 'third_place', 'final'] as const

/** The bracket keys whose result feeds another fixture. */
export const FEEDER_BRACKET_KEYS = ['M1', 'M2'] as const

export type FeederBracketKey = (typeof FEEDER_BRACKET_KEYS)[number]

/** The columns `planKnockoutAdvance()` needs off a `matches` row. */
export interface KnockoutMatchRow {
  id: string
  bracket_key: 'M1' | 'M2' | 'THIRD' | 'FINAL' | null
  status: MatchStatus
  team_a_id: string | null
  team_b_id: string | null
  score_a: number
  score_b: number
  winner_team_id: string | null
  forfeited_by_team_id: string | null
  points_to_win: number
  deuce_enabled: boolean
  cap: number | null
}

/** The exact columns to write. A key is present only when it must change. */
export interface KnockoutSlotPatch {
  team_a_id?: string
  team_b_id?: string
}

export interface KnockoutSlotUpdate {
  /** `matches.id` of the FINAL or THIRD row. */
  matchId: string
  bracketKey: 'THIRD' | 'FINAL'
  patch: KnockoutSlotPatch
}

const DECIDED = new Set<string>(DECIDED_MATCH_STATUSES)

/** Whether a match has played out, including forfeits, walkovers and retirements. */
export function isDecidedStatus(status: MatchStatus): boolean {
  return DECIDED.has(status)
}

function rulesOf(row: KnockoutMatchRow): StageRules {
  return {
    pointsToWin: row.points_to_win,
    deuce: row.deuce_enabled,
    cap: row.cap ?? undefined,
  }
}

export interface SemiOutcome {
  winner: TeamId
  loser: TeamId
}

/**
 * The winner and loser of a semi, or `null` while it is unresolved.
 *
 * Unresolved covers every case the bracket must not act on: the match is not
 * decided yet, a slot is still empty, or the row is self-contradictory (a
 * `winner_team_id` naming a team that is not playing — `matchWinner()` throws
 * on that, and a corrupt row must not take the Final down with it).
 */
export function semiOutcome(row: KnockoutMatchRow): SemiOutcome | null {
  if (!isDecidedStatus(row.status)) return null
  const teamA = row.team_a_id
  const teamB = row.team_b_id
  if (!teamA || !teamB || teamA === teamB) return null

  let winner: TeamId | null = null
  try {
    winner = matchWinner(
      {
        teamA,
        teamB,
        pointsA: row.score_a,
        pointsB: row.score_b,
        forfeitedBy: row.forfeited_by_team_id,
        winner: row.winner_team_id,
      },
      rulesOf(row),
    )
  } catch {
    return null
  }

  if (winner !== teamA && winner !== teamB) return null
  return { winner, loser: winner === teamA ? teamB : teamA }
}

function findByKey(
  rows: readonly KnockoutMatchRow[],
  key: NonNullable<KnockoutMatchRow['bracket_key']>,
): KnockoutMatchRow | undefined {
  return rows.find((row) => row.bracket_key === key)
}

function slotPatch(
  target: KnockoutMatchRow | undefined,
  teamA: TeamId | null,
  teamB: TeamId | null,
): KnockoutSlotPatch | null {
  if (!target) return null

  // Never rewrite the teams of a fixture that has already been played. If a
  // semi is corrected after the Final was recorded, that is an admin decision
  // with results attached, not something to silently overwrite.
  if (isDecidedStatus(target.status)) return null

  const patch: KnockoutSlotPatch = {}
  // Only ever *fill* a slot: leave a resolved id in place when the feeding
  // semi has been reverted to undecided, so nothing already recorded is lost.
  if (teamA && teamA !== target.team_a_id && teamA !== target.team_b_id) patch.team_a_id = teamA
  if (teamB && teamB !== target.team_b_id && teamB !== target.team_a_id) patch.team_b_id = teamB

  return Object.keys(patch).length > 0 ? patch : null
}

/**
 * The minimal set of writes that bring the FINAL and THIRD rows in line with
 * the semi results. Returns `[]` when there is nothing to do — which is the
 * normal answer on a re-run, and what makes advancement idempotent.
 */
export function planKnockoutAdvance(
  rows: readonly KnockoutMatchRow[],
): KnockoutSlotUpdate[] {
  const m1 = findByKey(rows, 'M1')
  const m2 = findByKey(rows, 'M2')
  if (!m1 && !m2) return []

  const one = m1 ? semiOutcome(m1) : null
  const two = m2 ? semiOutcome(m2) : null
  if (!one && !two) return []

  const updates: KnockoutSlotUpdate[] = []

  const finalRow = findByKey(rows, 'FINAL')
  const finalPatch = slotPatch(finalRow, one?.winner ?? null, two?.winner ?? null)
  if (finalRow && finalPatch) {
    updates.push({ matchId: finalRow.id, bracketKey: 'FINAL', patch: finalPatch })
  }

  const thirdRow = findByKey(rows, 'THIRD')
  const thirdPatch = slotPatch(thirdRow, one?.loser ?? null, two?.loser ?? null)
  if (thirdRow && thirdPatch) {
    updates.push({ matchId: thirdRow.id, bracketKey: 'THIRD', patch: thirdPatch })
  }

  return updates
}

/**
 * `next_match_id` for each knockout row, given the published row ids.
 *
 * The column holds a single link, so it records the **winner's** destination:
 * both semis point at the Final. The loser's route to the Battle for 3rd is
 * the fixed slot convention above and is applied by `planKnockoutAdvance()`.
 * The Final and the Battle for 3rd are terminal and link to nothing.
 */
export function knockoutNextMatchLinks(
  idsByBracketKey: Readonly<Partial<Record<'M1' | 'M2' | 'THIRD' | 'FINAL', string>>>,
): { matchId: string; nextMatchId: string }[] {
  const finalId = idsByBracketKey.FINAL
  if (!finalId) return []

  return FEEDER_BRACKET_KEYS.flatMap((key) => {
    const matchId = idsByBracketKey[key]
    return matchId ? [{ matchId, nextMatchId: finalId }] : []
  })
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

type Client = SupabaseClient<Database>

export interface AdvanceKnockoutResult {
  ok: boolean
  /** Rows whose team slots were actually written. */
  updated: number
  /** Present when something went wrong; already human-readable. */
  message?: string
}

const ADVANCE_COLUMNS =
  'id, bracket_key, status, team_a_id, team_b_id, score_a, score_b, winner_team_id, forfeited_by_team_id, points_to_win, deuce_enabled, cap'

/**
 * Fills the Championship and Battle for 3rd slots for one division.
 *
 * Safe to call after *any* knockout match is saved, and safe to call twice:
 * the plan is empty when the slots already hold the right teams.
 *
 * Every update asks for the affected rows back rather than trusting a missing
 * `error`. Under RLS a policy mismatch is reported as zero rows affected with
 * no error at all, so "no error" alone would report a silent failure as
 * success and leave the Final unplayable for the second time.
 */
export async function advanceKnockoutBracket(
  supabase: Client,
  divisionId: string,
): Promise<AdvanceKnockoutResult> {
  const { data, error } = await supabase
    .from('matches')
    .select(ADVANCE_COLUMNS)
    .eq('division_id', divisionId)
    .in('stage', [...KNOCKOUT_STAGES])

  if (error) {
    return { ok: false, updated: 0, message: `Could not read the bracket: ${error.message}` }
  }

  const updates = planKnockoutAdvance((data ?? []) as KnockoutMatchRow[])
  if (updates.length === 0) return { ok: true, updated: 0 }

  let updated = 0
  for (const update of updates) {
    const { data: rows, error: updateError } = await supabase
      .from('matches')
      .update(update.patch)
      .eq('id', update.matchId)
      .select('id')

    if (updateError) {
      return {
        ok: false,
        updated,
        message: `Could not send the semi finalists through to the ${bracketLabel(update.bracketKey)}: ${updateError.message}`,
      }
    }

    if (!rows || rows.length === 0) {
      return {
        ok: false,
        updated,
        message: `The ${bracketLabel(update.bracketKey)} line-up was refused by the database — no row was changed. An admin needs to set it manually.`,
      }
    }

    updated += 1
  }

  return { ok: true, updated }
}

function bracketLabel(key: 'THIRD' | 'FINAL'): string {
  return key === 'FINAL' ? 'Championship' : 'Battle for 3rd'
}

/**
 * Advances the bracket off the back of one match, when that match is a semi.
 *
 * This is the hook every "a result was recorded" path should call — the
 * scoring console and the admin result override alike. It resolves the
 * match's division itself so callers only need the id they already have, and
 * it is a no-op for round robin fixtures, which feed nothing.
 */
export async function advanceKnockoutForMatch(
  supabase: Client,
  matchId: string,
): Promise<AdvanceKnockoutResult> {
  const { data, error } = await supabase
    .from('matches')
    .select('division_id, bracket_key')
    .eq('id', matchId)
    .maybeSingle()

  if (error) {
    return { ok: false, updated: 0, message: `Could not read the match: ${error.message}` }
  }
  if (!data) return { ok: true, updated: 0 }

  const key = data.bracket_key
  if (key !== 'M1' && key !== 'M2') return { ok: true, updated: 0 }

  return advanceKnockoutBracket(supabase, data.division_id)
}
