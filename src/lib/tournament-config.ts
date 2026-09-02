import { unstable_cache } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/public'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import {
  DEFAULT_TOURNAMENT_DATES,
  tournamentDatesFrom,
  type TournamentDates,
} from '@/lib/tournament'
import type { DivisionGender, DivisionRow, TournamentPublicRow } from '@/lib/supabase/types'
import type { StageRulesConfig } from '@/lib/settings'

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

/**
 * The scoring rules of one published division, narrowed to what public copy
 * needs. Deliberately not the whole `DivisionRow`: this is read anonymously,
 * so it only carries what is already visible on the rules page.
 */
export interface PublicDivisionSummary {
  id: string
  name: string
  gender: DivisionGender
  elims: StageRulesConfig
  finals: StageRulesConfig
  qualifyingPlaces: number
}

export interface PublicTournamentConfig {
  dates: TournamentDates
  /** Null in demo mode or before setup — callers should fall back to their own copy. */
  row: TournamentPublicRow | null
  /**
   * Published divisions, ordered by name. Empty in demo mode, before setup,
   * or while every division is still unpublished — callers must fall back to
   * their own copy rather than rendering "first to points".
   */
  divisions: PublicDivisionSummary[]
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
  divisions: [],
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

type PublicDivisionRow = Pick<
  DivisionRow,
  | 'id'
  | 'name'
  | 'gender'
  | 'points_to_win_elims'
  | 'deuce_enabled_elims'
  | 'cap_elims'
  | 'points_to_win_finals'
  | 'deuce_enabled_finals'
  | 'cap_finals'
  | 'qualifying_places'
>

function toPublicDivisionSummary(row: PublicDivisionRow): PublicDivisionSummary {
  return {
    id: row.id,
    name: row.name,
    gender: row.gender,
    // A cap is only meaningful with deuce on, matching `stageConfigFromRow`.
    elims: {
      pointsToWin: row.points_to_win_elims,
      deuce: row.deuce_enabled_elims,
      cap: row.deuce_enabled_elims ? row.cap_elims : null,
    },
    finals: {
      pointsToWin: row.points_to_win_finals,
      deuce: row.deuce_enabled_finals,
      cap: row.deuce_enabled_finals ? row.cap_finals : null,
    },
    qualifyingPlaces: row.qualifying_places,
  }
}

export async function loadPublicTournamentConfig(): Promise<PublicTournamentConfig> {  if (!isSupabaseConfigured()) return FALLBACK
  return cachedPublicTournamentConfig()
}

async function fetchPublicTournamentConfig(): Promise<PublicTournamentConfig> {
  try {
    const supabase = createPublicClient()
    if (!supabase) return FALLBACK
    const { data } = await supabase
      .from('tournament_public')
      .select('*')
      .order('tournament_date', { ascending: true })
      .limit(1)
      .maybeSingle()

    const row = (data ?? null) as TournamentPublicRow | null
    if (!row) return FALLBACK

    // Divisions carry the scoring rules the public copy quotes. Anonymous
    // reads are allowed only for published rows (RLS policy
    // `divisions_select_published_or_admin`), which is exactly the set we
    // want: an unpublished division is not yet something to advertise.
    const { data: divisionRows } = await supabase
      .from('divisions')
      .select(
        'id, name, gender, points_to_win_elims, deuce_enabled_elims, cap_elims, points_to_win_finals, deuce_enabled_finals, cap_finals, qualifying_places',
      )
      .eq('tournament_id', row.id)
      .eq('is_published', true)
      .order('name', { ascending: true })

    return {
      dates: tournamentDatesFrom(row),
      row,
      divisions: (divisionRows ?? []).map(toPublicDivisionSummary),
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

/**
 * Cache tag for the published tournament row. Anything that edits the
 * tournament from the admin console must call `revalidateTag` with this, or
 * the public site keeps quoting the old date for up to `REVALIDATE_SECONDS`.
 */
export const TOURNAMENT_CONFIG_TAG = 'public-tournament-config'

/**
 * Seconds before a cached copy is refetched.
 *
 * Short on purpose. The row changes rarely, but when the committee *does*
 * change it — opening registration, shifting the doors-open time on the
 * morning — they expect the site to follow almost immediately, and they will
 * not think to look for a cache.
 */
const REVALIDATE_SECONDS = 30

/**
 * Why this is cached at all: this loader runs on the landing page, the rules
 * page, the registration page and the footer, i.e. very nearly every
 * navigation. It used to use the cookie-backed server client, which made every
 * one of those routes dynamic and put a Supabase round trip on the critical
 * path of each click — measured at 1.3s for /rules and 2.4s for /. The data is
 * a single world-readable row from the `tournament_public` view, so none of
 * that was buying anything.
 */
const cachedPublicTournamentConfig = unstable_cache(
  fetchPublicTournamentConfig,
  ['public-tournament-config'],
  { revalidate: REVALIDATE_SECONDS, tags: [TOURNAMENT_CONFIG_TAG] },
)

/** Convenience for callers that only need the three dates. */
export async function loadTournamentDates(): Promise<TournamentDates> {
  return (await loadPublicTournamentConfig()).dates
}
