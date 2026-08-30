/**
 * Rich, internally-consistent demo fixtures for the public tournament pages
 * (`/standings`, `/schedule`, `/bracket`, `/live`, `/players`).
 *
 * Used whenever `isSupabaseConfigured()` is false (the default for local
 * dev, CI builds and the Playwright smoke tests) so every public page is
 * fully reviewable without a database. Standings, the knockout bracket and
 * the duty roster are all computed with the *real* engines in
 * `src/lib/draw.ts` and `src/lib/schedule.ts` — nothing here is hand-faked
 * ranking or officiating data, only the raw match scores are.
 *
 * The story this data tells:
 *   - Men's Doubles: the full day is done — round robin, semis, third place
 *     and the championship have all been played, so the podium is decided.
 *   - Women's Doubles: the round robin has finished and both semi finals are
 *     currently being played (the "live" matches), with the Battle for 3rd
 *     and Championship still ahead — so the bracket page's placeholder
 *     sources ("Winner of M1", "Loser of M2") are still visible.
 *   - One elims match (Men's) ends in a forfeit, so the schedule page has a
 *     real forfeit badge to show.
 *
 * `src/lib/tv/demo-data.ts` is a *different* agent's fixtures for the
 * courtside TV scoreboard — unrelated, do not merge with this file.
 */

import type { MatchStatus } from '@/lib/supabase/types'
import {
  computeStandings,
  DEFAULT_ELIMS_RULES,
  DEFAULT_FINALS_RULES,
  finalPlacings,
  generateKnockout,
  generateRoundRobin,
  type FinalPlacings,
  type KnockoutFixture,
  type MatchStage,
  type PlayedMatch,
  type StageRules,
  type StandingRow,
  type TeamId,
} from './draw'
import {
  assignToCourts,
  deriveDutyRoster,
  mulberry32,
  type Court,
  type DutyAssignment,
  type FixtureToSchedule,
  type TeamRoster,
  type TimeSlot,
} from './schedule'

export type DivisionSlug = 'mens_doubles' | 'womens_doubles'

export interface DemoDivisionInfo {
  slug: DivisionSlug
  name: string
  gender: 'mens' | 'womens'
  elimsRules: StageRules
  finalsRules: StageRules
}

export interface DemoPlayer {
  id: string
  name: string
}

export interface DemoTeam {
  id: TeamId
  division: DivisionSlug
  name: string
  seed: number
  players: DemoPlayer[]
}

/**
 * Statuses the demo dataset can produce.
 *
 * Derived from `MatchStatus` rather than re-listed, so adding a status to the
 * database union surfaces here instead of silently leaving demo mode unable to
 * represent it. `cancelled` is excluded because the demo tournament never
 * calls a match off.
 */
export type DemoMatchStatus = Exclude<MatchStatus, 'cancelled'>

/** One duty roster row, resolved to a display name plus the stable player id. */
export interface DemoDutyAssignment {
  role: DutyAssignment['role']
  /** Synthetic demo player id (e.g. `w-candy-p1`) — stable, and not PII. */
  playerId: string
  playerName: string
  source: DutyAssignment['source']
}

export interface DemoMatch {
  /** Stable id, `${court}#${slotIndex}`. */
  id: string
  division: DivisionSlug
  stage: MatchStage
  bracketKey?: 'M1' | 'M2' | 'THIRD' | 'FINAL'
  court: Court
  slotIndex: number
  slotLabel: string
  teamA: TeamId | null
  teamB: TeamId | null
  /** Human placeholder source when a knockout team isn't decided yet, e.g. "Winner of M1". */
  sourceA: string | null
  sourceB: string | null
  status: DemoMatchStatus
  scoreA: number
  scoreB: number
  pointsToWin: number
  deuce: boolean
  forfeitedBy: TeamId | null
  winnerTeamId: TeamId | null
  duties: DemoDutyAssignment[]
}

export interface DemoDivisionBundle {
  division: DemoDivisionInfo
  teams: DemoTeam[]
  standings: StandingRow[]
  matches: DemoMatch[]
  knockout: KnockoutFixture[]
  placings: FinalPlacings
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

interface TeamDef {
  id: TeamId
  name: string
  seed: number
  players: [string, string]
}

const MENS_TEAM_DEFS: TeamDef[] = [
  { id: 'm-tinsel', name: 'Tinsel Titans', seed: 1, players: ['Aroha Ngata', 'Ben Cole'] },
  { id: 'm-sleigh', name: 'Sleigh Servers', seed: 2, players: ['Chris Doyle', 'Dev Patel'] },
  { id: 'm-holly', name: 'Holly Jolly Smash', seed: 3, players: ['Ezra Wills', 'Finn Ahern'] },
  { id: 'm-frost', name: 'Frostbite Flickers', seed: 4, players: ['Gus Reyes', 'Hemi Ropata'] },
  { id: 'm-carol', name: 'Carol Crushers', seed: 5, players: ['Ivan Petrov', 'Jai Sharma'] },
  { id: 'm-mistle', name: 'Mistletoe Mashers', seed: 6, players: ['Kai Wiremu', 'Leo Novak'] },
  { id: 'm-eggnog', name: 'Eggnog Enforcers', seed: 7, players: ['Marco Silva', 'Noa Green'] },
  { id: 'm-rein', name: 'Reindeer Rally', seed: 8, players: ['Omar Hassan', 'Pita Fifita'] },
  { id: 'm-netters', name: 'North Pole Netters', seed: 9, players: ['Quinn Baxter', 'Rhys Cooper'] },
  { id: 'm-gable', name: 'Gingerbread Generals', seed: 10, players: ['Sione Taufa', 'Toa Ripeka'] },
  { id: 'm-yule', name: 'Yule Log Legends', seed: 11, players: ['Umar Khan', 'Vince Alofa'] },
]

const WOMENS_TEAM_DEFS: TeamDef[] = [
  { id: 'w-baubl', name: 'Bauble Bashers', seed: 1, players: ['Amy Chen', 'Bree Walsh'] },
  { id: 'w-snow', name: 'Snowdrop Smashers', seed: 2, players: ['Cleo Manu', 'Dana Fox'] },
  { id: 'w-star', name: 'Starlight Rally', seed: 3, players: ['Eva Marsh', 'Faith Tuilagi'] },
  { id: 'w-ginger', name: 'Gingerbread Girls', seed: 4, players: ['Grace Iosefo', 'Hana Watene'] },
  { id: 'w-candy', name: 'Candy Cane Crew', seed: 5, players: ['Ivy Novak', 'Jade Kupenga'] },
  { id: 'w-noel', name: 'Noel Knockouts', seed: 6, players: ['Kira Ah Chong', 'Lucy Baker'] },
  { id: 'w-berry', name: 'Holly Berry Smashers', seed: 7, players: ['Mila Petelo', 'Nadia Osei'] },
  { id: 'w-frostb', name: 'Frosted Forehands', seed: 8, players: ['Olivia Tan', 'Priya Nair'] },
  { id: 'w-sugar', name: 'Sugarplum Smackers', seed: 9, players: ['Queenie Latu', 'Rosa Delgado'] },
  { id: 'w-jingle', name: 'Jingle Ballers', seed: 10, players: ['Sasha Moe', 'Tui Faleolo'] },
  { id: 'w-cocoa', name: 'Cocoa Crushers', seed: 11, players: ['Uma Reddy', 'Vera Kalani'] },
]

export const DEMO_DIVISIONS: DemoDivisionInfo[] = [
  {
    slug: 'mens_doubles',
    name: "Men's Doubles",
    gender: 'mens',
    elimsRules: DEFAULT_ELIMS_RULES,
    finalsRules: DEFAULT_FINALS_RULES,
  },
  {
    slug: 'womens_doubles',
    name: "Women's Doubles",
    gender: 'womens',
    elimsRules: DEFAULT_ELIMS_RULES,
    finalsRules: DEFAULT_FINALS_RULES,
  },
]

function toTeams(defs: TeamDef[], division: DivisionSlug): DemoTeam[] {
  return defs.map((d) => ({
    id: d.id,
    division,
    name: d.name,
    seed: d.seed,
    players: d.players.map((name, i) => ({ id: `${d.id}-p${i + 1}`, name })),
  }))
}

// ---------------------------------------------------------------------------
// Time slots
// ---------------------------------------------------------------------------

/** Generates `count` 15-minute time slots starting at 9:00am, offset by `startIndex`. */
function buildSlots(count: number, startIndex = 0): TimeSlot[] {
  return Array.from({ length: count }, (_, i) => {
    const idx = startIndex + i
    const totalMinutes = 9 * 60 + idx * 15
    const hour24 = Math.floor(totalMinutes / 60)
    const minute = totalMinutes % 60
    const hour12 = ((hour24 + 11) % 12) + 1
    const ampm = hour24 < 12 ? 'am' : 'pm'
    return { index: idx, label: `${hour12}:${minute.toString().padStart(2, '0')}${ampm}` }
  })
}

// ---------------------------------------------------------------------------
// Elims: round robin scores
// ---------------------------------------------------------------------------

/** Deterministic pseudo-scores for a full round robin, with one optional forfeit. */
function playElims(
  teamIds: readonly TeamId[],
  seed: number,
  forfeitFixtureIndex: number | null,
): { fixtures: ReturnType<typeof generateRoundRobin>; played: PlayedMatch[] } {
  const fixtures = generateRoundRobin(teamIds)
  const rng = mulberry32(seed)
  const played: PlayedMatch[] = fixtures.map((f, i) => {
    if (forfeitFixtureIndex === i) {
      return { teamA: f.teamA, teamB: f.teamB, pointsA: 15, pointsB: 0, forfeitedBy: f.teamB }
    }
    const r = rng()
    const winnerIsA = r > 0.45
    const loserScore = Math.floor(rng() * 13)
    return {
      teamA: f.teamA,
      teamB: f.teamB,
      pointsA: winnerIsA ? 15 : loserScore,
      pointsB: winnerIsA ? loserScore : 15,
    }
  })
  return { fixtures, played }
}

const PLACEHOLDER_TEAM_PREFIX = 'TBD-'

function isPlaceholderTeam(id: TeamId | null): boolean {
  return !!id && id.startsWith(PLACEHOLDER_TEAM_PREFIX)
}

/** Builds every scheduled/played/live match for one division, plus its duty roster. */
function buildDivision(
  info: DemoDivisionInfo,
  teamDefs: TeamDef[],
  seed: number,
  forfeitFixtureIndex: number | null,
  semisLive: boolean,
): DemoDivisionBundle {
  const teams = toTeams(teamDefs, info.slug)
  const teamIds = teams.map((t) => t.id)
  const roster: TeamRoster = new Map(teams.map((t) => [t.id, t.players.map((p) => p.id)]))
  const nameByPlayerId = new Map(teams.flatMap((t) => t.players.map((p) => [p.id, p.name] as const)))

  const courts: Court[] = info.slug === 'mens_doubles' ? ['Court 1', 'Court 2', 'Court 3'] : ['Court 4', 'Court 5', 'Court 6']

  const { fixtures, played } = playElims(teamIds, seed, forfeitFixtureIndex)
  const elimsToSchedule: FixtureToSchedule[] = fixtures.map((f) => ({ fixture: f, division: info.slug, stage: 'elims' }))
  const elimsResult = assignToCourts(elimsToSchedule, courts, buildSlots(20), {})
  const maxElimSlot = Math.max(0, ...elimsResult.schedule.map((m) => m.slot.index))

  const standings = computeStandings(teamIds, played, info.elimsRules)
  const knockoutPreSemis = generateKnockout(standings, undefined, info.finalsRules)
  const m1Fixture = knockoutPreSemis[0]
  const m2Fixture = knockoutPreSemis[1]

  // Semis: Men's fully played; Women's currently in progress (the "live" matches).
  const semiSlots = buildSlots(4, maxElimSlot + 2)
  const semiToSchedule: FixtureToSchedule[] = [
    { fixture: { round: 0, teamA: m1Fixture.teamA!, teamB: m1Fixture.teamB! }, division: info.slug, stage: 'semi' },
    { fixture: { round: 0, teamA: m2Fixture.teamA!, teamB: m2Fixture.teamB! }, division: info.slug, stage: 'semi' },
  ]
  const semiResult = assignToCourts(semiToSchedule, courts, semiSlots, {})
  const maxSemiSlot = Math.max(0, ...semiResult.schedule.map((m) => m.slot.index))

  const m1Result: PlayedMatch | undefined = semisLive
    ? undefined
    : { teamA: m1Fixture.teamA!, teamB: m1Fixture.teamB!, pointsA: 21, pointsB: 17 }
  const m2Result: PlayedMatch | undefined = semisLive
    ? undefined
    : { teamA: m2Fixture.teamA!, teamB: m2Fixture.teamB!, pointsA: 15, pointsB: 21 }

  const knockoutFinal = generateKnockout(standings, { m1: m1Result, m2: m2Result }, info.finalsRules)
  const thirdFixture = knockoutFinal[2]
  const finalFixture = knockoutFinal[3]

  const tfSlots = buildSlots(4, maxSemiSlot + 2)
  const tfToSchedule: FixtureToSchedule[] = [
    {
      fixture: {
        round: 0,
        teamA: thirdFixture.teamA ?? `${PLACEHOLDER_TEAM_PREFIX}THIRD-A`,
        teamB: thirdFixture.teamB ?? `${PLACEHOLDER_TEAM_PREFIX}THIRD-B`,
      },
      division: info.slug,
      stage: 'third_place',
    },
    {
      fixture: {
        round: 0,
        teamA: finalFixture.teamA ?? `${PLACEHOLDER_TEAM_PREFIX}FINAL-A`,
        teamB: finalFixture.teamB ?? `${PLACEHOLDER_TEAM_PREFIX}FINAL-B`,
      },
      division: info.slug,
      stage: 'final',
    },
  ]
  const tfResult = assignToCourts(tfToSchedule, courts, tfSlots, {})

  const thirdResult: PlayedMatch | undefined =
    !semisLive && thirdFixture.teamA && thirdFixture.teamB
      ? { teamA: thirdFixture.teamA, teamB: thirdFixture.teamB, pointsA: 21, pointsB: 19 }
      : undefined
  const finalResult: PlayedMatch | undefined =
    !semisLive && finalFixture.teamA && finalFixture.teamB
      ? { teamA: finalFixture.teamA, teamB: finalFixture.teamB, pointsA: 21, pointsB: 14 }
      : undefined
  const placings = finalPlacings(finalResult, thirdResult, info.finalsRules)

  const fullSchedule = [...elimsResult.schedule, ...semiResult.schedule, ...tfResult.schedule]
  const dutyResult = deriveDutyRoster(fullSchedule, roster)
  const dutiesByMatchId = new Map<string, DemoDutyAssignment[]>()
  for (const assignment of dutyResult.assignments) {
    const list = dutiesByMatchId.get(assignment.matchId) ?? []
    list.push({
      role: assignment.role,
      playerId: assignment.player ?? '',
      playerName: assignment.player ? nameByPlayerId.get(assignment.player) ?? assignment.player : '',
      source: assignment.source,
    })
    dutiesByMatchId.set(assignment.matchId, list)
  }

  // Keyed by stage + team pair — round robin opponents can meet again in the
  // knockout, so the pair alone isn't a unique key across stages.
  const playedByPair = new Map<string, PlayedMatch>()
  const pairKey = (stage: MatchStage, a: TeamId, b: TeamId) => `${stage}::${[a, b].sort().join('::')}`
  for (const p of played) playedByPair.set(pairKey('elims', p.teamA, p.teamB), p)
  if (m1Result) playedByPair.set(pairKey('semi', m1Result.teamA, m1Result.teamB), m1Result)
  if (m2Result) playedByPair.set(pairKey('semi', m2Result.teamA, m2Result.teamB), m2Result)
  if (thirdResult) playedByPair.set(pairKey('third_place', thirdResult.teamA, thirdResult.teamB), thirdResult)
  if (finalResult) playedByPair.set(pairKey('final', finalResult.teamA, finalResult.teamB), finalResult)

  function toDemoMatch(
    scheduled: (typeof elimsResult.schedule)[number],
    bracketKey?: DemoMatch['bracketKey'],
    sourceA?: string,
    sourceB?: string,
  ): DemoMatch {
    const { teamA, teamB } = scheduled.fixture
    const rules = scheduled.stage === 'elims' ? info.elimsRules : info.finalsRules
    const teamAResolved = isPlaceholderTeam(teamA) ? null : teamA
    const teamBResolved = isPlaceholderTeam(teamB) ? null : teamB

    const result =
      teamAResolved && teamBResolved ? playedByPair.get(pairKey(scheduled.stage, teamAResolved, teamBResolved)) : undefined

    let status: DemoMatchStatus
    let scoreA = 0
    let scoreB = 0
    let winnerTeamId: TeamId | null = null
    let forfeitedBy: TeamId | null = null

    if (!teamAResolved || !teamBResolved) {
      status = 'scheduled'
    } else if (result) {
      status = result.forfeitedBy ? 'forfeited' : 'completed'
      scoreA = result.pointsA
      scoreB = result.pointsB
      forfeitedBy = result.forfeitedBy ?? null
      winnerTeamId = result.forfeitedBy
        ? result.forfeitedBy === result.teamA
          ? result.teamB
          : result.teamA
        : result.pointsA > result.pointsB
          ? result.teamA
          : result.teamB
    } else if (scheduled.stage === 'semi' && semisLive) {
      // Live in-progress score for the semis while the round is being played.
      status = 'in_progress'
      const isM1 = scheduled.fixture.teamA === m1Fixture.teamA
      scoreA = isM1 ? 18 : 14
      scoreB = isM1 ? 16 : 19
    } else {
      status = 'scheduled'
    }

    return {
      id: scheduled.id,
      division: info.slug,
      stage: scheduled.stage,
      bracketKey,
      court: scheduled.court,
      slotIndex: scheduled.slot.index,
      slotLabel: scheduled.slot.label ?? '',
      teamA: teamAResolved,
      teamB: teamBResolved,
      sourceA: teamAResolved ? null : (sourceA ?? null),
      sourceB: teamBResolved ? null : (sourceB ?? null),
      status,
      scoreA,
      scoreB,
      pointsToWin: rules.pointsToWin,
      deuce: rules.deuce,
      forfeitedBy,
      winnerTeamId,
      duties: dutiesByMatchId.get(scheduled.id) ?? [],
    }
  }

  const matches: DemoMatch[] = [
    ...elimsResult.schedule.map((s) => toDemoMatch(s)),
    toDemoMatch(semiResult.schedule[0], 'M1', 'Rank 1', 'Rank 4'),
    toDemoMatch(semiResult.schedule[1], 'M2', 'Rank 2', 'Rank 3'),
    toDemoMatch(tfResult.schedule[0], 'THIRD', 'Loser of M1', 'Loser of M2'),
    toDemoMatch(tfResult.schedule[1], 'FINAL', 'Winner of M1', 'Winner of M2'),
  ]
  matches.sort((a, b) => a.slotIndex - b.slotIndex || a.court.localeCompare(b.court))

  return { division: info, teams, standings, matches, knockout: knockoutFinal, placings }
}

// Men's Doubles: whole day complete, forfeit at elims fixture #20, semis played out.
const MENS_BUNDLE = buildDivision(DEMO_DIVISIONS[0], MENS_TEAM_DEFS, 42, 20, false)
// Women's Doubles: round robin complete, semis in progress right now (live!).
const WOMENS_BUNDLE = buildDivision(DEMO_DIVISIONS[1], WOMENS_TEAM_DEFS, 8, null, true)

const BUNDLES_BY_SLUG: Record<DivisionSlug, DemoDivisionBundle> = {
  mens_doubles: MENS_BUNDLE,
  womens_doubles: WOMENS_BUNDLE,
}

export function getDemoBundle(slug: DivisionSlug): DemoDivisionBundle {
  return BUNDLES_BY_SLUG[slug]
}

export function getAllDemoBundles(): DemoDivisionBundle[] {
  return DEMO_DIVISIONS.map((d) => BUNDLES_BY_SLUG[d.slug])
}
