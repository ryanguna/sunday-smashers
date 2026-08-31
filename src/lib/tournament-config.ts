import { createClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import {
  DEFAULT_TOURNAMENT_DATES,
  tournamentDatesFrom,
  type TournamentDates,
} from '@/lib/tournament'
import type { TournamentPublicRow } from '@/lib/supabase/types'

/**
 * Server-side loader for the published tournament's public configuration.
 *
 * This closes audit blocker B4: the public countdown, the registration gate,
 * the entry fee and the organiser's contact details were all pinned in source
 * (`src/lib/tournament.ts`) or missing entirely. An organiser could change a
 * date in the admin console and the public site would keep quoting the old
 * one until somebody shipped a code change and redeployed.
 *
 * Reads the `tournament_public` view (migration 0010), which exposes only
 * published tournaments and is readable by anonymous visitors — so the
 * landing page stays cacheable-by-default and does not need a session.
 *
 * Every field degrades safely: with no Supabase, no published tournament, or
 * a half-filled row, the seeded defaults are used, so the site never renders
 * an "Invalid Date" countdown.
 */

export interface PublicTournamentConfig {
  dates: TournamentDates
  /** Null in demo mode or before setup — callers should fall back to their own copy. */
  row: TournamentPublicRow | null
  /**
   * The organiser's explicit switch. `null` means "no tournament row yet", in
   * which case the date window alone decides, exactly as it did before.
   */
  isRegistrationOpen: boolean | null
  entryFeeCents: number | null
  paymentInstructions: string | null
  venueName: string | null
  venueAddress: string | null
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  doorsOpenAt: string | null
}

const FALLBACK: PublicTournamentConfig = {
  dates: DEFAULT_TOURNAMENT_DATES,
  row: null,
  isRegistrationOpen: null,
  entryFeeCents: null,
  paymentInstructions: null,
  venueName: null,
  venueAddress: null,
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  doorsOpenAt: null,
}

export async function loadPublicTournamentConfig(): Promise<PublicTournamentConfig> {
  if (!isSupabaseConfigured()) return FALLBACK

  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('tournament_public')
      .select('*')
      .order('tournament_date', { ascending: true })
      .limit(1)
      .maybeSingle()

    const row = (data ?? null) as TournamentPublicRow | null
    if (!row) return FALLBACK

    return {
      dates: tournamentDatesFrom(row),
      row,
      isRegistrationOpen: row.is_registration_open,
      entryFeeCents: row.entry_fee_cents,
      paymentInstructions: row.payment_instructions,
      venueName: row.venue_name,
      venueAddress: row.venue_address,
      contactName: row.contact_name,
      contactEmail: row.contact_email,
      contactPhone: row.contact_phone,
      doorsOpenAt: row.doors_open_at,
    }
  } catch {
    // The public site must render even if the database is unreachable.
    return FALLBACK
  }
}

/** Convenience for callers that only need the three dates. */
export async function loadTournamentDates(): Promise<TournamentDates> {
  return (await loadPublicTournamentConfig()).dates
}
