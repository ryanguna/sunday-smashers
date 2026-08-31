import type { Metadata } from 'next'

import { requireAdmin } from '@/lib/auth'
import {
  AdminDataErrorBanner,
  AdminDemoBanner,
  AdminEmptyState,
} from '@/components/admin/AdminUI'
import { getAdminAwardsData } from './data'
import { AwardsAdminClient } from './AwardsAdminClient'

export const metadata: Metadata = {
  title: 'Awards · Admin',
  robots: { index: false, follow: false },
}

// Reads cookies (auth) — never prerender.
export const dynamic = 'force-dynamic'

/**
 * The awards console.
 *
 * Placing awards are derived from `finalPlacings()` rather than typed in, so
 * the admin's job is confirmation, not data entry. Everything stays
 * unpublished until someone explicitly reveals it.
 */
export default async function AdminAwardsPage() {
  await requireAdmin('/admin/awards')

  const { divisions, definitions, isDemo, error } = await getAdminAwardsData()

  return (
    <div className="space-y-6">
      {isDemo && <AdminDemoBanner />}
      {error && <AdminDataErrorBanner message={error} />}
      {divisions.length === 0 ? (
        <AdminEmptyState
          title="No podium to fill in yet"
          description="Awards are suggested from the final placings, so the ceremony page stays quiet until the draw is published and the knockout is played out."
          href="/admin/draw/knockout"
          linkLabel="See standings & knockout"
        />
      ) : (
        <AwardsAdminClient divisions={divisions} definitions={definitions} isDemo={isDemo} />
      )}
    </div>
  )
}
