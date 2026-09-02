/**
 * Pure logic behind the `/admin/teams` pairing bench.
 *
 * Everything here is deliberately free of React, Next and Supabase so it can
 * be unit tested directly and imported from a `'use client'` component
 * without dragging `next/headers` into the browser bundle.
 *
 * The domain problem: a doubles tournament needs *pairs*, but players may
 * register solo. Those solo entries sit in a "free agent" pool until an admin
 * pairs two of them into a `teams` row with two `team_members`. This module
 * owns the rules for when that is legal, what is wrong with the teams that
 * already exist, and how seeds are allocated.
 */

import type { AdminDivision, AuditEntry } from '@/lib/admin'
import type { PaymentStatus, RegistrationStatus } from '@/lib/supabase/types'

/** Doubles is two players. Not a magic number scattered through the file. */
export const TEAM_SIZE = 2

/** Longest team name we will store; keeps tables and the TV view readable. */
export const MAX_TEAM_NAME_LENGTH = 48

export type PlayerGender = 'male' | 'female' | 'other' | 'prefer_not_to_say' | null

/**
 * One player as the teams bench sees them. A flattened join of
 * `registrations` + `profiles` + `payments`, with only the fields the pairing
 * decision actually needs — deliberately *no* phone or emergency contact, so
 * this shape can be handed to a client component without leaking PII.
 */
export interface TeamPlayer {
  registrationId: string
  playerId: string
  name: string
  nickname: string | null
  gender: PlayerGender
  divisionId: string
  divisionName: string
  status: RegistrationStatus
  paymentStatus: PaymentStatus
  skillLevel: string | null
  /** `null` for a free agent; otherwise the team they already belong to. */
  teamId: string | null
  createdAt: string
}

export interface AdminTeam {
  id: string
  divisionId: string
  divisionName: string
  /** Optional display name; falls back to the members' names. */
  name: string | null
  seed: number | null
  isConfirmed: boolean
  members: TeamPlayer[]
}

export interface TeamsAdminRows {
  divisions: AdminDivision[]
  teams: AdminTeam[]
  freeAgents: TeamPlayer[]
}

export interface TeamsAdminData extends TeamsAdminRows {
  /** True when the rows above are the bundled demo set, not live data. */
  isDemo: boolean
  /** Set when a live query failed; the rows above are empty in that case. */
  error: string | null
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** "Sleigh Servers", or "Ana & Ben", or a last-resort placeholder. */
export function teamDisplayName(team: AdminTeam): string {
  const explicit = team.name?.trim()
  if (explicit) return explicit
  const names = team.members.map((m) => m.name.trim()).filter(Boolean)
  if (names.length > 0) return names.join(' & ')
  return 'Unnamed team'
}

/**
 * Trims and collapses whitespace, returning `null` for an empty name so the
 * database stores a real NULL (and the UI falls back to the player names)
 * rather than an empty string.
 */
export function normaliseTeamName(input: string): string | null {
  const collapsed = input.replace(/\s+/g, ' ').trim()
  if (!collapsed) return null
  return collapsed.slice(0, MAX_TEAM_NAME_LENGTH)
}

const SKILL_ORDER = ['beginner', 'intermediate', 'advanced', 'open'] as const

/** Numeric rank for a skill level; unknown levels sort in the middle. */
export function skillRank(level: string | null): number {
  const index = SKILL_ORDER.indexOf((level ?? '') as (typeof SKILL_ORDER)[number])
  return index === -1 ? 1.5 : index
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type TeamIssueCode =
  | 'wrong_size'
  | 'division_mismatch'
  | 'gender_mismatch'
  | 'duplicate_player'
  | 'unapproved_member'
  | 'unpaid_member'
  | 'duplicate_seed'
  | 'seed_out_of_range'

export type IssueSeverity = 'error' | 'warning'

export interface TeamIssue {
  code: TeamIssueCode
  severity: IssueSeverity
  message: string
}

export const TEAM_ISSUE_LABELS: Record<TeamIssueCode, string> = {
  wrong_size: 'Wrong number of players',
  division_mismatch: 'Members in different divisions',
  gender_mismatch: "Members don't match the division",
  duplicate_player: 'Player is in more than one team',
  unapproved_member: 'A member is not approved yet',
  unpaid_member: 'A member still owes the entry fee',
  duplicate_seed: 'Seed is used twice',
  seed_out_of_range: 'Seed is outside the division size',
}

/**
 * Does a player's recorded gender fit a division? Unknown / undisclosed
 * gender never raises a flag — we would rather stay quiet than misgender
 * someone on the strength of a blank profile field.
 */
export function genderFitsDivision(
  gender: PlayerGender,
  divisionGender: AdminDivision['gender']
): boolean {
  if (divisionGender === 'open' || divisionGender === 'mixed') return true
  if (gender === null || gender === 'prefer_not_to_say' || gender === 'other') return true
  return divisionGender === 'mens' ? gender === 'male' : gender === 'female'
}

/** Mixed doubles wants exactly one male and one female where both are known. */
function mixedPairIsValid(members: readonly TeamPlayer[]): boolean {
  const known = members.map((m) => m.gender).filter((g) => g === 'male' || g === 'female')
  if (known.length < TEAM_SIZE) return true
  return new Set(known).size === TEAM_SIZE
}

/**
 * Every problem worth an admin's attention across the whole team list.
 *
 * Returned as a map keyed by team id so the caller can render badges without
 * re-running the cross-team checks (duplicate player, duplicate seed) per row.
 */
export function validateTeams(
  teams: readonly AdminTeam[],
  divisions: readonly AdminDivision[]
): Map<string, TeamIssue[]> {
  const divisionById = new Map(divisions.map((d) => [d.id, d]))

  const teamsByPlayer = new Map<string, number>()
  const seedUses = new Map<string, number>()
  for (const team of teams) {
    for (const member of team.members) {
      teamsByPlayer.set(member.playerId, (teamsByPlayer.get(member.playerId) ?? 0) + 1)
    }
    if (team.seed !== null) {
      const key = `${team.divisionId}:${team.seed.toString()}`
      seedUses.set(key, (seedUses.get(key) ?? 0) + 1)
    }
  }

  const result = new Map<string, TeamIssue[]>()

  for (const team of teams) {
    const issues: TeamIssue[] = []
    const division = divisionById.get(team.divisionId)

    if (team.members.length !== TEAM_SIZE) {
      issues.push({
        code: 'wrong_size',
        severity: 'error',
        message: `Doubles teams need ${TEAM_SIZE.toString()} players — this one has ${team.members.length.toString()}.`,
      })
    }

    const strays = team.members.filter((m) => m.divisionId !== team.divisionId)
    if (strays.length > 0) {
      issues.push({
        code: 'division_mismatch',
        severity: 'error',
        message: `${strays.map((m) => m.name).join(' and ')} registered for a different division.`,
      })
    }

    if (division) {
      if (division.gender === 'mixed') {
        if (!mixedPairIsValid(team.members)) {
          issues.push({
            code: 'gender_mismatch',
            severity: 'error',
            message: `${division.name} needs one player of each gender.`,
          })
        }
      } else {
        const wrong = team.members.filter((m) => !genderFitsDivision(m.gender, division.gender))
        if (wrong.length > 0) {
          issues.push({
            code: 'gender_mismatch',
            severity: 'error',
            message: `${wrong.map((m) => m.name).join(' and ')} cannot play in ${division.name}.`,
          })
        }
      }
    }

    const doubled = team.members.filter((m) => (teamsByPlayer.get(m.playerId) ?? 0) > 1)
    if (doubled.length > 0) {
      issues.push({
        code: 'duplicate_player',
        severity: 'error',
        message: `${doubled.map((m) => m.name).join(' and ')} appear in more than one team.`,
      })
    }

    if (team.seed !== null) {
      const key = `${team.divisionId}:${team.seed.toString()}`
      if ((seedUses.get(key) ?? 0) > 1) {
        issues.push({
          code: 'duplicate_seed',
          severity: 'error',
          message: `Seed ${team.seed.toString()} is used by another team in this division.`,
        })
      }
      const max = division?.maxTeams ?? null
      if (team.seed < 1 || (max !== null && team.seed > max)) {
        issues.push({
          code: 'seed_out_of_range',
          severity: 'warning',
          message:
            max === null
              ? 'Seeds start at 1.'
              : `Seeds run from 1 to ${max.toString()} in this division.`,
        })
      }
    }

    const unapproved = team.members.filter((m) => m.status !== 'approved')
    if (unapproved.length > 0) {
      issues.push({
        code: 'unapproved_member',
        severity: 'warning',
        message: `${unapproved.map((m) => m.name).join(' and ')} still ${
          unapproved.length === 1 ? 'needs' : 'need'
        } approving.`,
      })
    }

    const owing = team.members.filter((m) => m.paymentStatus !== 'paid')
    if (owing.length > 0) {
      issues.push({
        code: 'unpaid_member',
        severity: 'warning',
        message: `${owing.map((m) => m.name).join(' and ')} still ${
          owing.length === 1 ? 'owes' : 'owe'
        } the entry fee.`,
      })
    }

    result.set(team.id, issues)
  }

  return result
}

/** True when a team has at least one blocking (not merely advisory) problem. */
export function hasBlockingIssue(issues: readonly TeamIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error')
}

export interface IssueTally {
  errors: number
  warnings: number
  teamsWithIssues: number
}

export function tallyIssues(issuesByTeam: ReadonlyMap<string, TeamIssue[]>): IssueTally {
  let errors = 0
  let warnings = 0
  let teamsWithIssues = 0
  for (const issues of issuesByTeam.values()) {
    if (issues.length > 0) teamsWithIssues += 1
    for (const issue of issues) {
      if (issue.severity === 'error') errors += 1
      else warnings += 1
    }
  }
  return { errors, warnings, teamsWithIssues }
}

// ---------------------------------------------------------------------------
// Pairing + dissolving
// ---------------------------------------------------------------------------

export type PairErrorCode =
  | 'same_player'
  | 'already_paired'
  | 'division_mismatch'
  | 'unknown_division'
  | 'gender_mismatch'
  | 'rejected_member'

export type PlanResult<T> = { ok: true; value: T } | { ok: false; code: string; message: string }

export interface PairingPlan {
  divisionId: string
  divisionName: string
  playerIds: [string, string]
  registrationIds: [string, string]
  /** Suggested display name, used when the admin doesn't type one. */
  suggestedName: string
}

/**
 * Decides whether two free agents may become a team.
 *
 * Payment and approval state are deliberately *not* blocking: an admin often
 * pairs people before the money lands, and `validateTeams` will keep nagging
 * about it afterwards. A rejected registration is blocking, because that
 * player is not in the tournament at all.
 */
export function planPairing(
  a: TeamPlayer,
  b: TeamPlayer,
  divisions: readonly AdminDivision[]
): PlanResult<PairingPlan> {
  if (a.playerId === b.playerId) {
    return { ok: false, code: 'same_player', message: 'A player cannot partner themselves.' }
  }
  if (a.teamId !== null || b.teamId !== null) {
    const paired = [a, b].filter((p) => p.teamId !== null).map((p) => p.name)
    return {
      ok: false,
      code: 'already_paired',
      message: `${paired.join(' and ')} already belong to a team.`,
    }
  }
  if (a.status === 'rejected' || b.status === 'rejected') {
    const rejected = [a, b].filter((p) => p.status === 'rejected').map((p) => p.name)
    return {
      ok: false,
      code: 'rejected_member',
      message: `${rejected.join(' and ')} were rejected and cannot be paired.`,
    }
  }
  if (a.divisionId !== b.divisionId) {
    return {
      ok: false,
      code: 'division_mismatch',
      message: `${a.name} is in ${a.divisionName} and ${b.name} is in ${b.divisionName}.`,
    }
  }

  const division = divisions.find((d) => d.id === a.divisionId)
  if (!division) {
    return {
      ok: false,
      code: 'unknown_division',
      message: 'That division no longer exists.',
    }
  }

  if (division.gender === 'mixed') {
    if (!mixedPairIsValid([a, b])) {
      return {
        ok: false,
        code: 'gender_mismatch',
        message: `${division.name} needs one player of each gender.`,
      }
    }
  } else {
    const wrong = [a, b].filter((p) => !genderFitsDivision(p.gender, division.gender))
    if (wrong.length > 0) {
      return {
        ok: false,
        code: 'gender_mismatch',
        message: `${wrong.map((p) => p.name).join(' and ')} cannot play in ${division.name}.`,
      }
    }
  }

  return {
    ok: true,
    value: {
      divisionId: division.id,
      divisionName: division.name,
      playerIds: [a.playerId, b.playerId],
      registrationIds: [a.registrationId, b.registrationId],
      suggestedName: `${a.name} & ${b.name}`,
    },
  }
}

export interface DissolvePlan {
  teamId: string
  divisionId: string
  /** The players who go back into the free-agent pool. */
  freed: TeamPlayer[]
}

/**
 * Breaking a team up. Confirmed teams are protected behind `force` because
 * they may already be sitting in a published draw — the admin has to say
 * they mean it.
 */
export function planDissolve(
  team: AdminTeam,
  options: { force?: boolean } = {}
): PlanResult<DissolvePlan> {
  if (team.members.length === 0) {
    return {
      ok: false,
      code: 'empty_team',
      message: 'That team has no members to release.',
    }
  }
  if (team.isConfirmed && !options.force) {
    return {
      ok: false,
      code: 'confirmed',
      message: `${teamDisplayName(team)} is confirmed and may already be in the draw. Confirm again to dissolve it.`,
    }
  }
  return {
    ok: true,
    value: {
      teamId: team.id,
      divisionId: team.divisionId,
      freed: [...team.members],
    },
  }
}

// ---------------------------------------------------------------------------
// Seeds
// ---------------------------------------------------------------------------

/** Parses a seed input box. Blank clears the seed; junk is rejected loudly. */
export function parseSeed(input: string): PlanResult<number | null> {
  const trimmed = input.trim()
  if (!trimmed) return { ok: true, value: null }
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, code: 'not_a_number', message: 'Seeds are whole numbers, e.g. 3.' }
  }
  const seed = Number.parseInt(trimmed, 10)
  if (seed < 1) {
    return { ok: false, code: 'out_of_range', message: 'Seeds start at 1.' }
  }
  return { ok: true, value: seed }
}

/**
 * Validates a seed against the rest of its division before we write it.
 * Returns the seed itself so callers can use this as a parse-and-check step.
 */
export function planSeedAssignment(
  team: AdminTeam,
  seed: number | null,
  teams: readonly AdminTeam[],
  divisions: readonly AdminDivision[]
): PlanResult<number | null> {
  if (seed === null) return { ok: true, value: null }
  if (!Number.isInteger(seed) || seed < 1) {
    return { ok: false, code: 'out_of_range', message: 'Seeds start at 1.' }
  }
  const max = divisions.find((d) => d.id === team.divisionId)?.maxTeams ?? null
  if (max !== null && seed > max) {
    return {
      ok: false,
      code: 'out_of_range',
      message: `This division only seeds up to ${max.toString()}.`,
    }
  }
  const clash = teams.find(
    (other) =>
      other.id !== team.id && other.divisionId === team.divisionId && other.seed === seed
  )
  if (clash) {
    return {
      ok: false,
      code: 'duplicate_seed',
      message: `Seed ${seed.toString()} already belongs to ${teamDisplayName(clash)}.`,
    }
  }
  return { ok: true, value: seed }
}

/** Lowest unused seed in a division, starting at 1. */
export function nextAvailableSeed(divisionId: string, teams: readonly AdminTeam[]): number {
  const taken = new Set(
    teams.filter((t) => t.divisionId === divisionId && t.seed !== null).map((t) => t.seed)
  )
  let seed = 1
  while (taken.has(seed)) seed += 1
  return seed
}

// ---------------------------------------------------------------------------
// The free-agent pool
// ---------------------------------------------------------------------------

export interface PairingPoolSummary {
  divisionId: string
  divisionName: string
  freeAgents: number
  /** Complete pairs we could make right now. */
  possiblePairs: number
  /** True when someone would be left without a partner. */
  hasOddOneOut: boolean
  teams: number
  maxTeams: number | null
}

export function summarisePairingPool(
  freeAgents: readonly TeamPlayer[],
  // Only the division matters here, so accept anything team-shaped enough.
  teams: readonly Pick<AdminTeam, 'divisionId'>[],
  divisions: readonly AdminDivision[]
): PairingPoolSummary[] {
  return divisions.map((division) => {
    const pool = freeAgents.filter((p) => p.divisionId === division.id)
    return {
      divisionId: division.id,
      divisionName: division.name,
      freeAgents: pool.length,
      possiblePairs: Math.floor(pool.length / TEAM_SIZE),
      hasOddOneOut: pool.length % TEAM_SIZE !== 0,
      teams: teams.filter((t) => t.divisionId === division.id).length,
      maxTeams: division.maxTeams,
    }
  })
}

/**
 * A deterministic first-cut pairing of the free-agent pool.
 *
 * Strategy: within each division, sort by skill then by registration time and
 * pair neighbours, so beginners land with beginners rather than being fed to
 * an open-grade player in round one. The odd one out (if any) is left alone.
 * Deterministic ordering matters — the same pool must always produce the same
 * suggestion, or server and client renders disagree.
 */
export function suggestPairings(
  freeAgents: readonly TeamPlayer[],
  divisions: readonly AdminDivision[]
): [TeamPlayer, TeamPlayer][] {
  const pairs: [TeamPlayer, TeamPlayer][] = []
  for (const division of divisions) {
    const pool = freeAgents
      .filter((p) => p.divisionId === division.id && p.status !== 'rejected' && p.teamId === null)
      .slice()
      .sort(
        (a, b) =>
          skillRank(a.skillLevel) - skillRank(b.skillLevel) ||
          a.createdAt.localeCompare(b.createdAt) ||
          a.playerId.localeCompare(b.playerId)
      )
    for (let i = 0; i + 1 < pool.length; i += TEAM_SIZE) {
      const plan = planPairing(pool[i], pool[i + 1], divisions)
      if (plan.ok) pairs.push([pool[i], pool[i + 1]])
    }
  }
  return pairs
}

// ---------------------------------------------------------------------------
// Filtering + sorting
// ---------------------------------------------------------------------------

export interface TeamFilters {
  divisionId: string
  search: string
  issuesOnly: boolean
}

export const EMPTY_TEAM_FILTERS: TeamFilters = {
  divisionId: 'all',
  search: '',
  issuesOnly: false,
}

export function teamMatchesSearch(team: AdminTeam, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystack = [
    team.name ?? '',
    teamDisplayName(team),
    team.divisionName,
    team.seed === null ? '' : `seed ${team.seed.toString()}`,
    ...team.members.flatMap((m) => [m.name, m.nickname ?? '', m.skillLevel ?? '']),
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(q)
}

export function filterTeams(
  teams: readonly AdminTeam[],
  filters: TeamFilters,
  issuesByTeam: ReadonlyMap<string, TeamIssue[]>
): AdminTeam[] {
  return teams.filter((team) => {
    if (filters.divisionId !== 'all' && team.divisionId !== filters.divisionId) return false
    if (filters.issuesOnly && (issuesByTeam.get(team.id) ?? []).length === 0) return false
    return teamMatchesSearch(team, filters.search)
  })
}

/** Division, then seeded teams in seed order, then unseeded teams by name. */
export function sortTeams(teams: readonly AdminTeam[]): AdminTeam[] {
  return teams.slice().sort((a, b) => {
    if (a.divisionName !== b.divisionName) return a.divisionName.localeCompare(b.divisionName)
    if (a.seed !== b.seed) {
      if (a.seed === null) return 1
      if (b.seed === null) return -1
      return a.seed - b.seed
    }
    return teamDisplayName(a).localeCompare(teamDisplayName(b))
  })
}

export function sortFreeAgents(players: readonly TeamPlayer[]): TeamPlayer[] {
  return players.slice().sort(
    (a, b) =>
      a.divisionName.localeCompare(b.divisionName) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.name.localeCompare(b.name)
  )
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export function teamAuditEntry(
  action: 'team.created' | 'team.dissolved' | 'team.renamed' | 'team.seeded',
  teamId: string | null,
  metadata: AuditEntry['metadata']
): AuditEntry {
  return {
    action,
    entity_type: 'team',
    entity_id: teamId,
    metadata,
  }
}
