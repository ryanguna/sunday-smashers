import { cache } from 'react'

import { getAdminConsoleData } from '@/components/admin/data'
import { PRIZES_SLUG } from '@/app/admin/settings/data'
import { defaultTournamentSettings, type PrizeSettings } from '@/lib/settings'
import type { AdminRegistration } from '@/lib/admin'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import type { SiteContentRow } from '@/lib/supabase/types'
import {
  COMMITTEE_CHECKLIST_SLUG,
  checklistOrDefault,
  deriveQuantities,
  type ChecklistItem,
  type DerivedQuantities,
} from '@/lib/checklist'

/**
 * Server-only data for `/admin/checklist`.
 *
 * SCHEMA NOTE: `public.checklist_items` is a per-player collection table
 * (did *this* player get a loot bag / shirt / medal). It cannot express a
 * committee readiness board with owners, due dates and notes, so the board
 * is persisted as a JSON blob in `site_content` under
 * `COMMITTEE_CHECKLIST_SLUG`. A dedicated table would be better — see the
 * agent report.
 */

export interface ChecklistPageData {
  items: ChecklistItem[]
  derived: DerivedQuantities
  prizes: PrizeSettings
  /** ISO timestamp resolved on the server so components never call `Date.now()`. */
  nowIso: string
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

function build(
  registrations: AdminRegistration[],
  prizes: PrizeSettings,
  divisionCount: number,
  raw: string | null,
  isDemo: boolean,
): ChecklistPageData {
  return {
    items: checklistOrDefault(raw),
    derived: deriveQuantities({ registrations, prizes, divisionCount }),
    prizes,
    nowIso: new Date().toISOString(),
    isDemo,
  }
}

export const getChecklistPageData = cache(async function getChecklistPageData(): Promise<ChecklistPageData> {
  const console_ = await getAdminConsoleData()
  const divisionCount = Math.max(1, console_.divisions.length)
  const fallbackPrizes = defaultTournamentSettings().prizes

  if (!isSupabaseConfigured()) {
    return build(console_.registrations, fallbackPrizes, divisionCount, null, true)
  }

  try {
    const supabase = await createClient()
    const [prizesRes, boardRes] = await Promise.all([
      supabase.from('site_content').select('*').eq('slug', PRIZES_SLUG).maybeSingle(),
      supabase.from('site_content').select('*').eq('slug', COMMITTEE_CHECKLIST_SLUG).maybeSingle(),
    ])

    const prizes = readPrizes((prizesRes.data as SiteContentRow | null)?.body_markdown)
    const raw = (boardRes.data as SiteContentRow | null)?.body_markdown ?? null

    return build(console_.registrations, prizes, divisionCount, raw, console_.isDemo)
  } catch {
    // A missing content row must never take the console down two days out.
    return build(console_.registrations, fallbackPrizes, divisionCount, null, console_.isDemo)
  }
})
