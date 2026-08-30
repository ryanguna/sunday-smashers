/**
 * Public player profiles (`/players/[handle]`) — handle generation, profile
 * assembly and the festive "derived stats" that make a profile worth
 * screenshotting.
 *
 * Data comes exclusively from `@/lib/public-data`, which already decides
 * between Supabase and the bundled demo fixtures and only ever selects
 * non-PII player columns. Nothing here talks to Supabase directly, and
 * nothing here imports `@/lib/supabase/server` (which pulls in
 * `next/headers` and would break the production build if it ever reached a
 * Client Component's import graph).
 *
 * Everything below the "Derived stats" heading is pure and unit tested in
 * `./player-profile.test.ts`.
 */

import {
  getDivisions,
  getSchedule,
  getStandings,
  type DivisionSlug,
  type PublicDivisionInfo,
  type PublicMatch,
  type PublicPlayer,
  type PublicStandingRow,
  type PublicTeam,
} from '@/lib/public-data'
import {
  playerDuties,
  playerFixtures,
  podiumFor,
  recordFor,
  TOP_FOUR_CUT,
  type PlayerDuty,
  type PlayerFixture,
  type PlayerRecord,
  type Podium,
} from '@/lib/dashboard'

// ---------------------------------------------------------------------------
// Handles
// ---------------------------------------------------------------------------

/**
 * Turns a display name into a URL-safe handle: "Aroha Ngata" → `aroha-ngata`.
 * Accents are stripped so the handle stays ASCII and typeable. Returns an
 * empty string when the name has no usable characters.
 */
export function slugifyName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** One player in the public directory, with everything a profile card needs. */
export interface PlayerDirectoryEntry {
  /** Canonical, URL-safe identifier used by `/players/[handle]`. */
  handle: string
  /** The underlying player id (a Supabase `profiles.id` in real mode). */
  playerId: string
  name: string
  team: PublicTeam
  division: DivisionSlug
  partner: PublicPlayer | null
  partnerHandle: string | null
}

/**
 * Builds the handle for every player across every pair.
 *
 * Handles are derived from the display name so URLs read nicely; when two
 * players slugify to the same handle the later ones get a `-2`, `-3` …
 * suffix, in the order the teams are supplied, so handles stay stable and
 * unique. A player with an unusable name falls back to their id.
 */
export function buildPlayerDirectory(teams: readonly PublicTeam[]): PlayerDirectoryEntry[] {
  const used = new Map<string, number>()
  const entries: Omit<PlayerDirectoryEntry, 'partnerHandle'>[] = []

  for (const team of teams) {
    for (const player of team.players) {
      const base = slugifyName(player.name) || slugifyName(player.id) || 'player'
      const seen = used.get(base) ?? 0
      used.set(base, seen + 1)
      const handle = seen === 0 ? base : `${base}-${seen + 1}`
      entries.push({
        handle,
        playerId: player.id,
        name: player.name,
        team,
        division: team.division,
        partner: team.players.find((p) => p.id !== player.id) ?? null,
      })
    }
  }

  const handleByPlayerId = new Map(entries.map((e) => [e.playerId, e.handle]))
  return entries.map((entry) => ({
    ...entry,
    partnerHandle: entry.partner ? (handleByPlayerId.get(entry.partner.id) ?? null) : null,
  }))
}

/**
 * Resolves a URL segment to a directory entry. Accepts the canonical handle,
 * the raw player id (so the dashboard can link with the signed-in user's id
 * without knowing their handle) or a bare name slug.
 */
export function resolvePlayer(
  directory: readonly PlayerDirectoryEntry[],
  handleOrId: string,
): PlayerDirectoryEntry | null {
  const needle = decodeURIComponent(handleOrId ?? '').trim().toLowerCase()
  if (!needle) return null
  const slug = slugifyName(needle)
  return (
    directory.find((e) => e.handle === needle) ??
    directory.find((e) => e.playerId.toLowerCase() === needle) ??
    (slug ? (directory.find((e) => slugifyName(e.name) === slug) ?? null) : null)
  )
}

// ---------------------------------------------------------------------------
// Derived stats — the fun bit
// ---------------------------------------------------------------------------

/** A fixture whose result is known (not upcoming, not still being played). */
export function decidedFixtures(fixtures: readonly PlayerFixture[]): PlayerFixture[] {
  return fixtures.filter((f) => f.outcome !== 'upcoming' && f.outcome !== 'live')
}

/** Decided fixtures that were actually played out (a forfeit isn't a contest). */
function contestedFixtures(fixtures: readonly PlayerFixture[]): PlayerFixture[] {
  return fixtures.filter((f) => f.outcome === 'win' || f.outcome === 'loss')
}

export interface MarginHighlight {
  fixture: PlayerFixture
  margin: number
}

/**
 * The pair's most emphatic win. Forfeits are excluded — nobody brags about a
 * no-show. Ties are broken by playing order, so the earliest such win wins.
 */
export function biggestWinMargin(fixtures: readonly PlayerFixture[]): MarginHighlight | null {
  let best: MarginHighlight | null = null
  for (const fixture of contestedFixtures(fixtures)) {
    if (fixture.outcome !== 'win') continue
    const margin = fixture.yourScore - fixture.theirScore
    if (!best || margin > best.margin) best = { fixture, margin }
  }
  return best
}

/**
 * The tightest contest of the day, won or lost — the one everybody watched
 * through their fingers. Ties broken by playing order.
 */
export function closestGame(fixtures: readonly PlayerFixture[]): MarginHighlight | null {
  let best: MarginHighlight | null = null
  for (const fixture of contestedFixtures(fixtures)) {
    const margin = Math.abs(fixture.yourScore - fixture.theirScore)
    if (!best || margin < best.margin) best = { fixture, margin }
  }
  return best
}

export interface StreakHighlight {
  /** Longest run of consecutive wins, in playing order. */
  length: number
  /** True when that run is still alive at the end of the played fixtures. */
  current: boolean
}

/**
 * Longest run of consecutive wins in playing order. Wins by forfeit count —
 * a win is a win in the standings — but upcoming and in-progress matches are
 * ignored rather than breaking the streak.
 */
export function longestWinStreak(fixtures: readonly PlayerFixture[]): StreakHighlight {
  let longest = 0
  let run = 0
  for (const fixture of decidedFixtures(fixtures)) {
    if (fixture.outcome === 'win' || fixture.outcome === 'forfeit_win') {
      run += 1
      if (run > longest) longest = run
    } else {
      run = 0
    }
  }
  return { length: longest, current: longest > 0 && run === longest }
}

/** Every point this pair has put on a scoresheet across the whole day. */
export function totalPointsScored(fixtures: readonly PlayerFixture[]): number {
  return decidedFixtures(fixtures).reduce((sum, f) => sum + f.yourScore, 0)
}

/** Total rallies contested — points for plus points against. */
export function totalRalliesPlayed(fixtures: readonly PlayerFixture[]): number {
  return decidedFixtures(fixtures).reduce((sum, f) => sum + f.yourScore + f.theirScore, 0)
}

/** Share of all rallies this pair won, 0–1. Returns `null` with nothing played. */
export function pointWinRate(fixtures: readonly PlayerFixture[]): number | null {
  const rallies = totalRalliesPlayed(fixtures)
  if (rallies === 0) return null
  return totalPointsScored(fixtures) / rallies
}

/** A single festive stat tile. */
export interface FunStat {
  key: string
  emoji: string
  label: string
  /** Big number/short string shown in the tile. */
  value: string
  /** One line of context under the value. */
  detail: string
}

export interface FunStatsInput {
  fixtures: readonly PlayerFixture[]
  duties: readonly PlayerDuty[]
  record: PlayerRecord
}

/**
 * The six festive stat tiles on a profile. Always returns all six, with
 * honest "nothing yet" copy where a stat can't be computed, so the grid
 * never collapses into a ragged layout for a player who hasn't played.
 */
export function funStats({ fixtures, duties, record }: FunStatsInput): FunStat[] {
  const sleigh = biggestWinMargin(fixtures)
  const closest = closestGame(fixtures)
  const streak = longestWinStreak(fixtures)
  const scored = totalPointsScored(fixtures)
  const rallies = totalRalliesPlayed(fixtures)
  const rate = pointWinRate(fixtures)
  const officiated = duties.length
  const officiatedMatches = new Set(duties.map((d) => d.match.id)).size

  return [
    {
      key: 'sleigh-ride',
      emoji: '🛷',
      label: 'Biggest sleigh ride',
      value: sleigh ? `+${sleigh.margin}` : '—',
      detail: sleigh
        ? `${sleigh.fixture.yourScore}–${sleigh.fixture.theirScore} over ${sleigh.fixture.opponentName}`
        : 'No wins on the board yet — the shuttles are still warming up.',
    },
    {
      key: 'yule-log-streak',
      emoji: '🔥',
      label: 'Yule log streak',
      value: streak.length > 0 ? `${streak.length}` : '—',
      detail:
        streak.length === 0
          ? 'A streak starts with one win. Plenty of Christmas left.'
          : streak.current
            ? `${streak.length} win${streak.length === 1 ? '' : 's'} in a row and still burning.`
            : `Best run of ${streak.length} straight win${streak.length === 1 ? '' : 's'}.`,
    },
    {
      key: 'cliffhanger',
      emoji: '🕯️',
      label: 'Closest cliffhanger',
      value: closest ? `${closest.margin}` : '—',
      detail: closest
        ? `${closest.fixture.yourScore}–${closest.fixture.theirScore} v ${closest.fixture.opponentName} — decided by ${closest.margin} point${closest.margin === 1 ? '' : 's'}.`
        : 'No finished games yet, so no fingernails harmed.',
    },
    {
      key: 'points-under-the-tree',
      emoji: '🎁',
      label: 'Points under the tree',
      value: `${scored}`,
      detail:
        record.played > 0
          ? `Scored across ${record.played} round-robin game${record.played === 1 ? '' : 's'} and every knockout.`
          : 'Every point of the day lands here once play starts.',
    },
    {
      key: 'shuttles-flown',
      emoji: '🏸',
      label: 'Rallies contested',
      value: `${rallies}`,
      detail:
        rate == null
          ? 'Rallies played, for and against — the day is still ahead.'
          : `${Math.round(rate * 100)}% of all rallies won.`,
    },
    {
      key: 'elf-on-duty',
      emoji: '🧝',
      label: 'Elf on duty',
      value: `${officiated}`,
      detail:
        officiated === 0
          ? 'No officiating duties rostered — enjoy the sideline.'
          : `Umpiring, scoresheets and lines across ${officiatedMatches} match${officiatedMatches === 1 ? '' : 'es'}.`,
    },
  ]
}

// ---------------------------------------------------------------------------
// Profile assembly
// ---------------------------------------------------------------------------

/** Where this pair sits in its division's round robin. */
export interface ProfileStanding {
  rank: number | null
  totalPairs: number
  inTopFour: boolean
  tiebreak: PublicStandingRow['tiebreak'] | null
}

export interface PlayerProfile {
  handle: string
  playerId: string
  name: string
  /** Up to two letters for the bauble avatar, e.g. "AN". */
  initials: string
  team: PublicTeam
  partner: PublicPlayer | null
  partnerHandle: string | null
  division: PublicDivisionInfo | null
  seed: number | null
  record: PlayerRecord
  standing: ProfileStanding
  podium: Podium
  fixtures: PlayerFixture[]
  duties: PlayerDuty[]
  stats: FunStat[]
  /** One-line festive summary, reused for the page's share description. */
  headline: string
}

export interface BuildPlayerProfileInput {
  entry: PlayerDirectoryEntry
  matches: readonly PublicMatch[]
  standings: readonly PublicStandingRow[]
  division: PublicDivisionInfo | null
}

/** Two-letter initials, falling back to a single letter or a shuttlecock. */
export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '🏸'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

const PODIUM_HEADLINE: Record<Exclude<Podium, null>, string> = {
  champion: 'Christmas champion 🏆',
  runner_up: 'Runner-up — silver bells 🥈',
  third: 'Third place — bronze bauble 🥉',
  fourth: 'Semi-finalist 🎄',
}

/** The festive one-liner under a player's name, also used as the OG description. */
export function profileHeadline(input: {
  name: string
  teamName: string
  divisionName: string | null
  record: PlayerRecord
  standing: ProfileStanding
  podium: Podium
}): string {
  const { name, teamName, divisionName, record, standing, podium } = input
  const where = divisionName ? ` in ${divisionName}` : ''

  if (podium) {
    return `${name} of ${teamName} — ${PODIUM_HEADLINE[podium]}${where} at the Sunday Smashers Christmas Mini Tournament.`
  }
  if (record.played === 0) {
    return `${name} plays for ${teamName}${where} at the Sunday Smashers Christmas Mini Tournament. Not a shuttle struck yet — the best is ahead. 🎄`
  }

  const diff = record.pointDiff > 0 ? `+${record.pointDiff}` : `${record.pointDiff}`
  const rank =
    standing.rank == null
      ? ''
      : standing.inTopFour
        ? ` Ranked ${standing.rank} of ${standing.totalPairs} and inside the semi-final cut.`
        : ` Ranked ${standing.rank} of ${standing.totalPairs}.`
  return `${name} of ${teamName}${where}: ${record.wins}–${record.losses} with a ${diff} point difference.${rank}`
}

/** Assembles a full profile from already-fetched public data. Pure. */
export function buildPlayerProfile({
  entry,
  matches,
  standings,
  division,
}: BuildPlayerProfileInput): PlayerProfile {
  const divisionMatches = matches.filter((m) => m.division === entry.division)
  const fixtures = playerFixtures(divisionMatches, entry.team.id)
  const duties = playerDuties(matches, { id: entry.playerId, name: entry.name }, entry.team.id)

  const divisionStandings = standings.filter((row) => row.team.division === entry.division)
  const row = divisionStandings.find((r) => r.teamId === entry.team.id) ?? null
  const record = recordFor(divisionStandings, entry.team.id)

  const standing: ProfileStanding = {
    rank: row?.rank ?? null,
    totalPairs: divisionStandings.length,
    inTopFour: row != null && row.rank <= TOP_FOUR_CUT,
    tiebreak: row?.tiebreak ?? null,
  }

  const podium = podiumFor(fixtures, entry.team.id)
  const stats = funStats({ fixtures, duties, record })

  return {
    handle: entry.handle,
    playerId: entry.playerId,
    name: entry.name,
    initials: initialsFor(entry.name),
    team: entry.team,
    partner: entry.partner,
    partnerHandle: entry.partnerHandle,
    division,
    seed: entry.team.seed,
    record,
    standing,
    podium,
    fixtures,
    duties,
    stats,
    headline: profileHeadline({
      name: entry.name,
      teamName: entry.team.name,
      divisionName: division?.name ?? null,
      record,
      standing,
      podium,
    }),
  }
}

// ---------------------------------------------------------------------------
// Data access (browser Supabase client via `@/lib/public-data`, or demo data)
// ---------------------------------------------------------------------------

interface ProfileSource {
  directory: PlayerDirectoryEntry[]
  matches: PublicMatch[]
  standings: PublicStandingRow[]
  divisions: PublicDivisionInfo[]
}

async function loadProfileSource(): Promise<ProfileSource> {
  const [matches, standingsByDivision, divisions] = await Promise.all([
    getSchedule(),
    getStandings(),
    getDivisions(),
  ])

  const standings = standingsByDivision.flatMap((d) => d.rows)
  const teams: PublicTeam[] = []
  const seen = new Set<string>()
  for (const row of standings) {
    if (seen.has(row.team.id)) continue
    seen.add(row.team.id)
    teams.push(row.team)
  }
  // A pair with no standings row at all (e.g. a division whose round robin
  // hasn't been generated) still deserves a profile, so sweep the schedule.
  for (const match of matches) {
    for (const team of [match.teamA, match.teamB]) {
      if (!team || seen.has(team.id)) continue
      seen.add(team.id)
      teams.push(team)
    }
  }

  return { directory: buildPlayerDirectory(sortTeams(teams)), matches, standings, divisions }
}

/** Division, then pair seed, then name — a stable, human order for handles. */
function sortTeams(teams: readonly PublicTeam[]): PublicTeam[] {
  return [...teams].sort(
    (a, b) =>
      a.division.localeCompare(b.division) ||
      (a.seed ?? Number.MAX_SAFE_INTEGER) - (b.seed ?? Number.MAX_SAFE_INTEGER) ||
      a.name.localeCompare(b.name),
  )
}

/** Every player with a public profile, ordered by division then pair seed. */
export async function getPlayerDirectory(): Promise<PlayerDirectoryEntry[]> {
  const { directory } = await loadProfileSource()
  return directory
}

/** Loads one player's profile, or `null` when the handle matches nobody. */
export async function getPlayerProfile(handleOrId: string): Promise<PlayerProfile | null> {
  const { directory, matches, standings, divisions } = await loadProfileSource()
  const entry = resolvePlayer(directory, handleOrId)
  if (!entry) return null
  const division = divisions.find((d) => d.slug === entry.division) ?? null
  return buildPlayerProfile({ entry, matches, standings, division })
}
