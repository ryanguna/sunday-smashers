import type { Metadata } from 'next'
import {
  AdminDataErrorBanner,
  AdminDemoBanner,
  AdminEmptyState,
  AdminPageHeader,
} from '@/components/admin/AdminUI'
import { PaymentsClient } from '@/components/admin/PaymentsClient'
import { getAdminConsoleData } from '@/components/admin/data'

export const metadata: Metadata = {
  title: 'Payments',
  robots: { index: false, follow: false },
}

export default async function AdminPaymentsPage() {
  const { divisions, registrations, isDemo, error } = await getAdminConsoleData()

  return (
    <>
      <AdminPageHeader
        eyebrow="Jingle the till"
        title="Payments"
        description="Record entry fees, split partial payments and reconcile the day's takings."
      />
      {isDemo && <AdminDemoBanner />}
      {error && <AdminDataErrorBanner message={error} />}
      {registrations.length === 0 ? (
        <AdminEmptyState
          title="Nothing in the tin yet"
          description="Entry fees show up here once players have registered. Approve an entry over on Registrations and its payment appears alongside it."
          href="/admin/registrations"
          linkLabel="Go to Registrations"
        />
      ) : (
        <PaymentsClient registrations={registrations} divisions={divisions} />
      )}
    </>
  )
}
