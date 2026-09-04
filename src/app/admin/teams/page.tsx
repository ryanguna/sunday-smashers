import type { Metadata } from 'next'

import { requireAdmin } from '@/lib/auth'

import {
  AdminDataErrorBanner,
  AdminDemoBanner,
  AdminEmptyState,
  AdminPageHeader,
} from '@/components/admin/AdminUI'
import { TeamsClient } from '@/components/admin/TeamsClient'

import { getTeamsAdminData } from './data'

export const metadata: Metadata = {
  title: 'Teams',
  robots: { index: false, follow: false },
}

/**
 * Signed-in-only, so it must never be prerendered: the guard would run once
 * at build time with no session and the result served to everyone.
 */
export const dynamic = 'force-dynamic'

/**
 * The pairing bench. Solo registrations land in the free-agent pool and can
 * never reach the draw until an admin puts them in a team — this page is that
 * step, plus seeding and the validation that stops a broken pair reaching the
 * court.
 */
export default async function AdminTeamsPage() {
  // Belt and braces with `admin/layout.tsx`. This page renders admin-only
  // PII, so it does not rely on a parent layout alone for its guard.
  await requireAdmin('/admin/teams')

  const { divisions, teams, freeAgents, isDemo, error } = await getTeamsAdminData()

  return (
    <>
      <AdminPageHeader
        eyebrow="Two by two"
        title="Teams"
        description="Pair up the free agents, name the teams and set the seeds that drive the draw."
      />
      {isDemo && <AdminDemoBanner />}
      {error && <AdminDataErrorBanner message={error} />}
      {teams.length === 0 && freeAgents.length === 0 ? (
        <AdminEmptyState
          title="No pairs on the bench yet"
          description="Players appear here as soon as their registration is approved — then you can pair them up, name the team and set a seed."
          href="/admin/registrations"
          linkLabel="Review registrations"
        />
      ) : (
        <TeamsClient
          divisions={divisions}
          teams={teams}
          freeAgents={freeAgents}
          isDemo={isDemo}
        />
      )}
    </>
  )
}
