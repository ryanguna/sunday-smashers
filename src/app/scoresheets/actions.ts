'use server'

import { revalidatePath } from 'next/cache'

import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, getProfile } from '@/lib/auth'
import type { ScoresheetStatus } from '@/lib/supabase/types'
import {
  applyScoresheetCommand,
  attributeSignatures,
  createSheetState,
  type MatchRosters,
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

    const saved = await persist(
      supabase,
      matchId,
      loaded.sheetId,
      loaded.state,
      result.state,
      command,
      actor,
    )
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

  const [{ data: signatures }, rosters] = await Promise.all([
    supabase.from('scoresheet_signatures').select('player_id, signed_at').eq('scoresheet_id', sheet.id),
    loadRosters(supabase, matchId),
  ])

  // The side is *not* the row's position in this list — that query has no
  // order, and `scoresheet_signatures` has no side column. It is recovered
  // from team membership by `attributeSignatures`, the same function the read
  // path uses, so a sheet the second pair signed first still shows their
  // signature against their own pair.
  const rows: SheetSignature[] = (signatures ?? []).map((row) => ({
    side: 'a',
    playerId: row.player_id,
    playerName: 'Player',
    signedAt: row.signed_at ? new Date(row.signed_at).getTime() : null,
  }))

  const state = createSheetState(matchId, {
    status: sheet.status,
    signatures: rows,
    disputeReason: sheet.dispute_reason,
    submittedBy: sheet.submitted_by,
    submittedAt: sheet.submitted_at ? new Date(sheet.submitted_at).getTime() : null,
    verifiedBy: sheet.verified_by,
    verifiedAt: sheet.verified_at ? new Date(sheet.verified_at).getTime() : null,
  })

  return { sheetId: sheet.id, state: attributeSignatures(state, rosters) }
}

const NO_ROSTERS: MatchRosters = { a: [], b: [] }

/** The two pairs' player ids for a match, straight from `team_members`. */
async function loadRosters(supabase: ServerClient, matchId: string): Promise<MatchRosters> {
  const { data: match } = await supabase
    .from('matches')
    .select('team_a_id, team_b_id')
    .eq('id', matchId)
    .maybeSingle()
  if (!match) return NO_ROSTERS

  const teamIds = [match.team_a_id, match.team_b_id].filter((id): id is string => Boolean(id))
  if (teamIds.length === 0) return NO_ROSTERS

  const { data: members } = await supabase
    .from('team_members')
    .select('team_id, player_id')
    .in('team_id', teamIds)

  return {
    a: (members ?? []).filter((m) => m.team_id === match.team_a_id).map((m) => m.player_id),
    b: (members ?? []).filter((m) => m.team_id === match.team_b_id).map((m) => m.player_id),
  }
}

async function isMatchComplete(supabase: ServerClient, matchId: string): Promise<boolean> {
  const { data } = await supabase.from('matches').select('status').eq('id', matchId).maybeSingle()
  const status = data?.status
  return (
    status === 'completed' || status === 'forfeited' || status === 'walkover' || status === 'retired'
  )
}

/**
 * The `scoresheets` columns this action owns, derived from a sheet state.
 * Signatures live in their own table and are deliberately absent.
 */
function sheetRow(matchId: string, state: SheetState) {
  return {
    match_id: matchId,
    status: state.status,
    dispute_reason: state.disputeReason,
    submitted_by: state.submittedBy,
    submitted_at: state.submittedAt ? new Date(state.submittedAt).toISOString() : null,
    verified_by: state.verifiedBy,
    verified_at: state.verifiedAt ? new Date(state.verifiedAt).toISOString() : null,
  }
}

type SheetRow = ReturnType<typeof sheetRow>

function rowChanged(before: SheetRow, after: SheetRow): boolean {
  return (Object.keys(after) as (keyof SheetRow)[]).some((key) => before[key] !== after[key])
}

/**
 * Writes the new state. Returns an error message, or `null` on success.
 *
 * Every write here asks for the affected rows back and checks that some came
 * out. Under RLS, PostgREST reports a write no policy allows as "0 rows
 * affected" with **no error** — so checking `error` alone reports success for
 * a change the database refused, which is how "take this signature back" came
 * to silently do nothing while the UI said it had worked.
 */
async function persist(
  supabase: ServerClient,
  matchId: string,
  sheetId: string | null,
  previous: SheetState,
  state: SheetState,
  command: ScoresheetCommand,
  actor: Actor,
): Promise<string | null> {
  const patch = sheetRow(matchId, state)

  let id = sheetId
  if (!id) {
    // Create the row in `draft` and let the update below carry it to wherever
    // the command actually landed. The INSERT policy only lets a duty official
    // create a sheet with `status = 'draft'` (migration 0009, H6 — so nobody
    // can file a sheet pre-marked 'verified'), but the very first command is
    // always `open`, which leaves the state at 'awaiting_signature'. Inserting
    // `state.status` directly therefore had RLS refuse the first write for
    // every match unless an admin made it.
    const { data, error } = await supabase
      .from('scoresheets')
      .insert({ match_id: matchId, status: 'draft' as ScoresheetStatus })
      .select('id')
    if (error) return friendlyError(error.message)
    if (!data || data.length === 0) return REFUSED_UPDATE
    id = data[0].id
  }

  // Only touch `scoresheets` when a column actually changes. `sign` and
  // `withdraw_signature` write nothing here — they only add or remove a
  // signature row — and the players doing the signing are never the duty
  // officials for their own match (the officials come from the *next* match on
  // that court), so the UPDATE policy refuses them. Firing a no-op UPDATE and
  // treating "0 rows" as fatal meant no sheet could ever reach two signatures.
  if (rowChanged(sheetRow(matchId, previous), patch)) {
    const { data, error } = await supabase.from('scoresheets').update(patch).eq('id', id).select('id')
    if (error) return friendlyError(error.message)
    if (!data || data.length === 0) return REFUSED_UPDATE
  }

  if (command.kind === 'sign') {
    const { data, error } = await supabase
      .from('scoresheet_signatures')
      .insert({
        scoresheet_id: id,
        player_id: command.playerId,
        signed_at: new Date(command.at ?? actor.at).toISOString(),
      })
      .select('id')
    if (error) return friendlyError(error.message)
    if (!data || data.length === 0) return REFUSED_SIGN
  }

  if (command.kind === 'withdraw_signature' || command.kind === 'reopen') {
    // Delete exactly the signatures the state machine dropped, and confirm
    // every one of them actually went. Anything left behind means the row is
    // still there on the next load, so reporting success would put the sheet
    // and the database into different stories about who agreed to this result.
    const kept = new Set(state.signatures.map((s) => s.playerId))
    const removed = [...new Set(previous.signatures.map((s) => s.playerId))].filter(
      (playerId) => !kept.has(playerId),
    )

    if (removed.length > 0) {
      const { data, error } = await supabase
        .from('scoresheet_signatures')
        .delete()
        .eq('scoresheet_id', id)
        .in('player_id', removed)
        .select('player_id')
      if (error) return friendlyError(error.message)
      if ((data?.length ?? 0) < removed.length) return REFUSED_DELETE
    }
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

/**
 * What a write that a database policy silently refused looks like to a person.
 *
 * PostgREST does not error on an RLS mismatch — it reports zero rows affected.
 * These messages exist so that never again reads as success.
 */
const REFUSED_UPDATE =
  'The database refused that change — the sheet was not updated. You may no longer be on duty for this match, or the sheet has moved on since this page loaded. Reload and try again.'

const REFUSED_SIGN =
  'The database refused that signature — nothing was recorded. A signature can only be added by the signed-in player, and only for a pair they actually play in.'

const REFUSED_DELETE =
  'The database refused to remove that signature — it is still on the sheet. Only the player who signed, or a duty official for this match, can take a signature back. Reload to see what is actually recorded.'

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
