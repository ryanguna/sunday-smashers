/**
 * Realistic demo fixtures for the courtside TV scoreboard.
 *
 * Used whenever `isSupabaseConfigured()` is false (the default for local
 * dev, CI builds and the Playwright smoke tests) so `/tv` and `/tv/[court]`
 * are fully reviewable without a database. Standings and the semis bracket
 * are computed with the *real* engine in `src/lib/draw.ts` — nothing here
 * is hand-faked ranking data.
 */

import {
  computeStandings,
  DEFAULT_ELIMS_RULES,
  DEFAULT_FINALS_RULES,
  generateKnockout,
  type PlayedMatch,
} from '@/lib/draw'
import type {
  CourtSnapshot,
  TvBracket,
  TvDutyAssignment,
  TvStandings,
  TvTeam,
} from './types'

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

const MENS_TEAMS: TvTeam[] = [
  { id: 'm-tinsel', name: 'The Tinsel Smashers', players: ['Aroha', 'Ben'] },
  { id: 'm-sleigh', name: 'Sleigh Servers', players: ['Chris', 'Dev'] },
  { id: 'm-holly', name: 'Holly Jolly Smash', players: ['Ezra', 'Finn'] },
  { id: 'm-frost', name: 'Frostbite Flickers', players: ['Gus', 'Hemi'] },
  { id: 'm-carol', name: 'Carol Crushers', players: ['Ivan', 'Jai'] },
  { id: 'm-mistle', name: 'Mistletoe Mashers', players: ['Kai', 'Leo'] },
]

const WOMENS_TEAMS: TvTeam[] = [
  { id: 'w-baubl', name: 'Bauble Bashers', players: ['Amy', 'Bree'] },
  { id: 'w-snow', name: 'Snowdrop Smashers', players: ['Cleo', 'Dana'] },
  { id: 'w-star', name: 'Starlight Rally', players: ['Eva', 'Faith'] },
  { id: 'w-ginger', name: 'Gingerbread Girls', players: ['Grace', 'Hana'] },
  { id: 'w-candy', name: 'Candy Cane Crew', players: ['Ivy', 'Jade'] },
  { id: 'w-noel', name: 'Noel Knockouts', players: ['Kira', 'Lucy'] },
]

const teamById = new Map<string, TvTeam>([
  ...MENS_TEAMS.map((t) => [t.id, t] as const),
  ...WOMENS_TEAMS.map((t) => [t.id, t] as const),
])

function names(ids: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const id of ids) out[id] = teamById.get(id)?.name ?? id
  return out
}

// ---------------------------------------------------------------------------
// Played elimination results (hand-picked so standings are interesting —
// a mix of close and lopsided games across both divisions).
// ---------------------------------------------------------------------------

const MENS_PLAYED: PlayedMatch[] = [
  { teamA: 'm-tinsel', teamB: 'm-sleigh', pointsA: 15, pointsB: 9 },
  { teamA: 'm-holly', teamB: 'm-frost', pointsA: 15, pointsB: 12 },
  { teamA: 'm-carol', teamB: 'm-mistle', pointsA: 8, pointsB: 15 },
  { teamA: 'm-tinsel', teamB: 'm-holly', pointsA: 15, pointsB: 6 },
  { teamA: 'm-sleigh', teamB: 'm-carol', pointsA: 15, pointsB: 13 },
  { teamA: 'm-frost', teamB: 'm-mistle', pointsA: 9, pointsB: 15 },
  { teamA: 'm-tinsel', teamB: 'm-carol', pointsA: 15, pointsB: 4 },
  { teamA: 'm-mistle', teamB: 'm-sleigh', pointsA: 15, pointsB: 11 },
  { teamA: 'm-holly', teamB: 'm-carol', pointsA: 15, pointsB: 10 },
  { teamA: 'm-frost', teamB: 'm-sleigh', pointsA: 0, pointsB: 15, forfeitedBy: 'm-frost' },
]

const WOMENS_PLAYED: PlayedMatch[] = [
  { teamA: 'w-baubl', teamB: 'w-snow', pointsA: 15, pointsB: 11 },
  { teamA: 'w-star', teamB: 'w-ginger', pointsA: 15, pointsB: 13 },
  { teamA: 'w-candy', teamB: 'w-noel', pointsA: 12, pointsB: 15 },
  { teamA: 'w-baubl', teamB: 'w-star', pointsA: 15, pointsB: 8 },
  { teamA: 'w-snow', teamB: 'w-candy', pointsA: 15, pointsB: 7 },
  { teamA: 'w-ginger', teamB: 'w-noel', pointsA: 10, pointsB: 15 },
  { teamA: 'w-baubl', teamB: 'w-candy', pointsA: 15, pointsB: 5 },
  { teamA: 'w-noel', teamB: 'w-snow', pointsA: 15, pointsB: 12 },
  { teamA: 'w-star', teamB: 'w-candy', pointsA: 15, pointsB: 9 },
]

// The live match in progress right now, on Court 1: mens elims, mid-game.
export const DEMO_LIVE_MENS: PlayedMatch = {
  teamA: 'm-mistle',
  teamB: 'm-tinsel',
  pointsA: 11,
  pointsB: 9,
}

export function mensStandings(): TvStandings {
  const ids = MENS_TEAMS.map((t) => t.id)
  const rows = computeStandings(ids, MENS_PLAYED, DEFAULT_ELIMS_RULES)
  return {
    division: 'mens',
    divisionLabel: "Men's Doubles",
    rows,
    teamNames: names(ids),
  }
}

export function womensStandings(): TvStandings {
  const ids = WOMENS_TEAMS.map((t) => t.id)
  const rows = computeStandings(ids, WOMENS_PLAYED, DEFAULT_ELIMS_RULES)
  return {
    division: 'womens',
    divisionLabel: "Women's Doubles",
    rows,
    teamNames: names(ids),
  }
}

export function mensBracket(): TvBracket {
  const standings = mensStandings().rows
  const fixtures = generateKnockout(standings, undefined, DEFAULT_FINALS_RULES)
  return {
    division: 'mens',
    divisionLabel: "Men's Doubles",
    fixtures,
    teamNames: names(MENS_TEAMS.map((t) => t.id)),
  }
}

export function womensBracket(): TvBracket {
  const standings = womensStandings().rows
  const fixtures = generateKnockout(standings, undefined, DEFAULT_FINALS_RULES)
  return {
    division: 'womens',
    divisionLabel: "Women's Doubles",
    fixtures,
    teamNames: names(WOMENS_TEAMS.map((t) => t.id)),
  }
}

const DEMO_DUTIES: TvDutyAssignment[] = [
  { role: 'umpire_scorer', playerName: 'Gus' },
  { role: 'scoresheet', playerName: 'Hemi' },
  { role: 'line_judge', playerName: 'Ivan' },
  { role: 'line_judge', playerName: 'Jai' },
]

export function getDemoCourtSnapshot(court: string): CourtSnapshot {
  const bothStandings = [mensStandings(), womensStandings()]
  const bothBrackets = [mensBracket(), womensBracket()]

  if (court === 'court-2') {
    // Court 2 is between matches right now — a good demo of the idle state
    // on a per-court basis (as opposed to the whole pre-tournament idle view).
    return {
      court,
      courtLabel: 'Court 2',
      live: null,
      upNext: {
        matchId: 'w-noel-vs-w-star',
        court,
        division: 'womens',
        divisionLabel: "Women's Doubles",
        stage: 'elims',
        stageLabel: 'Elimination',
        teamA: teamById.get('w-noel')!,
        teamB: teamById.get('w-star')!,
        scheduledLabel: 'Next up',
        duties: [
          { role: 'umpire_scorer', playerName: 'Ivy' },
          { role: 'scoresheet', playerName: 'Jade' },
          { role: 'line_judge', playerName: 'Grace' },
          { role: 'line_judge', playerName: 'Hana' },
        ],
      },
      laterOnCourt: [
        {
          matchId: 'w-baubl-vs-w-candy-2',
          stageLabel: 'Elimination',
          teamA: teamById.get('w-baubl')!,
          teamB: teamById.get('w-candy')!,
          scheduledLabel: 'Then',
        },
        {
          matchId: 'w-ginger-vs-w-snow-2',
          stageLabel: 'Elimination',
          teamA: teamById.get('w-ginger')!,
          teamB: teamById.get('w-snow')!,
          scheduledLabel: 'After that',
        },
      ],
      standings: bothStandings,
      bracket: bothBrackets,
    }
  }

  // Default: court-1 (or any other court slug) gets the live centrepiece
  // match, so the scoreboard is always demonstrable regardless of slug.
  const courtLabel = court
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

  return {
    court,
    courtLabel,
    live: {
      matchId: 'm-mistle-vs-m-tinsel',
      court,
      division: 'mens',
      divisionLabel: "Men's Doubles",
      stage: 'elims',
      stageLabel: 'Elimination',
      teamA: teamById.get(DEMO_LIVE_MENS.teamA)!,
      teamB: teamById.get(DEMO_LIVE_MENS.teamB)!,
      pointsA: DEMO_LIVE_MENS.pointsA,
      pointsB: DEMO_LIVE_MENS.pointsB,
      pointsToWin: DEFAULT_ELIMS_RULES.pointsToWin,
      deuce: DEFAULT_ELIMS_RULES.deuce,
      server: 'a',
      status: 'live',
      forfeitedBy: null,
      // Fixed offset (not Date.now()) so server and client render identically.
      startedAt: null,
      endedAt: null,
    },
    upNext: {
      matchId: 'm-holly-vs-m-frost-2',
      court,
      division: 'mens',
      divisionLabel: "Men's Doubles",
      stage: 'elims',
      stageLabel: 'Elimination',
      teamA: teamById.get('m-holly')!,
      teamB: teamById.get('m-frost')!,
      scheduledLabel: 'Next up',
      duties: DEMO_DUTIES,
    },
    laterOnCourt: [
      {
        matchId: 'm-carol-vs-m-sleigh-2',
        stageLabel: 'Elimination',
        teamA: teamById.get('m-carol')!,
        teamB: teamById.get('m-sleigh')!,
        scheduledLabel: 'Then',
      },
      {
        matchId: 'm-tinsel-vs-m-frost-2',
        stageLabel: 'Elimination',
        teamA: teamById.get('m-tinsel')!,
        teamB: teamById.get('m-frost')!,
        scheduledLabel: 'After that',
      },
    ],
    standings: bothStandings,
    bracket: bothBrackets,
  }
}

export const DEMO_COURTS = ['court-1', 'court-2'] as const
