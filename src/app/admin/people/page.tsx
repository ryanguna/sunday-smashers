import type { Metadata } from 'next'

import {
  AdminDataErrorBanner,
  AdminDemoBanner,
  AdminEmptyState,
  AdminPageHeader,
} from '@/components/admin/AdminUI'
import { PeopleClient } from '@/components/admin/PeopleClient'
import { loadPeoplePageData } from './data'

export const metadata: Metadata = {
  title: 'People & roles',
  robots: { index: false, follow: false },
}

/**
 * Every account on the project, and what each one is allowed to do.
 *
 * The database has supported roles since the first migration, but until this
 * page the only way to grant one was the Supabase SQL editor — so promoting a
 * committee member meant handing someone the database.
 */
export default async function AdminPeoplePage() {
  const { people, adminUserIds, currentUserId, isDemo, error } = await loadPeoplePageData()

  return (
    <>
      <AdminPageHeader
        eyebrow="Who's who"
        title="People & roles"
        description="Every account that has signed up, and what each one can do. Promote a committee member to admin, or hand out tabulator and duty-official access for match day."
      />
      {isDemo && <AdminDemoBanner />}
      {error && <AdminDataErrorBanner message={error} />}
      {people.length === 0 && !error ? (
        <AdminEmptyState
          title="No accounts yet"
          description="Nobody has signed up. The first person to create an account becomes an organiser through the setup wizard; everyone after that lands here as a player, ready for you to promote."
          href="/register"
          linkLabel="See the registration page"
        />
      ) : (
        <PeopleClient
          people={people}
          adminUserIds={adminUserIds}
          currentUserId={currentUserId}
          readOnly={isDemo}
        />
      )}
    </>
  )
}
