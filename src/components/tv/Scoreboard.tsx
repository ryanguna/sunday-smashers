'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { evaluateGame } from '@/lib/draw'
import { subscribeToCourt } from '@/lib/tv/data'
import type { CourtSnapshot, TvConnectionStatus, TvLiveMatch, TvUpcomingMatch } from '@/lib/tv/types'
import { ConnectionIndicator } from './ConnectionIndicator'
import { ScoreDigits } from './ScoreDigits'
import { ElapsedClock } from './ElapsedClock'
import { ForfeitBanner } from './ForfeitBanner'
import { IdleView } from './IdleView'
import { RotatingPanel } from './RotatingPanel'
import { UpNextPanel } from './panels/UpNextPanel'
import { StandingsPanel } from './panels/StandingsPanel'
import { BracketPanel } from './panels/BracketPanel'
import { AnnouncementsPanel } from './panels/AnnouncementsPanel'
import { SponsorPanel } from './panels/SponsorPanel'
import { Confetti } from '@/components/ui/Confetti'
import { ShuttlecockIcon, SnowflakeIcon } from '@/components/icons'

export interface ScoreboardProps {
  initial: CourtSnapshot
  /** Matches on other courts, used only for the idle-state schedule carousel. */
  venueUpcoming: TvUpcomingMatch[]
}

/**
 * The full-screen single-court TV scoreboard — the centrepiece of `/tv/[court]`.
 * Client component: subscribes to live updates, drives score-change and win
 * animations, and rotates the side panels.
 */
export function Scoreboard({ initial, venueUpcoming }: ScoreboardProps) {
  const [rawSnapshot, setRawSnapshot] = useState(initial)
  const [status, setStatus] = useState<TvConnectionStatus>('demo')
  const [celebrate, setCelebrate] = useState(false)
  const prevMatchRef = useRef<{ matchId: string; complete: boolean } | null>(null)

  const searchParams = useSearchParams()
  const rotateParam = searchParams.get('rotate')
  const autoRotate = rotateParam !== '0'
  // Debug-only affordance (demo mode only) so the win-celebration and
  // forfeit states can be reviewed without a real match reaching them:
  // `?scenario=win` or `?scenario=forfeit` on a /tv/[court] URL.
  const scenario = searchParams.get('scenario')

  const snapshot = useMemo(() => applyDebugScenario(rawSnapshot, scenario), [rawSnapshot, scenario])

  useEffect(() => {
    const unsubscribe = subscribeToCourt(initial.court, {
      onSnapshot: setRawSnapshot,
      onStatus: setStatus,
    })
    return unsubscribe
  }, [initial.court])

  const { live, upNext, standings, bracket, announcements, courtLabel } = snapshot

  // Detect a just-completed match to fire the confetti celebration once.
  useEffect(() => {
    if (!live) return
    const state = evaluateGame(live.pointsA, live.pointsB, {
      pointsToWin: live.pointsToWin,
      deuce: live.deuce,
    })
    const isComplete = live.status !== 'live' || state.complete
    const prev = prevMatchRef.current
    const justFinished =
      isComplete && !live.forfeitedBy && (!prev || prev.matchId !== live.matchId || !prev.complete)
    prevMatchRef.current = { matchId: live.matchId, complete: isComplete }
    if (justFinished) {
      setCelebrate(true)
      const timeout = setTimeout(() => setCelebrate(false), 4500)
      return () => clearTimeout(timeout)
    }
  }, [live])

  const slides = useMemo(() => {
    const s: React.ReactNode[] = [<UpNextPanel key="upnext" upNext={upNext} />]
    for (const st of standings) s.push(<StandingsPanel key={`st-${st.division}`} standings={st} />)
    for (const b of bracket) s.push(<BracketPanel key={`br-${b.division}`} bracket={b} />)
    s.push(<AnnouncementsPanel key="announce" announcements={announcements} />)
    s.push(<SponsorPanel key="sponsor" />)
    return s
  }, [upNext, standings, bracket, announcements])

  if (!live) {
    return <IdleView courtLabel={courtLabel} upcoming={upNext ? [upNext, ...venueUpcoming] : venueUpcoming} />
  }

  const forfeited = live.forfeitedBy ?? null
  const forfeitedTeam = forfeited === 'a' ? live.teamA : forfeited === 'b' ? live.teamB : null
  const winningSide =
    live.status !== 'live'
      ? forfeited
        ? forfeited === 'a'
          ? 'b'
          : 'a'
        : live.pointsA > live.pointsB
          ? 'a'
          : 'b'
      : null

  return (
    <main className="relative flex h-full w-full flex-col overflow-hidden bg-gradient-to-br from-[#1c0f2e] via-[#2a1745] to-[#4a1f3d] text-frost">
      <Confetti active={celebrate} />

      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden opacity-25">
        {Array.from({ length: 12 }).map((_, i) => (
          <SnowflakeIcon
            key={i}
            className="animate-snowfall absolute h-5 w-5 text-white"
            style={{
              left: `${(i * 8.3) % 100}%`,
              animationDuration: `${11 + (i % 5) * 2}s`,
              animationDelay: `${i * 0.7}s`,
            }}
          />
        ))}
      </div>

      {/* Header strip */}
      <div className="relative z-10 flex items-center justify-between px-[3vw] py-[1.6vh]">
        <div className="flex items-center gap-3">
          <ShuttlecockIcon className="h-[3.4vh] w-[3.4vh] text-[var(--color-brand-gold)]" />
          <span className="font-[family-name:var(--font-heading)] text-[clamp(1.1rem,1.6vw,1.6rem)] font-extrabold">
            {courtLabel}
          </span>
          <span className="rounded-[var(--radius-pill)] bg-[var(--color-brand-lilac)]/25 px-3 py-1 text-[clamp(0.7rem,1vw,1rem)] font-bold uppercase tracking-wide text-[var(--color-brand-lilac-light)]">
            {live.stageLabel}
          </span>
          <span className="text-[clamp(0.7rem,1vw,1rem)] font-semibold text-frost/50">
            {live.divisionLabel}
          </span>
        </div>
        <div className="flex items-center gap-4 text-[clamp(0.75rem,1vw,1rem)] font-semibold text-frost/70">
          <span>
            First to {live.pointsToWin}
            {live.deuce ? '' : ', no deuce'}
          </span>
          {live.status === 'live' && (
            <span className="tabular-nums">
              ⏱ <ElapsedClock matchKey={live.matchId} />
            </span>
          )}
          <ConnectionIndicator status={status} />
        </div>
      </div>

      {forfeitedTeam && (
        <div className="relative z-10 mx-[3vw] mb-[1.5vh]">
          <ForfeitBanner forfeitedTeam={forfeitedTeam} />
        </div>
      )}

      {/* Main score area — a top (names/serve) row, a centred group (huge
          score digits, a large elapsed-time readout and per-team
          progress-to-target bars) and the side panel, so the full viewport
          height is used regardless of monitor size rather than leaving a
          band of dead space below the digits. */}
      <div className="relative z-10 grid min-h-0 flex-1 grid-cols-1 gap-[2vw] px-[3vw] pb-[2vh] lg:grid-cols-[1fr_22vw]">
        <div className="flex min-h-0 flex-col">
          <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-[2vw] pt-[0.5vh]">
            <TeamHeader
              teamName={live.teamA.name}
              players={live.teamA.players}
              serving={live.status === 'live' && live.server === 'a'}
              align="right"
            />
            <span aria-hidden="true" />
            <TeamHeader
              teamName={live.teamB.name}
              players={live.teamB.players}
              serving={live.status === 'live' && live.server === 'b'}
              align="left"
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col justify-center gap-[2.5vh]">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-[2vw]">
              <ScoreDigits
                value={live.pointsA}
                label={`${live.teamA.name} score`}
                className={`text-center text-[clamp(8rem,48vh,38rem)] ${winningSide === 'a' ? 'text-[var(--color-brand-gold)] drop-shadow-[0_0_50px_rgba(255,200,97,0.55)]' : 'text-frost'}`}
              />

              <span className="font-[family-name:var(--font-heading)] text-[clamp(2rem,4vw,4.5rem)] font-black text-frost/30">
                –
              </span>

              <ScoreDigits
                value={live.pointsB}
                label={`${live.teamB.name} score`}
                className={`text-center text-[clamp(8rem,48vh,38rem)] ${winningSide === 'b' ? 'text-[var(--color-brand-gold)] drop-shadow-[0_0_50px_rgba(255,200,97,0.55)]' : 'text-frost'}`}
              />
            </div>

            {live.status === 'live' && (
              <div className="flex items-center justify-center gap-3 text-frost/70">
                <span aria-hidden="true" className="text-[clamp(1.2rem,2vw,2rem)]">
                  ⏱
                </span>
                <ElapsedClock
                  matchKey={live.matchId}
                  className="font-[family-name:var(--font-heading)] text-[clamp(1.8rem,3.4vw,3.4rem)] font-extrabold tabular-nums text-frost"
                />
                <span className="text-[clamp(0.7rem,1vw,1.1rem)] font-bold uppercase tracking-[0.2em] text-frost/50">
                  Elapsed
                </span>
              </div>
            )}

            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-[2vw]">
              <PointsProgress score={live.pointsA} target={live.pointsToWin} align="right" won={winningSide === 'a'} />
              <MatchPointBadge live={live} />
              <PointsProgress score={live.pointsB} target={live.pointsToWin} align="left" won={winningSide === 'b'} />
            </div>
          </div>
        </div>

        <aside className="flex min-h-[24vh] flex-col rounded-[var(--radius-xl)] bg-white/6 p-[1.4vw] backdrop-blur">
          <RotatingPanel slides={slides} autoRotate={autoRotate} className="flex h-full flex-col" />
        </aside>
      </div>

      {live.status !== 'live' && !forfeitedTeam && (
        <div className="animate-pop-in relative z-10 mx-auto mb-[2vh] w-fit rounded-[var(--radius-pill)] bg-[var(--color-brand-gold)] px-6 py-2 text-[clamp(1rem,1.6vw,1.5rem)] font-extrabold uppercase tracking-wide text-[var(--color-plum)]">
          🏆 Match Complete
        </div>
      )}
    </main>
  )
}

function TeamHeader({
  teamName,
  players,
  serving,
  align,
}: {
  teamName: string
  players: readonly [string, string]
  serving: boolean
  align: 'left' | 'right'
}) {
  return (
    <div
      className={`flex flex-col gap-2 ${align === 'right' ? 'items-end text-right' : 'items-start text-left'}`}
    >
      {serving && (
        <span
          className={`animate-pop-in flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--color-brand-mint)] px-3 py-1 text-[clamp(0.65rem,0.9vw,0.95rem)] font-extrabold uppercase tracking-widest text-[var(--color-plum)] shadow-[var(--shadow-glow-mint)] ${align === 'right' ? 'flex-row-reverse' : ''}`}
        >
          <ShuttlecockIcon className="animate-bob h-[1.4em] w-[1.4em]" aria-hidden="true" />
          Serving
        </span>
      )}
      <h2
        className="font-[family-name:var(--font-heading)] text-[clamp(1.2rem,2.2vw,2.4rem)] font-extrabold leading-tight"
        style={{ color: 'var(--color-frost)' }}
      >
        {teamName}
      </h2>
      <p className="text-[clamp(0.85rem,1.2vw,1.3rem)] font-semibold text-frost/60">
        {players[0]} &amp; {players[1]}
      </p>
    </div>
  )
}

function PointsProgress({
  score,
  target,
  align,
  won,
}: {
  score: number
  target: number
  align: 'left' | 'right'
  won: boolean
}) {
  const pct = Math.max(0, Math.min(100, (score / target) * 100))
  return (
    <div className={`flex flex-col gap-2 ${align === 'right' ? 'items-end' : 'items-start'}`}>
      <div className="h-[1.6vh] w-full min-w-[10rem] overflow-hidden rounded-[var(--radius-pill)] bg-white/12">
        <div
          className={`h-full rounded-[var(--radius-pill)] transition-[width] duration-500 ${won ? 'bg-[var(--color-brand-gold)]' : 'bg-[var(--color-brand-mint)]'}`}
          style={{ width: `${Math.round(pct)}%` }}
        />
      </div>
      <span className="text-[clamp(0.8rem,1.1vw,1.15rem)] font-semibold text-frost/60">
        {score} / {target} to win
      </span>
    </div>
  )
}

/**
 * "Match point" — the leading side wins outright by reaching `pointsToWin`
 * (the draft rules play with no deuce), so it is a match point for a side
 * the moment it sits one point below the target while the opponent hasn't
 * already reached it.
 */
function MatchPointBadge({ live }: { live: TvLiveMatch }) {
  if (live.status !== 'live') return null
  const aMatchPoint = live.pointsA === live.pointsToWin - 1 && live.pointsB < live.pointsToWin
  const bMatchPoint = live.pointsB === live.pointsToWin - 1 && live.pointsA < live.pointsToWin
  if (!aMatchPoint && !bMatchPoint) return <span aria-hidden="true" />

  return (
    <span className="animate-pop-in whitespace-nowrap rounded-[var(--radius-pill)] bg-[var(--color-danger)] px-3 py-1 text-[clamp(0.65rem,1vw,1rem)] font-extrabold uppercase tracking-widest text-white shadow-[var(--shadow-glow-pink)]">
      Match Point
    </span>
  )
}

/**
 * Debug-only scenario override, active in demo mode only, so reviewers can
 * see the win-celebration and forfeit states without waiting for a real
 * match to reach them: append `?scenario=win` or `?scenario=forfeit` to a
 * `/tv/[court]` URL.
 */
function applyDebugScenario(snapshot: CourtSnapshot, scenario: string | null): CourtSnapshot {
  if (!snapshot.live || (scenario !== 'win' && scenario !== 'forfeit')) return snapshot

  if (scenario === 'win') {
    return {
      ...snapshot,
      live: { ...snapshot.live, pointsA: 15, pointsB: 11, status: 'completed', forfeitedBy: null },
    }
  }

  return {
    ...snapshot,
    live: { ...snapshot.live, pointsA: 0, pointsB: snapshot.live.pointsToWin, status: 'forfeit', forfeitedBy: 'a' },
  }
}
