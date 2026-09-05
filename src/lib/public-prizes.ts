import { loadSiteContent } from '@/lib/site-content'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { PLAYERS_PER_PAIR, type PublicPrizeBoard } from '@/lib/settings'

/**
 * Reads the prize money the committee has chosen to announce.
 *
 * ## Why this is a second `site_content` row
 *
 * The full prize configuration (`prize-config`) is stored with
 * `is_published = false` on purpose — it carries internal loot bag notes, so
 * RLS keeps it away from anonymous visitors entirely. That left the landing
 * page with no way to ever show the amounts, so it shipped hardcoded copy
 * promising "details announced soon" with nothing able to replace it.
 *
 * `savePrizesAction` therefore also writes a display-safe projection to this
 * slug, published only when the organiser ticks "Show prizes on the public
 * site". Anonymous read of *published* `site_content` is already allowed by
 * policy, so no migration and no new policy are involved.
 */

export const PUBLIC_PRIZES_SLUG = 'prize-public'

/**
 * Returns the announced prize board, or `null` when there is nothing to show.
 *
 * `null` covers every "not yet" case — demo mode, no tournament, the switch
 * turned off, or a malformed blob — and callers fall back to their own copy
 * rather than rendering an empty prize table.
 */
export async function loadPublicPrizeBoard(): Promise<PublicPrizeBoard | null> {
  if (!isSupabaseConfigured()) return null

  const row = await loadSiteContent(PUBLIC_PRIZES_SLUG)
  if (!row) return null

  return parsePublicPrizeBoard(row.body_markdown)
}

/**
 * Parses and sanity-checks a stored board.
 *
 * Exported for tests, and defensive on purpose: this row is written by an
 * older deploy's shape as easily as the current one, and a landing page that
 * throws is far worse than one that falls back to its static copy.
 */
export function parsePublicPrizeBoard(body: string | null | undefined): PublicPrizeBoard | null {
  if (!body) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null

  const blob = parsed as Partial<PublicPrizeBoard>
  const divisionPrizes = Array.isArray(blob.divisionPrizes) ? blob.divisionPrizes : []
  const lootBagItems = Array.isArray(blob.lootBagItems) ? blob.lootBagItems : []

  const prizes = divisionPrizes
    .filter((prize) => typeof prize?.divisionName === 'string' && typeof prize?.championCents === 'number')
    // A blob written before 4th place existed has no `fourthPlaceCents`, and
    // `undefined` in a currency formatter renders as `$NaN` on the landing
    // page. Coerce every amount rather than trusting the stored shape.
    .map((prize) => ({
      divisionId: prize.divisionId,
      divisionName: prize.divisionName,
      championCents: numberOr(prize.championCents, 0),
      runnerUpCents: numberOr(prize.runnerUpCents, 0),
      thirdPlaceCents: numberOr(prize.thirdPlaceCents, 0),
      fourthPlaceCents: numberOr(prize.fourthPlaceCents, 0),
    }))

  const board: PublicPrizeBoard = {
    divisionPrizes: prizes,
    trophyCount: numberOr(blob.trophyCount, 0),
    medalCount: numberOr(blob.medalCount, 0),
    lootBagItems: lootBagItems.filter(
      (item) => typeof item?.name === 'string' && typeof item?.quantity === 'number',
    ),
    // Recomputed, not read. Amounts are now per player, so a total stored by
    // an older deploy was summed on the old per-pair basis and is simply
    // wrong — and it is the one number on the landing page that promises
    // players real money. The stored figure is only a fallback for a board
    // that lists no divisions.
    totalPoolCents:
      prizes.length > 0
        ? prizes.reduce(
            (total, prize) =>
              total +
              PLAYERS_PER_PAIR *
                (prize.championCents +
                  prize.runnerUpCents +
                  prize.thirdPlaceCents +
                  prize.fourthPlaceCents),
            0,
          )
        : numberOr(blob.totalPoolCents, 0),
  }

  // Nothing worth announcing: an empty board would render a heading over a
  // blank space, which reads as broken rather than as "to be confirmed".
  if (board.divisionPrizes.length === 0 && board.totalPoolCents === 0) return null

  return board
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
