import type { Metadata } from 'next'
import { RegistrationShell } from '@/components/registration/RegistrationShell'
import { ConfirmationPanel } from '@/components/registration/ConfirmationPanel'
import type { RegistrationStatus } from '@/lib/supabase/types'

export const metadata: Metadata = {
  title: 'Registration received',
  description: 'Your Sunday Smashers Christmas Mini Tournament registration has been received.',
}

function readStatus(raw: string | string[] | undefined): RegistrationStatus {
  const value = Array.isArray(raw) ? raw[0] : raw
  return value === 'waitlisted' ? 'waitlisted' : 'pending'
}

function readString(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  return value && value.trim().length > 0 ? value : null
}

export default async function RegistrationSuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const status = readStatus(params.status)
  const partner = readString(params.partner)

  return (
    <RegistrationShell
      eyebrow="Registration received"
      title={status === 'waitlisted' ? 'You’re on the waitlist' : 'You’re in!'}
    >
      <ConfirmationPanel
        status={status}
        divisionName={readString(params.division)}
        invitedPartner={partner === 'invited'}
        freeAgent={partner === 'solo'}
      />
    </RegistrationShell>
  )
}
