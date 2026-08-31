import type { Metadata } from 'next'

import { requireAdmin } from '@/lib/auth'
import {
  AdminDataErrorBanner,
  AdminDemoBanner,
  AdminEmptyState,
  AdminPageHeader,
} from '@/components/admin/AdminUI'
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
 * should not depend on a layout it does not own. In demo mode `requireAdmin`
 * resolves to the stand-in organiser rather than redirecting, so the console
 * stays reviewable in CI with sample data and nothing real to protect.
 */
export default async function AdminDrawPage() {
  await requireAdmin('/admin/draw')

  const { divisions, isDemo, error } = await getDrawWorkbenchData()

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
      {error && <AdminDataErrorBanner message={error} />}
      {divisions.length === 0 ? (
        <AdminEmptyState
          title="No divisions to draw yet"
          description="Set up the tournament and its divisions first — men's and women's doubles, court count and the rules. The draw workbench fills itself in from there."
          href="/admin/settings/divisions"
          linkLabel="Set up divisions"
        />
      ) : (
        <DrawWorkbench divisions={divisions} isDemo={isDemo} />
      )}
    </>
  )
}
