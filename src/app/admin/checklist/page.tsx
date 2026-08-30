import type { Metadata } from 'next'

import { requireAdmin } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { AdminDemoBanner, AdminPageHeader } from '@/components/admin/AdminUI'
import { ChecklistBoard } from '@/components/checklist'
import { TOURNAMENT_DATE_LABEL } from '@/lib/tournament'
import { getChecklistPageData } from './data'

export const metadata: Metadata = {
  title: 'Checklist · Admin',
  robots: { index: false, follow: false },
}

// Reads cookies (auth) — never prerender.
export const dynamic = 'force-dynamic'

/**
 * The committee's operational readiness board: loot bags, shirts, medals,
 * trophies, prize money, shuttles, first aid, scoresheets, pens.
 *
 * Quantities are never typed in — loot bags and the shirt-size breakdown
 * come from approved registrations via `shirtSizeTally`, and the money and
 * hardware counts come from Settings → Prizes.
 */
export default async function AdminChecklistPage() {
  if (isSupabaseConfigured()) {
    await requireAdmin('/admin/checklist')
  }

  const { items, derived, nowIso, isDemo } = await getChecklistPageData()

  return (
    <div>
      {isDemo && <AdminDemoBanner />}
      <AdminPageHeader
        eyebrow="Before the whistle"
        title="Loot bags & prizes checklist"
        description={`Everything that has to be in the hall on ${TOURNAMENT_DATE_LABEL}. Tick as you go, print it for the day.`}
      />
      <ChecklistBoard initialItems={items} derived={derived} nowIso={nowIso} isDemo={isDemo} />
    </div>
  )
}
