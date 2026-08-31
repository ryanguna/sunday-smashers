/**
 * View-model types for the courtside TV scoreboard (`/tv`, `/tv/[court]`).
 *
 * These are intentionally decoupled from the eventual Supabase schema — the
 * DB-owning agent's tables may not match this shape 1:1. `src/lib/tv/data.ts`
 * is the single seam that maps whatever the real schema turns out to be onto
 * these types, so the UI never needs to change when the schema lands.
 */

import type { KnockoutFixture, MatchStage, StandingRow, TeamId } from '@/lib/draw'
import type { DutyRole } from '@/lib/schedule'

export type CourtId = string
export type DivisionId = string

/** A doubles pair, with display-friendly names for the big screen. */
export interface TvTeam {
  id: TeamId
  /** Festive pair nickname, e.g. "The Tinsel Smashers". */
  name: string
  /** The two players' first names, e.g. ["Priya", "Sam"]. */
  players: [string, string]
}

export type TvMatchStatus = 'scheduled' | 'live' | 'completed' | 'forfeit'

/** One official on the duty roster for an upcoming match. */
export interface TvDutyAssignment {
  role: DutyRole
  playerName: string
}

/** The current or most recently finished match on a court. */
export interface TvLiveMatch {
  matchId: string
  court: CourtId
  division: DivisionId
  divisionLabel: string
  stage: MatchStage
  stageLabel: string
  teamA: TvTeam
  teamB: TvTeam
  pointsA: number
  pointsB: number
  pointsToWin: number
  deuce: boolean
  /** Which side is currently serving, if known. */
  server: 'a' | 'b' | null
  status: TvMatchStatus
  forfeitedBy?: 'a' | 'b' | null
  /** ISO timestamp the match started — used only for elapsed time, client-side. */
  startedAt: string | null
  /** ISO timestamp the match finished, when status is completed/forfeit. */
  endedAt: string | null
}

/** A match not yet underway, with the officiating roster for it. */
export interface TvUpcomingMatch {
  matchId: string
  court: CourtId
  division: DivisionId
  divisionLabel: string
  stage: MatchStage
  stageLabel: string
  teamA: TvTeam
  teamB: TvTeam
  scheduledLabel: string
  duties: TvDutyAssignment[]
}

/** Standings for one division, with display names resolved. */
export interface TvStandings {
  division: DivisionId
  divisionLabel: string
  rows: StandingRow[]
  teamNames: Record<TeamId, string>
}

/** Knockout bracket snapshot for one division. */
export interface TvBracket {
  division: DivisionId
  divisionLabel: string
  fixtures: KnockoutFixture[]
  teamNames: Record<TeamId, string>
}

/** Everything needed to render one court's TV page. */
export interface CourtSnapshot {
  court: CourtId
  courtLabel: string
  live: TvLiveMatch | null
  upNext: TvUpcomingMatch | null
  /**
   * The 2-3 fixtures scheduled on this court after `upNext`, for the
   * "later on this court" list in the side panel. No duty roster attached
   * (only the immediate next match needs one displayed courtside).
   */
  laterOnCourt: Pick<TvUpcomingMatch, 'matchId' | 'stageLabel' | 'teamA' | 'teamB' | 'scheduledLabel'>[]
  standings: TvStandings[]
  bracket: TvBracket[]
}

/** Summary used by the `/tv` overview grid — one tile per court. */
export interface CourtOverview {
  court: CourtId
  courtLabel: string
  live: TvLiveMatch | null
  upNext: TvUpcomingMatch | null
}

export type TvConnectionStatus =
  /** Demo mode — no Supabase configured, nothing to connect to. */
  | 'demo'
  /** Supabase configured, realtime channel connecting for the first time. */
  | 'connecting'
  /** Realtime channel connected and receiving updates. */
  | 'live'
  /** Realtime dropped, backing off before retrying. */
  | 'reconnecting'
  /** Realtime unavailable — falling back to periodic polling. */
  | 'polling'

/**
 * Re-exported, never redeclared. This file previously carried its own copy of
 * the date, which is exactly the drift this project keeps being bitten by:
 * changing the tournament date in `@/lib/tournament` would silently leave the
 * courtside TV countdown pointing at the old one.
 */
export { TOURNAMENT_DATE } from '@/lib/tournament'
