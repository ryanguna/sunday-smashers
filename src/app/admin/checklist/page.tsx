import type { Metadata } from 'next'

import { requireAdmin } from '@/lib/auth'
import { AdminDataErrorBanner, AdminDemoBanner, AdminPageHeader } from '@/components/admin/AdminUI'
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
  await requireAdmin('/admin/checklist')

  const { items, derived, nowIso, tournamentId, needsSeeding, isDemo, error } =
    await getChecklistPageData()

  return (
    <div>
      {isDemo && <AdminDemoBanner />}
      {error && <AdminDataErrorBanner message={error} />}
      <AdminPageHeader
        eyebrow="Before the whistle"
        title="Loot bags & prizes checklist"
        description={`Everything that has to be in the hall on ${TOURNAMENT_DATE_LABEL}. Tick as you go, print it for the day.`}
      />
      <ChecklistBoard
        initialItems={items}
        derived={derived}
        nowIso={nowIso}
        tournamentId={tournamentId}
        needsSeeding={needsSeeding}
        isDemo={isDemo}
      />
    </div>
  )
}
