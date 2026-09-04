import type { Metadata } from 'next'

import { GradientText, SectionHeading } from '@/components/ui'
import { requireAdmin } from '@/lib/auth'
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
 * Deliberately NOT behind `requireAdmin` *while the bootstrap is unfinished* —
 * on day zero there is no admin to satisfy that guard. The database is what
 * actually stops you: `claim_first_admin()` refuses the moment any admin
 * exists, and creating a tournament is gated by RLS.
 *
 * But "you cannot do any harm here" is not the same as "you should be looking
 * at this". Once an organiser exists the page has nothing left to offer a
 * player, and what it showed them was a committee wizard reading "Step 3 of 3
 * — the hall is ready" above a button labelled "Open the admin console". No
 * amount of RLS stops that from reading as *"my player account has organiser
 * access"*, which is exactly how it was reported. So the moment the bootstrap
 * is complete this becomes an ordinary admin page.
 */
export const dynamic = 'force-dynamic'

export default async function SetupPage() {
  const status = await readSetupStatus()

  // Only stay public while there is genuinely no other way in: an unconfigured
  // deployment (`requireAuth` sends people here to explain itself) or a
  // database with no organiser yet.
  //
  // `requireAdmin` rather than a bare role check, so a signed-out visitor is
  // sent to sign in instead of to a 403 that opens "you're signed in, but…"
  // at someone who isn't. Neither of its own redirects can fire here: the
  // unconfigured branch is excluded by `isConfigured`, and demo mode by the
  // same test.
  if (status.isConfigured && status.hasAdmin) {
    await requireAdmin('/setup')
  }

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
