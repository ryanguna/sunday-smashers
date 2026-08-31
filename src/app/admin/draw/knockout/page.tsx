import type { Metadata } from 'next'

import { requireAdmin } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import {
  AdminDataErrorBanner,
  AdminDemoBanner,
  AdminEmptyState,
  AdminPageHeader,
} from '@/components/admin/AdminUI'
import { Button } from '@/components/ui'
import { ShuttlecockIcon } from '@/components/icons'
import { KnockoutWorkbench } from '@/components/draw/KnockoutWorkbench'
import { getDrawWorkbenchData } from '../data'

export const metadata: Metadata = {
  title: 'Standings & knockout',
  robots: { index: false, follow: false },
}

/**
 * Standings preview, tiebreak inspector and the knockout bracket.
 * Guarded in its own right — see the note on `/admin/draw`.
 */
export default async function AdminKnockoutPage() {
  if (isSupabaseConfigured()) {
    await requireAdmin('/admin/draw/knockout')
  }

  const { divisions, isDemo, error } = await getDrawWorkbenchData()

  return (
    <>
      <AdminPageHeader
        eyebrow="Who makes the podium?"
        title="Standings & knockout"
        description="Ranked by wins, then head to head. Settle any tie the rules can't, then draw the semis, the Battle for 3rd and the Championship."
        actions={
          <Button href="/admin/draw" variant="secondary" size="sm">
            <ShuttlecockIcon size={16} aria-hidden="true" />
            Round robin draw
          </Button>
        }
      />
      {isDemo && <AdminDemoBanner />}
      {error && <AdminDataErrorBanner message={error} />}
      {divisions.length === 0 ? (
        <AdminEmptyState
          title="No standings to rank yet"
          description="Set up your divisions, then publish a round robin draw. Once results start coming in, the ladder and the knockout bracket appear here."
          href="/admin/draw"
          linkLabel="Go to the draw"
        />
      ) : (
        <KnockoutWorkbench divisions={divisions} isDemo={isDemo} />
      )}
    </>
  )
}
