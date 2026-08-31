import { cache } from 'react'

import { getAdminConsoleData } from '@/components/admin/data'
import { PRIZES_SLUG } from '@/app/admin/settings/data'
import { defaultTournamentSettings, type PrizeSettings } from '@/lib/settings'
import { loadLiveOrDemo, rowOrThrow, rowsOrThrow } from '@/lib/demo-mode'
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

interface ChecklistPageRows {
  items: ChecklistItem[]
  derived: DerivedQuantities
  prizes: PrizeSettings
  /** ISO timestamp resolved on the server so components never call `Date.now()`. */
  nowIso: string
  /** Null in demo mode, or when no tournament row exists to hang jobs off. */
  tournamentId: string | null
  /** True when the board has never been set up — the page offers to seed it. */
  needsSeeding: boolean
}

export interface ChecklistPageData extends ChecklistPageRows {
  isDemo: boolean
  /** Set when a live query failed; the seed board is shown in that case. */
  error: string | null
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

  const seedBoard = (): ChecklistPageRows => ({
    items: defaultChecklistItems(),
    derived: quantities(adminData.registrations, fallbackPrizes, divisionCount),
    prizes: fallbackPrizes,
    nowIso,
    tournamentId: null,
    needsSeeding: false,
  })

  const { data, isDemo, error } = await loadLiveOrDemo<ChecklistPageRows>({
    demo: seedBoard,
    empty: seedBoard,
    live: () => loadLive(adminData.registrations, divisionCount, nowIso),
  })
  return { ...data, isDemo, error: error ?? adminData.error }
})

async function loadLive(
  registrations: AdminRegistration[],
  divisionCount: number,
  nowIso: string,
): Promise<ChecklistPageRows> {
  const supabase = await createClient()
  const tournamentRow = rowOrThrow(
    await supabase.from('tournaments').select('*').order('tournament_date').limit(1).maybeSingle(),
  )
  const tournamentId = (tournamentRow as TournamentRow | null)?.id ?? null

  const [prizesRes, boardRes] = await Promise.all([
    supabase.from('site_content').select('*').eq('slug', PRIZES_SLUG).maybeSingle(),
    tournamentId
      ? supabase
          .from('committee_checklist')
          .select('*')
          .eq('tournament_id', tournamentId)
          .order('position')
      : Promise.resolve({ data: [] as CommitteeChecklistRow[], error: null }),
  ])

  if (prizesRes.error) throw new Error(prizesRes.error.message)
  const prizes = readPrizes((prizesRes.data as SiteContentRow | null)?.body_markdown)
  const rows = rowsOrThrow(boardRes) as CommitteeChecklistRow[]

  return {
    items: checklistItemsFromRows(rows),
    derived: quantities(registrations, prizes, divisionCount),
    prizes,
    nowIso,
    tournamentId,
    needsSeeding: tournamentId != null && rows.length === 0,
  }
}
