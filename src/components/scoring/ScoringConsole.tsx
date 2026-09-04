'use client'

import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react'

import { Badge, Button, Confetti } from '@/components/ui'
import { TrophyIcon } from '@/components/icons'
import { saveScore } from '@/app/scoring/actions'
import {
  createSyncTracker,
  deriveScoreboard,
  describeSync,
  endKindLabel,
  formatElapsed,
  rallyHistory,
  scoreAnnouncement,
  scoreForSide,
  scoreHeadline,
  serialiseSnapshot,
  serveSummary,
  syncFailed,
  syncLocalOnly,
  syncStarted,
  syncSucceeded,
  toSnapshot,
  type MatchEndKind,
  type ScoringAction,
  type ScoringSide,
  type ScoringState,
  scoringReducer,
  sideName,
  syncConflict,
  unsentRallies,
} from '@/lib/scoring'

import { EndMatchDialog } from './EndMatchDialog'
import { PointButton } from './PointButton'
import { RallyHistory } from './RallyHistory'
import { SyncBanner } from './SyncBanner'
import {
  clearLocalSnapshot,
  parseLocalSnapshot,
  readLocalSnapshot,
  serverSnapshot,
  subscribeLocalSnapshot,
  writeLocalSnapshot,
} from './localSnapshot'
import { useMatchClock } from './useMatchClock'

export interface ScoringConsoleProps {
  initialState: ScoringState
  /** No Supabase configured — everything stays on the device. */
  demo: boolean
  /** False for line judges and spectators: the console renders read-only. */
  canScore: boolean
  /** Clock resolved on the server, so render stays pure and hydration-safe. */
  now: number
  startedAtMs: number | null
  /** The `matches.updated_at` the server rendered this console from. */
  revision: string | null
  contextLabel: string
}

/**
 * The courtside console.
 *
 * Everything on this screen is derived from one list of rallies, so undo,
 * correcting an old point and the serve rotation are all the same operation
 * replayed — there is no second copy of the score to drift out of step.
 *
 * The save path is deliberately blunt: apply the tap locally, write the whole
 * log to `localStorage` in the same handler, then push it. If the push fails
 * the local log is untouched and the banner says so loudly. A point can be
 * delayed but it cannot be lost.
 */
export function ScoringConsole({
  initialState,
  demo,
  canScore,
  now,
  startedAtMs,
  revision,
  contextLabel,
}: ScoringConsoleProps) {
  const [state, dispatch] = useReducer(scoringReducer, initialState)
  const [tracker, setTracker] = useState(() =>
    createSyncTracker(demo ? 'local' : 'idle', initialState.rallies.length),
  )
  const [historyOpen, setHistoryOpen] = useState(false)
  const [endOpen, setEndOpen] = useState(false)
  const [restored, setRestored] = useState(false)

  const config = state.config
  const board = useMemo(() => deriveScoreboard(state), [state])
  const history = useMemo(() => rallyHistory(state), [state])
  const teamAName = sideName(config, 'a')
  const teamBName = sideName(config, 'b')

  const clock = useMatchClock(now, startedAtMs != null && !board.complete)

  // A save already in flight, and the newest state waiting behind it.
  const inFlight = useRef(false)
  const queued = useRef<ScoringState | null>(null)

  /**
   * The version of the match row this phone believes it is editing.
   *
   * A save replaces the whole rally log, so two officials on the same match —
   * and the umpire and the scoresheet person are both duty officials — would
   * otherwise take turns wiping each other's points with nobody told. Sending
   * this back lets the server refuse a save built on a log it has since
   * replaced. It is a ref, not state: it changes on every save and must never
   * cause a re-render of a live scoreboard.
   */
  const knownRevision = useRef(revision)

  /**
   * Anything this phone recorded that never reached the server — surfaced as
   * an explicit "restore" offer rather than silently applied, so the umpire is
   * always the one who decides which log is the real one.
   */
  const storedRaw = useSyncExternalStore(
    subscribeLocalSnapshot,
    () => readLocalSnapshot(config.matchId),
    serverSnapshot,
  )
  const stored = useMemo(() => parseLocalSnapshot(storedRaw), [storedRaw])
  const canRestore =
    !restored && stored != null && stored.rallies.length > state.rallies.length && canScore

  const push = async (next: ScoringState): Promise<void> => {
    if (demo) {
      setTracker((current) => syncLocalOnly(current, next.rallies.length))
      return
    }
    if (inFlight.current) {
      // A save is already on the wire — remember the newest state and let the
      // in-flight call send it when it lands. Only the latest matters.
      queued.current = next
      setTracker((current) => ({
        ...current,
        status: 'pending',
        localRallies: next.rallies.length,
      }))
      return
    }

    inFlight.current = true
    try {
      let target: ScoringState | null = next
      while (target) {
        const attempt: ScoringState = target
        queued.current = null
        const rallies = attempt.rallies.length
        setTracker((current) => syncStarted(current, rallies))

        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          setTracker((current) => syncFailed(current, rallies, 'this phone is offline', true))
          return
        }

        try {
          const result = await saveScore({
            matchId: attempt.config.matchId,
            snapshot: toSnapshot(attempt),
            rules: attempt.config.rules,
            teamA: attempt.config.teamA,
            teamB: attempt.config.teamB,
            knownRevision: knownRevision.current,
          })
          if (result.revision !== undefined) knownRevision.current = result.revision
          if (result.ok) {
            setTracker((current) => syncSucceeded(current, rallies, Date.now()))
          } else if (result.demo) {
            setTracker((current) => syncLocalOnly(current, rallies))
          } else if (result.conflict) {
            // Stop here rather than draining the queue: every state behind this
            // one is built on the same stale log and would be refused too.
            setTracker((current) => syncConflict(current, rallies, result.message))
            return
          } else {
            setTracker((current) => syncFailed(current, rallies, result.message))
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'the server did not answer'
          const dropped = typeof navigator !== 'undefined' && navigator.onLine === false
          setTracker((current) => syncFailed(current, rallies, message, dropped))
        }

        target = queued.current
      }
    } finally {
      inFlight.current = false
    }
  }

  /**
   * Send whatever this phone is holding as soon as the browser reconnects.
   *
   * `push` gives up when `navigator.onLine` is false, which is correct — there
   * is no point burning a request — but nothing then retried. The points sat
   * in localStorage until the umpire happened to tap another one, while the
   * banner told them the score "will send itself when the wifi returns". In a
   * gym with patchy wifi the last point of a game is exactly the one nobody
   * taps past, so the scoreboard could stay wrong until someone noticed.
   *
   * Refs, not deps: the listener is registered once, and must always see the
   * newest state rather than the render it was created in.
   */
  const latest = useRef({ state, tracker, push })
  useEffect(() => {
    latest.current = { state, tracker, push }
  })

  useEffect(() => {
    if (demo) return
    function flush() {
      const { state: current, tracker: seen, push: send } = latest.current
      if (unsentRallies(seen) === 0) return
      void send(current)
    }
    window.addEventListener('online', flush)
    return () => window.removeEventListener('online', flush)
  }, [demo])

  /**
   * One entry point for every change: reduce, persist, then push. The reducer
   * is pure so computing the next state here as well as in React costs
   * nothing, and lets exactly the same value be saved and sent.
   */
  const run = (action: ScoringAction) => {
    const next = scoringReducer(state, action)
    if (next === state) return
    dispatch(action)
    writeLocalSnapshot(config.matchId, serialiseSnapshot(next))
    void push(next)
  }

  const restore = () => {
    if (!stored) return
    setRestored(true)
    const next = scoringReducer(state, { type: 'load', snapshot: stored })
    dispatch({ type: 'load', snapshot: stored })
    void push(next)
  }

  const endMatch = (kind: MatchEndKind, side: ScoringSide, reason: string) => {
    setEndOpen(false)
    run({ type: 'end_match', kind, side, reason, at: Date.now() })
  }

  const headline = scoreHeadline(board, config)
  const announcement = scoreAnnouncement(board, config)
  const sync = describeSync(tracker)
  const locked = !canScore || board.complete

  return (
    <div className="flex flex-col gap-4">
      <Confetti active={board.complete && board.outcome === 'points'} />

      {/* Screen readers hear every score change without the visual noise. */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      <header className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-white/85 px-4 py-4 shadow-[var(--shadow-soft)] backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
            {contextLabel}
          </p>
          <div className="flex items-center gap-2">
            {board.complete ? (
              <Badge status="final">Result in</Badge>
            ) : (
              <Badge status="live">Scoring</Badge>
            )}
            <span
              className="font-[family-name:var(--font-heading)] text-base font-bold tabular-nums text-[var(--color-plum)]"
              aria-label="Time on court"
            >
              {formatElapsed(startedAtMs, clock)}
            </span>
          </div>
        </div>

        <h2
          className="flex items-center gap-2 font-[family-name:var(--font-heading)] text-2xl font-extrabold leading-tight"
          style={{
            color: board.complete ? 'var(--color-brand-holly)' : 'var(--color-plum)',
          }}
        >
          {board.complete && board.outcome === 'points' ? (
            <TrophyIcon className="h-7 w-7 shrink-0" aria-hidden="true" />
          ) : null}
          {headline}
        </h2>

        <p className="text-base text-[var(--color-ink-soft)]">{serveSummary(board, config)}</p>
      </header>

      <SyncBanner
        view={sync}
        onRetry={() => void push(state)}
        retrying={tracker.status === 'saving'}
      />

      {canRestore ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border-2 border-[var(--color-warn)] bg-[var(--color-warn-bg)] px-4 py-3">
          <p className="text-sm font-semibold text-[var(--color-ink-soft)]">
            This phone has {stored ? stored.rallies.length : 0} rallies saved that the scoreboard
            has not seen. Restore them?
          </p>
          <span className="flex gap-2">
            <Button type="button" size="sm" onClick={restore}>
              Restore
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setRestored(true)
                clearLocalSnapshot(config.matchId)
              }}
            >
              Ignore
            </Button>
          </span>
        </div>
      ) : null}

      {!canScore ? (
        <p className="rounded-[var(--radius-md)] border-2 border-[var(--color-info)] bg-[var(--color-info-bg)] px-4 py-3 text-sm font-semibold text-[var(--color-ink-soft)]">
          You are watching this match, not scoring it. Only the umpire/scorer and the scoresheet
          keeper can record points.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <PointButton
          side="a"
          teamName={teamAName}
          players={config.teamA.players.map((p) => p.name)}
          score={scoreForSide(board, 'a')}
          serving={board.serve.servingSide === 'a'}
          serverName={board.serve.serverName}
          serviceCourt={board.serve.court}
          gamePoint={board.gamePointFor === 'a'}
          disabled={locked}
          onPoint={() => run({ type: 'point', side: 'a', at: Date.now() })}
        />
        <PointButton
          side="b"
          teamName={teamBName}
          players={config.teamB.players.map((p) => p.name)}
          score={scoreForSide(board, 'b')}
          serving={board.serve.servingSide === 'b'}
          serverName={board.serve.serverName}
          serviceCourt={board.serve.court}
          gamePoint={board.gamePointFor === 'b'}
          disabled={locked}
          onPoint={() => run({ type: 'point', side: 'b', at: Date.now() })}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          size="lg"
          variant="secondary"
          className="min-h-[3.5rem] flex-1"
          disabled={!canScore || !board.canUndo}
          onClick={() => run({ type: 'undo' })}
        >
          ↺ Undo last point
        </Button>
        {board.ending ? (
          <Button
            type="button"
            size="lg"
            variant="ghost"
            className="min-h-[3.5rem]"
            disabled={!canScore}
            aria-label={`Back to scoring — undo the ${endKindLabel(board.ending.kind).toLowerCase()} result`}
            onClick={() => run({ type: 'resume' })}
          >
            Back to scoring
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            variant="ghost"
            className="min-h-[3.5rem]"
            disabled={!canScore || board.complete}
            onClick={() => setEndOpen(true)}
          >
            End early…
          </Button>
        )}
      </div>

      <section className="rounded-[var(--radius-lg)] bg-white/85 px-4 py-4 shadow-[var(--shadow-soft)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3
            className="font-[family-name:var(--font-heading)] text-lg font-extrabold"
            style={{ color: 'var(--color-plum)' }}
          >
            Rally history
          </h3>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((open) => !open)}
          >
            {historyOpen ? 'Hide' : `Show (${history.length})`}
          </Button>
        </div>
        {historyOpen ? (
          <div className="mt-3">
            <RallyHistory
              rows={history}
              teamAName={teamAName}
              teamBName={teamBName}
              editable={canScore && !board.complete}
              onCorrect={(seq, side) => run({ type: 'correct_rally', seq, side })}
              onRemove={(seq) => run({ type: 'remove_rally', seq })}
            />
          </div>
        ) : (
          <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
            Every rally is kept here — open it to fix a point from earlier in the game.
          </p>
        )}
      </section>

      {board.totalPoints === 0 && canScore && !board.complete ? (
        <section className="rounded-[var(--radius-lg)] bg-white/85 px-4 py-4 shadow-[var(--shadow-soft)]">
          <h3
            className="font-[family-name:var(--font-heading)] text-lg font-extrabold"
            style={{ color: 'var(--color-plum)' }}
          >
            Who serves first?
          </h3>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Set this before the first rally. After that the serve follows the score automatically.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant={board.serve.servingSide === 'a' ? 'primary' : 'secondary'}
              onClick={() => run({ type: 'set_serving_side', side: 'a' })}
            >
              {teamAName}
            </Button>
            <Button
              type="button"
              variant={board.serve.servingSide === 'b' ? 'primary' : 'secondary'}
              onClick={() => run({ type: 'set_serving_side', side: 'b' })}
            >
              {teamBName}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                run({
                  type: 'swap_serve_positions',
                  side: board.serve.servingSide,
                })
              }
            >
              Swap who is in the right court
            </Button>
          </div>
        </section>
      ) : null}

      <EndMatchDialog
        open={endOpen}
        onClose={() => setEndOpen(false)}
        teamAName={teamAName}
        teamBName={teamBName}
        onConfirm={endMatch}
      />
    </div>
  )
}
