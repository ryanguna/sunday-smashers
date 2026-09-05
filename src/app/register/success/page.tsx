import type { Metadata } from 'next'
import { RegistrationShell } from '@/components/registration/RegistrationShell'
import { ConfirmationPanel } from '@/components/registration/ConfirmationPanel'
import type { RegistrationStatus } from '@/lib/supabase/types'
import { loadPublicTournamentConfig } from '@/lib/tournament-config'
import { formatTournamentDayMonth } from '@/lib/tournament'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import { loadSiteCopy } from '@/lib/site-copy-server'

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

/**
 * The status actually saved, not the one in the URL.
 *
 * `?status=` is whatever the browser was last redirected with, and a player
 * can retype it. Telling someone "you're in!" when the committee sees a
 * waitlist entry — or the reverse — is the kind of contradiction that gets
 * argued about on match day, so the persisted row wins whenever it can be
 * read. The query parameter stays as the fallback for demo mode and for the
 * moment right after signup when the read fails.
 */
async function persistedStatus(divisionId: string | null): Promise<RegistrationStatus | null> {
  if (!divisionId || !isSupabaseConfigured()) return null
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from('registrations')
      .select('status')
      .eq('player_id', user.id)
      .eq('division_id', divisionId)
      .maybeSingle()
    if (error || !data) return null

    const status = (data as { status: string }).status
    return status === 'waitlisted' ? 'waitlisted' : status === 'pending' ? 'pending' : null
  } catch {
    return null
  }
}

export default async function RegistrationSuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const divisionId = readString(params.divisionId)
  const status = (await persistedStatus(divisionId)) ?? readStatus(params.status)
  // Read for the waitlist advice, which names the week to watch out for.
  const { dates } = await loadPublicTournamentConfig()
  const partner = readString(params.partner)
  const copy = await loadSiteCopy()

  return (
    <RegistrationShell
      eyebrow="Registration received"
      title={status === 'waitlisted' ? 'You’re on the waitlist' : 'You’re in!'}
    >
      <ConfirmationPanel
        status={status}
        divisionName={readString(params.division)}
        freeAgent={partner === 'solo'}
        tournamentDayMonth={formatTournamentDayMonth(dates.tournamentDate)}
        refundPolicyNote={copy.refundPolicyNote}
      />
    </RegistrationShell>
  )
}
