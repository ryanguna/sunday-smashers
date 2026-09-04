/**
 * Data-access abstraction for the courtside TV scoreboard.
 *
 * This is the ONLY module that should know whether data is coming from
 * Supabase or the bundled demo fixtures — components import from here, never
 * from `demo-data.ts` or `@/lib/supabase/*` directly.
 *
 * Real data comes from `@/lib/public-data`, the same layer `/schedule`,
 * `/standings` and `/live` read, mapped onto the TV view-model by
 * `./from-public`. It previously returned the demo fixtures unconditionally,
 * so a configured project still put invented pairs and an invented score on
 * the arena monitor; the demo dataset is now strictly the fallback for demo
 * mode and for a court with nothing scheduled on it yet.
 */

import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/client'
import { getBrackets, getDivisions, getSchedule, getStandings } from '@/lib/public-data'
import type { PublicMatch } from '@/lib/public-data'
import { DEMO_COURTS, getDemoCourtSnapshot } from './demo-data'
import { buildCourtSnapshot, courtSlug, type LiveMatchExtras } from './from-public'
import type { CourtOverview, CourtSnapshot, TvConnectionStatus } from './types'

const NO_EXTRAS: LiveMatchExtras = { server: null, startedAt: null, endedAt: null }

/**
 * Court names as scheduled, keyed by the slug the TV routes use.
 *
 * Built from the schedule rather than the `courts` table so a court with no
 * matches on it never gets a blank monitor of its own, and so the label shown
 * is the one the schedule uses.
 */
async function courtLabelsFromSchedule(): Promise<Map<string, string>> {
  const matches = await getSchedule()
  const labels = new Map<string, string>()
  for (const match of matches) {
    if (!match.court) continue
    const slug = courtSlug(match.court)
    if (slug && !labels.has(slug)) labels.set(slug, match.court)
  }
  return labels
}

/**
 * Who serves next, and when the match really started.
 *
 * Under rally scoring the serve passes to whoever won the last rally, so the
 * serving side is the `side` of the most recent `point` event — no replay
 * needed. The first event's timestamp is the true match start, which is what
 * an elapsed clock on an unattended screen has to count from: counting from
 * page load restarts at 0:00 every time the monitor reconnects.
 */
async function loadLiveExtras(matchIds: readonly string[]): Promise<Map<string, LiveMatchExtras>> {
  const extras = new Map<string, LiveMatchExtras>()
  if (matchIds.length === 0) return extras

  try {
    const { data } = await createClient()
      .from('score_events')
      .select('match_id, side, sequence, event_type, created_at')
      .in('match_id', [...matchIds])
      .eq('event_type', 'point')
      .order('sequence', { ascending: true })

    for (const row of (data ?? []) as {
      match_id: string
      side: 'a' | 'b'
      created_at: string
    }[]) {
      const current = extras.get(row.match_id)
      extras.set(row.match_id, {
        server: row.side,
        startedAt: current?.startedAt ?? row.created_at,
        endedAt: null,
      })
    }
  } catch {
    // A missing serve indicator is a smaller problem than a blank scoreboard.
  }

  return extras
}

/** All known court ids. In demo mode, the two bundled demo courts. */
export async function getCourtIds(): Promise<string[]> {
  if (!isSupabaseConfigured()) return [...DEMO_COURTS]

  const labels = await courtLabelsFromSchedule()
  const slugs = [...labels.keys()].sort()
  return slugs.length > 0 ? slugs : [...DEMO_COURTS]
}

/** One-shot fetch of everything needed to render a single court's TV page. */
export async function getCourtSnapshot(court: string): Promise<CourtSnapshot> {
  if (!isSupabaseConfigured()) return getDemoCourtSnapshot(court)

  try {
    const [schedule, standings, brackets, divisions, labels] = await Promise.all([
      getSchedule(),
      getStandings(),
      getBrackets(),
      getDivisions(),
      courtLabelsFromSchedule(),
    ])

    const onCourt = schedule.filter(
      (match): match is PublicMatch => !!match.court && courtSlug(match.court) === court,
    )

    // Nothing scheduled here at all — most likely a court slug typed into a
    // monitor before the draw exists. The idle view handles it, but only if
    // there is a real court to be idle about; otherwise fall through to demo
    // so a mistyped URL is never a blank screen in front of the crowd.
    if (onCourt.length === 0 && !labels.has(court)) return getDemoCourtSnapshot(court)

    const needExtras = onCourt
      .filter((m) => m.status === 'in_progress' || m.status === 'completed')
      .map((m) => m.id)
    const extras = await loadLiveExtras(needExtras)

    const divisionLabels: Record<string, string> = {}
    for (const division of divisions) divisionLabels[division.slug] = division.name

    return buildCourtSnapshot({
      court,
      courtLabel: labels.get(court) ?? court,
      matches: onCourt,
      divisionLabels,
      standings,
      brackets,
      extrasFor: (id) => extras.get(id) ?? NO_EXTRAS,
    })
  } catch {
    // An unattended screen in front of a crowd must never render an error.
    return getDemoCourtSnapshot(court)
  }
}

/**
 * Lightweight summaries for every court, used by the `/tv` overview grid.
 *
 * Fetches the tournament once and slices it per court. Calling
 * `getCourtSnapshot` in a loop instead would re-run the schedule, standings,
 * bracket and division queries for every court on every poll — and this page
 * polls unattended all day.
 */
export async function getAllCourtOverviews(): Promise<CourtOverview[]> {
  if (!isSupabaseConfigured()) {
    const snapshots = DEMO_COURTS.map((court) => getDemoCourtSnapshot(court))
    return snapshots.map(toOverview)
  }

  try {
    const [schedule, divisions, labels] = await Promise.all([
      getSchedule(),
      getDivisions(),
      courtLabelsFromSchedule(),
    ])
    if (labels.size === 0) return DEMO_COURTS.map((c) => toOverview(getDemoCourtSnapshot(c)))

    const divisionLabels: Record<string, string> = {}
    for (const division of divisions) divisionLabels[division.slug] = division.name

    const byCourt = new Map<string, PublicMatch[]>()
    for (const match of schedule) {
      if (!match.court) continue
      const slug = courtSlug(match.court)
      const bucket = byCourt.get(slug)
      if (bucket) bucket.push(match)
      else byCourt.set(slug, [match])
    }

    const needExtras = schedule
      .filter((m) => m.status === 'in_progress' || m.status === 'completed')
      .map((m) => m.id)
    const extras = await loadLiveExtras(needExtras)

    return [...labels.keys()].sort().map((court) =>
      toOverview(
        buildCourtSnapshot({
          court,
          courtLabel: labels.get(court) ?? court,
          matches: byCourt.get(court) ?? [],
          divisionLabels,
          // The overview tiles show only the live match and what is up next,
          // so the standings and bracket panels are not built here.
          standings: [],
          brackets: [],
          extrasFor: (id) => extras.get(id) ?? NO_EXTRAS,
        }),
      ),
    )
  } catch {
    return DEMO_COURTS.map((court) => toOverview(getDemoCourtSnapshot(court)))
  }
}

function toOverview(snapshot: CourtSnapshot): CourtOverview {
  return {
    court: snapshot.court,
    courtLabel: snapshot.courtLabel,
    live: snapshot.live,
    upNext: snapshot.upNext,
  }
}

// ---------------------------------------------------------------------------
// Realtime subscription with reconnect/backoff + polling fallback
// ---------------------------------------------------------------------------

export interface SubscribeHandlers {
  onSnapshot: (snapshot: CourtSnapshot) => void
  onStatus: (status: TvConnectionStatus) => void
}

const POLL_INTERVAL_MS = 15_000
const BASE_BACKOFF_MS = 2_000
const MAX_BACKOFF_MS = 30_000
/**
 * Slow poll kept running underneath a healthy realtime channel — see the
 * matching note in `src/lib/public-data.ts`. This matters most here: the TV
 * view runs unattended on a courtside monitor for a whole afternoon with
 * nobody to notice it has stopped updating.
 */
const SAFETY_NET_POLL_MS = 60_000

/**
 * Subscribes a court's TV view to live updates. Designed to run unattended
 * for hours on a courtside monitor:
 *   - Demo mode: polls the (static) demo snapshot on an interval so the UI
 *     code path is exercised identically to the real thing; status is
 *     always `'demo'`.
 *   - Configured mode: attempts a Supabase Realtime channel. On error/close
 *     it retries with exponential backoff (capped) and reports
 *     `'reconnecting'`; if realtime keeps failing it switches to plain
 *     polling (`'polling'`) so the screen keeps updating regardless.
 * Returns an unsubscribe function that stops all timers/channels.
 */
export function subscribeToCourt(court: string, handlers: SubscribeHandlers): () => void {
  let stopped = false
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let backoffTimer: ReturnType<typeof setTimeout> | null = null
  let backoffMs = BASE_BACKOFF_MS
  let pollIntervalMs: number | null = null
  let channel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null

  const emitSnapshot = async () => {
    try {
      const snapshot = await getCourtSnapshot(court)
      if (!stopped) handlers.onSnapshot(snapshot)
    } catch {
      // Swallow — a failed fetch just means we try again next tick. Never
      // throw out of a background subscription on an unattended display.
    }
  }

  if (!isSupabaseConfigured()) {
    handlers.onStatus('demo')
    void emitSnapshot()
    pollTimer = setInterval(emitSnapshot, POLL_INTERVAL_MS)
    return () => {
      stopped = true
      if (pollTimer) clearInterval(pollTimer)
    }
  }

  const setPolling = (intervalMs: number) => {
    if (pollTimer && pollIntervalMs === intervalMs) return
    if (pollTimer) clearInterval(pollTimer)
    pollIntervalMs = intervalMs
    pollTimer = setInterval(emitSnapshot, intervalMs)
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
    startPolling() // keep the screen live while we retry the realtime link
    backoffTimer = setTimeout(() => {
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS)
      connect()
    }, backoffMs)
  }

  const connect = () => {
    if (stopped) return
    handlers.onStatus('connecting')
    void emitSnapshot()

    try {
      const supabase = createClient()
      // Not filtered to this court: `matches.court_id` is a uuid but the route
      // param is the court's human label, so a `court=eq.` filter would need a
      // lookup and would silently match nothing if it drifted. A mini
      // tournament is a handful of rows an afternoon — re-fetching this
      // court's snapshot on any match change is cheaper than that risk.
      channel = supabase
        .channel(`tv:${court}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () =>
          void emitSnapshot(),
        )
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
