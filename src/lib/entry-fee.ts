/**
 * One home for "what does it cost to enter?".
 *
 * The fee had three separate answers depending on which page you were on:
 *
 *  - `/pay` read `tournaments.entry_fee_cents`, the value the admin actually
 *    edits in Tournament details;
 *  - the admin registrations and teams tables fell back to the hard-coded
 *    `DEFAULT_ENTRY_FEE_CENTS` ($25) whenever a player had no `payments` row
 *    yet, which is every player before they pay — so an organiser who set the
 *    fee to $30 saw "$25 owing" on the very screen used to chase payments;
 *  - `DivisionsEditor` wrote a *per-division* fee into the settings extras
 *    blob that nothing outside that form ever read back.
 *
 * `resolveEntryFee()` collapses all three into one lookup: the division's own
 * fee if the committee set one, otherwise the tournament fee, otherwise the
 * built-in default. `DEFAULT_ENTRY_FEE_CENTS` stays as the day-zero value for
 * a site with no tournament row yet, not as a runtime answer.
 */

import { DEFAULT_ENTRY_FEE_CENTS } from '@/lib/admin'
import { createClient } from '@/lib/supabase/server'

export const SETTINGS_EXTRAS_SLUG = 'settings-extras'

/** Resolves the fee owed for one entry, given its division. */
export type EntryFeeResolver = (divisionId: string | null | undefined) => number

interface ExtrasShape {
  divisions?: Record<string, { entryFeeCents?: number } | null | undefined>
}

type ServerClient = Awaited<ReturnType<typeof createClient>>

function parse(body: unknown): ExtrasShape {
  if (typeof body !== 'string') return {}
  try {
    const parsed = JSON.parse(body)
    return parsed && typeof parsed === 'object' ? (parsed as ExtrasShape) : {}
  } catch {
    return {}
  }
}

/**
 * Builds the resolver from the two rows that hold a fee. Reads are tolerant:
 * a missing tournament, a missing extras blob or unparseable JSON all fall
 * through to the next source rather than throwing, because a fee lookup must
 * never be the thing that takes the admin console down.
 */
export async function loadEntryFeeResolver(supabase: ServerClient): Promise<EntryFeeResolver> {
  const [tournamentRow, extrasRow] = await Promise.all([
    supabase
      .from('tournaments')
      .select('entry_fee_cents')
      .order('tournament_date', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('site_content')
      .select('body_markdown')
      .eq('slug', SETTINGS_EXTRAS_SLUG)
      .maybeSingle(),
  ])

  const tournamentFee = (tournamentRow.data as { entry_fee_cents?: number | null } | null)?.entry_fee_cents
  const base = typeof tournamentFee === 'number' ? tournamentFee : DEFAULT_ENTRY_FEE_CENTS
  const perDivision = parse((extrasRow.data as { body_markdown?: unknown } | null)?.body_markdown).divisions ?? {}

  return (divisionId) => {
    if (!divisionId) return base
    const own = perDivision[divisionId]?.entryFeeCents
    return typeof own === 'number' ? own : base
  }
}
