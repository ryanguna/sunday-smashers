/**
 * App-level domain types, derived from the raw `Database` row types in
 * `src/lib/supabase/types.ts`. Components/pages should generally import
 * from here rather than reaching into the DB types directly, so shapes can
 * evolve (joins, computed fields) without every call site changing.
 *
 * The adapters at the bottom translate DB rows into the plain types
 * `src/lib/draw.ts` (the draw/ranking engine) already understands, so the
 * engine never needs to know about Supabase.
 */

import type {
  AnnouncementRow,
  AwardRow,
  ChecklistItemRow,
  CourtRow,
  DivisionRow,
  DutyAssignmentRow,
  MatchRow,
  MatchStatus,
  PartnerInviteRow,
  PaymentRow,
  PhotoRow,
  ProfileRow,
  RegistrationRow,
  ScoresheetRow,
  ScoresheetSignatureRow,
  ScoreEventRow,
  StandingsViewRow,
  TeamMemberRow,
  TeamRow,
  TimeSlotRow,
  TournamentRow,
  UserRole,
} from '@/lib/supabase/types'
import { DECIDED_MATCH_STATUSES } from '@/lib/supabase/types'
import type { PlayedMatch, StageRules, StandingRow } from '@/lib/draw'

// ---------------------------------------------------------------------------
// Re-exports of the raw row types, for convenience.
// ---------------------------------------------------------------------------

export type {
  AnnouncementRow,
  AwardRow,
  ChecklistItemRow,
  CourtRow,
  DivisionRow,
  DutyAssignmentRow,
  MatchRow,
  MatchStatus,
  PartnerInviteRow,
  PaymentRow,
  PhotoRow,
  ProfileRow,
  RegistrationRow,
  ScoresheetRow,
  ScoresheetSignatureRow,
  ScoreEventRow,
  StandingsViewRow,
  TeamMemberRow,
  TeamRow,
  TimeSlotRow,
  TournamentRow,
  UserRole,
}

// ---------------------------------------------------------------------------
// Composite / joined domain types
// ---------------------------------------------------------------------------

/** A player is a profile plus the roles they hold. */
export interface Player extends ProfileRow {
  roles: UserRole[]
}

/** A doubles team with its two resolved player profiles. */
export interface Team extends TeamRow {
  players: Player[]
}

/** A match with its teams resolved (rather than bare team ids). */
export interface MatchWithTeams extends MatchRow {
  teamA: Team | null
  teamB: Team | null
  court: CourtRow | null
  timeSlot: TimeSlotRow | null
}

/** A duty roster slot with the assigned player's profile attached. */
export interface DutyAssignmentWithPlayer extends DutyAssignmentRow {
  player: Player
}

/** A scoresheet with all of its signatures attached. */
export interface ScoresheetWithSignatures extends ScoresheetRow {
  signatures: ScoresheetSignatureRow[]
}

/** A division with its computed format rules bundled as `StageRules`. */
export interface DivisionWithRules extends DivisionRow {
  elimsRules: StageRules
  finalsRules: StageRules
}

// ---------------------------------------------------------------------------
// Adapters — DB rows -> src/lib/draw.ts input types
// ---------------------------------------------------------------------------

/**
 * Converts a completed/forfeited `MatchRow` (stage='elims') into the
 * `PlayedMatch` shape `computeStandings()` expects. Returns `null` for
 * matches that haven't produced a result yet (no teams assigned, or still
 * scheduled/in_progress/cancelled) so callers can `filter(Boolean)` a list
 * of rows straight from Supabase.
 */
export function toPlayedMatch(row: MatchRow): PlayedMatch | null {
  if (!row.team_a_id || !row.team_b_id) return null
  if (!isDecided(row.status)) return null

  return {
    teamA: row.team_a_id,
    teamB: row.team_b_id,
    pointsA: row.score_a,
    pointsB: row.score_b,
    forfeitedBy: row.forfeited_by_team_id ?? null,
    // Required for a retirement: play stopped early, so the recorded score is
    // short of `pointsToWin` and cannot decide the match on its own. Omitting
    // this dropped every retirement from the public standings — and from the
    // win count that picks the top four — while `dashboard.ts` counted them,
    // so a player's own dashboard disagreed with the public table.
    winner: row.winner_team_id ?? null,
  }
}

/**
 * Derived from `DECIDED_MATCH_STATUSES` rather than restating the list.
 *
 * This function used to hold its own copy that omitted `'retired'`, so the
 * public standings quietly disagreed with both the shared constant and the
 * player dashboard. The constant is the single home for "has this match
 * produced a result"; adding a status there now reaches every caller.
 */
function isDecided(status: MatchStatus): boolean {
  return (DECIDED_MATCH_STATUSES as readonly MatchStatus[]).includes(status)
}

/** Builds the `StageRules` a division uses for its elims (round robin) stage. */
export function divisionElimsRules(division: DivisionRow): StageRules {
  return {
    pointsToWin: division.points_to_win_elims,
    deuce: division.deuce_enabled_elims,
    cap: division.cap_elims ?? undefined,
  }
}

/** Builds the `StageRules` a division uses for its semi/final stages. */
export function divisionFinalsRules(division: DivisionRow): StageRules {
  return {
    pointsToWin: division.points_to_win_finals,
    deuce: division.deuce_enabled_finals,
    cap: division.cap_finals ?? undefined,
  }
}

/** The number of pairs a division qualifies for its knockout stage. */
export function divisionQualifyingPlaces(division: DivisionRow): number {
  return division.qualifying_places
}

/**
 * Converts a `matches` row into the `StageRules` that applied when it was
 * played — useful for re-evaluating a single match (e.g. `matchWinner`)
 * without needing the parent division row, since `points_to_win`/`deuce`/
 * `cap` are denormalised onto the match at scheduling time.
 */
export function matchStageRules(row: MatchRow): StageRules {
  return {
    pointsToWin: row.points_to_win,
    deuce: row.deuce_enabled,
    cap: row.cap ?? undefined,
  }
}

/**
 * Maps the `standings` SQL view's raw aggregates onto the fields of
 * `StandingRow` that don't require tiebreak resolution. `rank`, `tiebreak`
 * and `needsAdminDecision` are left at their placeholder defaults — call
 * `computeStandings()` from `src/lib/draw.ts` with the division's played
 * matches to get a fully ranked, tie-broken `StandingRow[]`. This helper is
 * mainly useful for a quick "played/won/lost" summary without the full
 * match history at hand.
 */
export function toStandingRowAggregatesOnly(row: StandingsViewRow): Omit<StandingRow, 'rank' | 'tiebreak' | 'needsAdminDecision'> {
  return {
    teamId: row.team_id,
    played: row.played,
    wins: row.wins,
    losses: row.losses,
    forfeits: row.forfeits,
    pointsFor: row.points_for,
    pointsAgainst: row.points_against,
    pointDiff: row.point_diff,
  }
}
