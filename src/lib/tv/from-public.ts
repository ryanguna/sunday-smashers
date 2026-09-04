/**
 * Maps the real tournament data in `@/lib/public-data` onto the courtside TV
 * view-model in `./types`.
 *
 * `data.ts` used to return the bundled demo fixtures unconditionally — even
 * with Supabase configured — so the arena monitor showed invented pairs
 * ("The Tinsel Smashers") and an invented score all day. Everything the TV
 * needs already existed; nothing was reading it.
 *
 * These functions are pure and take their data as arguments so the whole
 * mapping is unit-testable without a database.
 */

import { stageLabel } from '@/lib/dashboard'
import type {
  PublicBracket,
  PublicDivisionStandings,
  PublicMatch,
  PublicTeam,
} from '@/lib/public-data'
import type { TeamId } from '@/lib/draw'
import type {
  CourtSnapshot,
  TvBracket,
  TvLiveMatch,
  TvStandings,
  TvTeam,
  TvUpcomingMatch,
} from './types'

/**
 * Court identity on the TV routes is the slugified court *name*, because
 * `/tv/[court]` is typed into a smart TV or a kiosk shortcut by a human.
 * `matches.court_id` is a uuid nobody can read off a remote control.
 */
export function courtSlug(courtName: string): string {
  return courtName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** How many following fixtures the "Later on This Court" list shows. */
const LATER_ON_COURT_LIMIT = 3

/**
 * A pair needs two names on the big screen. Real divisions are doubles, but a
 * team row can be mid-pairing (a free agent awaiting a partner), and the TV
 * must not crash or print `undefined` because of it.
 */
function tvTeam(team: PublicTeam | null, fallbackName: string): TvTeam {
  const names = (team?.players ?? []).map((p) => p.name)
  return {
    id: team?.id ?? '',
    name: team?.name ?? fallbackName,
    players: [names[0] ?? 'TBC', names[1] ?? 'TBC'],
  }
}

function teamNameIndex(teams: readonly (PublicTeam | null)[]): Record<TeamId, string> {
  const index: Record<TeamId, string> = {}
  for (const team of teams) if (team) index[team.id] = team.name
  return index
}

/**
 * The TV shows the played state, not the administrative one: a walkover or a
 * retirement is over as far as the monitor is concerned, and only `forfeited`
 * carries the blame banner.
 */
function tvStatus(match: PublicMatch): TvLiveMatch['status'] {
  if (match.status === 'in_progress') return 'live'
  if (match.status === 'forfeited') return 'forfeit'
  if (match.status === 'scheduled') return 'scheduled'
  return 'completed'
}

function forfeitedSide(match: PublicMatch): 'a' | 'b' | null {
  if (!match.forfeitedBy) return null
  if (match.teamA && match.forfeitedBy === match.teamA.id) return 'a'
  if (match.teamB && match.forfeitedBy === match.teamB.id) return 'b'
  return null
}

export interface LiveMatchExtras {
  /**
   * Which pair serves the next rally. Under rally scoring that is simply
   * whoever won the last rally, so it is read from the most recent
   * `score_events` row rather than replayed — see `data.ts`.
   */
  server: 'a' | 'b' | null
  /** When the first rally was scored, for a true elapsed clock. */
  startedAt: string | null
  endedAt: string | null
}

export function toLiveMatch(
  match: PublicMatch,
  divisionLabel: string,
  extras: LiveMatchExtras,
): TvLiveMatch {
  return {
    matchId: match.id,
    court: match.court ? courtSlug(match.court) : '',
    division: match.division,
    divisionLabel,
    stage: match.stage,
    stageLabel: stageLabel(match.stage),
    teamA: tvTeam(match.teamA, match.sourceA ?? 'TBC'),
    teamB: tvTeam(match.teamB, match.sourceB ?? 'TBC'),
    pointsA: match.scoreA,
    pointsB: match.scoreB,
    pointsToWin: match.pointsToWin,
    deuce: match.deuce,
    server: extras.server,
    status: tvStatus(match),
    forfeitedBy: forfeitedSide(match),
    startedAt: extras.startedAt,
    endedAt: extras.endedAt,
  }
}

export function toUpcomingMatch(match: PublicMatch, divisionLabel: string): TvUpcomingMatch {
  return {
    matchId: match.id,
    court: match.court ? courtSlug(match.court) : '',
    division: match.division,
    divisionLabel,
    stage: match.stage,
    stageLabel: stageLabel(match.stage),
    teamA: tvTeam(match.teamA, match.sourceA ?? 'TBC'),
    teamB: tvTeam(match.teamB, match.sourceB ?? 'TBC'),
    scheduledLabel: match.slotLabel ?? 'Time TBC',
    // `unassigned` rows are placeholders the roster builder emits for slots it
    // could not fill. Printing "Unassigned" four times courtside tells nobody
    // anything; the panel's own "to be confirmed" line says it once.
    duties: match.duties
      .filter((duty) => duty.source !== 'unassigned' && duty.playerName)
      .map((duty) => ({ role: duty.role, playerName: duty.playerName })),
  }
}

export function toTvStandings(standings: PublicDivisionStandings): TvStandings {
  return {
    division: standings.division.slug,
    divisionLabel: standings.division.name,
    rows: standings.rows,
    teamNames: teamNameIndex(standings.rows.map((row) => row.team)),
  }
}

export function toTvBracket(bracket: PublicBracket): TvBracket {
  return {
    division: bracket.division.slug,
    divisionLabel: bracket.division.name,
    fixtures: bracket.fixtures.map((fixture) => ({
      key: fixture.key,
      stage: fixture.stage,
      label: fixture.label,
      teamA: fixture.teamA?.id ?? null,
      teamB: fixture.teamB?.id ?? null,
      sourceA: fixture.sourceA,
      sourceB: fixture.sourceB,
    })),
    teamNames: teamNameIndex(bracket.fixtures.flatMap((f) => [f.teamA, f.teamB])),
  }
}

/**
 * Orders a court's fixtures the way they will actually be played, so "up
 * next" means next. `slotIndex` is the schedule's own ordering; matches with
 * no slot yet sort last rather than jumping the queue.
 */
export function bySlot(a: PublicMatch, b: PublicMatch): number {
  const ai = a.slotIndex ?? Number.MAX_SAFE_INTEGER
  const bi = b.slotIndex ?? Number.MAX_SAFE_INTEGER
  if (ai !== bi) return ai - bi
  return a.id.localeCompare(b.id)
}

export interface BuildSnapshotInput {
  court: string
  courtLabel: string
  /** Every match on this court, any status. */
  matches: readonly PublicMatch[]
  divisionLabels: Record<string, string>
  standings: readonly PublicDivisionStandings[]
  brackets: readonly PublicBracket[]
  extrasFor: (matchId: string) => LiveMatchExtras
}

/**
 * Assembles one court's TV snapshot.
 *
 * "Live" is the match in progress. When none is, the most recently *finished*
 * match on the court is held on screen instead of blanking to the idle view:
 * the seconds after match point are exactly when players and spectators look
 * up to check the final score, and the duty roster for the next match is
 * beside it. It gives way to the idle view only once the next match starts.
 */
export function buildCourtSnapshot(input: BuildSnapshotInput): CourtSnapshot {
  const { court, courtLabel, matches, divisionLabels, standings, brackets, extrasFor } = input
  const ordered = [...matches].sort(bySlot)
  const label = (division: string) => divisionLabels[division] ?? division

  const inProgress = ordered.find((m) => m.status === 'in_progress')
  const decided = ordered.filter((m) => m.status !== 'scheduled' && m.status !== 'in_progress')
  const lastDecided = decided.length > 0 ? decided[decided.length - 1] : null
  const current = inProgress ?? lastDecided

  const scheduled = ordered.filter((m) => m.status === 'scheduled')
  const [next, ...rest] = scheduled

  return {
    court,
    courtLabel,
    live: current ? toLiveMatch(current, label(current.division), extrasFor(current.id)) : null,
    upNext: next ? toUpcomingMatch(next, label(next.division)) : null,
    laterOnCourt: rest.slice(0, LATER_ON_COURT_LIMIT).map((m) => {
      const mapped = toUpcomingMatch(m, label(m.division))
      return {
        matchId: mapped.matchId,
        stageLabel: mapped.stageLabel,
        teamA: mapped.teamA,
        teamB: mapped.teamB,
        scheduledLabel: mapped.scheduledLabel,
      }
    }),
    standings: standings.map(toTvStandings),
    bracket: brackets.map(toTvBracket),
  }
}
