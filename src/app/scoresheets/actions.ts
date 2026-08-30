'use server'

import { revalidatePath } from 'next/cache'

import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, getProfile } from '@/lib/auth'
import type { ScoresheetStatus } from '@/lib/supabase/types'
import {
  applyScoresheetCommand,
  createSheetState,
  type ScoresheetCommand,
  type SheetSignature,
  type SheetState,
} from '@/lib/scoresheet'
import type { ScoringSide } from '@/lib/scoring'

/**
 * Write actions for the digital scoresheet.
 *
 * Two rules, both non-negotiable:
 *
 *  1. **Demo mode short-circuits before `createClient()`.** CI builds and runs
 *     the app with no Supabase env vars; a Server Action that reached for a
 *     database there would break the build. In demo mode the sheet advances on
 *     the device only, and says so.
 *  2. **The state machine decides, not the caller.** Every action reloads the
 *     sheet's current status from the database and runs the requested move
 *     through `applyScoresheetCommand`. A Server Action is a public POST
 *     endpoint: nobody gets to verify an unsigned sheet by posting
 *     `status: 'verified'`, and the RLS policies in migration 0001 are the
 *     backstop behind that.
 */

export interface ScoresheetActionResult {
  ok: boolean
  message: string
  /** The status the sheet is in after the attempt. */
  status?: ScoresheetStatus
  /** True when nothing was written because Supabase isn't configured. */
  demo?: boolean
}

const DEMO_RESULT: ScoresheetActionResult = {
  ok: false,
  demo: true,
  message: 'Demo mode — this sheet is kept on your device only, nothing was filed.',
}

export interface SignSheetInput {
  matchId: string
  side: ScoringSide
  /** The player the signer picked from their own pair. */
  playerId: string
  playerName: string
}

export async function signSheet(input: SignSheetInput): Promise<ScoresheetActionResult> {
  return run(input.matchId, (actor) => ({
    kind: 'sign',
    side: input.side,
    playerId: input.playerId,
    playerName: input.playerName,
    at: actor.at,
  }))
}

export async function openSheet(matchId: string): Promise<ScoresheetActionResult> {
  return run(matchId, (actor) => ({ kind: 'open', actor: actor.name, at: actor.at }))
}

export async function withdrawSignature(
  matchId: string,
  side: ScoringSide,
): Promise<ScoresheetActionResult> {
  return run(matchId, (actor) => ({
    kind: 'withdraw_signature',
    side,
    actor: actor.name,
    at: actor.at,
  }))
}

export async function submitSheet(matchId: string): Promise<ScoresheetActionResult> {
  return run(matchId, (actor) => ({
    kind: 'submit',
    actor: actor.name,
    actorId: actor.id,
    at: actor.at,
  }))
}

export async function verifySheet(matchId: string): Promise<ScoresheetActionResult> {
  return run(matchId, (actor) => ({
    kind: 'verify',
    actor: actor.name,
    actorId: actor.id,
    at: actor.at,
  }))
}

export async function disputeSheet(
  matchId: string,
  reason: string,
  side?: ScoringSide,
): Promise<ScoresheetActionResult> {
  return run(matchId, (actor) => ({
    kind: 'dispute',
    reason,
    actor: actor.name,
    actorId: actor.id,
    side,
    at: actor.at,
  }))
}

export async function reopenSheet(matchId: string): Promise<ScoresheetActionResult> {
  return run(matchId, (actor) => ({ kind: 'reopen', actor: actor.name, at: actor.at }))
}

// ---------------------------------------------------------------------------
// Shared plumbing
// ---------------------------------------------------------------------------

interface Actor {
  id: string | null
  name: string
  at: number
}

/**
 * Load → apply → persist, for every command. The clock is read here (a Server
 * Action, not a render) and injected, so nothing downstream ever touches one.
 */
async function run(
  matchId: string,
  build: (actor: Actor) => ScoresheetCommand,
): Promise<ScoresheetActionResult> {
  if (!isSupabaseConfigured()) return DEMO_RESULT
  if (!matchId) return { ok: false, message: 'No match was named, so nothing was changed.' }

  try {
    const supabase = await createClient()
    const [user, profile] = await Promise.all([getCurrentUser(), getProfile()])
    if (!user) {
      return { ok: false, message: 'You are signed out — sign in again to change this sheet.' }
    }

    const actor: Actor = {
      id: user.id,
      name: profile?.nickname || profile?.full_name || user.email || 'Someone',
      at: Date.now(),
    }
    const command = build(actor)

    const loaded = await loadSheet(supabase, matchId)
    const matchComplete = await isMatchComplete(supabase, matchId)
    const result = applyScoresheetCommand(loaded.state, command, { matchComplete })
    if (!result.ok) return { ok: false, message: result.message, status: loaded.state.status }

    const saved = await persist(supabase, matchId, loaded.sheetId, result.state, command, actor)
    if (saved) return { ok: false, message: saved, status: loaded.state.status }

    revalidatePath('/scoresheets')
    revalidatePath(`/scoresheets/${matchId}`)
    revalidatePath('/tabulator')
    if (result.state.status === 'verified') {
      revalidatePath('/standings')
      revalidatePath('/bracket')
    }

    return { ok: true, message: result.message, status: result.state.status }
  } catch (error) {
    return { ok: false, message: friendlyError(error instanceof Error ? error.message : '') }
  }
}

type ServerClient = Awaited<ReturnType<typeof createClient>>

async function loadSheet(
  supabase: ServerClient,
  matchId: string,
): Promise<{ sheetId: string | null; state: SheetState }> {
  const { data: sheet } = await supabase
    .from('scoresheets')
    .select('id, status, dispute_reason, submitted_by, submitted_at, verified_by, verified_at')
    .eq('match_id', matchId)
    .maybeSingle()

  if (!sheet) return { sheetId: null, state: createSheetState(matchId) }

  const { data: signatures } = await supabase
    .from('scoresheet_signatures')
    .select('player_id, signed_at')
    .eq('scoresheet_id', sheet.id)

  // Side is recovered from team membership when the sheet is *read* (see
  // `src/app/scoresheets/data.ts`). Here only the count and the identities
  // matter, so each stored signature is placed on a distinct side.
  const rows: SheetSignature[] = (signatures ?? []).map((row, index) => ({
    side: index === 0 ? 'a' : 'b',
    playerId: row.player_id,
    playerName: 'Player',
    signedAt: row.signed_at ? new Date(row.signed_at).getTime() : null,
  }))

  return {
    sheetId: sheet.id,
    state: createSheetState(matchId, {
      status: sheet.status,
      signatures: rows,
      disputeReason: sheet.dispute_reason,
      submittedBy: sheet.submitted_by,
      submittedAt: sheet.submitted_at ? new Date(sheet.submitted_at).getTime() : null,
      verifiedBy: sheet.verified_by,
      verifiedAt: sheet.verified_at ? new Date(sheet.verified_at).getTime() : null,
    }),
  }
}

async function isMatchComplete(supabase: ServerClient, matchId: string): Promise<boolean> {
  const { data } = await supabase.from('matches').select('status').eq('id', matchId).maybeSingle()
  const status = data?.status
  return (
    status === 'completed' || status === 'forfeited' || status === 'walkover' || status === 'retired'
  )
}

/** Writes the new state. Returns an error message, or `null` on success. */
async function persist(
  supabase: ServerClient,
  matchId: string,
  sheetId: string | null,
  state: SheetState,
  command: ScoresheetCommand,
  actor: Actor,
): Promise<string | null> {
  const patch = {
    match_id: matchId,
    status: state.status,
    dispute_reason: state.disputeReason,
    submitted_by: state.submittedBy,
    submitted_at: state.submittedAt ? new Date(state.submittedAt).toISOString() : null,
    verified_by: state.verifiedBy,
    verified_at: state.verifiedAt ? new Date(state.verifiedAt).toISOString() : null,
  }

  let id = sheetId
  if (id) {
    const { error } = await supabase.from('scoresheets').update(patch).eq('id', id)
    if (error) return friendlyError(error.message)
  } else {
    const { data, error } = await supabase.from('scoresheets').insert(patch).select('id').single()
    if (error) return friendlyError(error.message)
    id = data.id
  }

  if (command.kind === 'sign') {
    const { error } = await supabase.from('scoresheet_signatures').insert({
      scoresheet_id: id,
      player_id: command.playerId,
      signed_at: new Date(command.at ?? actor.at).toISOString(),
    })
    if (error) return friendlyError(error.message)
  }

  if (command.kind === 'withdraw_signature' || command.kind === 'reopen') {
    const keep = state.signatures.map((s) => s.playerId)
    let query = supabase.from('scoresheet_signatures').delete().eq('scoresheet_id', id)
    if (keep.length > 0) query = query.not('player_id', 'in', `(${keep.join(',')})`)
    const { error } = await query
    if (error) return friendlyError(error.message)
  }

  const last = state.trail[state.trail.length - 1]
  await supabase.from('audit_log').insert({
    actor_id: actor.id,
    action: `scoresheet.${command.kind}`,
    entity_type: 'scoresheet',
    entity_id: id,
    metadata: {
      match_id: matchId,
      from: last?.from ?? null,
      to: state.status,
      detail: last?.detail ?? '',
    },
  })

  return null
}

/** Turns a raw Postgres/PostgREST message into something a person can act on. */
function friendlyError(message: string): string {
  const text = message.toLowerCase()
  if (text.includes('row-level security') || text.includes('permission')) {
    return 'The database refused that change. Signatures can only be added by the player signing them, and only the tabulator can verify a sheet.'
  }
  if (text.includes('duplicate') || text.includes('unique')) {
    return 'That signature is already on this sheet.'
  }
  if (text.includes('fetch') || text.includes('network') || text.includes('timeout')) {
    return 'No answer from the server — the sheet was not changed.'
  }
  return message || 'Unknown error.'
}
