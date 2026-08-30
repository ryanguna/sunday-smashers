'use server'

import { revalidatePath } from 'next/cache'

import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, isAdmin } from '@/lib/auth'
import type { AwardRow, Json } from '@/lib/supabase/types'
import {
  awardAuditEntry,
  awardCollisionMessage,
  citationForStorage,
  isUniqueViolation,
  isValidAwardKey,
  planPublish,
  publishAuditEntry,
  type AwardAuditEntry,
  type AwardRecord,
} from '@/lib/awards'

/**
 * Write actions for `/admin/awards`.
 *
 * Every action re-checks `isAdmin()`: the `/admin` layout guard stops people
 * *navigating* here, but a Server Action is a public POST endpoint and must
 * defend itself. RLS (`awards_admin_write`) is the final backstop.
 *
 * Demo mode is an honest no-op so the console stays clickable with no
 * database attached.
 */

const AWARDS_PATH = '/admin/awards'
const PUBLIC_PATH = '/awards'

export interface AwardActionResult {
  ok: boolean
  message: string
  /** True when nothing was written because Supabase isn't configured. */
  demo?: boolean
  /** Rows affected. */
  count?: number
}

const DEMO_RESULT: AwardActionResult = {
  ok: false,
  demo: true,
  message: 'Demo mode — no database is connected, so the ceremony was rehearsed but not saved.',
}

export interface SaveAwardInput {
  /** Existing row id, or `null` to insert. */
  id: string | null
  divisionSlug: string
  awardKey: string
  /** The Postgres enum value this award is stored as. */
  dbType: AwardRow['award_type']
  teamId: string | null
  playerId: string | null
  citation: string
  isPublished: boolean
}

type SupabaseLike = Awaited<ReturnType<typeof createClient>>

async function ensureAdmin(): Promise<boolean> {
  return isAdmin()
}

async function writeAudit(supabase: SupabaseLike, entry: AwardAuditEntry): Promise<void> {
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
    // An audit failure must never lose the award itself.
  }
}

function recordFor(input: SaveAwardInput, id: string | null): Pick<AwardRecord, 'id' | 'key' | 'divisionSlug' | 'recipient'> {
  return {
    id,
    key: input.awardKey,
    divisionSlug: input.divisionSlug,
    recipient: {
      teamId: input.teamId,
      teamName: null,
      playerNames: [],
      playerId: input.playerId,
      playerName: null,
    },
  }
}

/** Inserts or updates one award. */
export async function saveAwardAction(input: SaveAwardInput): Promise<AwardActionResult> {
  if (!isSupabaseConfigured()) return DEMO_RESULT
  if (!(await ensureAdmin())) {
    return { ok: false, message: 'Only admins can hand out awards.' }
  }
  if (!input.teamId && !input.playerId) {
    return { ok: false, message: 'Pick a pair or a player first — an award needs a recipient.' }
  }
  if (!isValidAwardKey(input.awardKey)) {
    return {
      ok: false,
      message: `"${input.awardKey}" is not a usable award key — lower-case letters, digits, dashes and underscores only.`,
    }
  }

  const supabase = await createClient()
  const patch = {
    division_id: input.divisionSlug,
    team_id: input.teamId,
    player_id: input.playerId,
    award_type: input.dbType,
    award_key: input.awardKey,
    citation: citationForStorage(input.citation),
    is_published: input.isPublished,
  }

  if (input.id) {
    const { error } = await supabase.from('awards').update(patch).eq('id', input.id)
    if (error) {
      return {
        ok: false,
        message: isUniqueViolation(error)
          ? awardCollisionMessage(input.awardKey)
          : `Could not update the award: ${error.message}`,
      }
    }
    await writeAudit(supabase, awardAuditEntry('award.update', recordFor(input, input.id)))
  } else {
    const { data, error } = await supabase.from('awards').insert(patch).select('id').maybeSingle()
    if (error) {
      return {
        ok: false,
        message: isUniqueViolation(error)
          ? awardCollisionMessage(input.awardKey)
          : `Could not save the award: ${error.message}`,
      }
    }
    await writeAudit(
      supabase,
      awardAuditEntry('award.create', recordFor(input, (data as { id: string } | null)?.id ?? null)),
    )
  }

  revalidatePath(AWARDS_PATH)
  revalidatePath(PUBLIC_PATH)
  return { ok: true, message: 'Award recorded. 🏆', count: 1 }
}

/** Confirms several derived placing awards in one go. */
export async function confirmPlacingsAction(
  inputs: readonly SaveAwardInput[],
): Promise<AwardActionResult> {
  if (!isSupabaseConfigured()) return DEMO_RESULT
  if (!(await ensureAdmin())) {
    return { ok: false, message: 'Only admins can hand out awards.' }
  }
  if (inputs.length === 0) {
    return { ok: true, message: 'Nothing to confirm — the placings are already saved.', count: 0 }
  }

  const supabase = await createClient()
  const rows = inputs.map((input) => ({
    division_id: input.divisionSlug,
    team_id: input.teamId,
    player_id: input.playerId,
    award_type: input.dbType,
    award_key: input.awardKey,
    citation: citationForStorage(input.citation),
    is_published: input.isPublished,
  }))

  const { data, error } = await supabase.from('awards').insert(rows).select('id')
  if (error) {
    return {
      ok: false,
      message: isUniqueViolation(error)
        ? 'Some of these placings have already been confirmed for this division — reload the page to see the current awards.'
        : `Could not confirm the placings: ${error.message}`,
    }
  }

  const ids = ((data as { id: string }[] | null) ?? []).map((row) => row.id)
  for (const [index, input] of inputs.entries()) {
    await writeAudit(supabase, awardAuditEntry('award.create', recordFor(input, ids[index] ?? null)))
  }

  revalidatePath(AWARDS_PATH)
  revalidatePath(PUBLIC_PATH)
  return {
    ok: true,
    message: `Confirmed ${inputs.length} placing${inputs.length === 1 ? '' : 's'}. Medals engraved.`,
    count: inputs.length,
  }
}

export async function deleteAwardAction(id: string, divisionSlug: string, awardKey: string): Promise<AwardActionResult> {
  if (!isSupabaseConfigured()) return DEMO_RESULT
  if (!(await ensureAdmin())) {
    return { ok: false, message: 'Only admins can remove awards.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('awards').delete().eq('id', id)
  if (error) return { ok: false, message: `Could not remove the award: ${error.message}` }

  await writeAudit(
    supabase,
    awardAuditEntry('award.delete', {
      id,
      key: awardKey,
      divisionSlug,
      recipient: { teamId: null, teamName: null, playerNames: [], playerId: null, playerName: null },
    }),
  )

  revalidatePath(AWARDS_PATH)
  revalidatePath(PUBLIC_PATH)
  return { ok: true, message: 'Award removed.', count: 1 }
}

/**
 * Publishes or hides every saved award in a division.
 *
 * `planPublish` decides what actually changes and refuses to publish an
 * award with no recipient — an empty podium on the public page would be
 * worse than a delayed one.
 */
export async function setPublishedAction(
  records: readonly AwardRecord[],
  divisionSlug: string,
  publish: boolean,
): Promise<AwardActionResult> {
  const plan = planPublish(records, publish)
  if (plan.blockers.length > 0) {
    return { ok: false, message: plan.blockers.join(' ') }
  }
  if (plan.ids.length === 0) {
    return { ok: true, message: plan.summary, count: 0 }
  }
  if (!isSupabaseConfigured()) return { ...DEMO_RESULT, message: `Demo mode — would ${plan.summary.toLowerCase()}` }
  if (!(await ensureAdmin())) {
    return { ok: false, message: 'Only admins can publish awards.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('awards')
    .update({ is_published: publish })
    .in('id', plan.ids)
  if (error) return { ok: false, message: `Could not update the awards: ${error.message}` }

  await writeAudit(supabase, publishAuditEntry(plan, divisionSlug))

  revalidatePath(AWARDS_PATH)
  revalidatePath(PUBLIC_PATH)
  return {
    ok: true,
    message: publish
      ? `Published ${plan.ids.length} award${plan.ids.length === 1 ? '' : 's'} — the podium is live. 🎉`
      : `Hidden ${plan.ids.length} award${plan.ids.length === 1 ? '' : 's'} from the public page.`,
    count: plan.ids.length,
  }
}
