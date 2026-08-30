import { cache } from 'react'

import { getAdminConsoleData } from '@/components/admin/data'
import { PRIZES_SLUG } from '@/app/admin/settings/data'
import { defaultTournamentSettings, type PrizeSettings } from '@/lib/settings'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import type { AdminRegistration } from '@/lib/admin'
import type { CommitteeChecklistRow, SiteContentRow, TournamentRow } from '@/lib/supabase/types'
import {
  checklistItemsFromRows,
  defaultChecklistItems,
  deriveQuantities,
  type ChecklistItem,
  type DerivedQuantities,
} from '@/lib/checklist'

/**
 * Server-only data for `/admin/checklist`.
 *
 * The board is one row per job in `public.committee_checklist` (migration
 * 0005) so two committee members can tick different jobs at the same time
 * without overwriting each other.
 *
 * Demo mode renders the seed board in memory: there is no database to read
 * and nothing to save, but the console must still be reviewable.
 */

export interface ChecklistPageData {
  items: ChecklistItem[]
  derived: DerivedQuantities
  prizes: PrizeSettings
  /** ISO timestamp resolved on the server so components never call `Date.now()`. */
  nowIso: string
  /** Null in demo mode, or when no tournament row exists to hang jobs off. */
  tournamentId: string | null
  /** True when the board has never been set up — the page offers to seed it. */
  needsSeeding: boolean
  isDemo: boolean
}

function readPrizes(raw: string | null | undefined): PrizeSettings {
  const fallback = defaultTournamentSettings().prizes
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw) as Partial<PrizeSettings>
    return {
      ...fallback,
      ...parsed,
      divisionPrizes: parsed.divisionPrizes ?? fallback.divisionPrizes,
      lootBagItems: parsed.lootBagItems ?? fallback.lootBagItems,
    }
  } catch {
    return fallback
  }
}

function quantities(
  registrations: AdminRegistration[],
  prizes: PrizeSettings,
  divisionCount: number,
): DerivedQuantities {
  return deriveQuantities({ registrations, prizes, divisionCount })
}

export const getChecklistPageData = cache(async function getChecklistPageData(): Promise<ChecklistPageData> {
  const adminData = await getAdminConsoleData()
  const divisionCount = Math.max(1, adminData.divisions.length)
  const fallbackPrizes = defaultTournamentSettings().prizes
  const nowIso = new Date().toISOString()

  if (!isSupabaseConfigured()) {
    return {
      items: defaultChecklistItems(),
      derived: quantities(adminData.registrations, fallbackPrizes, divisionCount),
      prizes: fallbackPrizes,
      nowIso,
      tournamentId: null,
      needsSeeding: false,
      isDemo: true,
    }
  }

  try {
    const supabase = await createClient()
    const { data: tournamentRow } = await supabase
      .from('tournaments')
      .select('*')
      .order('tournament_date')
      .limit(1)
      .maybeSingle()
    const tournamentId = (tournamentRow as TournamentRow | null)?.id ?? null

    const [prizesRes, boardRes] = await Promise.all([
      supabase.from('site_content').select('*').eq('slug', PRIZES_SLUG).maybeSingle(),
      tournamentId
        ? supabase
            .from('committee_checklist')
            .select('*')
            .eq('tournament_id', tournamentId)
            .order('position')
        : Promise.resolve({ data: [] as CommitteeChecklistRow[] }),
    ])

    const prizes = readPrizes((prizesRes.data as SiteContentRow | null)?.body_markdown)
    const rows = (boardRes.data as CommitteeChecklistRow[] | null) ?? []

    return {
      items: checklistItemsFromRows(rows),
      derived: quantities(adminData.registrations, prizes, divisionCount),
      prizes,
      nowIso,
      tournamentId,
      needsSeeding: tournamentId != null && rows.length === 0,
      isDemo: adminData.isDemo,
    }
  } catch {
    // A missing content row must never take the console down two days out.
    return {
      items: defaultChecklistItems(),
      derived: quantities(adminData.registrations, fallbackPrizes, divisionCount),
      prizes: fallbackPrizes,
      nowIso,
      tournamentId: null,
      needsSeeding: false,
      isDemo: true,
    }
  }
})
