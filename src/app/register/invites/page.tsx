import type { Metadata } from 'next'
import { RegistrationShell } from '@/components/registration/RegistrationShell'
import { InvitesPanel } from '@/components/registration/InvitesPanel'

export const metadata: Metadata = {
  title: 'Partner invites',
  description:
    'Accept or decline a doubles partner invite for the Sunday Smashers Christmas Mini Tournament.',
}

export default function PartnerInvitesPage() {
  return (
    <RegistrationShell
      eyebrow="Partner up"
      title="Your partner invites"
      description="Accept an invite and you’re officially a doubles pair — we’ll send your team straight to the committee for approval."
    >
      <InvitesPanel />
    </RegistrationShell>
  )
}
