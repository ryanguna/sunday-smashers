'use server'

import { revalidatePath } from 'next/cache'

import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, isAdmin } from '@/lib/auth'
import type { Json, MatchRow, MatchStageEnum } from '@/lib/supabase/types'
import {
  generateKnockout,
  generateRoundRobin,
  type StageRules,
  type StandingRow,
  type TeamId,
} from '@/lib/draw'
import {
  describePublishRpcError,
  fixturesToMatchInserts,
  knockoutToMatchInserts,
  publishSafety,
  toPublishDrawCalls,
  type ExistingMatchSummary,
  type MatchInsert,
} from '@/lib/draw-admin'
import { KNOCKOUT_STAGES, knockoutNextMatchLinks } from '@/lib/knockout-advance'
import { TIEBREAK_AUDIT_ACTION } from './data'
import { withDemoHint } from '@/lib/demo-mode'

/**
 * Write actions behind the draw workbench.
 *
 * Every action re-checks `isAdmin()` server-side: the layout guard stops
 * people *navigating* to the console, but a Server Action is a public POST
 * endpoint and must defend itself. RLS on `matches` is the final backstop.
 *
 * ATOMICITY: publishing goes through the `publish_draw()` Postgres function
 * (migration 0004), which does the delete + insert for one division+stage
 * inside a single server-side transaction. A failure can therefore no longer
 * leave a division with zero fixtures on tournament day. The RPC re-checks
 * `is_admin()` itself, refuses to destroy played matches unless forced, and
 * writes its own `draw.published` audit row — so this file deliberately does
 * *not* log publishes, only the things the RPC knows nothing about.
 *
 * `publishSafety()` still runs first: the RPC is the last line of defence,
 * but the admin should be told what they are about to destroy *before* they
 * confirm, not by a database error afterwards.
 *
 * In demo mode every action is an honest no-op so the console stays
 * clickable with no database.
 */

export interface DrawActionResult {
  ok: boolean
  message: string
  /** True when nothing was written because Supabase isn't configured. */
  demo?: boolean
  /** Fixtures written, when the action published something. */
  count?: number
}

const DEMO_RESULT: DrawActionResult = {
  ok: false,
  demo: true,
  message: withDemoHint('Demo mode — no database is connected, so the draw was previewed but not saved.'),
}

async function writeAudit(
  action: string,
  entityId: string,
  metadata: Record<string, Json>
): Promise<void> {
  try {
    const supabase = await createClient()
    const actor = await getCurrentUser()
    await supabase.from('audit_log').insert({
      actor_id: actor?.id ?? null,
      action,
      entity_type: 'division',
      entity_id: entityId,
      metadata,
    })
  } catch {
    // Audit logging must never block the operational change it describes.
  }
}

function revalidateDraw() {
  revalidatePath('/admin/draw')
  revalidatePath('/admin/draw/knockout')
  revalidatePath('/admin/schedule')
  revalidatePath('/schedule')
  revalidatePath('/standings')
  revalidatePath('/bracket')
}

function toSummaries(rows: readonly MatchRow[]): ExistingMatchSummary[] {
  return rows.map((row) => ({
    id: row.id,
    stage: row.stage,
    hasResult:
      row.status === 'completed' ||
      row.status === 'forfeited' ||
      row.status === 'walkover' ||
      row.status === 'in_progress' ||
      row.score_a > 0 ||
      row.score_b > 0,
  }))
}

interface PublishOptions {
  confirmReplace?: boolean
  confirmDestroyResults?: boolean
}

/**
 * Shared publish pipeline: read what is already there → `publishSafety()` →
 * one `publish_draw()` transaction per stage.
 *
 * A knockout spans three stages, so it takes three calls. Each is atomic on
 * its own; they are ordered semis → third → final so that a mid-way failure
 * leaves the *earlier* rounds published (which is the recoverable direction —
 * the semis are what gets played first).
 *
 * Every stage in `stages` gets a call, including the ones `inserts` has
 * nothing for. `publish_draw()` deletes the stage before inserting, so an
 * empty fixture list is how a stage is cleared — and clearing is required:
 * a division switched from 4 qualifiers to a straight final produces only a
 * FINAL, and without a call for `semi` and `third_place` the superseded
 * semis stayed in the database, scheduled and waiting to be played.
 */
async function replaceStage(
  divisionId: string,
  stages: readonly MatchStageEnum[],
  inserts: MatchInsert[],
  options: PublishOptions,
  label: string
): Promise<DrawActionResult> {
  const supabase = await createClient()

  const { data: existingRows, error: readError } = await supabase
    .from('matches')
    .select('*')
    .eq('division_id', divisionId)
    .in('stage', stages)

  if (readError) {
    return { ok: false, message: `Could not read the existing draw: ${readError.message}` }
  }

  const existing = toSummaries((existingRows ?? []) as MatchRow[])
  const safety = publishSafety(existing, options)
  if (!safety.canPublish) {
    return { ok: false, message: `${safety.headline}. ${safety.detail}` }
  }

  // The admin has seen exactly how many results this will destroy and ticked
  // the box, so the RPC's own refusal is redundant here — but only here.
  const force = safety.resultCount > 0 && options.confirmDestroyResults === true

  let published = 0
  let stageIndex = 0

  const callsByStage = new Map(toPublishDrawCalls(inserts).map((call) => [call.stage, call]))

  for (const stage of stages) {
    const call = callsByStage.get(stage) ?? { stage, matches: [] }
    const { data, error } = await supabase.rpc('publish_draw', {
      p_division_id: divisionId,
      p_stage: call.stage,
      p_matches: call.matches,
      p_force: force,
    })

    if (error) {
      const detail = describePublishRpcError(error.message)
      if (stageIndex === 0) {
        return { ok: false, message: detail }
      }
      revalidateDraw()
      return {
        ok: false,
        count: published,
        message: `${label} was only partly published — ${published} fixture(s) are live but the ${call.stage.replace('_', ' ')} stage failed. ${detail}`,
      }
    }

    published += typeof data === 'number' ? data : call.matches.length
    stageIndex += 1
  }

  revalidateDraw()
  return { ok: true, count: published, message: '' }
}

export interface PublishRoundRobinInput extends PublishOptions {
  divisionId: string
  /** The draw order the preview was generated from. */
  orderedTeamIds: TeamId[]
  rules: StageRules
  /** The reshuffle seed that produced this order, for the audit trail. */
  seed: number | null
}

/** Persists a round robin preview into `matches` as `scheduled` fixtures. */
export async function publishRoundRobinAction(
  input: PublishRoundRobinInput
): Promise<DrawActionResult> {
  if (input.orderedTeamIds.length < 2) {
    return { ok: false, message: 'You need at least two eligible pairs to publish a draw.' }
  }
  if (new Set(input.orderedTeamIds).size !== input.orderedTeamIds.length) {
    return { ok: false, message: 'The draw order contains the same pair twice.' }
  }
  if (!isSupabaseConfigured()) return DEMO_RESULT
  if (!(await isAdmin())) {
    return { ok: false, message: 'Only admins can publish the draw.' }
  }

  const fixtures = generateRoundRobin(input.orderedTeamIds)
  const result = await replaceStage(
    input.divisionId,
    ['elims'],
    fixturesToMatchInserts(fixtures, input.divisionId, input.rules),
    input,
    'The round robin'
  )

  if (!result.ok) return result

  // publish_draw() logs the publish itself; this records the *human* choice
  // behind it — the draw order and reshuffle seed — which the RPC cannot see.
  await writeAudit('draw.order_recorded', input.divisionId, {
    stage: 'elims',
    order: input.orderedTeamIds,
    seed: input.seed,
  })

  return {
    ...result,
    message: `Ho ho ho — ${result.count} round robin fixtures are live. 🎄`,
  }
}

export interface PublishKnockoutInput extends PublishOptions {
  divisionId: string
  /** Final ranked order after any manual tiebreak calls. */
  rankedTeamIds: TeamId[]
  rules: StageRules
  /**
   * The division's `qualifyingPlaces`. Required rather than defaulted: this is
   * the one path that writes the bracket to the database, and defaulting it
   * is exactly how a straight-final division ended up with two semi finals.
   */
  qualifyingPlaces: number
}

/**
 * Writes `matches.next_match_id` on the two semis so each points at the
 * Championship row that its winner feeds.
 *
 * It has to be a second pass: `publish_draw()` runs once per stage and the
 * semis are inserted before the Final exists, so there is no id to reference
 * until every stage is live. The column has been in the schema and accepted by
 * the RPC since migration 0004 but was never populated, which left the
 * bracket's shape as a naming convention rather than data.
 *
 * A failure here is reported but not treated as a failed publish: the fixtures
 * are live and playable, only the explicit link is missing.
 */
async function linkKnockoutNextMatches(divisionId: string): Promise<number> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('matches')
    .select('id, bracket_key, next_match_id')
    .eq('division_id', divisionId)
    .in('stage', [...KNOCKOUT_STAGES])

  if (error || !data) return 0

  const idsByBracketKey: Partial<Record<'M1' | 'M2' | 'THIRD' | 'FINAL', string>> = {}
  const currentLinks = new Map<string, string | null>()
  for (const row of data) {
    if (row.bracket_key) idsByBracketKey[row.bracket_key] = row.id
    currentLinks.set(row.id, row.next_match_id)
  }

  let linked = 0
  for (const link of knockoutNextMatchLinks(idsByBracketKey)) {
    if (currentLinks.get(link.matchId) === link.nextMatchId) continue

    // `.select()` so a policy mismatch — reported by PostgREST as zero rows
    // affected and no error — is not mistaken for a successful write.
    const { data: updated } = await supabase
      .from('matches')
      .update({ next_match_id: link.nextMatchId })
      .eq('id', link.matchId)
      .select('id')

    if (updated && updated.length > 0) linked += 1
  }

  return linked
}

/**
 * Persists the semi finals, Battle for 3rd and Championship. The bracket
 * shape always comes from `generateKnockout()` — this action only supplies
 * the ranked order.
 */
export async function publishKnockoutAction(
  input: PublishKnockoutInput
): Promise<DrawActionResult> {
  const places = input.qualifyingPlaces
  if (places < 2) {
    return { ok: false, message: 'This division qualifies nobody, so there is no bracket to draw.' }
  }
  if (input.rankedTeamIds.length < places) {
    return {
      ok: false,
      message: `${places} qualified pairs are needed before the bracket can be drawn.`,
    }
  }
  if (!isSupabaseConfigured()) return DEMO_RESULT
  if (!(await isAdmin())) {
    return { ok: false, message: 'Only admins can publish the knockout bracket.' }
  }

  // Minimal rows: `generateKnockout` only reads `teamId` order.
  const standings = input.rankedTeamIds.map<StandingRow>((teamId, index) => ({
    teamId,
    rank: index + 1,
    played: 0,
    wins: 0,
    losses: 0,
    forfeits: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    pointDiff: 0,
    tiebreak: 'wins',
    needsAdminDecision: false,
  }))

  const knockout = generateKnockout(standings, undefined, input.rules, places)
  const result = await replaceStage(
    input.divisionId,
    ['semi', 'third_place', 'final'],
    knockoutToMatchInserts(knockout, input.divisionId, input.rules),
    input,
    'The bracket'
  )

  if (!result.ok) return result

  const linked = await linkKnockoutNextMatches(input.divisionId)

  // The RPC logs one row per stage; this records who the qualifiers were.
  await writeAudit('draw.knockout_published', input.divisionId, {
    stage: 'knockout',
    qualifiers: input.rankedTeamIds.slice(0, places),
    qualifying_places: places,
    fixtures: result.count ?? 0,
    next_match_links: linked,
  })

  const shape =
    places === 2 ? 'a straight Championship' : 'semis, Battle for 3rd and the Final'
  return {
    ...result,
    message: `The bracket is live — ${result.count} fixtures: ${shape}. 🏆`,
  }
}

export interface TiebreakDecisionInput {
  divisionId: string
  /** The tied pairs in the admin's chosen final order. */
  teamIds: TeamId[]
  note?: string
}

/**
 * Records an admin's manual call on a tie the engine could not separate.
 *
 * There is no dedicated table for this, so the decision lives in
 * `audit_log` (action `draw.tiebreak_resolved`) and is replayed on load by
 * `getDrawWorkbenchData()` — which also gives it the paper trail a coin
 * toss deserves.
 */
export async function recordTiebreakDecisionAction(
  input: TiebreakDecisionInput
): Promise<DrawActionResult> {
  if (input.teamIds.length < 2) {
    return { ok: false, message: 'A tiebreak decision needs at least two pairs.' }
  }
  if (!isSupabaseConfigured()) return DEMO_RESULT
  if (!(await isAdmin())) {
    return { ok: false, message: 'Only admins can settle a tie.' }
  }

  await writeAudit(TIEBREAK_AUDIT_ACTION, input.divisionId, {
    team_ids: input.teamIds,
    note: input.note ?? null,
  })

  revalidateDraw()
  return { ok: true, message: 'Tie settled and logged. ⚖️' }
}
