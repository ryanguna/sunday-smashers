import type { Metadata } from 'next'
import { AdminDemoBanner, AdminPageHeader } from '@/components/admin/AdminUI'
import { RegistrationsClient } from '@/components/admin/RegistrationsClient'
import { getAdminConsoleData } from '@/components/admin/data'
import { REGISTRATION_STATUSES, type RegistrationFilters } from '@/lib/admin'
import type { RegistrationStatus } from '@/lib/supabase/types'

export const metadata: Metadata = {
  title: 'Registrations',
  robots: { index: false, follow: false },
}

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
  const params = await searchParams
  const { divisions, registrations, isDemo } = await getAdminConsoleData()

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
      <RegistrationsClient
        registrations={registrations}
        divisions={divisions}
        initialFilters={initialFilters}
      />
    </>
  )
}
