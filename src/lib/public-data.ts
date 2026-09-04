/**
 * Public, read-only data access for the tournament pages: standings,
 * schedule, bracket, live scores and the players directory.
 *
 * This is the ONLY module those pages should import data from — never
 * `@/lib/demo-data` or `@/lib/supabase/*` directly — so there is exactly one
 * place that decides whether data comes from Supabase or the bundled demo
 * fixtures, and exactly one set of shapes (`Public*`) the UI needs to know
 * about.
 *
 * Every exported async function falls back to the rich, internally
 * consistent demo dataset in `./demo-data` whenever `isSupabaseConfigured()`
 * is false, or if a real query fails/returns nothing — the public pages
 * must never render blank just because a database hiccup, an unpublished
 * tournament, or a missing env var got in the way.
 *
 * `profiles` has **no public RLS policy at all** (see `supabase/SCHEMA.md`)
 * — phone numbers, emergency contacts and emails are never selected here,
 * only `id`, `full_name` and `nickname`. Never widen these selects.
 */

import { DECIDED_MATCH_STATUSES } from '@/lib/supabase/types'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/client'
import type { BadgeStatus } from '@/components/ui'
import {
  computeStandings,
  finalPlacings,
  generateKnockout,
  type FinalPlacings,
  type MatchStage,
  type PlayedMatch,
  type StageRules,
  type StandingRow,
  type TeamId,
  type TiebreakReason,
} from '@/lib/draw'
import {
  divisionElimsRules,
  divisionFinalsRules,
  matchStageRules,
  toPlayedMatch,
  type DivisionRow,
  type DutyAssignmentRow,
  type MatchRow,
  type TeamRow,
} from '@/types'
import {
  getAllDemoBundles,
  DEMO_DIVISIONS,
  type DemoDivisionBundle,
  type DemoMatch,
  type DemoTeam,
} from './demo-data'

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

/** A division identifier. Demo mode uses `'mens_doubles' | 'womens_doubles'`; real data uses the division's row id. */
export type DivisionSlug = string

export interface PublicDivisionInfo {
  slug: DivisionSlug
  name: string
  gender: string
  elimsRules: StageRules
  finalsRules: StageRules
}

export interface PublicPlayer {
  id: string
  name: string
}

export interface PublicTeam {
  id: TeamId
  division: DivisionSlug
  name: string
  seed: number | null
  players: PublicPlayer[]
}

/**
 * The subset of `MatchStatus` the public site can encounter.
 *
 * `'retired'` and `'walkover'` are distinct from `'forfeited'` on purpose: a
 * retirement keeps the score actually played and carries no blame, a walkover
 * means the opposition never arrived, and a forfeit is a penalty. Collapsing
 * them would label an injured pair as having forfeited, which is a distinction
 * players genuinely care about.
 */
export type PublicMatchStatus =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'forfeited'
  | 'walkover'
  | 'retired'

export interface PublicDutyAssignment {
  role: 'umpire_scorer' | 'scoresheet' | 'line_judge'
  /**
   * The officiating player's `profiles.id`. Prefer this over `playerName` when
   * attributing duties to a person: display names are `nickname || full_name`
   * and are not unique, so two entrants sharing one would have their duties
   * merged. Empty string only where the demo dataset has no id for the row.
   */
  playerId: string
  playerName: string
  source: 'derived' | 'fallback' | 'manual' | 'unassigned'
}

export interface PublicMatch {
  id: string
  division: DivisionSlug
  stage: MatchStage
  bracketKey?: 'M1' | 'M2' | 'THIRD' | 'FINAL'
  court: string | null
  slotIndex: number | null
  slotLabel: string | null
  /**
   * The slot's real `starts_at`, when the match is scheduled against one.
   *
   * `slotIndex`/`slotLabel` describe *where* in the order a match sits, not
   * when it begins. Without this, `matchStartIso` had to reconstruct the time
   * from a 15-minute-slots-from-9am assumption, so moving the first slot or
   * changing its length quoted every player the wrong time.
   */
  slotStartsAt: string | null
  teamA: PublicTeam | null
  teamB: PublicTeam | null
  /** Human placeholder source when a knockout team isn't decided yet, e.g. "Winner of M1". */
  sourceA: string | null
  sourceB: string | null
  status: PublicMatchStatus
  scoreA: number
  scoreB: number
  pointsToWin: number
  deuce: boolean
  /**
   * Hard ceiling on the score when deuce is enabled (e.g. 30 in a 21-up game),
   * or `null` for none. Needed by the scoring console to decide when a game
   * ends at the cap rather than on a two-point margin — it previously had to
   * load this separately because it was dropped here.
   */
  cap: number | null
  forfeitedBy: TeamId | null
  winnerTeamId: TeamId | null
  duties: PublicDutyAssignment[]
}

export interface PublicStandingRow extends StandingRow {
  team: PublicTeam
}

export interface PublicDivisionStandings {
  division: PublicDivisionInfo
  rows: PublicStandingRow[]
}

export interface PublicKnockoutFixture {
  key: 'M1' | 'M2' | 'THIRD' | 'FINAL'
  stage: MatchStage
  label: string
  teamA: PublicTeam | null
  teamB: PublicTeam | null
  sourceA: string
  sourceB: string
  match: PublicMatch | null
}

export interface PublicBracket {
  division: PublicDivisionInfo
  fixtures: PublicKnockoutFixture[]
  placings: {
    champion: PublicTeam | null
    runnerUp: PublicTeam | null
    third: PublicTeam | null
    fourth: PublicTeam | null
  }
}

export interface PublicPlayerDirectoryEntry {
  team: PublicTeam
  rank: number | null
  played: number
  wins: number
  losses: number
}

// ---------------------------------------------------------------------------
// Demo mode: adapt `./demo-data` bundles into the Public* shapes
// ---------------------------------------------------------------------------

function demoTeamToPublic(team: DemoTeam): PublicTeam {
  return { id: team.id, division: team.division, name: team.name, seed: team.seed, players: team.players }
}

function demoMatchToPublic(match: DemoMatch, teamsById: Map<TeamId, PublicTeam>): PublicMatch {
  return {
    id: match.id,
    division: match.division,
    stage: match.stage,
    bracketKey: match.bracketKey,
    court: match.court,
    slotIndex: match.slotIndex,
    slotLabel: match.slotLabel,
    // Demo fixtures have no time_slots rows, so the slotIndex heuristic in
    // `matchStartIso` stays the fallback for them.
    slotStartsAt: null,
    teamA: match.teamA ? (teamsById.get(match.teamA) ?? null) : null,
    teamB: match.teamB ? (teamsById.get(match.teamB) ?? null) : null,
    sourceA: match.sourceA,
    sourceB: match.sourceB,
    status: match.status,
    scoreA: match.scoreA,
    scoreB: match.scoreB,
    pointsToWin: match.pointsToWin,
    deuce: match.deuce,
    // The demo rules run no-deuce throughout, so a cap can never be reached.
    cap: null,
    forfeitedBy: match.forfeitedBy,
    winnerTeamId: match.winnerTeamId,
    duties: match.duties,
  }
}

interface AdaptedDemoBundle {
  division: PublicDivisionInfo
  teams: PublicTeam[]
  teamsById: Map<TeamId, PublicTeam>
  standings: PublicStandingRow[]
  matches: PublicMatch[]
  bracket: PublicBracket
}

function adaptDemoBundle(bundle: DemoDivisionBundle): AdaptedDemoBundle {
  const teams = bundle.teams.map(demoTeamToPublic)
  const teamsById = new Map(teams.map((t) => [t.id, t]))

  const standings: PublicStandingRow[] = bundle.standings.map((row) => ({
    ...row,
    team: teamsById.get(row.teamId) ?? {
      id: row.teamId,
      division: bundle.division.slug,
      name: row.teamId,
      seed: null,
      players: [],
    },
  }))

  const matches = bundle.matches.map((m) => demoMatchToPublic(m, teamsById))
  const matchByBracketKey = new Map(matches.filter((m) => m.bracketKey).map((m) => [m.bracketKey, m]))

  const fixtures: PublicKnockoutFixture[] = bundle.knockout.map((fixture) => ({
    key: fixture.key,
    stage: fixture.stage,
    label: fixture.label,
    teamA: fixture.teamA ? (teamsById.get(fixture.teamA) ?? null) : null,
    teamB: fixture.teamB ? (teamsById.get(fixture.teamB) ?? null) : null,
    sourceA: fixture.sourceA,
    sourceB: fixture.sourceB,
    match: matchByBracketKey.get(fixture.key) ?? null,
  }))

  const resolvePlacing = (id: TeamId | null) => (id ? (teamsById.get(id) ?? null) : null)

  return {
    division: bundle.division as PublicDivisionInfo,
    teams,
    teamsById,
    standings,
    matches,
    bracket: {
      division: bundle.division as PublicDivisionInfo,
      fixtures,
      placings: {
        champion: resolvePlacing(bundle.placings.champion),
        runnerUp: resolvePlacing(bundle.placings.runnerUp),
        third: resolvePlacing(bundle.placings.third),
        fourth: resolvePlacing(bundle.placings.fourth),
      },
    },
  }
}

function getAdaptedDemoBundles(): AdaptedDemoBundle[] {
  return getAllDemoBundles().map(adaptDemoBundle)
}

// ---------------------------------------------------------------------------
// Real Supabase queries
// ---------------------------------------------------------------------------

/**
 * Loads every published division for the most recently created published
 * tournament, plus its confirmed teams (with whitelisted player columns —
 * `id`, `full_name`, `nickname` only), matches, courts, time slots and duty
 * assignments, and adapts all of it into the same `AdaptedDemoBundle` shape
 * the demo path produces so downstream code never needs to branch on the
 * data source.
 *
 * Returns `null` on any failure (no published tournament, a query error, or
 * an empty result) so callers fall back to the demo dataset — the public
 * pages must never render blank.
 */
async function loadRealBundles(): Promise<AdaptedDemoBundle[] | null> {
  try {
    const supabase = createClient()

    const { data: tournaments, error: tErr } = await supabase
      .from('tournaments')
      .select('id')
      .eq('is_published', true)
      .order('tournament_date', { ascending: false })
      .limit(1)
    if (tErr || !tournaments || tournaments.length === 0) return null
    const tournamentId = tournaments[0].id

    const { data: divisions, error: dErr } = await supabase
      .from('divisions')
      .select('*')
      .eq('tournament_id', tournamentId)
      .eq('is_published', true)
      .order('name', { ascending: true })
    if (dErr || !divisions || divisions.length === 0) return null

    const divisionIds = divisions.map((d) => d.id)

    const [{ data: courts }, { data: timeSlots }, { data: teams }, { data: matches }] = await Promise.all([
      supabase.from('courts').select('*').eq('tournament_id', tournamentId),
      supabase.from('time_slots').select('*').eq('tournament_id', tournamentId),
      supabase.from('teams').select('*').in('division_id', divisionIds).eq('is_confirmed', true),
      supabase.from('matches').select('*').in('division_id', divisionIds),
    ])

    const teamRows: TeamRow[] = teams ?? []
    const matchRows: MatchRow[] = matches ?? []
    const teamIds = teamRows.map((t) => t.id)
    const matchIds = matchRows.map((m) => m.id)

    const [{ data: teamMembers }, { data: dutyAssignments }] = await Promise.all([
      teamIds.length > 0
        ? supabase.from('team_members').select('*').in('team_id', teamIds)
        : Promise.resolve({ data: [] as { team_id: string; player_id: string }[] }),
      matchIds.length > 0
        ? supabase.from('duty_assignments').select('*').in('match_id', matchIds)
        : Promise.resolve({ data: [] as DutyAssignmentRow[] }),
    ])

    const playerIds = [
      ...new Set([...(teamMembers ?? []).map((tm) => tm.player_id), ...(dutyAssignments ?? []).map((d) => d.player_id)]),
    ]
    const { data: profiles } =
      playerIds.length > 0
        ? // `player_directory`, not `profiles`. `profiles` holds phone numbers
          // and emergency contacts and therefore has no anon SELECT policy, so
          // for a signed-out visitor this query returned zero rows and every
          // name on the schedule, standings, players directory, duty roster and
          // courtside TV screen fell back to the literal 'Player'. The view
          // exposes only id/name/nickname/avatar (see migration 0009).
          await supabase.from('player_directory').select('id, full_name, nickname').in('id', playerIds)
        : { data: [] as { id: string; full_name: string; nickname: string | null }[] }

    const playerNameById = new Map((profiles ?? []).map((p) => [p.id, p.nickname || p.full_name]))
    const courtNameById = new Map((courts ?? []).map((c) => [c.id, c.name]))
    const slotById = new Map((timeSlots ?? []).map((s) => [s.id, s]))

    const playersByTeam = new Map<string, PublicPlayer[]>()
    for (const tm of teamMembers ?? []) {
      const list = playersByTeam.get(tm.team_id) ?? []
      list.push({ id: tm.player_id, name: playerNameById.get(tm.player_id) ?? 'Player' })
      playersByTeam.set(tm.team_id, list)
    }

    const dutiesByMatch = new Map<string, PublicDutyAssignment[]>()
    for (const d of dutyAssignments ?? []) {
      const list = dutiesByMatch.get(d.match_id) ?? []
      list.push({
        role: d.duty_role,
        playerId: d.player_id,
        playerName: playerNameById.get(d.player_id) ?? '',
        source: d.source_match_id ? 'derived' : 'manual',
      })
      dutiesByMatch.set(d.match_id, list)
    }

    return divisions.map((division) =>
      buildRealDivisionBundle(division, teamRows, matchRows, playersByTeam, courtNameById, slotById, dutiesByMatch),
    )
  } catch {
    // Any unexpected shape/permission error — fall back to demo data rather
    // than let a public page 500.
    return null
  }
}

function buildRealDivisionBundle(
  division: DivisionRow,
  allTeams: TeamRow[],
  allMatches: MatchRow[],
  playersByTeam: Map<string, PublicPlayer[]>,
  courtNameById: Map<string, string>,
  slotById: Map<string, { label: string | null; starts_at: string }>,
  dutiesByMatch: Map<string, PublicDutyAssignment[]>,
): AdaptedDemoBundle {
  const teamRows = allTeams.filter((t) => t.division_id === division.id)
  const teams: PublicTeam[] = teamRows.map((t) => ({
    id: t.id,
    division: division.id,
    name: t.name ?? 'Unnamed pair',
    seed: t.seed,
    players: playersByTeam.get(t.id) ?? [],
  }))
  const teamsById = new Map(teams.map((t) => [t.id, t]))

  const matchRows = allMatches.filter((m) => m.division_id === division.id)
  const elimsRules = divisionElimsRules(division)
  const finalsRules = divisionFinalsRules(division)

  const playedElims: PlayedMatch[] = matchRows
    .filter((m) => m.stage === 'elims')
    .map(toPlayedMatch)
    .filter((m): m is PlayedMatch => m !== null)
  const standingRows = computeStandings(
    teamRows.map((t) => t.id),
    playedElims,
    elimsRules,
  )
  const standings: PublicStandingRow[] = standingRows.map((row) => ({
    ...row,
    team: teamsById.get(row.teamId) ?? { id: row.teamId, division: division.id, name: row.teamId, seed: null, players: [] },
  }))

  const m1Row = matchRows.find((m) => m.bracket_key === 'M1')
  const m2Row = matchRows.find((m) => m.bracket_key === 'M2')
  const m1Played = m1Row ? (toPlayedMatch(m1Row) ?? undefined) : undefined
  const m2Played = m2Row ? (toPlayedMatch(m2Row) ?? undefined) : undefined
  const knockout = generateKnockout(standingRows, { m1: m1Played, m2: m2Played }, finalsRules)

  const finalRow = matchRows.find((m) => m.bracket_key === 'FINAL')
  const thirdRow = matchRows.find((m) => m.bracket_key === 'THIRD')
  const placings: FinalPlacings = finalPlacings(
    finalRow ? (toPlayedMatch(finalRow) ?? undefined) : undefined,
    thirdRow ? (toPlayedMatch(thirdRow) ?? undefined) : undefined,
    finalsRules,
  )

  const matches: PublicMatch[] = matchRows.map((m) => matchRowToPublic(m, teamsById, courtNameById, slotById, dutiesByMatch))
  const matchByBracketKey = new Map(matches.filter((m) => m.bracketKey).map((m) => [m.bracketKey, m]))

  const publicDivision: PublicDivisionInfo = {
    slug: division.id,
    name: division.name,
    gender: division.gender,
    elimsRules,
    finalsRules,
  }

  const fixtures: PublicKnockoutFixture[] = knockout.map((fixture) => ({
    key: fixture.key,
    stage: fixture.stage,
    label: fixture.label,
    teamA: fixture.teamA ? (teamsById.get(fixture.teamA) ?? null) : null,
    teamB: fixture.teamB ? (teamsById.get(fixture.teamB) ?? null) : null,
    sourceA: fixture.sourceA,
    sourceB: fixture.sourceB,
    match: matchByBracketKey.get(fixture.key) ?? null,
  }))

  const resolvePlacing = (id: TeamId | null) => (id ? (teamsById.get(id) ?? null) : null)

  return {
    division: publicDivision,
    teams,
    teamsById,
    standings,
    matches,
    bracket: {
      division: publicDivision,
      fixtures,
      placings: {
        champion: resolvePlacing(placings.champion),
        runnerUp: resolvePlacing(placings.runnerUp),
        third: resolvePlacing(placings.third),
        fourth: resolvePlacing(placings.fourth),
      },
    },
  }
}

function matchRowToPublic(
  m: MatchRow,
  teamsById: Map<string, PublicTeam>,
  courtNameById: Map<string, string>,
  slotById: Map<string, { label: string | null; starts_at: string }>,
  dutiesByMatch: Map<string, PublicDutyAssignment[]>,
): PublicMatch {
  const rules = matchStageRules(m)
  // Map the DB status onto the public one explicitly. An earlier version
  // collapsed `walkover` into `completed` and let anything unrecognised fall
  // through to `scheduled`, which meant a *retired* match — a real result,
  // with a real score — displayed publicly as if it had not been played yet.
  const status: PublicMatchStatus =
    m.status === 'completed'
      ? 'completed'
      : m.status === 'walkover'
        ? 'walkover'
        : m.status === 'retired'
          ? 'retired'
          : m.status === 'forfeited'
            ? 'forfeited'
            : m.status === 'in_progress'
              ? 'in_progress'
              : 'scheduled'
  const slot = m.time_slot_id ? slotById.get(m.time_slot_id) : undefined

  return {
    id: m.id,
    division: m.division_id,
    stage: m.stage,
    bracketKey: m.bracket_key ?? undefined,
    court: m.court_id ? (courtNameById.get(m.court_id) ?? null) : null,
    slotIndex: null,
    slotLabel: slot?.label ?? (slot ? new Date(slot.starts_at).toLocaleTimeString() : null),
    slotStartsAt: slot?.starts_at ?? null,
    teamA: m.team_a_id ? (teamsById.get(m.team_a_id) ?? null) : null,
    teamB: m.team_b_id ? (teamsById.get(m.team_b_id) ?? null) : null,
    sourceA: null,
    sourceB: null,
    status,
    scoreA: m.score_a,
    scoreB: m.score_b,
    pointsToWin: rules.pointsToWin,
    deuce: rules.deuce,
    cap: m.cap ?? null,
    forfeitedBy: m.forfeited_by_team_id,
    winnerTeamId: m.winner_team_id,
    duties: dutiesByMatch.get(m.id) ?? [],
  }
}

async function getBundles(): Promise<AdaptedDemoBundle[]> {
  // Demo data is for demo mode ONLY. It used to also be the fallback whenever
  // `loadRealBundles()` returned null — which happens both when no tournament
  // is published yet and when any query errors. That meant a correctly
  // configured production site showed invented pairs ("Sleigh Servers") and
  // completed results for an event that had not happened, for the whole nine
  // months before the day; and a transient error on the day would have
  // silently swapped real standings for fictional ones, with nothing on
  // screen saying so. An empty board is honest; a fake one is not.
  if (!isSupabaseConfigured()) return getAdaptedDemoBundles()
  return (await loadRealBundles()) ?? []
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getDivisions(): Promise<PublicDivisionInfo[]> {
  const bundles = await getBundles()
  return bundles.map((b) => b.division)
}

/** Round-robin standings for every division. */
export async function getStandings(): Promise<PublicDivisionStandings[]> {
  const bundles = await getBundles()
  return bundles.map((b) => ({ division: b.division, rows: b.standings }))
}

/** The full match timetable across every division, sorted by court then slot. */
export async function getSchedule(): Promise<PublicMatch[]> {
  const bundles = await getBundles()
  return bundles.flatMap((b) => b.matches).sort(compareByCourtAndSlot)
}

/** Semis/finals bracket for a single division. */
export async function getBracket(slug: DivisionSlug): Promise<PublicBracket | null> {
  const bundles = await getBundles()
  return bundles.find((b) => b.division.slug === slug)?.bracket ?? null
}

/** Semis/finals bracket for every division. */
export async function getBrackets(): Promise<PublicBracket[]> {
  const bundles = await getBundles()
  return bundles.map((b) => b.bracket)
}

/** Matches currently in progress, across every division. */
export async function getLiveMatches(): Promise<PublicMatch[]> {
  const schedule = await getSchedule()
  return schedule.filter((m) => m.status === 'in_progress')
}

/** Public team/pair directory — never exposes phone, email or emergency contact fields. */
export async function getPlayersDirectory(): Promise<PublicPlayerDirectoryEntry[]> {
  const bundles = await getBundles()
  const entries: PublicPlayerDirectoryEntry[] = []
  for (const bundle of bundles) {
    const rankByTeam = new Map(bundle.standings.map((r) => [r.teamId, r]))
    for (const team of bundle.teams) {
      const row = rankByTeam.get(team.id)
      entries.push({
        team,
        rank: row?.rank ?? null,
        played: row?.played ?? 0,
        wins: row?.wins ?? 0,
        losses: row?.losses ?? 0,
      })
    }
  }
  return entries
}

// ---------------------------------------------------------------------------
// Realtime subscription with reconnect/backoff + polling fallback
// ---------------------------------------------------------------------------

export type LiveConnectionStatus = 'demo' | 'connecting' | 'live' | 'reconnecting' | 'polling'

export interface LiveSubscribeHandlers {
  onMatches: (matches: PublicMatch[]) => void
  onStatus: (status: LiveConnectionStatus) => void
}

const POLL_INTERVAL_MS = 10_000
const BASE_BACKOFF_MS = 2_000
const MAX_BACKOFF_MS = 30_000
/**
 * Slow poll kept running *underneath* a healthy realtime channel. Realtime
 * reporting SUBSCRIBED only proves the websocket joined the topic — it does
 * not prove a single row change will ever be delivered. If the table is
 * missing from the `supabase_realtime` publication, or RLS filters the
 * replicated row, the channel stays happily subscribed and silent. Tearing
 * the poller down on SUBSCRIBED therefore trades a 10s lag for an
 * indefinitely stale page. This bounds that worst case to a minute while
 * still letting realtime deliver instantly in the normal case.
 */
const SAFETY_NET_POLL_MS = 60_000

/**
 * Subscribes to live match updates for the `/live` page. Meant to be called
 * from a client component only (uses the browser Supabase client).
 *
 *   - Demo mode: polls the (static) demo snapshot on an interval so the same
 *     code path renders identically to the real thing; status is `'demo'`.
 *   - Configured mode: opens a Supabase Realtime channel on the `matches`
 *     table. Any change re-fetches the live snapshot. On error/close it
 *     retries with capped exponential backoff (`'reconnecting'`); if
 *     realtime keeps failing it falls back to plain polling (`'polling'`)
 *     so the page keeps updating regardless.
 * Returns an unsubscribe function that stops all timers/channels.
 */
export function subscribeToLiveMatches(handlers: LiveSubscribeHandlers): () => void {
  let stopped = false
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let backoffTimer: ReturnType<typeof setTimeout> | null = null
  let backoffMs = BASE_BACKOFF_MS
  let pollIntervalMs: number | null = null
  let channel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null

  const emit = async () => {
    try {
      const matches = await getLiveMatches()
      if (!stopped) handlers.onMatches(matches)
    } catch {
      // A failed fetch just means we try again next tick.
    }
  }

  if (!isSupabaseConfigured()) {
    handlers.onStatus('demo')
    void emit()
    pollTimer = setInterval(emit, POLL_INTERVAL_MS)
    return () => {
      stopped = true
      if (pollTimer) clearInterval(pollTimer)
    }
  }

  const setPolling = (intervalMs: number) => {
    if (pollTimer && pollIntervalMs === intervalMs) return
    if (pollTimer) clearInterval(pollTimer)
    pollIntervalMs = intervalMs
    pollTimer = setInterval(emit, intervalMs)
  }
  const startPolling = () => {
    handlers.onStatus('polling')
    setPolling(POLL_INTERVAL_MS)
  }
  const stopPolling = () => {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = null
    pollIntervalMs = null
  }

  const scheduleReconnect = () => {
    if (stopped) return
    handlers.onStatus('reconnecting')
    startPolling()
    backoffTimer = setTimeout(() => {
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS)
      connect()
    }, backoffMs)
  }

  const connect = () => {
    if (stopped) return
    handlers.onStatus('connecting')
    void emit()

    try {
      const supabase = createClient()
      channel = supabase
        .channel('public:matches')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => void emit())
        .subscribe((status) => {
          if (stopped) return
          if (status === 'SUBSCRIBED') {
            backoffMs = BASE_BACKOFF_MS
            setPolling(SAFETY_NET_POLL_MS)
            handlers.onStatus('live')
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            scheduleReconnect()
          }
        })
    } catch {
      scheduleReconnect()
    }
  }

  connect()

  return () => {
    stopped = true
    stopPolling()
    if (backoffTimer) clearTimeout(backoffTimer)
    if (channel) {
      try {
        createClient().removeChannel(channel)
      } catch {
        // best-effort cleanup only
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Pure helpers (unit tested in ./public-data.test.ts)
// ---------------------------------------------------------------------------

export function compareByCourtAndSlot(a: PublicMatch, b: PublicMatch): number {
  const courtCompare = (a.court ?? '').localeCompare(b.court ?? '')
  if (courtCompare !== 0) return courtCompare
  return (a.slotIndex ?? 0) - (b.slotIndex ?? 0)
}

export interface CourtGroup {
  court: string
  matches: PublicMatch[]
}

/** Groups matches by court, each court's matches sorted by time slot. */
export function groupMatchesByCourt(matches: readonly PublicMatch[]): CourtGroup[] {
  const byCourt = new Map<string, PublicMatch[]>()
  for (const match of matches) {
    const key = match.court ?? 'Court TBC'
    const list = byCourt.get(key) ?? []
    list.push(match)
    byCourt.set(key, list)
  }
  return [...byCourt.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([court, courtMatches]) => ({
      court,
      matches: [...courtMatches].sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0)),
    }))
}

/** Filters matches to a single division; `null`/`undefined` returns every match. */
export function filterMatchesByDivision(
  matches: readonly PublicMatch[],
  slug: DivisionSlug | null | undefined,
): PublicMatch[] {
  if (!slug) return [...matches]
  return matches.filter((m) => m.division === slug)
}

/** Case-insensitive search across pair names and player names — powers the "my next match" search box. */
export function matchesForPlayerQuery(matches: readonly PublicMatch[], query: string): PublicMatch[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const teamMatches = (team: PublicTeam | null) =>
    !!team && (team.name.toLowerCase().includes(q) || team.players.some((p) => p.name.toLowerCase().includes(q)))
  return matches.filter((m) => teamMatches(m.teamA) || teamMatches(m.teamB))
}

/** Human-readable explanation of how a standings tie was broken, for a badge/tooltip. */
export function tiebreakLabel(reason: TiebreakReason): string {
  switch (reason) {
    case 'wins':
      return 'Ranked on match wins'
    case 'head_to_head':
      return 'Ranked higher on head-to-head result'
    case 'mini_league':
      return 'Ranked on a mini-league among tied pairs'
    case 'head_to_head_points':
      return 'Ranked on points from head-to-head meetings'
    case 'point_difference':
      return 'Ranked on overall point difference'
    case 'points_scored':
      return 'Ranked on total points scored'
    case 'unresolved':
      return 'Tied on every tiebreaker — needs an admin decision'
    default:
      return 'Ranked'
  }
}

/** Maps a match status onto the shared `Badge` component's status prop. */
export function statusToBadgeStatus(status: PublicMatchStatus): BadgeStatus {
  switch (status) {
    case 'in_progress':
      return 'live'
    case 'completed':
    case 'retired':
    case 'walkover':
      return 'final'
    case 'forfeited':
      return 'forfeit'
    case 'scheduled':
    default:
      return 'info'
  }
}

/** Short human label for a match status, e.g. for a badge's text. */
export function statusLabel(status: PublicMatchStatus): string {
  switch (status) {
    case 'in_progress':
      return 'Live'
    case 'completed':
      return 'Final'
    case 'forfeited':
      return 'Forfeit'
    case 'walkover':
      return 'Walkover'
    case 'retired':
      return 'Retired'
    case 'scheduled':
    default:
      return 'Upcoming'
  }
}

/**
 * Whether a match has a result — as opposed to being scheduled or in play.
 *
 * Exists so call sites stop restating the list. Several independently wrote
 * `status === 'completed' || status === 'forfeited'`, and every one of them
 * silently excluded retirements and walkovers the moment those became real
 * statuses, under-counting played matches and hiding scores that exist.
 */
export function isMatchDecided(status: PublicMatchStatus): boolean {
  // Derived from the shared constant rather than restating the list. Three
  // separate copies of this predicate existed and one of them had drifted,
  // dropping retirements from the public standings.
  return (DECIDED_MATCH_STATUSES as readonly string[]).includes(status)
}

/**
 * Whether a score is worth showing for this status.
 *
 * True for anything decided plus a match in play. A retirement keeps the score
 * actually played, and a forfeit/walkover carries the normalised one, so all of
 * them have something meaningful to display.
 */
export function showsScore(status: PublicMatchStatus): boolean {
  return status === 'in_progress' || isMatchDecided(status)
}

/** Renders a team's display name, or its knockout placeholder source when not yet decided. */
export function teamDisplayName(team: PublicTeam | null, source: string | null): string {
  if (team) return team.name
  return source ?? 'TBC'
}

export { DEMO_DIVISIONS }
