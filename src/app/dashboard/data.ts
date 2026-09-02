import type { ProfileRow, RegistrationStatus, PaymentStatus } from '@/lib/supabase/types'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, getProfile } from '@/lib/auth'
import { getDivisions, getSchedule, type PublicDivisionInfo, type PublicMatch } from '@/lib/public-data'
import { getPublishedAnnouncements, type Announcement } from '@/lib/announcements'
import {
  buildPlayerDashboard,
  demoClock,
  rewindSchedule,
  type PlayerDashboard,
  type PlayerIdentity,
  type RegistrationSnapshot,
} from '@/lib/dashboard'

/**
 * Server-side data loading for `/dashboard`.
 *
 * Lives in the route folder (not `src/components/dashboard`) on purpose: it
 * imports the server Supabase client, which pulls in `next/headers` and
 * therefore must never end up in a Client Component's import graph. Every
 * component under `src/components/dashboard` takes plain data as props.
 *
 * Demo mode (no Supabase env vars) resolves a real player from the bundled
 * demo dataset so the page is fully reviewable without a database.
 */

/**
 * Demo mode replays tournament day from this 15-minute slot (12:45pm), the
 * point where our demo player has a match in progress, another still to
 * come, and an officiating duty on the very next match.
 */
export const DEMO_CURSOR_SLOT = 15

/** The demo player: Ivy Novak of the Candy Cane Crew (Women's Doubles). */
export const DEMO_PLAYER: PlayerIdentity = { id: 'w-candy-p1', name: 'Ivy Novak' }

const DEMO_PROFILE: ProfileRow = {
  id: DEMO_PLAYER.id,
  full_name: 'Ivy Novak',
  nickname: 'ivysmash',
  gender: 'female',
  phone: '0412 345 678',
  skill_level: 'intermediate',
  emergency_contact_name: 'Rudolph Reindeer',
  emergency_contact_phone: '0400 000 000',
  avatar_url: null,
  bio: 'Net kills and candy canes. 🍬',
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  email: 'ivy.novak@example.com',
}

const DEMO_REGISTRATION: RegistrationSnapshot = {
  status: 'approved',
  payment: 'unpaid',
  amountDueCents: 2500,
  amountPaidCents: 0,
  divisionName: "Women's Doubles",
}

export interface DashboardPageData {
  demo: boolean
  profile: ProfileRow | null
  player: PlayerIdentity
  dashboard: PlayerDashboard
  matches: PublicMatch[]
  divisions: PublicDivisionInfo[]
  announcements: Announcement[]
  /** Resolved once, on the server, and threaded through every component. */
  now: number
}

async function loadRegistrationSnapshot(userId: string): Promise<RegistrationSnapshot | null> {
  try {
    const supabase = await createClient()
    const { data: registrations } = await supabase
      .from('registrations')
      .select('id, division_id, status')
      .eq('player_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)

    const registration = (registrations ?? [])[0] as
      | { id: string; division_id: string; status: RegistrationStatus }
      | undefined
    if (!registration) return null

    const [{ data: payments }, { data: division }] = await Promise.all([
      supabase.from('payments').select('*').eq('registration_id', registration.id).limit(1),
      supabase.from('divisions').select('name').eq('id', registration.division_id).maybeSingle(),
    ])

    const payment = (payments ?? [])[0] as
      | { amount_cents: number; amount_paid_cents: number; status: PaymentStatus }
      | undefined

    return {
      status: registration.status,
      payment: payment?.status ?? null,
      amountDueCents: payment?.amount_cents ?? 0,
      amountPaidCents: payment?.amount_paid_cents ?? 0,
      divisionName: (division as { name: string } | null)?.name ?? null,
    }
  } catch {
    // A registration lookup failure must never blank the dashboard.
    return null
  }
}

/** Loads everything `/dashboard` renders, in demo or Supabase mode. */
export async function loadDashboardData(): Promise<DashboardPageData> {
  const demo = !isSupabaseConfigured()
  const [schedule, divisions] = await Promise.all([getSchedule(), getDivisions()])

  if (demo) {
    const matches = rewindSchedule(schedule, DEMO_CURSOR_SLOT)
    const now = demoClock(DEMO_CURSOR_SLOT)
    return {
      demo,
      profile: DEMO_PROFILE,
      player: DEMO_PLAYER,
      dashboard: buildPlayerDashboard({
        player: DEMO_PLAYER,
        matches,
        divisions,
        registration: DEMO_REGISTRATION,
        now,
      }),
      matches,
      divisions,
      announcements: await getPublishedAnnouncements(undefined, now),
      now,
    }
  }

  const [user, profile] = await Promise.all([getCurrentUser(), getProfile()])
  const player: PlayerIdentity = {
    id: user?.id ?? '',
    name: profile?.full_name ?? user?.email ?? '',
  }
  const [registration, announcements] = await Promise.all([
    user ? loadRegistrationSnapshot(user.id) : Promise.resolve(null),
    createClient().then((client) => getPublishedAnnouncements(client)),
  ])
  const now = Date.now()

  return {
    demo,
    profile,
    player,
    dashboard: buildPlayerDashboard({
      player,
      matches: schedule,
      divisions,
      registration,
      now,
    }),
    matches: schedule,
    divisions,
    announcements,
    now,
  }
}
