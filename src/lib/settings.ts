/**
 * Pure logic for the admin **tournament settings** console (`/admin/settings`).
 *
 * The draft rules from the admin team are explicitly NOT final, so every
 * value that `src/lib/draw.ts` consumes is editable here. This module owns:
 *
 *   - the shape of the editable settings bundle (details, divisions, rules,
 *     courts, time slots, prizes),
 *   - validation of everything an admin can type,
 *   - the mapping onto `StageRules` / `DivisionRow` so the draw engine and
 *     the database stay in lock-step,
 *   - the "what this means" preview maths (11 pairs -> 55 games, 10 each),
 *   - impact analysis so a rules change can never silently invalidate a
 *     published draw or in-progress results,
 *   - role-change safety checks (never lock the last admin out),
 *   - a field-level diff used for the unsaved-changes bar and `audit_log`.
 *
 * Everything here is dependency-free and synchronous so it can be unit
 * tested (`settings.test.ts`) and shared by Server Components, Server
 * Actions and Client Components alike.
 */

import {
  DEFAULT_ELIMS_RULES,
  DEFAULT_FINALS_RULES,
  gamesPerTeam,
  totalRoundRobinMatches,
  type StageRules,
} from './draw'
import {
  PRE_REGISTRATION_OPENS_AT,
  REGISTRATION_CLOSES_AT,
  TOURNAMENT_DATE,
} from './tournament'
import type { DivisionGender } from './supabase/types'

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

/** Mirrors `MatchStage` in `src/lib/draw.ts`. */
export type StageKey = 'elims' | 'semi' | 'third_place' | 'final'

export const STAGE_KEYS = ['elims', 'semi', 'third_place', 'final'] as const satisfies readonly StageKey[]

export const STAGE_LABELS: Record<StageKey, string> = {
  elims: 'Round robin',
  semi: 'Semi finals',
  third_place: 'Battle for 3rd',
  final: 'Championship final',
}

export const STAGE_BLURBS: Record<StageKey, string> = {
  elims: 'Every pair plays every other pair once. Wins decide the ranking.',
  semi: 'Top qualifiers only. M1 = Rank 1 v Rank 4, M2 = Rank 2 v Rank 3.',
  third_place: 'The two semi final losers play off for the bronze.',
  final: 'The two semi final winners play for the Championship.',
}

// ---------------------------------------------------------------------------
// Settings shapes
// ---------------------------------------------------------------------------

export interface StageRulesConfig {
  /** Points needed to win a game. */
  pointsToWin: number
  /** When false the first pair to reach `pointsToWin` wins immediately. */
  deuce: boolean
  /** Hard ceiling, only meaningful when `deuce` is on. */
  cap: number | null
}

export interface RulesConfig {
  stages: Record<StageKey, StageRulesConfig>
  /** How many pairs advance from the round robin to the knockout. */
  qualifyingPlaces: number
}

export interface DivisionSettings {
  id: string
  name: string
  gender: DivisionGender
  /** Maps to `divisions.is_published` — a disabled division accepts no entries. */
  enabled: boolean
  /** Entry cap in *pairs*. `null` means uncapped. Maps to `divisions.max_teams`. */
  maxTeams: number | null
  /** No column exists yet — persisted in the settings extras blob. */
  entryFeeCents: number
  rules: RulesConfig
}

export interface TournamentDetails {
  name: string
  /** ISO timestamp of the first serve. */
  tournamentDate: string
  venueName: string
  venueAddress: string
  description: string
  registrationOpensAt: string
  registrationClosesAt: string
  /**
   * The close date in `src/lib/tournament.ts` is an *assumption* (one week
   * out). Until an admin ticks this box the UI keeps nagging.
   */
  registrationCloseConfirmed: boolean
  contactName: string
  contactEmail: string
  contactPhone: string
  /** What one player pays. This is the figure every player-facing surface
   *  quotes (`/pay`, the landing page), so it lives on the tournament row. */
  entryFeeCents: number
  /** Free text: bank details, "cash to Nadia at the hall", whatever suits. */
  paymentInstructions: string
}

export interface CourtSettings {
  id: string
  name: string
  sortOrder: number
}

export interface TimeSlotSettings {
  id: string
  /** ISO timestamp. */
  startsAt: string
  /** ISO timestamp. */
  endsAt: string
  label: string
}

export interface LootBagItem {
  id: string
  name: string
  /** Quantity per player. */
  quantity: number
  notes: string
}

/**
 * Prize money for one division, **per player**.
 *
 * Doubles pays two people per placing, so a per-pair figure has to be halved
 * in someone's head before it means anything to the player being handed an
 * envelope. Storing the per-player amount is the number the committee counts
 * out, and `totalPrizePoolCents` does the doubling.
 */
export interface DivisionPrize {
  divisionId: string
  championCents: number
  runnerUpCents: number
  thirdPlaceCents: number
  /** Loser of the Battle for 3rd. */
  fourthPlaceCents: number
}

/** Everyone on the podium is a pair, so every placing is paid twice. */
export const PLAYERS_PER_PAIR = 2

/**
 * Which basis the stored amounts were entered on.
 *
 * Prizes used to be recorded **per pair** and were later redefined as **per
 * player**, because that is the figure the committee counts into an envelope.
 * The blob sitting in `site_content` from before that change contains per-pair
 * numbers, and nothing in the JSON says so — read naively, every announced
 * prize silently doubles and the landing page promises money the committee
 * never budgeted.
 *
 * So the basis is written explicitly from now on, and a blob without it is
 * known to be the old format and is halved on read. This is a one-way marker:
 * once rebased and saved, the amount is per player forever.
 */
export type PrizeBasis = 'per-player'

/** The value written into every blob saved by this version onwards. */
export const PRIZE_BASIS: PrizeBasis = 'per-player'

/**
 * Converts a legacy per-pair amount to the per-player equivalent.
 *
 * Rounds rather than truncates so a stray odd cent does not quietly vanish
 * from the pool; amounts are whole dollars in practice.
 */
export function rebasePerPairAmount(cents: number): number {
  return Math.round(cents / PLAYERS_PER_PAIR)
}

export interface PrizeSettings {
  /**
   * Absent means the blob predates the per-pair -> per-player change and its
   * amounts still need halving. See `PrizeBasis`.
   */
  basis?: PrizeBasis
  divisionPrizes: DivisionPrize[]
  trophyCount: number
  medalCount: number
  lootBagItems: LootBagItem[]
  /**
   * Whether the public landing page shows the real amounts.
   *
   * The prize blob itself is stored unpublished because it carries internal
   * notes ("ask Dad for the trophies"), so nothing here reaches anonymous
   * visitors directly. This switch instead controls whether a *display-safe
   * projection* (`publicPrizeBoard`) is published alongside it.
   *
   * Defaults to off: the seeded amounts are placeholders, and a committee
   * mid-way through budgeting must not have draft figures announced for them.
   */
  showOnPublicSite: boolean
}

export interface TournamentSettings {
  details: TournamentDetails
  divisions: DivisionSettings[]
  courts: CourtSettings[]
  timeSlots: TimeSlotSettings[]
  prizes: PrizeSettings
}

/** Live tournament state used to decide how dangerous a rules change is. */
export interface DrawState {
  /** True once the draw has been generated and shown to players. */
  drawPublished: boolean
  matchesScheduled: number
  matchesInProgress: number
  matchesCompleted: number
}

export const EMPTY_DRAW_STATE: DrawState = {
  drawPublished: false,
  matchesScheduled: 0,
  matchesInProgress: 0,
  matchesCompleted: 0,
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_ENTRY_FEE_CENTS = 2500
export const DEFAULT_QUALIFYING_PLACES = 4
export const MAX_POINTS_TO_WIN = 99
export const MIN_POINTS_TO_WIN = 1

function stageConfig(rules: StageRules): StageRulesConfig {
  return { pointsToWin: rules.pointsToWin, deuce: rules.deuce, cap: rules.cap ?? null }
}

/** The draft rules, expressed as an editable config. */
export function defaultRulesConfig(): RulesConfig {
  return {
    stages: {
      elims: stageConfig(DEFAULT_ELIMS_RULES),
      semi: stageConfig(DEFAULT_FINALS_RULES),
      third_place: stageConfig(DEFAULT_FINALS_RULES),
      final: stageConfig(DEFAULT_FINALS_RULES),
    },
    qualifyingPlaces: DEFAULT_QUALIFYING_PLACES,
  }
}

function defaultDivision(id: string, name: string, gender: DivisionGender): DivisionSettings {
  return {
    id,
    name,
    gender,
    enabled: true,
    maxTeams: 11,
    entryFeeCents: DEFAULT_ENTRY_FEE_CENTS,
    rules: defaultRulesConfig(),
  }
}

/** Fifteen-minute slots from 9am, matching the demo schedule. */
function defaultTimeSlots(count = 8): TimeSlotSettings[] {
  const base = new Date(TOURNAMENT_DATE).getTime()
  return Array.from({ length: count }, (_, i) => {
    const startsAt = new Date(base + i * 15 * 60_000).toISOString()
    const endsAt = new Date(base + (i + 1) * 15 * 60_000).toISOString()
    return { id: `slot-${i + 1}`, startsAt, endsAt, label: `Slot ${i + 1}` }
  })
}

/**
 * The settings an admin sees before anything has been saved (and the demo
 * mode fixture). Derived from `src/lib/tournament.ts` so the countdown copy
 * and this console never disagree.
 */
export function defaultTournamentSettings(): TournamentSettings {
  const divisions = [
    defaultDivision('div-mens', "Men's Doubles", 'mens'),
    defaultDivision('div-womens', "Women's Doubles", 'womens'),
  ]

  return {
    details: {
      name: 'Sunday Smashers Christmas Mini Tournament',
      tournamentDate: TOURNAMENT_DATE,
      venueName: 'Sunday Smashers Badminton Hall',
      venueAddress: '',
      description:
        'Smash. Compete. Celebrate. Men’s & Women’s Doubles, cash prizes, trophies & medals, and loot bags for everyone.',
      registrationOpensAt: PRE_REGISTRATION_OPENS_AT,
      registrationClosesAt: REGISTRATION_CLOSES_AT,
      registrationCloseConfirmed: false,
      contactName: 'Sunday Smashers Committee',
      contactEmail: 'hello@sundaysmashers.example',
      contactPhone: '',
      entryFeeCents: DEFAULT_ENTRY_FEE_CENTS,
      paymentInstructions: '',
    },
    divisions,
    courts: [
      { id: 'court-1', name: 'Court 1', sortOrder: 1 },
      { id: 'court-2', name: 'Court 2', sortOrder: 2 },
      { id: 'court-3', name: 'Court 3', sortOrder: 3 },
    ],
    timeSlots: defaultTimeSlots(),
    prizes: {
      basis: PRIZE_BASIS,
      divisionPrizes: divisions.map((d) => ({
        divisionId: d.id,
        // Per player. A champion pair therefore costs $300.
        championCents: 15000,
        runnerUpCents: 7500,
        thirdPlaceCents: 3750,
        fourthPlaceCents: 0,
      })),
      trophyCount: 4,
      medalCount: 16,
      showOnPublicSite: false,
      lootBagItems: [
        { id: 'loot-shuttle', name: 'Shuttlecock tube', quantity: 1, notes: 'Feather, tournament grade' },
        { id: 'loot-grip', name: 'Overgrip', quantity: 2, notes: 'Assorted pastel colours' },
        { id: 'loot-santa', name: 'Santa hat', quantity: 1, notes: 'Mandatory festive headwear' },
        { id: 'loot-candy', name: 'Candy cane', quantity: 2, notes: '' },
      ],
    },
  }
}

// ---------------------------------------------------------------------------
// Mapping onto the draw engine + the database
// ---------------------------------------------------------------------------

/** Converts an editable stage config into the `StageRules` `draw.ts` expects. */
export function toStageRules(config: StageRulesConfig): StageRules {
  const rules: StageRules = { pointsToWin: config.pointsToWin, deuce: config.deuce }
  if (config.deuce && config.cap != null) rules.cap = config.cap
  return rules
}

/** All four stages as `StageRules`, ready to hand to the draw engine. */
export function toStageRulesMap(config: RulesConfig): Record<StageKey, StageRules> {
  return {
    elims: toStageRules(config.stages.elims),
    semi: toStageRules(config.stages.semi),
    third_place: toStageRules(config.stages.third_place),
    final: toStageRules(config.stages.final),
  }
}

/**
 * Shape of a `divisions` row patch.
 *
 * The table only carries *two* rule sets (elims + finals) plus
 * `qualifying_places`, while the console lets admins configure all four
 * stages. The semi final config is written to the `*_finals` columns (it is
 * the canonical knockout rule set) and any third-place / final overrides go
 * into the extras blob — see `divisionExtras`.
 */
export interface DivisionRowPatch {
  name: string
  is_published: boolean
  max_teams: number | null
  points_to_win_elims: number
  deuce_enabled_elims: boolean
  cap_elims: number | null
  points_to_win_finals: number
  deuce_enabled_finals: boolean
  cap_finals: number | null
  qualifying_places: number
}

export function divisionRowPatch(division: DivisionSettings): DivisionRowPatch {
  const { elims, semi } = division.rules.stages
  return {
    name: division.name,
    is_published: division.enabled,
    max_teams: division.maxTeams,
    points_to_win_elims: elims.pointsToWin,
    deuce_enabled_elims: elims.deuce,
    cap_elims: elims.deuce ? elims.cap : null,
    points_to_win_finals: semi.pointsToWin,
    deuce_enabled_finals: semi.deuce,
    cap_finals: semi.deuce ? semi.cap : null,
    qualifying_places: division.rules.qualifyingPlaces,
  }
}

/** Per-division values with no column of their own. */
export interface DivisionExtras {
  entryFeeCents: number
  thirdPlace: StageRulesConfig
  final: StageRulesConfig
}

export function divisionExtras(division: DivisionSettings): DivisionExtras {
  return {
    entryFeeCents: division.entryFeeCents,
    thirdPlace: division.rules.stages.third_place,
    final: division.rules.stages.final,
  }
}

/** Rebuilds editable settings from a `divisions` row plus its extras blob. */
export function divisionSettingsFromRow(
  row: {
    id: string
    name: string
    gender: DivisionGender
    is_published: boolean
    max_teams: number | null
    points_to_win_elims: number
    deuce_enabled_elims: boolean
    cap_elims: number | null
    points_to_win_finals: number
    deuce_enabled_finals: boolean
    cap_finals: number | null
    qualifying_places: number
  },
  extras?: Partial<DivisionExtras> | null,
): DivisionSettings {
  const elims: StageRulesConfig = {
    pointsToWin: row.points_to_win_elims,
    deuce: row.deuce_enabled_elims,
    cap: row.cap_elims,
  }
  const semi: StageRulesConfig = {
    pointsToWin: row.points_to_win_finals,
    deuce: row.deuce_enabled_finals,
    cap: row.cap_finals,
  }

  return {
    id: row.id,
    name: row.name,
    gender: row.gender,
    enabled: row.is_published,
    maxTeams: row.max_teams,
    entryFeeCents: extras?.entryFeeCents ?? DEFAULT_ENTRY_FEE_CENTS,
    rules: {
      stages: {
        elims,
        semi,
        third_place: extras?.thirdPlace ?? { ...semi },
        final: extras?.final ?? { ...semi },
      },
      qualifyingPlaces: row.qualifying_places,
    },
  }
}

// ---------------------------------------------------------------------------
// Preview maths — "what this means"
// ---------------------------------------------------------------------------

export interface RoundRobinPreview {
  teams: number
  /** Total round robin fixtures across the division. */
  totalGames: number
  /** Games each pair plays. */
  gamesEach: number
  /** Rounds produced by the circle method (one pair sits out when odd). */
  rounds: number
  /** True when a pair sits out each round. */
  hasBye: boolean
}

export function roundRobinPreview(teamCount: number): RoundRobinPreview {
  const teams = Math.max(0, Math.floor(teamCount))
  if (teams < 2) {
    return { teams, totalGames: 0, gamesEach: 0, rounds: 0, hasBye: teams === 1 }
  }
  const hasBye = teams % 2 !== 0
  return {
    teams,
    totalGames: totalRoundRobinMatches(teams),
    gamesEach: gamesPerTeam(teams),
    rounds: hasBye ? teams : teams - 1,
    hasBye,
  }
}

/** Knockout fixtures produced for `qualifyingPlaces` qualifiers. */
export function knockoutGameCount(qualifyingPlaces: number): number {
  if (qualifyingPlaces < 2) return 0
  if (qualifyingPlaces === 2) return 1 // straight final
  return 4 // 2 semis + battle for 3rd + championship
}

/** Estimated minutes of court time for one game under the given rules. */
export function estimateGameMinutes(config: StageRulesConfig): number {
  const base = Math.ceil(config.pointsToWin * 0.8)
  return config.deuce ? base + 4 : base
}

export interface DayLoadPreview {
  totalGames: number
  totalCourtMinutes: number
  /** Wall-clock minutes when games run concurrently across `courts`. */
  estimatedMinutes: number
}

export function estimateDayLoad(
  division: DivisionSettings,
  teamCount: number,
  courts: number,
): DayLoadPreview {
  const rr = roundRobinPreview(teamCount)
  const knockouts = knockoutGameCount(division.rules.qualifyingPlaces)
  const rrMinutes = rr.totalGames * estimateGameMinutes(division.rules.stages.elims)
  const koMinutes =
    knockouts === 0
      ? 0
      : knockouts === 1
        ? estimateGameMinutes(division.rules.stages.final)
        : 2 * estimateGameMinutes(division.rules.stages.semi) +
          estimateGameMinutes(division.rules.stages.third_place) +
          estimateGameMinutes(division.rules.stages.final)

  const totalCourtMinutes = rrMinutes + koMinutes
  const lanes = Math.max(1, Math.floor(courts))
  return {
    totalGames: rr.totalGames + knockouts,
    totalCourtMinutes,
    estimatedMinutes: Math.ceil(totalCourtMinutes / lanes),
  }
}

/** Plain-English bullets describing a stage's scoring rules. */
export function describeStage(stage: StageKey, config: StageRulesConfig): string {
  const target = `first to ${config.pointsToWin}`
  if (!config.deuce) return `${STAGE_LABELS[stage]}: ${target}, no deuce — reach it and the game is yours.`
  const cap = config.cap != null ? `, capped at ${config.cap}` : ''
  return `${STAGE_LABELS[stage]}: ${target}, win by 2 (deuce)${cap}.`
}

/** The headline "what this means" sentence for a division. */
export function describeDivisionFormat(division: DivisionSettings, teamCount: number): string[] {
  const rr = roundRobinPreview(teamCount)
  const lines: string[] = []

  if (rr.teams < 2) {
    lines.push('Not enough pairs yet — a round robin needs at least 2.')
  } else {
    lines.push(
      `${rr.teams} pairs → ${rr.totalGames} round robin games, ${rr.gamesEach} each, over ${rr.rounds} rounds.`,
    )
    if (rr.hasBye) lines.push('Odd number of pairs, so one pair sits out each round.')
  }

  const places = division.rules.qualifyingPlaces
  if (places >= 4) {
    lines.push(
      `Top ${places} qualify: M1 = Rank 1 v Rank ${places}, M2 = Rank 2 v Rank ${places - 1}, then Battle for 3rd + Championship.`,
    )
  } else if (places === 2) {
    lines.push('Top 2 qualify and go straight to the Championship — no semi finals, no Battle for 3rd.')
  } else {
    lines.push('No knockout stage — the round robin ranking decides everything.')
  }

  for (const stage of STAGE_KEYS) {
    if (stage !== 'elims' && places < 2) continue
    if ((stage === 'semi' || stage === 'third_place') && places < 4) continue
    lines.push(describeStage(stage, division.rules.stages[stage]))
  }

  return lines
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type IssueSeverity = 'error' | 'warning'

export interface SettingsIssue {
  /** Dot path of the offending field, e.g. `divisions.div-mens.maxTeams`. */
  path: string
  message: string
  severity: IssueSeverity
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function err(path: string, message: string): SettingsIssue {
  return { path, message, severity: 'error' }
}

function warn(path: string, message: string): SettingsIssue {
  return { path, message, severity: 'warning' }
}

export function hasErrors(issues: readonly SettingsIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error')
}

export function issuesFor(issues: readonly SettingsIssue[], path: string): SettingsIssue[] {
  return issues.filter((issue) => issue.path === path)
}

export function firstErrorFor(issues: readonly SettingsIssue[], path: string): string | undefined {
  return issues.find((issue) => issue.path === path && issue.severity === 'error')?.message
}

export function validateTournamentDetails(details: TournamentDetails): SettingsIssue[] {
  const issues: SettingsIssue[] = []

  if (details.name.trim().length < 3) {
    issues.push(err('details.name', 'Give the tournament a name of at least 3 characters.'))
  }
  if (details.name.length > 120) {
    issues.push(err('details.name', 'Keep the name under 120 characters.'))
  }

  const date = Date.parse(details.tournamentDate)
  const opens = Date.parse(details.registrationOpensAt)
  const closes = Date.parse(details.registrationClosesAt)

  if (Number.isNaN(date)) issues.push(err('details.tournamentDate', 'Pick a valid tournament date.'))
  if (Number.isNaN(opens)) issues.push(err('details.registrationOpensAt', 'Pick a valid opening date.'))
  if (Number.isNaN(closes)) issues.push(err('details.registrationClosesAt', 'Pick a valid closing date.'))

  if (!Number.isNaN(opens) && !Number.isNaN(closes) && closes <= opens) {
    issues.push(
      err('details.registrationClosesAt', 'Registration must close after it opens.'),
    )
  }
  if (!Number.isNaN(date) && !Number.isNaN(closes) && closes > date) {
    issues.push(
      err('details.registrationClosesAt', 'Registration must close on or before tournament day.'),
    )
  }
  if (!Number.isNaN(date) && !Number.isNaN(closes) && closes <= date && date - closes < DAY_MS * 3) {
    issues.push(
      warn(
        'details.registrationClosesAt',
        'Less than 3 days between closing and first serve — that is a tight turnaround for the draw.',
      ),
    )
  }
  if (!details.registrationCloseConfirmed) {
    issues.push(
      warn(
        'details.registrationClosesAt',
        'This closing date is still the assumed one week before the event. Confirm it with the committee.',
      ),
    )
  }

  if (!details.venueName.trim()) {
    issues.push(warn('details.venueName', 'Players will want to know where to turn up.'))
  }
  if (details.contactEmail.trim() && !EMAIL_RE.test(details.contactEmail.trim())) {
    issues.push(err('details.contactEmail', 'That does not look like an email address.'))
  }
  if (!details.contactEmail.trim() && !details.contactPhone.trim()) {
    issues.push(warn('details.contactEmail', 'Add at least one way for players to reach the committee.'))
  }

  if (!Number.isInteger(details.entryFeeCents) || details.entryFeeCents < 0) {
    issues.push(err('details.entryFeeCents', 'Entry fee must be zero or more.'))
  } else if (details.entryFeeCents > 100_000) {
    issues.push(warn('details.entryFeeCents', 'That is a hefty entry fee — double-check the amount.'))
  }
  if (details.entryFeeCents > 0 && !details.paymentInstructions.trim()) {
    issues.push(
      warn(
        'details.paymentInstructions',
        'Players are told to pay but not how. /pay shows this text — add bank details or a drop-off point.',
      ),
    )
  }

  return issues
}

export function validateStageRules(path: string, config: StageRulesConfig): SettingsIssue[] {
  const issues: SettingsIssue[] = []

  if (!Number.isInteger(config.pointsToWin)) {
    issues.push(err(`${path}.pointsToWin`, 'Points to win must be a whole number.'))
  } else if (config.pointsToWin < MIN_POINTS_TO_WIN || config.pointsToWin > MAX_POINTS_TO_WIN) {
    issues.push(
      err(`${path}.pointsToWin`, `Points to win must be between ${MIN_POINTS_TO_WIN} and ${MAX_POINTS_TO_WIN}.`),
    )
  }

  if (config.deuce) {
    if (config.cap == null) {
      issues.push(
        warn(`${path}.cap`, 'With deuce on and no cap, a game can run forever. Consider a point cap.'),
      )
    } else if (!Number.isInteger(config.cap)) {
      issues.push(err(`${path}.cap`, 'The point cap must be a whole number.'))
    } else if (config.cap <= config.pointsToWin) {
      issues.push(err(`${path}.cap`, 'The point cap must be higher than the points to win.'))
    } else if (config.cap > MAX_POINTS_TO_WIN) {
      issues.push(err(`${path}.cap`, `Keep the cap at or under ${MAX_POINTS_TO_WIN}.`))
    }
  }

  return issues
}

export function validateRules(path: string, rules: RulesConfig): SettingsIssue[] {
  const issues: SettingsIssue[] = []
  for (const stage of STAGE_KEYS) {
    issues.push(...validateStageRules(`${path}.${stage}`, rules.stages[stage]))
  }

  const places = rules.qualifyingPlaces
  if (!Number.isInteger(places) || places < 0) {
    issues.push(err(`${path}.qualifyingPlaces`, 'Qualifiers must be a whole number of pairs.'))
  } else if (places < 2) {
    // `divisions.qualifying_places` carries `check (qualifying_places >= 2)`
    // since migration 0001, so "no knockout stage" cannot be saved at all —
    // the write fails on the constraint. Say so here instead of letting the
    // admin pick it, press save and get a database error.
    issues.push(
      err(
        `${path}.qualifyingPlaces`,
        'Every division needs a knockout — use 2 for a straight final, or 4 for semis.',
      ),
    )
  } else if (places !== 2 && places !== 4) {
    // `generateKnockout()` (src/lib/draw.ts) builds exactly one final for 2
    // qualifiers and exactly four fixtures — two semis, a 3rd-place playoff and
    // the championship — for 4. It has no quarter-final round, so anything
    // between 5 and 8 qualifiers silently seeded ranks 5-8 into a bracket that
    // was never built for them: they qualified and then never played. This was
    // only a warning, which let an admin save it and find out on match day.
    issues.push(
      err(
        `${path}.qualifyingPlaces`,
        'The draw engine builds a straight final (2 qualifiers) or semis plus a 3rd-place playoff (4). Pick 2 or 4.',
      ),
    )
  }

  return issues
}

export function validateDivision(division: DivisionSettings, allDivisions: readonly DivisionSettings[]): SettingsIssue[] {
  const base = `divisions.${division.id}`
  const issues: SettingsIssue[] = []

  if (!division.name.trim()) {
    issues.push(err(`${base}.name`, 'Every division needs a name.'))
  }
  const clash = allDivisions.some(
    (other) => other.id !== division.id && other.name.trim().toLowerCase() === division.name.trim().toLowerCase(),
  )
  if (clash) issues.push(err(`${base}.name`, 'Another division already uses this name.'))

  if (division.maxTeams != null) {
    if (!Number.isInteger(division.maxTeams) || division.maxTeams < 2) {
      issues.push(err(`${base}.maxTeams`, 'An entry cap must be at least 2 pairs (or leave it empty for no cap).'))
    } else if (division.maxTeams > 64) {
      issues.push(err(`${base}.maxTeams`, 'That is a lot of pairs — cap at 64 or fewer.'))
    } else if (division.maxTeams < division.rules.qualifyingPlaces) {
      issues.push(
        err(`${base}.maxTeams`, 'The entry cap cannot be smaller than the number of pairs that qualify.'),
      )
    }
  } else {
    issues.push(warn(`${base}.maxTeams`, 'No entry cap set — the round robin could get very long.'))
  }

  if (!Number.isInteger(division.entryFeeCents) || division.entryFeeCents < 0) {
    issues.push(err(`${base}.entryFeeCents`, 'Entry fee must be zero or more.'))
  } else if (division.entryFeeCents > 100_000) {
    issues.push(warn(`${base}.entryFeeCents`, 'That is a hefty entry fee — double-check the amount.'))
  }

  issues.push(...validateRules(`${base}.rules`, division.rules))
  return issues
}

export function validateCourts(courts: readonly CourtSettings[]): SettingsIssue[] {
  const issues: SettingsIssue[] = []
  if (courts.length === 0) {
    issues.push(err('courts', 'Add at least one court — matches have to be played somewhere.'))
  }

  const seen = new Map<string, number>()
  for (const court of courts) {
    const path = `courts.${court.id}.name`
    const name = court.name.trim()
    if (!name) {
      issues.push(err(path, 'Give this court a name.'))
      continue
    }
    const key = name.toLowerCase()
    seen.set(key, (seen.get(key) ?? 0) + 1)
    if ((seen.get(key) ?? 0) > 1) {
      issues.push(err(path, `Two courts are both called “${name}”.`))
    }
  }

  return issues
}

export function validateTimeSlots(slots: readonly TimeSlotSettings[]): SettingsIssue[] {
  const issues: SettingsIssue[] = []
  if (slots.length === 0) {
    issues.push(warn('timeSlots', 'No time slots yet — the scheduler has nowhere to put matches.'))
  }

  const sorted = [...slots].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))

  for (const slot of slots) {
    const path = `timeSlots.${slot.id}`
    const start = Date.parse(slot.startsAt)
    const end = Date.parse(slot.endsAt)
    if (Number.isNaN(start)) issues.push(err(`${path}.startsAt`, 'Invalid start time.'))
    if (Number.isNaN(end)) issues.push(err(`${path}.endsAt`, 'Invalid end time.'))
    if (!Number.isNaN(start) && !Number.isNaN(end) && end <= start) {
      issues.push(err(`${path}.endsAt`, 'A slot has to end after it starts.'))
    }
  }

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const current = sorted[i]
    const prevEnd = Date.parse(prev.endsAt)
    const start = Date.parse(current.startsAt)
    if (Number.isNaN(prevEnd) || Number.isNaN(start)) continue
    if (start < prevEnd) {
      issues.push(
        warn(`timeSlots.${current.id}.startsAt`, `Overlaps the previous slot (${prev.label || 'unnamed'}).`),
      )
    }
  }

  return issues
}

export function validatePrizes(prizes: PrizeSettings, divisions: readonly DivisionSettings[]): SettingsIssue[] {
  const issues: SettingsIssue[] = []

  for (const prize of prizes.divisionPrizes) {
    const base = `prizes.${prize.divisionId}`
    const amounts: [string, number][] = [
      ['championCents', prize.championCents],
      ['runnerUpCents', prize.runnerUpCents],
      ['thirdPlaceCents', prize.thirdPlaceCents],
      ['fourthPlaceCents', prize.fourthPlaceCents],
    ]
    for (const [field, cents] of amounts) {
      if (!Number.isInteger(cents) || cents < 0) {
        issues.push(err(`${base}.${field}`, 'Prize money must be zero or more.'))
      }
    }
    if (prize.runnerUpCents > prize.championCents) {
      issues.push(warn(`${base}.runnerUpCents`, 'The runner-up is being paid more than the champion.'))
    }
    if (prize.thirdPlaceCents > prize.runnerUpCents) {
      issues.push(warn(`${base}.thirdPlaceCents`, 'Third place is being paid more than the runner-up.'))
    }
    if (prize.fourthPlaceCents > prize.thirdPlaceCents) {
      issues.push(warn(`${base}.fourthPlaceCents`, 'Fourth place is being paid more than third.'))
    }
  }

  const enabled = divisions.filter((d) => d.enabled)
  for (const division of enabled) {
    if (!prizes.divisionPrizes.some((p) => p.divisionId === division.id)) {
      issues.push(warn(`prizes.${division.id}`, `${division.name} has no prize money configured.`))
    }
  }

  const podiumSpots = enabled.length * 3
  if (prizes.trophyCount < 0 || !Number.isInteger(prizes.trophyCount)) {
    issues.push(err('prizes.trophyCount', 'Trophy count must be a whole number.'))
  } else if (prizes.trophyCount < enabled.length) {
    issues.push(warn('prizes.trophyCount', 'Fewer trophies than divisions — someone goes home empty handed.'))
  }
  if (prizes.medalCount < 0 || !Number.isInteger(prizes.medalCount)) {
    issues.push(err('prizes.medalCount', 'Medal count must be a whole number.'))
  } else if (prizes.medalCount < podiumSpots * 2) {
    issues.push(
      warn('prizes.medalCount', `Doubles means 2 players per placing — you need ${podiumSpots * 2} medals.`),
    )
  }

  for (const item of prizes.lootBagItems) {
    const base = `prizes.loot.${item.id}`
    if (!item.name.trim()) issues.push(err(`${base}.name`, 'Name this loot bag item.'))
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      issues.push(err(`${base}.quantity`, 'Quantity must be at least 1.'))
    }
  }
  if (prizes.lootBagItems.length === 0) {
    issues.push(warn('prizes.loot', 'The loot bags are empty. Every player is promised one!'))
  }

  return issues
}

export function validateSettings(settings: TournamentSettings): SettingsIssue[] {
  const issues: SettingsIssue[] = [...validateTournamentDetails(settings.details)]

  for (const division of settings.divisions) {
    issues.push(...validateDivision(division, settings.divisions))
  }
  if (settings.divisions.length === 0) {
    issues.push(err('divisions', 'Add at least one division.'))
  } else if (!settings.divisions.some((d) => d.enabled)) {
    issues.push(err('divisions', 'At least one division must be enabled or nobody can enter.'))
  }

  issues.push(...validateCourts(settings.courts))
  issues.push(...validateTimeSlots(settings.timeSlots))
  issues.push(...validatePrizes(settings.prizes, settings.divisions))

  const slotCapacity = settings.courts.length * settings.timeSlots.length
  const demand = settings.divisions
    .filter((d) => d.enabled)
    .reduce(
      (total, d) =>
        total + roundRobinPreview(d.maxTeams ?? 0).totalGames + knockoutGameCount(d.rules.qualifyingPlaces),
      0,
    )
  if (slotCapacity > 0 && demand > slotCapacity) {
    issues.push(
      warn(
        'timeSlots',
        `At full entries you need ${demand} games but only have ${slotCapacity} court slots. Add courts or slots.`,
      ),
    )
  }

  return issues
}

// ---------------------------------------------------------------------------
// Rules-change impact analysis
// ---------------------------------------------------------------------------

export type ImpactLevel = 'none' | 'safe' | 'caution' | 'danger'

export interface RulesChangeImpact {
  level: ImpactLevel
  headline: string
  reasons: string[]
  changedStages: StageKey[]
  qualifiersChanged: boolean
  /** True when the published draw/bracket has to be regenerated to match. */
  requiresRegeneration: boolean
  /** True when the admin must explicitly type-to-confirm before saving. */
  requiresConfirmation: boolean
}

function stageRulesEqual(a: StageRulesConfig, b: StageRulesConfig): boolean {
  const capA = a.deuce ? a.cap : null
  const capB = b.deuce ? b.cap : null
  return a.pointsToWin === b.pointsToWin && a.deuce === b.deuce && capA === capB
}

/**
 * Explains how dangerous a rules edit is, given what has already happened on
 * the day. Nothing here blocks the change outright — the tournament rules are
 * a draft and admins must be able to fix them — but a `danger` result should
 * force an explicit confirmation in the UI.
 */
export function analyseRulesChange(
  before: RulesConfig,
  after: RulesConfig,
  state: DrawState = EMPTY_DRAW_STATE,
): RulesChangeImpact {
  const changedStages = STAGE_KEYS.filter(
    (stage) => !stageRulesEqual(before.stages[stage], after.stages[stage]),
  )
  const qualifiersChanged = before.qualifyingPlaces !== after.qualifyingPlaces

  if (changedStages.length === 0 && !qualifiersChanged) {
    return {
      level: 'none',
      headline: 'No rule changes yet.',
      reasons: [],
      changedStages: [],
      qualifiersChanged: false,
      requiresRegeneration: false,
      requiresConfirmation: false,
    }
  }

  const reasons: string[] = []
  for (const stage of changedStages) {
    reasons.push(
      `${STAGE_LABELS[stage]} scoring changes from ${summariseStage(before.stages[stage])} to ${summariseStage(after.stages[stage])}.`,
    )
  }
  if (qualifiersChanged) {
    reasons.push(
      `Qualifiers advancing to the knockout changes from ${before.qualifyingPlaces} to ${after.qualifyingPlaces}.`,
    )
  }

  const played = state.matchesCompleted + state.matchesInProgress

  if (!state.drawPublished) {
    return {
      level: 'safe',
      headline: 'Safe to change — the draw has not been published yet.',
      reasons,
      changedStages,
      qualifiersChanged,
      requiresRegeneration: false,
      requiresConfirmation: false,
    }
  }

  if (played === 0) {
    if (qualifiersChanged) {
      reasons.push('The published bracket must be regenerated so the semi final match-ups line up.')
    }
    reasons.push('Players have already seen the published draw — tell them what changed.')
    return {
      level: 'caution',
      headline: 'The draw is published but nothing has been played — change it now, not later.',
      reasons,
      changedStages,
      qualifiersChanged,
      requiresRegeneration: qualifiersChanged,
      requiresConfirmation: true,
    }
  }

  if (state.matchesCompleted > 0) {
    reasons.push(
      `${state.matchesCompleted} completed game${state.matchesCompleted === 1 ? '' : 's'} were played under the OLD rules — results and standings may no longer be valid.`,
    )
  }
  if (state.matchesInProgress > 0) {
    reasons.push(
      `${state.matchesInProgress} game${state.matchesInProgress === 1 ? ' is' : 's are'} in progress right now on court.`,
    )
  }
  if (changedStages.includes('elims')) {
    reasons.push('Round robin standings are recomputed from scores — changing the target rewrites the ranking.')
  }
  if (qualifiersChanged) {
    reasons.push('Changing qualifiers rebuilds the knockout bracket from scratch.')
  }

  return {
    level: 'danger',
    headline: 'Games have already been played under the current rules.',
    reasons,
    changedStages,
    qualifiersChanged,
    requiresRegeneration: true,
    requiresConfirmation: true,
  }
}

export function summariseStage(config: StageRulesConfig): string {
  if (!config.deuce) return `first to ${config.pointsToWin}, no deuce`
  return config.cap != null
    ? `first to ${config.pointsToWin}, deuce, cap ${config.cap}`
    : `first to ${config.pointsToWin}, deuce, no cap`
}

/** Highest impact across every division being saved. */
export function analyseSettingsRulesChange(
  before: readonly DivisionSettings[],
  after: readonly DivisionSettings[],
  state: DrawState = EMPTY_DRAW_STATE,
): RulesChangeImpact {
  const order: ImpactLevel[] = ['none', 'safe', 'caution', 'danger']
  let worst: RulesChangeImpact = analyseRulesChange(defaultRulesConfig(), defaultRulesConfig(), state)

  for (const division of after) {
    const previous = before.find((d) => d.id === division.id)
    if (!previous) continue
    const impact = analyseRulesChange(previous.rules, division.rules, state)
    if (impact.level === 'none') continue
    const prefixed: RulesChangeImpact = {
      ...impact,
      reasons: impact.reasons.map((reason) => `${division.name}: ${reason}`),
    }
    if (order.indexOf(prefixed.level) > order.indexOf(worst.level)) {
      worst = prefixed
    } else if (prefixed.level === worst.level) {
      worst = {
        ...worst,
        reasons: [...worst.reasons, ...prefixed.reasons],
        changedStages: [...new Set([...worst.changedStages, ...prefixed.changedStages])],
        qualifiersChanged: worst.qualifiersChanged || prefixed.qualifiersChanged,
        requiresRegeneration: worst.requiresRegeneration || prefixed.requiresRegeneration,
        requiresConfirmation: worst.requiresConfirmation || prefixed.requiresConfirmation,
      }
    }
  }

  return worst
}

// ---------------------------------------------------------------------------
// Role management
// ---------------------------------------------------------------------------

export const ASSIGNABLE_ROLES = ['admin', 'tabulator', 'duty_official', 'player'] as const

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]

export const ROLE_LABELS: Record<AssignableRole, string> = {
  admin: 'Admin',
  tabulator: 'Tabulator',
  duty_official: 'Duty official',
  player: 'Player',
}

export const ROLE_BLURBS: Record<AssignableRole, string> = {
  admin: 'Full control: settings, draw, results and roles.',
  tabulator: 'Verifies submitted scoresheets and resolves disputes.',
  duty_official: 'Umpires, scores and calls lines for the next match.',
  player: 'Can register, pick a partner and see their own schedule.',
}

export interface ManagedUser {
  id: string
  fullName: string
  nickname: string | null
  email: string | null
  roles: AssignableRole[]
}

export type RoleAction = 'grant' | 'revoke'

export interface RoleChangeVerdict {
  allowed: boolean
  /** Why the change is impossible (only when `allowed` is false). */
  blockedReason?: string
  /** Something the admin should know before continuing. */
  warning?: string
  /** True when the admin is editing their own roles. */
  isSelf: boolean
}

/**
 * Guards role edits. The one hard rule: the tournament must always have at
 * least one admin, and you cannot strip your own last admin role.
 */
export function analyseRoleChange(input: {
  actorUserId: string
  targetUserId: string
  role: AssignableRole
  action: RoleAction
  users: readonly ManagedUser[]
}): RoleChangeVerdict {
  const { actorUserId, targetUserId, role, action, users } = input
  const target = users.find((user) => user.id === targetUserId)
  const isSelf = actorUserId === targetUserId

  if (!target) {
    return { allowed: false, blockedReason: 'That user no longer exists.', isSelf }
  }

  const hasRole = target.roles.includes(role)

  if (action === 'grant') {
    if (hasRole) {
      return { allowed: false, blockedReason: `${target.fullName} already has the ${ROLE_LABELS[role]} role.`, isSelf }
    }
    if (role === 'admin') {
      return {
        allowed: true,
        warning: 'Admins can change every setting, publish the draw and edit results. Grant sparingly.',
        isSelf,
      }
    }
    return { allowed: true, isSelf }
  }

  if (!hasRole) {
    return { allowed: false, blockedReason: `${target.fullName} does not have the ${ROLE_LABELS[role]} role.`, isSelf }
  }

  if (role === 'admin') {
    const admins = users.filter((user) => user.roles.includes('admin'))
    if (admins.length <= 1) {
      return {
        allowed: false,
        blockedReason:
          'This is the last admin. Grant the admin role to somebody else before revoking this one, or nobody can run the tournament.',
        isSelf,
      }
    }
    if (isSelf) {
      return {
        allowed: true,
        warning: 'You are removing your OWN admin role — you will lose access to this console immediately.',
        isSelf,
      }
    }
  }

  return { allowed: true, isSelf }
}

/** Case-insensitive search over name, nickname and email. */
export function searchUsers(users: readonly ManagedUser[], query: string): ManagedUser[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...users]
  return users.filter((user) =>
    [user.fullName, user.nickname ?? '', user.email ?? '', ...user.roles.map((r) => ROLE_LABELS[r])]
      .join(' ')
      .toLowerCase()
      .includes(needle),
  )
}

export function countRole(users: readonly ManagedUser[], role: AssignableRole): number {
  return users.filter((user) => user.roles.includes(role)).length
}

// ---------------------------------------------------------------------------
// Diffing / unsaved changes / audit log
// ---------------------------------------------------------------------------

export interface SettingsChange {
  path: string
  label: string
  before: string
  after: string
}

function fmt(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'on' : 'off'
  return String(value)
}

function pushChange(
  changes: SettingsChange[],
  path: string,
  label: string,
  before: unknown,
  after: unknown,
): void {
  if (fmt(before) === fmt(after)) return
  changes.push({ path, label, before: fmt(before), after: fmt(after) })
}

const DETAIL_LABELS: Record<keyof TournamentDetails, string> = {
  name: 'Tournament name',
  tournamentDate: 'Tournament date',
  venueName: 'Venue',
  venueAddress: 'Venue address',
  description: 'Description',
  registrationOpensAt: 'Registration opens',
  registrationClosesAt: 'Registration closes',
  registrationCloseConfirmed: 'Closing date confirmed',
  contactName: 'Contact name',
  contactEmail: 'Contact email',
  contactPhone: 'Contact phone',
  entryFeeCents: 'Entry fee',
  paymentInstructions: 'Payment instructions',
}

export function diffDetails(before: TournamentDetails, after: TournamentDetails): SettingsChange[] {
  const changes: SettingsChange[] = []
  for (const key of Object.keys(DETAIL_LABELS) as (keyof TournamentDetails)[]) {
    pushChange(changes, `details.${key}`, DETAIL_LABELS[key], before[key], after[key])
  }
  return changes
}

export function diffDivisions(
  before: readonly DivisionSettings[],
  after: readonly DivisionSettings[],
): SettingsChange[] {
  const changes: SettingsChange[] = []

  for (const division of after) {
    const previous = before.find((d) => d.id === division.id)
    const base = `divisions.${division.id}`
    if (!previous) {
      changes.push({ path: base, label: 'New division', before: '—', after: division.name })
      continue
    }
    pushChange(changes, `${base}.name`, `${previous.name} · name`, previous.name, division.name)
    pushChange(changes, `${base}.enabled`, `${division.name} · enabled`, previous.enabled, division.enabled)
    pushChange(changes, `${base}.maxTeams`, `${division.name} · entry cap`, previous.maxTeams, division.maxTeams)
    pushChange(
      changes,
      `${base}.entryFeeCents`,
      `${division.name} · entry fee`,
      formatCents(previous.entryFeeCents),
      formatCents(division.entryFeeCents),
    )
    pushChange(
      changes,
      `${base}.rules.qualifyingPlaces`,
      `${division.name} · qualifiers`,
      previous.rules.qualifyingPlaces,
      division.rules.qualifyingPlaces,
    )
    for (const stage of STAGE_KEYS) {
      pushChange(
        changes,
        `${base}.rules.${stage}`,
        `${division.name} · ${STAGE_LABELS[stage]}`,
        summariseStage(previous.rules.stages[stage]),
        summariseStage(division.rules.stages[stage]),
      )
    }
  }

  for (const previous of before) {
    if (!after.some((d) => d.id === previous.id)) {
      changes.push({
        path: `divisions.${previous.id}`,
        label: 'Removed division',
        before: previous.name,
        after: '—',
      })
    }
  }

  return changes
}

export function diffCourts(before: readonly CourtSettings[], after: readonly CourtSettings[]): SettingsChange[] {
  const changes: SettingsChange[] = []
  for (const court of after) {
    const previous = before.find((c) => c.id === court.id)
    if (!previous) {
      changes.push({ path: `courts.${court.id}`, label: 'New court', before: '—', after: court.name })
      continue
    }
    pushChange(changes, `courts.${court.id}.name`, 'Court name', previous.name, court.name)
    pushChange(changes, `courts.${court.id}.sortOrder`, `${court.name} · order`, previous.sortOrder, court.sortOrder)
  }
  for (const previous of before) {
    if (!after.some((c) => c.id === previous.id)) {
      changes.push({ path: `courts.${previous.id}`, label: 'Removed court', before: previous.name, after: '—' })
    }
  }
  return changes
}

export function diffTimeSlots(
  before: readonly TimeSlotSettings[],
  after: readonly TimeSlotSettings[],
): SettingsChange[] {
  const changes: SettingsChange[] = []
  for (const slot of after) {
    const previous = before.find((s) => s.id === slot.id)
    if (!previous) {
      changes.push({ path: `timeSlots.${slot.id}`, label: 'New time slot', before: '—', after: slot.label || slot.startsAt })
      continue
    }
    pushChange(changes, `timeSlots.${slot.id}.startsAt`, `${slot.label || 'Slot'} · start`, previous.startsAt, slot.startsAt)
    pushChange(changes, `timeSlots.${slot.id}.endsAt`, `${slot.label || 'Slot'} · end`, previous.endsAt, slot.endsAt)
    pushChange(changes, `timeSlots.${slot.id}.label`, 'Slot label', previous.label, slot.label)
  }
  for (const previous of before) {
    if (!after.some((s) => s.id === previous.id)) {
      changes.push({
        path: `timeSlots.${previous.id}`,
        label: 'Removed time slot',
        before: previous.label || previous.startsAt,
        after: '—',
      })
    }
  }
  return changes
}

export function diffPrizes(before: PrizeSettings, after: PrizeSettings): SettingsChange[] {
  const changes: SettingsChange[] = []

  for (const prize of after.divisionPrizes) {
    const previous = before.divisionPrizes.find((p) => p.divisionId === prize.divisionId)
    const base = `prizes.${prize.divisionId}`
    pushChange(changes, `${base}.championCents`, 'Champion prize', formatCents(previous?.championCents ?? 0), formatCents(prize.championCents))
    pushChange(changes, `${base}.runnerUpCents`, 'Runner-up prize', formatCents(previous?.runnerUpCents ?? 0), formatCents(prize.runnerUpCents))
    pushChange(changes, `${base}.thirdPlaceCents`, 'Third place prize', formatCents(previous?.thirdPlaceCents ?? 0), formatCents(prize.thirdPlaceCents))
    pushChange(changes, `${base}.fourthPlaceCents`, 'Fourth place prize', formatCents(previous?.fourthPlaceCents ?? 0), formatCents(prize.fourthPlaceCents))
  }

  pushChange(changes, 'prizes.trophyCount', 'Trophies', before.trophyCount, after.trophyCount)
  pushChange(changes, 'prizes.medalCount', 'Medals', before.medalCount, after.medalCount)
  pushChange(
    changes,
    'prizes.showOnPublicSite',
    'Shown on public site',
    before.showOnPublicSite ? 'Yes' : 'No',
    after.showOnPublicSite ? 'Yes' : 'No',
  )

  for (const item of after.lootBagItems) {
    const previous = before.lootBagItems.find((i) => i.id === item.id)
    if (!previous) {
      changes.push({ path: `prizes.loot.${item.id}`, label: 'New loot bag item', before: '—', after: item.name })
      continue
    }
    pushChange(changes, `prizes.loot.${item.id}.name`, 'Loot item', previous.name, item.name)
    pushChange(changes, `prizes.loot.${item.id}.quantity`, `${item.name} · qty`, previous.quantity, item.quantity)
    pushChange(changes, `prizes.loot.${item.id}.notes`, `${item.name} · notes`, previous.notes, item.notes)
  }
  for (const previous of before.lootBagItems) {
    if (!after.lootBagItems.some((i) => i.id === previous.id)) {
      changes.push({ path: `prizes.loot.${previous.id}`, label: 'Removed loot item', before: previous.name, after: '—' })
    }
  }

  return changes
}

export function diffSettings(before: TournamentSettings, after: TournamentSettings): SettingsChange[] {
  return [
    ...diffDetails(before.details, after.details),
    ...diffDivisions(before.divisions, after.divisions),
    ...diffCourts(before.courts, after.courts),
    ...diffTimeSlots(before.timeSlots, after.timeSlots),
    ...diffPrizes(before.prizes, after.prizes),
  ]
}

export function hasUnsavedChanges(before: TournamentSettings, after: TournamentSettings): boolean {
  return diffSettings(before, after).length > 0
}

/** `audit_log` insert payload (metadata only — the caller adds `actor_id`). */
export interface AuditEntry {
  action: string
  entity_type: string
  entity_id: string | null
  metadata: {
    changes: SettingsChange[]
    summary: string
    [key: string]: unknown
  }
}

export function buildAuditEntry(
  action: string,
  entityType: string,
  entityId: string | null,
  changes: readonly SettingsChange[],
  extra: Record<string, unknown> = {},
): AuditEntry {
  return {
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata: {
      ...extra,
      changes: [...changes],
      summary: summariseChanges(changes),
    },
  }
}

export function summariseChanges(changes: readonly SettingsChange[]): string {
  if (changes.length === 0) return 'No changes'
  if (changes.length <= 3) {
    return changes.map((change) => `${change.label}: ${change.before} → ${change.after}`).join('; ')
  }
  const head = changes
    .slice(0, 3)
    .map((change) => `${change.label}: ${change.before} → ${change.after}`)
    .join('; ')
  return `${head}; +${changes.length - 3} more`
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000
const SYDNEY_TZ = 'Australia/Sydney'

export function formatCents(cents: number): string {
  if (!Number.isFinite(cents)) return '—'
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.round(cents))
  // Grouped, because the prize pool crossed a thousand dollars and the
  // headline on the landing page read "$2080.00" — a four-figure sum with no
  // separator is read wrong at a glance, and this one is a promise of money.
  const amount = (abs / 100).toLocaleString('en-AU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${sign}$${amount}`
}

/** Parses "$25", "25.50", "2,500" into cents. Returns `null` when unparseable. */
export function parseMoneyToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, '')
  if (!cleaned) return null
  if (!/^-?\d*(\.\d{0,2})?$/.test(cleaned)) return null
  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100)
}

/** Parses an integer input, returning `fallback` when empty/invalid. */
export function parseIntOr(input: string, fallback: number): number {
  const value = Number.parseInt(input, 10)
  return Number.isFinite(value) ? value : fallback
}

function sydneyParts(date: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SYDNEY_TZ,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)

  const out: Record<string, string> = {}
  for (const part of parts) {
    if (part.type !== 'literal') out[part.type] = part.value
  }
  return out
}

function sydneyOffsetMs(date: Date): number {
  const p = sydneyParts(date)
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second),
  )
  return asUtc - date.getTime()
}

/**
 * ISO timestamp -> `YYYY-MM-DDTHH:mm` in Sydney time, for
 * `<input type="datetime-local">`. Deterministic on server and client (it
 * pins the zone rather than using the viewer's), so no hydration mismatch.
 */
export function toDateTimeLocal(iso: string, opts: { withSeconds?: boolean } = {}): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const p = sydneyParts(date)
  const stamp = `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}`
  return opts.withSeconds ? `${stamp}:${p.second}` : stamp
}

/** `YYYY-MM-DDTHH:mm[:ss]` in Sydney time -> UTC ISO timestamp. */
export function fromDateTimeLocal(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?/.exec(value)
  if (!match) return ''
  const naive = Date.parse(`${match[1]}${match[2] ?? ':00'}Z`)
  if (Number.isNaN(naive)) return ''
  // Two passes so the DST changeover resolves correctly.
  let ts = naive - sydneyOffsetMs(new Date(naive))
  ts = naive - sydneyOffsetMs(new Date(ts))
  return new Date(ts).toISOString()
}

/** Human date/time in Sydney, e.g. "Sun 13 Dec 2026, 9:00 am". */
export function formatSydney(iso: string, opts: { withTime?: boolean } = {}): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: SYDNEY_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(opts.withTime === false ? {} : { hour: 'numeric', minute: '2-digit' }),
  }).format(date)
}

/** Just the time, e.g. "9:15 am". */
export function formatSydneyTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: SYDNEY_TZ,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function slotDurationMinutes(slot: TimeSlotSettings): number {
  const start = Date.parse(slot.startsAt)
  const end = Date.parse(slot.endsAt)
  if (Number.isNaN(start) || Number.isNaN(end)) return 0
  // Halves, not whole minutes: 12.5-minute slots are a legitimate timetable.
  return Math.round((end - start) / 30_000) / 2
}

export interface GenerateSlotsInput {
  /** ISO timestamp of the first slot. */
  startsAt: string
  durationMinutes: number
  count: number
  /** Break between slots, in minutes. */
  gapMinutes?: number
  labelPrefix?: string
  /** Prefix for generated ids, so callers can keep them stable. */
  idPrefix?: string
}

/** Builds a run of back-to-back time slots for the schedule. */
export function generateTimeSlots(input: GenerateSlotsInput): TimeSlotSettings[] {
  const {
    startsAt,
    durationMinutes,
    count,
    gapMinutes = 0,
    labelPrefix = 'Slot',
    idPrefix = 'slot',
  } = input

  const start = Date.parse(startsAt)
  if (Number.isNaN(start) || durationMinutes <= 0 || count <= 0) return []

  const step = (durationMinutes + Math.max(0, gapMinutes)) * 60_000
  return Array.from({ length: Math.min(count, 60) }, (_, i) => {
    const slotStart = start + i * step
    return {
      id: `${idPrefix}-${i + 1}`,
      startsAt: new Date(slotStart).toISOString(),
      endsAt: new Date(slotStart + durationMinutes * 60_000).toISOString(),
      label: `${labelPrefix} ${i + 1}`,
    }
  })
}

/**
 * Total cash the committee actually hands out, in cents.
 *
 * The per-division amounts are per *player*, and every placing is a pair, so
 * the real outlay is twice the sum. The old total added the four placings once
 * and called it the prize pool — which was the figure for one player from each
 * pair, half of what the committee had to bring, and the reason the number
 * never matched the budget.
 */
export function totalPrizePoolCents(prizes: PrizeSettings): number {
  return prizes.divisionPrizes.reduce(
    (total, prize) =>
      total +
      PLAYERS_PER_PAIR *
        (prize.championCents + prize.runnerUpCents + prize.thirdPlaceCents + prize.fourthPlaceCents),
    0,
  )
}

/**
 * Fills in prize fields that a stored blob predates.
 *
 * Prizes live as JSON in `site_content`, so a blob written before a field
 * existed simply lacks it. `fourthPlaceCents` was added after the first
 * tournament was configured, and `undefined` in a sum turns the whole total
 * into `NaN` — a prize board reading "$NaN" rather than an obviously missing
 * number. Every read path goes through here.
 */
export function normalisePrizes(
  parsed: Partial<PrizeSettings> | null | undefined,
  fallback: PrizeSettings,
): PrizeSettings {
  if (!parsed) return fallback
  const money = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
  // A blob with no `basis` was written when amounts meant "per pair". Reading
  // it as-is would double every figure the committee had agreed, so rebase it
  // here — the single place every prize read passes through.
  const legacy = parsed.basis !== PRIZE_BASIS
  const amount = (value: unknown): number => {
    const cents = money(value)
    return legacy ? rebasePerPairAmount(cents) : cents
  }
  return {
    ...fallback,
    ...parsed,
    basis: PRIZE_BASIS,
    divisionPrizes: (parsed.divisionPrizes ?? fallback.divisionPrizes).map((prize) => ({
      divisionId: prize.divisionId,
      championCents: amount(prize.championCents),
      runnerUpCents: amount(prize.runnerUpCents),
      thirdPlaceCents: amount(prize.thirdPlaceCents),
      fourthPlaceCents: amount(prize.fourthPlaceCents),
    })),
    lootBagItems: parsed.lootBagItems ?? fallback.lootBagItems,
  }
}

/** Loot bag items needed for `playerCount` players. */
export function lootBagTotals(prizes: PrizeSettings, playerCount: number): { name: string; total: number }[] {
  const players = Math.max(0, Math.floor(playerCount))
  return prizes.lootBagItems.map((item) => ({ name: item.name, total: item.quantity * players }))
}

// ---------------------------------------------------------------------------
// Publishing prizes to the public site
// ---------------------------------------------------------------------------

/** One division's prize money, ready to render to anonymous visitors. */
export interface PublicDivisionPrize {
  divisionId: string
  divisionName: string
  /** All amounts are per player — see `DivisionPrize`. */
  championCents: number
  runnerUpCents: number
  thirdPlaceCents: number
  fourthPlaceCents: number
}

/**
 * Joins a list into readable prose: "a, b and c".
 *
 * Used for the placings the prize pool actually funds. Naming them from the
 * data rather than typing them into a sentence is what stops the summary card
 * disagreeing with the board printed underneath it.
 */
export function formatList(items: string[]): string {
  return new Intl.ListFormat('en-AU', { style: 'long', type: 'conjunction' }).format(items)
}

/** One line of a division's prize card: which placing, and what it pays. */
export interface PrizePlacing {
  label: string
  /** Decorative only — the label carries the meaning for screen readers. */
  medal: string
  /** What one partner is handed, which is how the cash is actually counted. */
  perPlayerCents: number
  /**
   * What the pair takes home between them — the headline figure on the public
   * board, and the one that sums to the advertised total pool.
   *
   * Both are spelled out because a bare `amountCents` is exactly the ambiguity
   * that made the landing page need a sentence of explanation underneath it.
   */
  pairCents: number
}

/**
 * A division's prize money as an ordered list of placings.
 *
 * The landing page used to render this as a five-column table, which on a
 * phone pushed every amount off the right-hand edge behind a scroll gesture
 * nothing advertised. Listing the placings instead lets the page lay them out
 * vertically, and putting the order here rather than in JSX means the podium
 * can never end up out of sequence in one place and not another.
 */
export function placingsFor(prize: PublicDivisionPrize): PrizePlacing[] {
  const placing = (label: string, medal: string, perPlayerCents: number): PrizePlacing => ({
    label,
    medal,
    perPlayerCents,
    // Stored amounts are per player; the pair figure is derived here so the
    // public board and the advertised total pool are computed from the same
    // number. The total is summed per player and multiplied by the pair size,
    // so a card that showed the per-player amount added up to half the
    // headline figure sitting directly above it.
    pairCents: perPlayerCents * PLAYERS_PER_PAIR,
  })
  return [
    placing('Champion', '🥇', prize.championCents),
    placing('Runner-up', '🥈', prize.runnerUpCents),
    placing('3rd place', '🥉', prize.thirdPlaceCents),
    placing('4th place', '🏸', prize.fourthPlaceCents),
  ]
}

/**
 * The display-safe projection of `PrizeSettings` that the landing page reads.
 *
 * Deliberately narrower than `PrizeSettings`: loot bag `notes` are internal
 * committee reminders and supplier hints, so they are dropped rather than
 * merely unrendered. If this ever grows a field, ask first whether a player
 * standing in a gym should be able to read it.
 */
export interface PublicPrizeBoard {
  /** Absent means legacy per-pair amounts — see `PrizeBasis`. */
  basis?: PrizeBasis
  divisionPrizes: PublicDivisionPrize[]
  trophyCount: number
  medalCount: number
  /** Loot bag contents, names and per-player quantities only. */
  lootBagItems: { name: string; quantity: number }[]
  totalPoolCents: number
}

/**
 * Builds the anonymous-visitor view of the prize configuration.
 *
 * Only *enabled* divisions contribute, so a division the committee has
 * switched off does not advertise prize money nobody can win. Prizes for a
 * division that no longer exists are dropped rather than shown with a blank
 * name.
 */
export function publicPrizeBoard(
  prizes: PrizeSettings,
  divisions: readonly DivisionSettings[],
): PublicPrizeBoard {
  const byId = new Map(divisions.filter((d) => d.enabled).map((d) => [d.id, d]))
  const divisionPrizes: PublicDivisionPrize[] = []

  for (const prize of prizes.divisionPrizes) {
    const division = byId.get(prize.divisionId)
    if (!division) continue
    divisionPrizes.push({
      divisionId: prize.divisionId,
      divisionName: division.name,
      championCents: prize.championCents,
      runnerUpCents: prize.runnerUpCents,
      thirdPlaceCents: prize.thirdPlaceCents,
      fourthPlaceCents: prize.fourthPlaceCents,
    })
  }

  return {
    basis: PRIZE_BASIS,
    divisionPrizes,
    trophyCount: prizes.trophyCount,
    medalCount: prizes.medalCount,
    lootBagItems: prizes.lootBagItems.map((item) => ({ name: item.name, quantity: item.quantity })),
    totalPoolCents: divisionPrizes.reduce(
      (total, p) =>
        total +
        PLAYERS_PER_PAIR *
          (p.championCents + p.runnerUpCents + p.thirdPlaceCents + p.fourthPlaceCents),
      0,
    ),
  }
}

/** A stable-ish id for newly added rows (no crypto dependency in tests). */
export function newId(prefix: string, existing: readonly { id: string }[]): string {
  let n = existing.length + 1
  const taken = new Set(existing.map((row) => row.id))
  while (taken.has(`${prefix}-${n}`)) n++
  return `${prefix}-${n}`
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Whether an id refers to a row that actually exists in the database.
 *
 * Two kinds of id flow through the settings console. Saved rows carry the
 * database's `uuid`. Everything else carries a readable stand-in: `newId()`
 * mints `division-3` for a row the admin just added, and
 * `defaultTournamentSettings()` ships `div-mens`, `court-1`, `slot-1` for the
 * placeholder settings shown before anything has been saved.
 *
 * The save actions used to decide insert-vs-update by asking whether the id
 * appeared in the settings they had just loaded — which is true for the
 * placeholders, because those *are* what was loaded. So a committee filling in
 * divisions for the first time issued `update ... where id = 'div-mens'` and
 * got `invalid input syntax for type uuid: "div-mens"`. Same for `court-1`.
 * The console was unusable for exactly the case it exists to serve.
 */
export function isPersistedId(id: string): boolean {
  return UUID.test(id)
}

// ---------------------------------------------------------------------------
// Going live
// ---------------------------------------------------------------------------

/** The two switches that decide whether the public site shows anything real. */
export interface LiveStatus {
  /** Publishes the tournament: until this is on, `tournament_public` is empty
   *  and the site falls back to built-in defaults. */
  isPublished: boolean
  /**
   * Organiser override for the registration sheet.
   *
   * `null` — and this is the default — means "follow the registration dates".
   * `true` forces it open, `false` forces it shut. The third answer had to be
   * expressible: while the column was `not null default false` every
   * tournament permanently forced it shut, and the dates were never consulted.
   */
  isRegistrationOpen: boolean | null
}

/**
 * Refuses the one combination that is a trap: registration open on an
 * unpublished tournament. `tournament_public` filters to published rows, so
 * the public site would never see the flag, players would still be told
 * registration is closed, and the committee would be left believing they had
 * opened it.
 */
export function validateLiveStatus(status: LiveStatus): SettingsIssue[] {
  const issues: SettingsIssue[] = []
  if (status.isRegistrationOpen === true && !status.isPublished) {
    issues.push({
      path: 'tournament.is_registration_open',
      severity: 'error',
      message:
        'Publish the tournament first — while it is unpublished the public site cannot see it, so opening registration would have no effect.',
    })
  }
  return issues
}

/** Plain-language read-back of what the two switches currently mean. */
export function describeLiveStatus(status: LiveStatus): string {
  if (!status.isPublished) {
    return 'Not published. The public site is showing built-in placeholder details and nobody can register.'
  }
  if (status.isRegistrationOpen === true) {
    return 'Published, and the registration sheet is open regardless of the calendar.'
  }
  if (status.isRegistrationOpen === false) {
    return 'Published, and the registration sheet is held shut — the dates below are ignored until you switch this back to “Follow the dates”.'
  }
  return 'Published. Registration opens and closes on the dates below, with no help from you.'
}

export function diffLiveStatus(before: LiveStatus, after: LiveStatus): SettingsChange[] {
  const changes: SettingsChange[] = []
  const say = (on: boolean) => (on ? 'on' : 'off')
  if (before.isPublished !== after.isPublished) {
    changes.push({
      path: 'tournament.is_published',
      label: 'Published',
      before: say(before.isPublished),
      after: say(after.isPublished),
    })
  }
  if (before.isRegistrationOpen !== after.isRegistrationOpen) {
    const sayOverride = (value: boolean | null) =>
      value === true ? 'forced open' : value === false ? 'held shut' : 'following the dates'
    changes.push({
      path: 'tournament.is_registration_open',
      label: 'Registration sheet',
      before: sayOverride(before.isRegistrationOpen),
      after: sayOverride(after.isRegistrationOpen),
    })
  }
  return changes
}
