import type { Metadata } from 'next'
import { AdminDemoBanner, AdminPageHeader } from '@/components/admin/AdminUI'
import { PaymentsClient } from '@/components/admin/PaymentsClient'
import { getAdminConsoleData } from '@/components/admin/data'

export const metadata: Metadata = {
  title: 'Payments',
  robots: { index: false, follow: false },
}

export default async function AdminPaymentsPage() {
  const { divisions, registrations, isDemo } = await getAdminConsoleData()

  return (
    <>
      <AdminPageHeader
        eyebrow="Jingle the till"
        title="Payments"
        description="Record entry fees, split partial payments and reconcile the day's takings."
      />
      {isDemo && <AdminDemoBanner />}
      <PaymentsClient registrations={registrations} divisions={divisions} />
    </>
  )
}
