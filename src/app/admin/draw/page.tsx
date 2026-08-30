import type { Metadata } from 'next'

import { requireAdmin } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { AdminDemoBanner, AdminPageHeader } from '@/components/admin/AdminUI'
import { Button } from '@/components/ui'
import { TrophyIcon } from '@/components/icons'
import { DrawWorkbench } from '@/components/draw/DrawWorkbench'
import { getDrawWorkbenchData } from './data'

export const metadata: Metadata = {
  title: 'Draw',
  robots: { index: false, follow: false },
}

/**
 * The round robin draw workbench.
 *
 * Guarded with `requireAdmin()` in its own right — the `/admin` layout
 * already guards the tree, but a page that can rewrite the whole schedule
 * should not depend on a layout it does not own. Demo mode (no Supabase env
 * vars) skips the redirect exactly as the layout does, so the console is
 * reviewable in CI with sample data and nothing real to protect.
 */
export default async function AdminDrawPage() {
  if (isSupabaseConfigured()) {
    await requireAdmin('/admin/draw')
  }

  const { divisions, isDemo } = await getDrawWorkbenchData()

  return (
    <>
      <AdminPageHeader
        eyebrow="Deck the courts"
        title="Draw"
        description="Generate the single round robin, shuffle it until it looks right, then publish it to the world."
        actions={
          <Button href="/admin/draw/knockout" variant="secondary" size="sm">
            <TrophyIcon size={16} aria-hidden="true" />
            Standings & knockout
          </Button>
        }
      />
      {isDemo && <AdminDemoBanner />}
      <DrawWorkbench divisions={divisions} isDemo={isDemo} />
    </>
  )
}
