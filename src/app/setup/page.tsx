import type { Metadata } from 'next'

import { GradientText, SectionHeading } from '@/components/ui'
import { readSetupStatus } from './actions'
import { SetupClient } from './SetupClient'

export const metadata: Metadata = {
  title: 'First-run setup',
  description: 'Get the Sunday Smashers tournament off the ground.',
  robots: { index: false, follow: false },
}

/**
 * `/setup` — the only route that works on a brand new, empty database.
 *
 * It exists because two audit blockers made an empty Supabase project a dead
 * end: there was no UI anywhere that created a tournament row (every admin
 * loader only ever UPDATEs one), and the first admin could only be granted by
 * hand-writing SQL, since every signup gets 'player' and the role-granting
 * screen is itself behind the admin guard.
 *
 * Deliberately NOT behind `requireAdmin` — on day zero there is no admin to
 * satisfy that guard. It is safe because the privileged step calls
 * `claim_first_admin()`, which refuses the moment any admin exists, and
 * creating a tournament is gated by RLS, which only admins satisfy. The page
 * hides what you cannot do; the database is what actually stops you.
 */
export const dynamic = 'force-dynamic'

export default async function SetupPage() {
  const status = await readSetupStatus()

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:py-16">
      <SectionHeading
        level={1}
        eyebrow="Committee"
        title={<GradientText as="span">Let&rsquo;s get the hall ready</GradientText>}
        description="Three short steps between an empty database and a tournament your players can register for."
      />
      <div className="mt-8" />
      <SetupClient status={status} />
    </main>
  )
}
