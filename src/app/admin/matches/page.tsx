import type { Metadata } from 'next'

import { requireAdmin } from '@/lib/auth'
import {
  AdminDataErrorBanner,
  AdminDemoBanner,
  AdminEmptyState,
  AdminPageHeader,
} from '@/components/admin/AdminUI'
import { MatchesConsole } from '@/components/admin/MatchesConsole'
import { Button } from '@/components/ui'
import { RacketIcon } from '@/components/icons'
import { getMatchAdminData } from './data'

/**
 * Signed-in only: never prerender. Without this the auth check runs at build
 * time (when there is no session) and the result is cached and served to
 * everyone. Most pages here are dynamic anyway because they read cookie-bound
 * data, but that is incidental — this states it.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Matches',
  robots: { index: false, follow: false },
}

/**
 * Match management — the admin override.
 *
 * Guarded with `requireAdmin()` in its own right rather than leaning on the
 * `/admin` layout, because this page can rewrite a result that has already
 * been verified and moved into the standings. In demo mode `requireAdmin`
 * resolves to the stand-in organiser rather than redirecting, so CI can still
 * render it with the sample tournament.
 */
export default async function AdminMatchesPage() {
  await requireAdmin('/admin/matches')

  const { rows, divisions, matches, courts, slots, teams, placements, overrides, isDemo, error } =
    await getMatchAdminData()

  return (
    <>
      <AdminPageHeader
        eyebrow="Every rally, put right"
        title="Matches"
        description="Correct a score, record a late no-show, mark a retirement or move a fixture to another court. Nothing saves until you have seen exactly what it will change."
        actions={
          <Button href="/scoring" variant="secondary" size="sm">
            <RacketIcon size={16} aria-hidden="true" />
            Courtside scoring
          </Button>
        }
      />
      {isDemo && <AdminDemoBanner />}
      {error && <AdminDataErrorBanner message={error} />}
      {rows.length === 0 ? (
        <AdminEmptyState
          title="No fixtures on the books yet"
          description="Every match here comes from a published draw. Once the draw is out and scheduled, you can correct scores, record a no-show or move a game from this page."
          href="/admin/draw"
          linkLabel="Publish a draw"
        />
      ) : (
        <MatchesConsole
          rows={rows}
          divisions={divisions}
          isDemo={isDemo}
          context={{ matches, courts, slots, teams, placements, overrides }}
        />
      )}
    </>
  )
}
