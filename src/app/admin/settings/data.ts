import { cache } from 'react'

import { isSupabaseConfigured } from '@/lib/supabase/config'
import { getAllDemoBundles, type DemoMatchStatus } from '@/lib/demo-data'
import { createClient } from '@/lib/supabase/server'
import type {
  CourtRow,
  DivisionRow,
  MatchStatus,
  ProfileRow,
  SiteContentRow,
  TimeSlotRow,
  TournamentRow,
  UserRoleRow,
} from '@/lib/supabase/types'
import {
  ASSIGNABLE_ROLES,
  defaultTournamentSettings,
  divisionSettingsFromRow,
  EMPTY_DRAW_STATE,
  type AssignableRole,
  type DrawState,
  type ManagedUser,
  type TournamentSettings,
} from '@/lib/settings'

/**
 * The ONLY data source for `/admin/settings`. Server-side only — every
 * caller sits behind `requireAdmin()`.
 *
 * Everything falls back to `defaultTournamentSettings()` when Supabase is
 * absent (demo mode / CI / the no-env-var preview deploy) so the console is
 * fully reviewable without a database and can never crash a build.
 *
 * SCHEMA NOTE: a few values admins expect to edit have no column yet —
 * per-division entry fee, third-place/final rule overrides, committee
 * contact details and the whole prizes/loot-bag config. They are persisted
 * as JSON in `site_content` under the slugs below. See the agent report:
 * dedicated columns/tables would be better once the schema can change.
 */

/** `site_content.slug` used as a JSON settings blob. */
export const SETTINGS_EXTRAS_SLUG = 'settings-extras'
export const PRIZES_SLUG = 'prize-config'

export interface SettingsPageData {
  settings: TournamentSettings
  users: ManagedUser[]
  drawState: DrawState
  /** Approved pairs per division id — powers the live "what this means" preview. */
  entryCounts: Record<string, number>
  tournamentId: string | null
  currentUserId: string | null
  isDemo: boolean
}

const DEMO_USERS: ManagedUser[] = [
  {
    id: 'demo-user-1',
    fullName: 'Nadia Kaur',
    nickname: 'Nads',
    email: 'nadia@sundaysmashers.example',
    roles: ['admin', 'player'],
  },
  {
    id: 'demo-user-2',
    fullName: 'Marcus Vella',
    nickname: null,
    email: 'marcus@sundaysmashers.example',
    roles: ['admin', 'tabulator'],
  },
  {
    id: 'demo-user-3',
    fullName: 'Priya Nair',
    nickname: 'Pri',
    email: 'priya@sundaysmashers.example',
    roles: ['tabulator', 'player'],
  },
  {
    id: 'demo-user-4',
    fullName: 'Tui Faleolo',
    nickname: null,
    email: 'tui@sundaysmashers.example',
    roles: ['duty_official', 'player'],
  },
  {
    id: 'demo-user-5',
    fullName: 'Ben Ashworth',
    nickname: 'Benny',
    email: 'ben@sundaysmashers.example',
    roles: ['player'],
  },
  {
    id: 'demo-user-6',
    fullName: 'Olivia Tan',
    nickname: null,
    email: 'olivia@sundaysmashers.example',
    roles: ['player'],
  },
]

/**
 * Demo fallback. Division sizes, fixture counts and progress all come from the
 * shared demo dataset (`src/lib/demo-data.ts`) so the previews here agree with
 * the public schedule, standings and bracket pages.
 */
function demoData(): SettingsPageData {
  const settings = defaultTournamentSettings()
  const bundles = getAllDemoBundles()

  const entryCounts: Record<string, number> = {}
  settings.divisions.forEach((division, index) => {
    entryCounts[division.id] = bundles[index]?.teams.length ?? 0
  })

  const matches = bundles.flatMap((bundle) => bundle.matches)
  const countOf = (...statuses: DemoMatchStatus[]) =>
    matches.filter((match) => statuses.includes(match.status)).length

  return {
    settings,
    users: DEMO_USERS,
    drawState: {
      drawPublished: matches.length > 0,
      matchesScheduled: countOf('scheduled'),
      matchesInProgress: countOf('in_progress'),
      matchesCompleted: countOf('completed', 'forfeited'),
    },
    entryCounts,
    tournamentId: null,
    currentUserId: 'demo-user-1',
    isDemo: true,
  }
}

interface StageBlob {
  pointsToWin: number
  deuce: boolean
  cap: number | null
}

interface ExtrasBlob {
  details?: {
    contactName?: string
    contactEmail?: string
    contactPhone?: string
    registrationCloseConfirmed?: boolean
  }
  divisions?: Record<string, { entryFeeCents?: number; thirdPlace?: StageBlob; final?: StageBlob }>
}

function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function isAssignableRole(role: string): role is AssignableRole {
  return (ASSIGNABLE_ROLES as readonly string[]).includes(role)
}

type SupabaseLike = Awaited<ReturnType<typeof createClient>>

async function loadDrawState(supabase: SupabaseLike, divisionIds: string[]): Promise<DrawState> {
  const countFor = async (statuses: MatchStatus[]) => {
    const { count } = await supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .in('division_id', divisionIds)
      .in('status', statuses)
    return count ?? 0
  }

  const [scheduled, inProgress, completed] = await Promise.all([
    countFor(['scheduled']),
    countFor(['in_progress']),
    countFor(['completed', 'forfeited', 'walkover']),
  ])

  return {
    drawPublished: scheduled + inProgress + completed > 0,
    matchesScheduled: scheduled,
    matchesInProgress: inProgress,
    matchesCompleted: completed,
  }
}

/**
 * Loads everything `/admin/settings` needs. Wrapped in `cache()` so sibling
 * segments share a single set of round trips.
 */
export const loadSettingsPageData = cache(async function loadSettingsPageData(): Promise<SettingsPageData> {
  if (!isSupabaseConfigured()) return demoData()

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { data: tournamentRows } = await supabase
      .from('tournaments')
      .select('*')
      .order('tournament_date', { ascending: true })
      .limit(1)

    const tournament = (tournamentRows as TournamentRow[] | null)?.[0] ?? null
    if (!tournament) return { ...demoData(), currentUserId: user?.id ?? null }

    const [divisionsRes, courtsRes, slotsRes, extrasRes, prizesRes, profilesRes, rolesRes] = await Promise.all([
      supabase.from('divisions').select('*').eq('tournament_id', tournament.id),
      supabase.from('courts').select('*').eq('tournament_id', tournament.id).order('sort_order'),
      supabase.from('time_slots').select('*').eq('tournament_id', tournament.id).order('starts_at'),
      supabase.from('site_content').select('*').eq('slug', SETTINGS_EXTRAS_SLUG).maybeSingle(),
      supabase.from('site_content').select('*').eq('slug', PRIZES_SLUG).maybeSingle(),
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('user_roles').select('*'),
    ])

    const fallback = defaultTournamentSettings()
    const extras = parseJson<ExtrasBlob>((extrasRes.data as SiteContentRow | null)?.body_markdown) ?? {}
    const prizes =
      parseJson<TournamentSettings['prizes']>((prizesRes.data as SiteContentRow | null)?.body_markdown) ??
      fallback.prizes

    const divisionRows = (divisionsRes.data as DivisionRow[] | null) ?? []
    const divisions = divisionRows.length
      ? divisionRows.map((row) => divisionSettingsFromRow(row, extras.divisions?.[row.id] ?? null))
      : fallback.divisions

    const courtRows = (courtsRes.data as CourtRow[] | null) ?? []
    const slotRows = (slotsRes.data as TimeSlotRow[] | null) ?? []

    const profiles = (profilesRes.data as ProfileRow[] | null) ?? []
    const roleRows = (rolesRes.data as UserRoleRow[] | null) ?? []
    const rolesByUser = new Map<string, AssignableRole[]>()
    for (const row of roleRows) {
      if (!isAssignableRole(row.role)) continue
      const list = rolesByUser.get(row.user_id) ?? []
      list.push(row.role)
      rolesByUser.set(row.user_id, list)
    }

    const divisionIds = divisionRows.map((row) => row.id)
    const drawState = divisionIds.length ? await loadDrawState(supabase, divisionIds) : EMPTY_DRAW_STATE

    const entryCounts: Record<string, number> = {}
    await Promise.all(
      divisionRows.map(async (row) => {
        const { count } = await supabase
          .from('registrations')
          .select('id', { count: 'exact', head: true })
          .eq('division_id', row.id)
          .eq('status', 'approved')
        // Two approved players make one pair.
        entryCounts[row.id] = Math.floor((count ?? 0) / 2)
      }),
    )

    return {
      settings: {
        details: {
          name: tournament.name,
          tournamentDate: tournament.tournament_date,
          venueName: tournament.venue_name ?? '',
          venueAddress: tournament.venue_address ?? '',
          description: tournament.description ?? '',
          registrationOpensAt: tournament.registration_opens_at,
          registrationClosesAt: tournament.registration_closes_at ?? fallback.details.registrationClosesAt,
          registrationCloseConfirmed: extras.details?.registrationCloseConfirmed ?? false,
          contactName: extras.details?.contactName ?? '',
          contactEmail: extras.details?.contactEmail ?? '',
          contactPhone: extras.details?.contactPhone ?? '',
        },
        divisions,
        courts: courtRows.length
          ? courtRows.map((row) => ({ id: row.id, name: row.name, sortOrder: row.sort_order }))
          : fallback.courts,
        timeSlots: slotRows.length
          ? slotRows.map((row) => ({
              id: row.id,
              startsAt: row.starts_at,
              endsAt: row.ends_at,
              label: row.label ?? '',
            }))
          : fallback.timeSlots,
        prizes,
      },
      users: profiles.map((profile) => ({
        id: profile.id,
        fullName: profile.full_name,
        nickname: profile.nickname,
        // Email lives in `auth.users`, which the anon key cannot read.
        email: null,
        roles: rolesByUser.get(profile.id) ?? [],
      })),
      drawState,
      entryCounts,
      tournamentId: tournament.id,
      currentUserId: user?.id ?? null,
      isDemo: false,
    }
  } catch {
    // Never let a settings page 500 — fall back to the demo bundle.
    return demoData()
  }
})
