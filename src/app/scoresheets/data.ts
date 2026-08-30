import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, getProfile, getUserRoles } from '@/lib/auth'
import {
  getDivisions,
  getSchedule,
  isMatchDecided,
  type PublicDivisionInfo,
  type PublicDutyAssignment,
  type PublicMatch,
} from '@/lib/public-data'
import { demoClock, matchStartIso, stageLabel, type PlayerIdentity } from '@/lib/dashboard'
import {
  createScoringState,
  deriveScoreboard,
  rallyHistory,
  restoreFromScoreEvents,
  scoringConfigFromMatch,
  type MatchScoringConfig,
  type RallyHistoryRow,
  type ScoreboardState,
  type ScoringSide,
  type ScoringState,
  type StoredScoreEvent,
} from '@/lib/scoring'
import {
  attributeSignatures,
  createSheetState,
  demoSheetState,
  demoSheetStatus,
  describeEnding,
  reconstructRallies,
  resolveMatchEnding,
  type EndingPresentation,
  type InboxItem,
  type RallySource,
  type SheetSignature,
  type SheetState,
} from '@/lib/scoresheet'
import type { MatchStatus } from '@/lib/supabase/types'

/**
 * Server-side data loading for `/scoresheets` and `/tabulator`.
 *
 * Lives in the route folder, not `src/lib`, because it imports the server
 * Supabase client — which pulls in `next/headers`. Everything under
 * `src/components/scoresheet` takes plain data as props and must never see
 * this file, or `npm run build` fails while `next dev` looks fine.
 *
 * Demo mode (no Supabase env vars) synthesises a whole day's worth of sheets
 * from the bundled demo schedule, because `/tabulator` showing an empty desk
 * in the one mode CI runs is worse than useless for reviewing it.
 */

/** The demo wall clock sits this many slots past the last match of the day. */
const DEMO_LAST_SLOT_PADDING = 2

/** How long a match is assumed to have taken, for demo timestamps. */
const DEMO_MATCH_MINUTES = 12

export interface ScoresheetViewer {
  id: string
  name: string
  /** Which pair this person plays for in the match being viewed, if either. */
  side: ScoringSide | null
  /** Rostered as umpire/scorer or scoresheet keeper on this match. */
  isOfficial: boolean
  isTabulator: boolean
}

const ANONYMOUS_VIEWER: ScoresheetViewer = {
  id: '',
  name: '',
  side: null,
  isOfficial: false,
  isTabulator: false,
}

interface Context {
  demo: boolean
  now: number
  player: PlayerIdentity
  isTabulator: boolean
  matches: PublicMatch[]
  divisionNames: Map<string, string>
}

async function loadContext(): Promise<Context> {
  const demo = !isSupabaseConfigured()
  const [schedule, divisions] = await Promise.all([getSchedule(), getDivisions()])
  const divisionNames = new Map(divisions.map((d: PublicDivisionInfo) => [d.slug, d.name]))

  if (demo) {
    const lastSlot = Math.max(0, ...schedule.map((m) => m.slotIndex ?? 0))
    return {
      demo,
      now: demoClock(lastSlot + DEMO_LAST_SLOT_PADDING),
      player: { id: 'demo-tabulator', name: 'Demo Organiser' },
      isTabulator: true,
      matches: schedule,
      divisionNames,
    }
  }

  const [user, profile, roles] = await Promise.all([getCurrentUser(), getProfile(), getUserRoles()])
  return {
    demo,
    now: Date.now(),
    player: {
      id: user?.id ?? '',
      name: profile?.nickname || profile?.full_name || user?.email || '',
    },
    isTabulator: roles.includes('tabulator') || roles.includes('admin'),
    matches: schedule,
    divisionNames,
  }
}

// ---------------------------------------------------------------------------
// The raw per-match extras `PublicMatch` does not carry
// ---------------------------------------------------------------------------

interface MatchExtras {
  cap: number | null
  status: MatchStatus | null
  forfeitReason: string | null
  completedAtMs: number | null
  events: StoredScoreEvent[]
}

const NO_EXTRAS: MatchExtras = {
  cap: null,
  status: null,
  forfeitReason: null,
  completedAtMs: null,
  events: [],
}

async function loadMatchExtras(matchId: string): Promise<MatchExtras> {
  if (!isSupabaseConfigured()) return NO_EXTRAS
  try {
    const supabase = await createClient()
    const [{ data: row }, { data: events }] = await Promise.all([
      supabase
        .from('matches')
        .select('cap, status, forfeit_reason, completed_at')
        .eq('id', matchId)
        .maybeSingle(),
      supabase
        .from('score_events')
        .select('sequence, side, event_type, score_a_after, score_b_after, note')
        .eq('match_id', matchId)
        .order('sequence', { ascending: true }),
    ])
    const completed = row?.completed_at ? new Date(row.completed_at).getTime() : null
    return {
      cap: row?.cap ?? null,
      status: row?.status ?? null,
      forfeitReason: row?.forfeit_reason ?? null,
      completedAtMs: completed != null && Number.isFinite(completed) ? completed : null,
      // `score_events.event_type` gained 'walkover' and 'retire' in migration
      // 0006, but `StoredScoreEvent` still lists the pre-0006 set. Rows using
      // the new values are ignored by `restoreFromScoreEvents`; the ending is
      // recovered from `matches.status` instead. See the accompanying report.
      events: (events ?? []) as StoredScoreEvent[],
    }
  } catch {
    return NO_EXTRAS
  }
}

// ---------------------------------------------------------------------------
// Stored sheets
// ---------------------------------------------------------------------------

/** Every persisted sheet for the given matches, keyed by match id. */
async function loadStoredSheets(matchIds: readonly string[]): Promise<Map<string, SheetState>> {
  const out = new Map<string, SheetState>()
  if (!isSupabaseConfigured() || matchIds.length === 0) return out

  try {
    const supabase = await createClient()
    const { data: sheets } = await supabase
      .from('scoresheets')
      .select(
        'id, match_id, status, dispute_reason, submitted_by, submitted_at, verified_by, verified_at',
      )
      .in('match_id', [...matchIds])
    if (!sheets || sheets.length === 0) return out

    const { data: signatures } = await supabase
      .from('scoresheet_signatures')
      .select('scoresheet_id, player_id, signed_at')
      .in(
        'scoresheet_id',
        sheets.map((s) => s.id),
      )

    const playerIds = [...new Set((signatures ?? []).map((s) => s.player_id))]
    const { data: profiles } =
      playerIds.length > 0
        ? await supabase.from('profiles').select('id, full_name, nickname').in('id', playerIds)
        : { data: [] as { id: string; full_name: string; nickname: string | null }[] }
    const nameById = new Map((profiles ?? []).map((p) => [p.id, p.nickname || p.full_name]))

    const bySheet = new Map<string, SheetSignature[]>()
    for (const row of signatures ?? []) {
      const list = bySheet.get(row.scoresheet_id) ?? []
      list.push({
        // Placeholder — `attributeSignatures` puts it on the right pair once
        // the match rosters are known. `scoresheet_signatures` has no side.
        side: 'a',
        playerId: row.player_id,
        playerName: nameById.get(row.player_id) ?? 'Player',
        signedAt: toMs(row.signed_at),
      })
      bySheet.set(row.scoresheet_id, list)
    }

    for (const sheet of sheets) {
      out.set(
        sheet.match_id,
        createSheetState(sheet.match_id, {
          status: sheet.status,
          signatures: bySheet.get(sheet.id) ?? [],
          disputeReason: sheet.dispute_reason,
          submittedBy: sheet.submitted_by,
          submittedAt: toMs(sheet.submitted_at),
          verifiedBy: sheet.verified_by,
          verifiedAt: toMs(sheet.verified_at),
        }),
      )
    }
    return out
  } catch {
    return out
  }
}

function toMs(value: string | null): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

/**
 * Puts each stored signature on the side its signer actually plays for, using
 * the rosters carried by the public match. The attribution itself lives in
 * `@/lib/scoresheet` so the write path in `actions.ts` runs the same code.
 */
function attributeForMatch(sheet: SheetState, match: PublicMatch): SheetState {
  return attributeSignatures(sheet, {
    a: (match.teamA?.players ?? []).map((p) => p.id),
    b: (match.teamB?.players ?? []).map((p) => p.id),
  })
}

// ---------------------------------------------------------------------------
// Assembling one sheet
// ---------------------------------------------------------------------------

export interface ScoresheetData {
  demo: boolean
  now: number
  match: PublicMatch
  divisionName: string
  stage: string
  config: MatchScoringConfig
  board: ScoreboardState
  rallies: RallyHistoryRow[]
  rallySource: RallySource
  ending: EndingPresentation
  sheet: SheetState
  officials: PublicDutyAssignment[]
  viewer: ScoresheetViewer
  /** True once the rally log says the match is over, however it ended. */
  matchComplete: boolean
  /** When the result was declared — the clock the queue ages from. */
  finishedAtMs: number | null
}

function buildScoringState(
  match: PublicMatch,
  extras: MatchExtras,
): { config: MatchScoringConfig; state: ScoringState; source: RallySource } {
  const config = scoringConfigFromMatch(match, { cap: extras.cap, useCurrentScore: false })

  if (extras.events.length > 0) {
    return { config, state: restoreFromScoreEvents(config, extras.events), source: 'log' }
  }

  // No `score_events` rows: demo mode, or a result typed in from a paper
  // sheet. The final score is still authoritative — only the order below it
  // is a reconstruction, and the sheet says so.
  const ending = resolveMatchEnding({
    fromRallyLog: null,
    matchStatus: extras.status ?? endingStatusOf(match),
    forfeitReason: extras.forfeitReason,
    endingSide: endingSideOf(match),
  })
  const playedOut = ending == null || ending.kind === 'retired'
  const rallies = playedOut ? reconstructRallies(match.scoreA, match.scoreB, match.id) : []

  return {
    config,
    state: createScoringState(config, { rallies, ending }),
    source: rallies.length === 0 ? 'none' : 'reconstructed',
  }
}

/**
 * The terminal `matches.status` behind a public fixture, or `null` when the
 * match was simply played out. `PublicMatchStatus` keeps `forfeited`,
 * `walkover` and `retired` distinct, so no prose parsing is needed here.
 */
function endingStatusOf(match: PublicMatch): MatchStatus | null {
  if (match.status === 'forfeited') return 'forfeited'
  if (match.status === 'walkover') return 'walkover'
  if (match.status === 'retired') return 'retired'
  return null
}

/**
 * The pair that forfeited, withdrew or retired.
 *
 * `forfeited_by_team_id` is the explicit record; where it is missing on a
 * terminal match the losing pair is the one that stopped, which is the only
 * reading the winner column allows.
 */
function endingSideOf(match: PublicMatch): ScoringSide | null {
  const teamId =
    match.forfeitedBy ??
    (endingStatusOf(match) && match.winnerTeamId
      ? match.winnerTeamId === match.teamA?.id
        ? (match.teamB?.id ?? null)
        : (match.teamA?.id ?? null)
      : null)
  if (!teamId) return null
  if (match.teamA?.id === teamId) return 'a'
  if (match.teamB?.id === teamId) return 'b'
  return null
}

/** When the result was declared. Demo mode has no clock, so the slot is used. */
function finishedAt(match: PublicMatch, extras: MatchExtras, demo: boolean): number | null {
  if (extras.completedAtMs != null) return extras.completedAtMs
  if (!demo) return null
  return demoFinishedAt(match)
}

function demoFinishedAt(match: PublicMatch): number | null {
  const iso = matchStartIso(match)
  if (!iso) return null
  const ms = new Date(iso).getTime()
  return Number.isFinite(ms) ? ms + DEMO_MATCH_MINUTES * 60_000 : null
}

function viewerFor(context: Context, match: PublicMatch): ScoresheetViewer {
  if (!context.player.id) return { ...ANONYMOUS_VIEWER, isTabulator: context.isTabulator }
  const inA = (match.teamA?.players ?? []).some((p) => p.id === context.player.id)
  const inB = (match.teamB?.players ?? []).some((p) => p.id === context.player.id)
  return {
    id: context.player.id,
    name: context.player.name,
    side: inA ? 'a' : inB ? 'b' : null,
    isOfficial: match.duties.some(
      (d) => d.playerId === context.player.id && (d.role === 'umpire_scorer' || d.role === 'scoresheet'),
    ),
    isTabulator: context.isTabulator,
  }
}

/** Everything `/scoresheets/[matchId]` and its print view render. */
export async function loadScoresheet(matchId: string): Promise<ScoresheetData | null> {
  const context = await loadContext()
  const match = findMatch(context.matches, matchId)
  if (!match) return null

  const extras = await loadMatchExtras(match.id)
  const { config, state, source } = buildScoringState(match, extras)
  const board = deriveScoreboard(state)
  const finished = finishedAt(match, extras, context.demo)

  const stored = (await loadStoredSheets([match.id])).get(match.id)
  const sheet = stored
    ? attributeForMatch(stored, match)
    : defaultSheet(match, config, board.complete, finished, context)

  return {
    demo: context.demo,
    now: context.now,
    match,
    divisionName: context.divisionNames.get(match.division) ?? 'Division',
    stage: stageLabel(match.stage),
    config,
    board,
    rallies: rallyHistory(state),
    rallySource: source,
    ending: describeEnding(board, config),
    sheet,
    officials: match.duties,
    viewer: viewerFor(context, match),
    matchComplete: board.complete,
    finishedAtMs: finished,
  }
}

/**
 * The sheet for a match with no `scoresheets` row yet.
 *
 * In demo mode this is where the whole day's spread of statuses comes from;
 * with a real database it is an honest `draft`, because no row means nobody
 * has opened the sheet.
 */
function defaultSheet(
  match: PublicMatch,
  config: MatchScoringConfig,
  complete: boolean,
  finished: number | null,
  context: Context,
): SheetState {
  if (!context.demo || !complete) return createSheetState(match.id)
  const finishedMatches = context.matches.filter(isFinished).sort(byPlayOrder)
  const index = finishedMatches.findIndex((m) => m.id === match.id)
  return demoSheetState({
    matchId: match.id,
    status: demoSheetStatus(index, finishedMatches.length),
    config,
    finishedAt: finished ?? context.now,
  })
}

function isFinished(match: PublicMatch): boolean {
  return isMatchDecided(match.status)
}

function byPlayOrder(a: PublicMatch, b: PublicMatch): number {
  return (a.slotIndex ?? 0) - (b.slotIndex ?? 0) || (a.court ?? '').localeCompare(b.court ?? '')
}

// ---------------------------------------------------------------------------
// The list / inbox
// ---------------------------------------------------------------------------

export interface ScoresheetIndexData {
  demo: boolean
  now: number
  items: InboxItem[]
  isTabulator: boolean
  viewerName: string
}

/**
 * Every finished match's sheet, in one pass — what `/scoresheets` lists and
 * what `/tabulator` queues. Deliberately does not read rally logs: the inbox
 * needs statuses and final scores, and thirty round-robin logs is a lot of
 * rows to fetch to render a list.
 */
export async function loadScoresheetIndex(): Promise<ScoresheetIndexData> {
  const context = await loadContext()
  const finishedMatches = context.matches.filter(isFinished).sort(byPlayOrder)
  const stored = await loadStoredSheets(finishedMatches.map((m) => m.id))

  const items = finishedMatches.map((match, index) => {
    const config = scoringConfigFromMatch(match, { useCurrentScore: false })
    const ending = resolveMatchEnding({
      fromRallyLog: null,
      matchStatus: endingStatusOf(match),
      forfeitReason: null,
      endingSide: endingSideOf(match),
    })
    const board = deriveScoreboard(
      createScoringState(config, {
        rallies:
          ending && ending.kind !== 'retired'
            ? []
            : reconstructRallies(match.scoreA, match.scoreB, match.id),
        ending,
      }),
    )
    const finished = context.demo ? demoFinishedAt(match) : null

    const record = stored.get(match.id)
    const sheet = record
      ? attributeForMatch(record, match)
      : context.demo
        ? demoSheetState({
            matchId: match.id,
            status: demoSheetStatus(index, finishedMatches.length),
            config,
            finishedAt: finished ?? context.now,
          })
        : createSheetState(match.id)

    return toInboxItem(match, sheet, board, describeEnding(board, config), context, finished)
  })

  return {
    demo: context.demo,
    now: context.now,
    items,
    isTabulator: context.isTabulator,
    viewerName: context.player.name,
  }
}

function toInboxItem(
  match: PublicMatch,
  sheet: SheetState,
  board: ScoreboardState,
  ending: EndingPresentation,
  context: Context,
  finished: number | null,
): InboxItem {
  return {
    matchId: match.id,
    sheet,
    divisionName: context.divisionNames.get(match.division) ?? 'Division',
    stageLabel: stageLabel(match.stage),
    court: match.court ?? 'Court TBC',
    slotLabel: match.slotLabel ?? 'Time TBC',
    teamAName: match.teamA?.name ?? match.sourceA ?? 'Pair A',
    teamBName: match.teamB?.name ?? match.sourceB ?? 'Pair B',
    scoreLine: `${board.awardedA}–${board.awardedB}`,
    outcomeLabel: ending.label,
    endingKind: ending.kind,
    resultAt: finished,
    slotIndex: match.slotIndex ?? 0,
  }
}

/**
 * Finds a match by id, tolerating a percent-encoded route param — demo match
 * ids look like `Court 5#16`. Mirrors `src/app/scoring/data.ts`.
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
