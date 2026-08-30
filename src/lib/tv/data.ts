/**
 * Data-access abstraction for the courtside TV scoreboard.
 *
 * This is the ONLY module that should know whether data is coming from
 * Supabase or the bundled demo fixtures — components import from here, never
 * from `demo-data.ts` or `@/lib/supabase/*` directly.
 *
 * ---------------------------------------------------------------------------
 * WIRING THE REAL DATABASE (for whoever owns the Supabase schema):
 * ---------------------------------------------------------------------------
 * Every `// TODO(schema)` below marks a spot that currently either returns
 * demo data or a safe empty/no-op result. Replace those bodies with real
 * queries once the schema exists. The expected shapes are documented on each
 * function and in `./types.ts` — keep returning those shapes and nothing
 * downstream needs to change.
 *
 * Suggested realtime wiring once a `live_matches` (or similar) table exists:
 *   supabase
 *     .channel(`tv:${court}`)
 *     .on('postgres_changes', { event: '*', schema: 'public', table: 'live_matches', filter: `court=eq.${court}` }, handler)
 *     .subscribe((status) => ...)
 * `subscribeToCourt` below already implements the reconnect/backoff/polling
 * shell around that — only the inner "how do I fetch/subscribe" bodies need
 * filling in.
 */

import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/client'
import { DEMO_COURTS, getDemoCourtSnapshot } from './demo-data'
import type { CourtOverview, CourtSnapshot, TvConnectionStatus } from './types'

/** All known court ids. In demo mode, the two bundled demo courts. */
export async function getCourtIds(): Promise<string[]> {
  if (!isSupabaseConfigured()) return [...DEMO_COURTS]

  // TODO(schema): replace with a real query, e.g.
  //   const { data } = await createClient().from('courts').select('id').order('id')
  //   return (data ?? []).map((row) => row.id)
  return [...DEMO_COURTS]
}

/** One-shot fetch of everything needed to render a single court's TV page. */
export async function getCourtSnapshot(court: string): Promise<CourtSnapshot> {
  if (!isSupabaseConfigured()) return getDemoCourtSnapshot(court)

  // TODO(schema): replace with real queries against the live-match, roster,
  // standings and announcements tables once they exist. Until then, fall
  // back to demo data so the page never renders blank even if this branch
  // is reached against a project that has `NEXT_PUBLIC_SUPABASE_*` set but
  // no schema deployed yet.
  try {
    const supabase = createClient()
    void supabase // referenced so the client is exercised once schema lands
    return getDemoCourtSnapshot(court)
  } catch {
    return getDemoCourtSnapshot(court)
  }
}

/** Lightweight summaries for every court, used by the `/tv` overview grid. */
export async function getAllCourtOverviews(): Promise<CourtOverview[]> {
  const courts = await getCourtIds()
  const snapshots = await Promise.all(courts.map((court) => getCourtSnapshot(court)))
  return snapshots.map((snapshot) => ({
    court: snapshot.court,
    courtLabel: snapshot.courtLabel,
    live: snapshot.live,
    upNext: snapshot.upNext,
  }))
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
