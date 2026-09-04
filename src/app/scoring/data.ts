import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, getProfile } from '@/lib/auth'
import { getSchedule, type PublicMatch } from '@/lib/public-data'
import {
  demoClock,
  findPlayerTeam,
  matchStartIso,
  rewindSchedule,
  type DutyRole,
  type PlayerIdentity,
} from '@/lib/dashboard'
import {
  groupAssignments,
  restoreFromScoreEvents,
  scoringAssignments,
  scoringConfigFromMatch,
  type AssignmentGroups,
  type MatchScoringConfig,
  type ScoringAssignment,
  type ScoringState,
  type StoredScoreEvent,
} from '@/lib/scoring'
import { DEMO_CURSOR_SLOT, DEMO_PLAYER } from '@/app/dashboard/data'
import type { TeamId } from '@/lib/draw'

/**
 * Server-side data loading for `/scoring`.
 *
 * Lives in the route folder because it imports the server Supabase client
 * (which pulls in `next/headers`) — everything under
 * `src/components/scoring` takes plain data as props and must never see it.
 *
 * Demo mode resolves the same stand-in player the dashboard uses, one slot
 * later in the day: at 1:00pm Ivy Novak has finished her own match and is
 * sitting courtside as Umpire/Scorer on a match that is in progress, which is
 * exactly the state this console exists for.
 */

/** The demo replay cursor for the console — one slot past the dashboard's. */
export const SCORING_DEMO_CURSOR_SLOT = DEMO_CURSOR_SLOT + 1

export interface ScoringListData {
  demo: boolean
  player: PlayerIdentity
  assignments: ScoringAssignment[]
  groups: AssignmentGroups
  /** Resolved once, on the server, and threaded through every component. */
  now: number
}

interface OfficialContext {
  demo: boolean
  player: PlayerIdentity
  matches: PublicMatch[]
  playingTeamId: TeamId | null
  now: number
}

async function loadOfficialContext(): Promise<OfficialContext> {
  const demo = !isSupabaseConfigured()
  const schedule = await getSchedule()

  if (demo) {
    const matches = rewindSchedule(schedule, SCORING_DEMO_CURSOR_SLOT)
    return {
      demo,
      player: DEMO_PLAYER,
      matches,
      playingTeamId: findPlayerTeam(matches, DEMO_PLAYER)?.id ?? null,
      now: demoClock(SCORING_DEMO_CURSOR_SLOT),
    }
  }

  const [user, profile] = await Promise.all([getCurrentUser(), getProfile()])
  const player: PlayerIdentity = {
    id: user?.id ?? '',
    name: profile?.nickname || profile?.full_name || user?.email || '',
  }
  return {
    demo,
    player,
    matches: schedule,
    playingTeamId: findPlayerTeam(schedule, player)?.id ?? null,
    now: Date.now(),
  }
}

/** Every match the signed-in official is rostered to, grouped for the list page. */
export async function loadScoringList(): Promise<ScoringListData> {
  const { demo, player, matches, playingTeamId, now } = await loadOfficialContext()
  const assignments = scoringAssignments(matches, player, playingTeamId)
  return {
    demo,
    player,
    assignments,
    groups: groupAssignments(assignments),
    now,
  }
}

export interface ScoringMatchData {
  demo: boolean
  player: PlayerIdentity
  match: PublicMatch
  /** Every duty seat this person holds on the match. Empty when not rostered. */
  roles: DutyRole[]
  /** True when one of those seats may drive the console. */
  canScore: boolean
  /** True when the roster has them officiating and playing in the same slot. */
  clash: boolean
  config: MatchScoringConfig
  /** Session rebuilt from the server's `score_events` log where one exists. */
  state: ScoringState
  startedAtMs: number | null
  /**
   * The match row's `updated_at`, handed to the console so its first save can
   * say which version of the row it is replacing. Null in demo mode.
   */
  revision: string | null
  now: number
}

/**
 * Everything `/scoring/[matchId]` renders. Returns `null` when the match id
 * is unknown, so the page can 404 rather than render an empty console.
 */
export async function loadScoringMatch(matchId: string): Promise<ScoringMatchData | null> {
  const { demo, player, matches, playingTeamId, now } = await loadOfficialContext()
  const match = findMatch(matches, matchId)
  if (!match) return null

  const assignment = scoringAssignments(matches, player, playingTeamId).find(
    (a) => a.match.id === match.id,
  )

  const { startedAtMs, revision, events } = await loadMatchScoringRow(match.id)
  // Rules, including `cap`, come off the fixture itself — one fetch, one
  // source of truth.
  const config = scoringConfigFromMatch(match)

  return {
    demo,
    player,
    match,
    roles: assignment?.roles ?? [],
    canScore: assignment?.canScore ?? false,
    clash: assignment?.clash ?? false,
    config,
    state: restoreFromScoreEvents(config, events),
    startedAtMs: startedAtMs ?? demoStartedAt(demo, match),
    revision,
    now,
  }
}

/**
 * Demo mode has no `started_at`, so a match that the fixture data says is in
 * progress gets its scheduled start time — enough for an honest match clock.
 */
function demoStartedAt(demo: boolean, match: PublicMatch): number | null {
  if (!demo || match.status !== 'in_progress') return null
  const iso = matchStartIso(match)
  if (!iso) return null
  const ms = new Date(iso).getTime()
  return Number.isFinite(ms) ? ms : null
}

interface MatchScoringRow {
  startedAtMs: number | null
  revision: string | null
  events: StoredScoreEvent[]
}

/**
 * The two things the public fixture shape doesn't carry: when the match
 * actually started, and its point-by-point log. Demo mode never touches
 * Supabase; any failure here degrades to "no clock, no history" rather than
 * breaking the console.
 */
async function loadMatchScoringRow(matchId: string): Promise<MatchScoringRow> {
  if (!isSupabaseConfigured()) return { startedAtMs: null, revision: null, events: [] }

  try {
    const supabase = await createClient()
    const [{ data: row }, { data: events }] = await Promise.all([
      supabase.from('matches').select('started_at, updated_at').eq('id', matchId).maybeSingle(),
      supabase
        .from('score_events')
        .select('sequence, side, event_type, score_a_after, score_b_after, note')
        .eq('match_id', matchId)
        .order('sequence', { ascending: true }),
    ])

    const started = row?.started_at ? new Date(row.started_at).getTime() : null
    return {
      startedAtMs: started != null && Number.isFinite(started) ? started : null,
      revision: row?.updated_at ?? null,
      events: (events ?? []) as StoredScoreEvent[],
    }
  } catch {
    return { startedAtMs: null, revision: null, events: [] }
  }
}

/**
 * Finds a match by id, tolerating a percent-encoded route param.
 *
 * Demo match ids look like `Court 5#16`, and Next hands the dynamic segment
 * to a page still encoded (route handlers get it decoded), so the raw value
 * is tried first and the decoded one second. Real ids are UUIDs, where both
 * forms are identical.
 */
function findMatch(matches: readonly PublicMatch[], matchId: string): PublicMatch | null {
  const direct = matches.find((m) => m.id === matchId)
  if (direct) return direct

  let decoded = matchId
  try {
    decoded = decodeURIComponent(matchId)
  } catch {
    return null
  }
  return matches.find((m) => m.id === decoded) ?? null
}
