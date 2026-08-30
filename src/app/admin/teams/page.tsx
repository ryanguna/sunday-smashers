import type { Metadata } from 'next'

import { AdminDemoBanner, AdminPageHeader } from '@/components/admin/AdminUI'
import { TeamsClient } from '@/components/admin/TeamsClient'

import { getTeamsAdminData } from './data'

export const metadata: Metadata = {
  title: 'Teams',
  robots: { index: false, follow: false },
}

/**
 * The pairing bench. Solo registrations land in the free-agent pool and can
 * never reach the draw until an admin puts them in a team — this page is that
 * step, plus seeding and the validation that stops a broken pair reaching the
 * court.
 */
export default async function AdminTeamsPage() {
  const { divisions, teams, freeAgents, isDemo } = await getTeamsAdminData()

  return (
    <>
      <AdminPageHeader
        eyebrow="Two by two"
        title="Teams"
        description="Pair up the free agents, name the teams and set the seeds that drive the draw."
      />
      {isDemo && <AdminDemoBanner />}
      <TeamsClient
        divisions={divisions}
        teams={teams}
        freeAgents={freeAgents}
        isDemo={isDemo}
      />
    </>
  )
}
