import type { Metadata } from 'next'

import { requireAdmin } from '@/lib/auth'
import {
  AdminDataErrorBanner,
  AdminDemoBanner,
  AdminEmptyState,
  AdminPageHeader,
} from '@/components/admin/AdminUI'
import { RegistrationsClient } from '@/components/admin/RegistrationsClient'
import { getAdminConsoleData } from '@/components/admin/data'
import { REGISTRATION_STATUSES, type RegistrationFilters } from '@/lib/admin'
import type { RegistrationStatus } from '@/lib/supabase/types'

export const metadata: Metadata = {
  title: 'Registrations',
  robots: { index: false, follow: false },
}

/**
 * Signed-in-only, so it must never be prerendered: the guard would run once
 * at build time with no session and the result served to everyone.
 */
export const dynamic = 'force-dynamic'

function isStatus(value: string | undefined): value is RegistrationStatus {
  return !!value && (REGISTRATION_STATUSES as readonly string[]).includes(value)
}

/**
 * The registrations workbench. Deep-linkable from the dashboard alerts via
 * `?status=pending`, `?division=<id>` and `?free=1`.
 */
export default async function AdminRegistrationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // Belt and braces with `admin/layout.tsx`. This page renders admin-only
  // PII, so it does not rely on a parent layout alone for its guard.
  await requireAdmin('/admin/registrations')

  const params = await searchParams
  const { divisions, registrations, isDemo, error } = await getAdminConsoleData()

  const first = (key: string) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }

  const initialFilters: Partial<RegistrationFilters> = {
    status: isStatus(first('status')) ? (first('status') as RegistrationStatus) : 'all',
    divisionId: first('division') ?? 'all',
    freeAgentsOnly: first('free') === '1',
    search: first('q') ?? '',
  }

  return (
    <>
      <AdminPageHeader
        eyebrow="Nice list duty"
        title="Registrations"
        description="Search, review and export every entry. Tick players to approve, waitlist or reject in bulk."
      />
      {isDemo && <AdminDemoBanner />}
      {error && <AdminDataErrorBanner message={error} />}
      {registrations.length === 0 ? (
        <AdminEmptyState
          title="The nice list is empty — for now"
          description="Nobody has signed up yet. Share the registration link with the club and entries will land here the moment they arrive, ready for you to approve."
          href="/register"
          linkLabel="See the registration page"
        />
      ) : (
        <RegistrationsClient
          registrations={registrations}
          divisions={divisions}
          initialFilters={initialFilters}
        />
      )}
    </>
  )
}
