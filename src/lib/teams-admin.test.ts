import { describe, expect, it } from 'vitest'

import type { AdminDivision } from '@/lib/admin'
import {
  EMPTY_TEAM_FILTERS,
  MAX_TEAM_NAME_LENGTH,
  TEAM_ISSUE_LABELS,
  TEAM_SIZE,
  filterTeams,
  genderFitsDivision,
  hasBlockingIssue,
  nextAvailableSeed,
  normaliseTeamName,
  parseSeed,
  planDissolve,
  planPairing,
  planSeedAssignment,
  skillRank,
  sortFreeAgents,
  sortTeams,
  suggestPairings,
  summarisePairingPool,
  tallyIssues,
  teamAuditEntry,
  teamDisplayName,
  teamMatchesSearch,
  validateTeams,
  type AdminTeam,
  type TeamIssueCode,
  type TeamPlayer,
} from './teams-admin'

const DIVISIONS: AdminDivision[] = [
  { id: 'mens', name: "Men's Doubles", gender: 'mens', maxTeams: 12 },
  { id: 'womens', name: "Women's Doubles", gender: 'womens', maxTeams: 12 },
  { id: 'mixed', name: 'Mixed Doubles', gender: 'mixed', maxTeams: null },
  { id: 'open', name: 'Open Doubles', gender: 'open', maxTeams: 4 },
]

type PlayerOverrides = Partial<TeamPlayer> & { playerId: string }

function player(overrides: PlayerOverrides): TeamPlayer {
  const { playerId } = overrides
  return {
    registrationId: `reg-${playerId}`,
    name: `Player ${playerId}`,
    nickname: null,
    gender: 'male',
    divisionId: 'mens',
    divisionName: "Men's Doubles",
    status: 'approved',
    paymentStatus: 'paid',
    shirtSize: 'M',
    skillLevel: 'intermediate',
    teamId: null,
    createdAt: '2026-09-06T00:00:00.000Z',
    ...overrides,
  }
}

type TeamOverrides = Partial<Omit<AdminTeam, 'members'>> & {
  id: string
  members?: TeamPlayer[]
}

function team(overrides: TeamOverrides): AdminTeam {
  const { id, members, ...rest } = overrides
  const resolved = members ?? [
    player({ playerId: `${id}-a`, teamId: id }),
    player({ playerId: `${id}-b`, teamId: id }),
  ]
  return {
    id,
    divisionId: 'mens',
    divisionName: "Men's Doubles",
    name: null,
    seed: null,
    isConfirmed: false,
    members: resolved,
    ...rest,
  }
}

function codes(issues: { code: TeamIssueCode }[]): TeamIssueCode[] {
  return issues.map((issue) => issue.code)
}

describe('teamDisplayName', () => {
  it('prefers an explicit name', () => {
    expect(teamDisplayName(team({ id: 't1', name: 'Sleigh Servers' }))).toBe('Sleigh Servers')
  })

  it('falls back to the members joined with an ampersand', () => {
    const t = team({
      id: 't1',
      members: [
        player({ playerId: 'p1', name: 'Ana Reyes' }),
        player({ playerId: 'p2', name: 'Ben Cole' }),
      ],
    })
    expect(teamDisplayName(t)).toBe('Ana Reyes & Ben Cole')
  })

  it('ignores a whitespace-only name', () => {
    const t = team({
      id: 't1',
      name: '   ',
      members: [player({ playerId: 'p1', name: 'Ana Reyes' })],
    })
    expect(teamDisplayName(t)).toBe('Ana Reyes')
  })

  it('has a last-resort placeholder for an empty team', () => {
    expect(teamDisplayName(team({ id: 't1', members: [] }))).toBe('Unnamed team')
  })
})

describe('normaliseTeamName', () => {
  it('returns null for blank input so the column stores a real NULL', () => {
    expect(normaliseTeamName('')).toBeNull()
    expect(normaliseTeamName('   \n ')).toBeNull()
  })

  it('collapses internal whitespace', () => {
    expect(normaliseTeamName('  Jingle   Bell   Rockets ')).toBe('Jingle Bell Rockets')
  })

  it('truncates to the maximum length', () => {
    const long = 'a'.repeat(MAX_TEAM_NAME_LENGTH + 20)
    expect(normaliseTeamName(long)).toHaveLength(MAX_TEAM_NAME_LENGTH)
  })
})

describe('skillRank', () => {
  it('orders the known levels', () => {
    expect(skillRank('beginner')).toBeLessThan(skillRank('intermediate'))
    expect(skillRank('intermediate')).toBeLessThan(skillRank('advanced'))
    expect(skillRank('advanced')).toBeLessThan(skillRank('open'))
  })

  it('sorts an unknown level in the middle rather than at an extreme', () => {
    expect(skillRank(null)).toBeGreaterThan(skillRank('beginner'))
    expect(skillRank(null)).toBeLessThan(skillRank('advanced'))
  })
})

describe('genderFitsDivision', () => {
  it('matches gendered divisions', () => {
    expect(genderFitsDivision('male', 'mens')).toBe(true)
    expect(genderFitsDivision('female', 'mens')).toBe(false)
    expect(genderFitsDivision('female', 'womens')).toBe(true)
    expect(genderFitsDivision('male', 'womens')).toBe(false)
  })

  it('never complains about unknown or undisclosed gender', () => {
    expect(genderFitsDivision(null, 'mens')).toBe(true)
    expect(genderFitsDivision('prefer_not_to_say', 'womens')).toBe(true)
    expect(genderFitsDivision('other', 'mens')).toBe(true)
  })

  it('accepts anyone in open and mixed divisions', () => {
    expect(genderFitsDivision('female', 'open')).toBe(true)
    expect(genderFitsDivision('male', 'mixed')).toBe(true)
  })
})

describe('validateTeams', () => {
  it('reports nothing for a healthy team', () => {
    const issues = validateTeams([team({ id: 't1' })], DIVISIONS)
    expect(issues.get('t1')).toEqual([])
  })

  it('flags a team without exactly two players', () => {
    const solo = team({ id: 't1', members: [player({ playerId: 'p1', teamId: 't1' })] })
    const issues = validateTeams([solo], DIVISIONS)
    expect(codes(issues.get('t1') ?? [])).toContain('wrong_size')
  })

  it('flags a member registered in another division', () => {
    const t = team({
      id: 't1',
      members: [
        player({ playerId: 'p1', teamId: 't1' }),
        player({
          playerId: 'p2',
          teamId: 't1',
          divisionId: 'womens',
          divisionName: "Women's Doubles",
          gender: 'female',
        }),
      ],
    })
    expect(codes(validateTeams([t], DIVISIONS).get('t1') ?? [])).toContain('division_mismatch')
  })

  it("flags a member whose gender doesn't match the division", () => {
    const t = team({
      id: 't1',
      members: [
        player({ playerId: 'p1', teamId: 't1' }),
        player({ playerId: 'p2', teamId: 't1', gender: 'female', name: 'Bree Walsh' }),
      ],
    })
    const issues = validateTeams([t], DIVISIONS).get('t1') ?? []
    expect(codes(issues)).toContain('gender_mismatch')
    expect(issues.find((i) => i.code === 'gender_mismatch')?.message).toContain('Bree Walsh')
  })

  it('requires one of each gender in a mixed division', () => {
    const sameGender = team({
      id: 't1',
      divisionId: 'mixed',
      divisionName: 'Mixed Doubles',
      members: [
        player({ playerId: 'p1', teamId: 't1', divisionId: 'mixed', divisionName: 'Mixed Doubles' }),
        player({ playerId: 'p2', teamId: 't1', divisionId: 'mixed', divisionName: 'Mixed Doubles' }),
      ],
    })
    expect(codes(validateTeams([sameGender], DIVISIONS).get('t1') ?? [])).toContain(
      'gender_mismatch'
    )

    const mixedPair = team({
      id: 't2',
      divisionId: 'mixed',
      divisionName: 'Mixed Doubles',
      members: [
        player({ playerId: 'p3', teamId: 't2', divisionId: 'mixed', divisionName: 'Mixed Doubles' }),
        player({
          playerId: 'p4',
          teamId: 't2',
          divisionId: 'mixed',
          divisionName: 'Mixed Doubles',
          gender: 'female',
        }),
      ],
    })
    expect(codes(validateTeams([mixedPair], DIVISIONS).get('t2') ?? [])).not.toContain(
      'gender_mismatch'
    )
  })

  it('flags a player who appears in two teams, on both teams', () => {
    const shared = player({ playerId: 'dup', name: 'Double Booked', teamId: 't1' })
    const t1 = team({ id: 't1', members: [shared, player({ playerId: 'p1', teamId: 't1' })] })
    const t2 = team({
      id: 't2',
      members: [{ ...shared, teamId: 't2' }, player({ playerId: 'p2', teamId: 't2' })],
    })
    const issues = validateTeams([t1, t2], DIVISIONS)
    expect(codes(issues.get('t1') ?? [])).toContain('duplicate_player')
    expect(codes(issues.get('t2') ?? [])).toContain('duplicate_player')
  })

  it('flags a duplicate seed only within the same division', () => {
    const a = team({ id: 't1', seed: 3 })
    const b = team({ id: 't2', seed: 3 })
    const other = team({
      id: 't3',
      seed: 3,
      divisionId: 'womens',
      divisionName: "Women's Doubles",
      members: [
        player({ playerId: 'w1', teamId: 't3', divisionId: 'womens', gender: 'female' }),
        player({ playerId: 'w2', teamId: 't3', divisionId: 'womens', gender: 'female' }),
      ],
    })
    const issues = validateTeams([a, b, other], DIVISIONS)
    expect(codes(issues.get('t1') ?? [])).toContain('duplicate_seed')
    expect(codes(issues.get('t2') ?? [])).toContain('duplicate_seed')
    expect(codes(issues.get('t3') ?? [])).not.toContain('duplicate_seed')
  })

  it('warns when a seed is above the division cap', () => {
    const issues = validateTeams([team({ id: 't1', seed: 99 })], DIVISIONS)
    const issue = (issues.get('t1') ?? []).find((i) => i.code === 'seed_out_of_range')
    expect(issue?.severity).toBe('warning')
    expect(issue?.message).toContain('12')
  })

  it('does not cap seeds in an uncapped division', () => {
    const t = team({
      id: 't1',
      seed: 99,
      divisionId: 'mixed',
      divisionName: 'Mixed Doubles',
      members: [
        player({ playerId: 'p1', teamId: 't1', divisionId: 'mixed' }),
        player({ playerId: 'p2', teamId: 't1', divisionId: 'mixed', gender: 'female' }),
      ],
    })
    expect(codes(validateTeams([t], DIVISIONS).get('t1') ?? [])).not.toContain('seed_out_of_range')
  })

  it('warns about unapproved and unpaid members without blocking', () => {
    const t = team({
      id: 't1',
      members: [
        player({ playerId: 'p1', teamId: 't1', status: 'pending' }),
        player({ playerId: 'p2', teamId: 't1', paymentStatus: 'partial' }),
      ],
    })
    const issues = validateTeams([t], DIVISIONS).get('t1') ?? []
    expect(codes(issues)).toEqual(
      expect.arrayContaining(['unapproved_member', 'unpaid_member'])
    )
    expect(hasBlockingIssue(issues)).toBe(false)
  })

  it('treats size, division, gender, duplicate player and duplicate seed as blocking', () => {
    const t = team({ id: 't1', members: [player({ playerId: 'p1', teamId: 't1' })] })
    expect(hasBlockingIssue(validateTeams([t], DIVISIONS).get('t1') ?? [])).toBe(true)
  })

  it('has a label for every issue code it can emit', () => {
    const broken = team({
      id: 't1',
      seed: 0,
      members: [player({ playerId: 'p1', teamId: 't1', status: 'pending', paymentStatus: 'unpaid' })],
    })
    for (const issue of validateTeams([broken], DIVISIONS).get('t1') ?? []) {
      expect(TEAM_ISSUE_LABELS[issue.code]).toBeTruthy()
    }
  })
})

describe('tallyIssues', () => {
  it('counts errors, warnings and affected teams separately', () => {
    const broken = team({
      id: 't1',
      members: [player({ playerId: 'p1', teamId: 't1', paymentStatus: 'unpaid' })],
    })
    const healthy = team({ id: 't2' })
    const tally = tallyIssues(validateTeams([broken, healthy], DIVISIONS))
    expect(tally.errors).toBe(1)
    expect(tally.warnings).toBe(1)
    expect(tally.teamsWithIssues).toBe(1)
  })
})

describe('planPairing', () => {
  it('pairs two compatible free agents', () => {
    const a = player({ playerId: 'p1', name: 'Ana Reyes' })
    const b = player({ playerId: 'p2', name: 'Ben Cole' })
    const result = planPairing(a, b, DIVISIONS)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.playerIds).toEqual(['p1', 'p2'])
    expect(result.value.registrationIds).toEqual(['reg-p1', 'reg-p2'])
    expect(result.value.suggestedName).toBe('Ana Reyes & Ben Cole')
    expect(result.value.divisionId).toBe('mens')
  })

  it('refuses to pair a player with themselves', () => {
    const a = player({ playerId: 'p1' })
    const result = planPairing(a, { ...a }, DIVISIONS)
    expect(result).toMatchObject({ ok: false, code: 'same_player' })
  })

  it('refuses a player who already has a team', () => {
    const result = planPairing(
      player({ playerId: 'p1', name: 'Ana Reyes', teamId: 'existing' }),
      player({ playerId: 'p2' }),
      DIVISIONS
    )
    expect(result).toMatchObject({ ok: false, code: 'already_paired' })
    if (result.ok) return
    expect(result.message).toContain('Ana Reyes')
  })

  it('refuses players from different divisions', () => {
    const result = planPairing(
      player({ playerId: 'p1' }),
      player({
        playerId: 'p2',
        divisionId: 'womens',
        divisionName: "Women's Doubles",
        gender: 'female',
      }),
      DIVISIONS
    )
    expect(result).toMatchObject({ ok: false, code: 'division_mismatch' })
  })

  it('refuses a player whose gender does not fit the division', () => {
    const result = planPairing(
      player({ playerId: 'p1' }),
      player({ playerId: 'p2', gender: 'female' }),
      DIVISIONS
    )
    expect(result).toMatchObject({ ok: false, code: 'gender_mismatch' })
  })

  it('refuses two same-gender players in a mixed division', () => {
    const result = planPairing(
      player({ playerId: 'p1', divisionId: 'mixed', divisionName: 'Mixed Doubles' }),
      player({ playerId: 'p2', divisionId: 'mixed', divisionName: 'Mixed Doubles' }),
      DIVISIONS
    )
    expect(result).toMatchObject({ ok: false, code: 'gender_mismatch' })
  })

  it('refuses a rejected registration', () => {
    const result = planPairing(
      player({ playerId: 'p1', status: 'rejected', name: 'Yusuf Demir' }),
      player({ playerId: 'p2' }),
      DIVISIONS
    )
    expect(result).toMatchObject({ ok: false, code: 'rejected_member' })
  })

  it('refuses a division that no longer exists', () => {
    const result = planPairing(
      player({ playerId: 'p1', divisionId: 'ghost' }),
      player({ playerId: 'p2', divisionId: 'ghost' }),
      DIVISIONS
    )
    expect(result).toMatchObject({ ok: false, code: 'unknown_division' })
  })

  it('still pairs players who are unapproved or unpaid', () => {
    const result = planPairing(
      player({ playerId: 'p1', status: 'pending', paymentStatus: 'unpaid' }),
      player({ playerId: 'p2', status: 'waitlisted', paymentStatus: 'partial' }),
      DIVISIONS
    )
    expect(result.ok).toBe(true)
  })
})

describe('planDissolve', () => {
  it('releases both members back to the pool', () => {
    const result = planDissolve(team({ id: 't1' }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.freed).toHaveLength(TEAM_SIZE)
    expect(result.value.teamId).toBe('t1')
  })

  it('refuses an empty team', () => {
    expect(planDissolve(team({ id: 't1', members: [] }))).toMatchObject({
      ok: false,
      code: 'empty_team',
    })
  })

  it('protects a confirmed team until the admin forces it', () => {
    const confirmed = team({ id: 't1', isConfirmed: true, name: 'Sleigh Servers' })
    const guarded = planDissolve(confirmed)
    expect(guarded).toMatchObject({ ok: false, code: 'confirmed' })
    if (!guarded.ok) expect(guarded.message).toContain('Sleigh Servers')
    expect(planDissolve(confirmed, { force: true }).ok).toBe(true)
  })
})

describe('parseSeed', () => {
  it('treats blank input as clearing the seed', () => {
    expect(parseSeed('')).toEqual({ ok: true, value: null })
    expect(parseSeed('   ')).toEqual({ ok: true, value: null })
  })

  it('parses a whole number', () => {
    expect(parseSeed(' 7 ')).toEqual({ ok: true, value: 7 })
  })

  it('rejects junk and non-integers', () => {
    expect(parseSeed('two')).toMatchObject({ ok: false, code: 'not_a_number' })
    expect(parseSeed('3.5')).toMatchObject({ ok: false, code: 'not_a_number' })
    expect(parseSeed('-1')).toMatchObject({ ok: false, code: 'not_a_number' })
  })

  it('rejects zero', () => {
    expect(parseSeed('0')).toMatchObject({ ok: false, code: 'out_of_range' })
  })
})

describe('planSeedAssignment', () => {
  const existing = team({ id: 't1', seed: 4, name: 'Sleigh Servers' })
  const target = team({ id: 't2' })

  it('accepts a free seed', () => {
    expect(planSeedAssignment(target, 5, [existing, target], DIVISIONS)).toEqual({
      ok: true,
      value: 5,
    })
  })

  it('always accepts clearing the seed', () => {
    expect(planSeedAssignment(target, null, [existing, target], DIVISIONS)).toEqual({
      ok: true,
      value: null,
    })
  })

  it('rejects a seed already used in the same division', () => {
    const result = planSeedAssignment(target, 4, [existing, target], DIVISIONS)
    expect(result).toMatchObject({ ok: false, code: 'duplicate_seed' })
    if (!result.ok) expect(result.message).toContain('Sleigh Servers')
  })

  it('lets a team keep its own seed', () => {
    expect(planSeedAssignment(existing, 4, [existing, target], DIVISIONS).ok).toBe(true)
  })

  it('rejects a seed above the division cap', () => {
    expect(planSeedAssignment(target, 13, [target], DIVISIONS)).toMatchObject({
      ok: false,
      code: 'out_of_range',
    })
  })

  it('rejects zero, negatives and fractions', () => {
    expect(planSeedAssignment(target, 0, [target], DIVISIONS).ok).toBe(false)
    expect(planSeedAssignment(target, -2, [target], DIVISIONS).ok).toBe(false)
    expect(planSeedAssignment(target, 1.5, [target], DIVISIONS).ok).toBe(false)
  })
})

describe('nextAvailableSeed', () => {
  it('starts at 1 for an empty division', () => {
    expect(nextAvailableSeed('mens', [])).toBe(1)
  })

  it('fills the first gap rather than appending', () => {
    const teams = [team({ id: 't1', seed: 1 }), team({ id: 't2', seed: 3 })]
    expect(nextAvailableSeed('mens', teams)).toBe(2)
  })

  it('ignores seeds from other divisions', () => {
    const teams = [team({ id: 't1', seed: 1, divisionId: 'womens' })]
    expect(nextAvailableSeed('mens', teams)).toBe(1)
  })
})

describe('summarisePairingPool', () => {
  it('counts pairs and spots the odd one out', () => {
    const pool = [
      player({ playerId: 'p1' }),
      player({ playerId: 'p2' }),
      player({ playerId: 'p3' }),
      player({ playerId: 'w1', divisionId: 'womens', divisionName: "Women's Doubles", gender: 'female' }),
    ]
    const summary = summarisePairingPool(pool, [team({ id: 't1' })], DIVISIONS)
    const mens = summary.find((s) => s.divisionId === 'mens')
    expect(mens).toMatchObject({ freeAgents: 3, possiblePairs: 1, hasOddOneOut: true, teams: 1 })
    const womens = summary.find((s) => s.divisionId === 'womens')
    expect(womens).toMatchObject({ freeAgents: 1, possiblePairs: 0, hasOddOneOut: true, teams: 0 })
  })

  it('reports an even pool as fully pairable', () => {
    const pool = [player({ playerId: 'p1' }), player({ playerId: 'p2' })]
    const mens = summarisePairingPool(pool, [], DIVISIONS).find((s) => s.divisionId === 'mens')
    expect(mens).toMatchObject({ possiblePairs: 1, hasOddOneOut: false })
  })
})

describe('suggestPairings', () => {
  it('pairs like skill with like skill and leaves the odd one out', () => {
    const pool = [
      player({ playerId: 'p1', skillLevel: 'advanced' }),
      player({ playerId: 'p2', skillLevel: 'beginner' }),
      player({ playerId: 'p3', skillLevel: 'beginner' }),
      player({ playerId: 'p4', skillLevel: 'advanced' }),
      player({ playerId: 'p5', skillLevel: 'open' }),
    ]
    const pairs = suggestPairings(pool, DIVISIONS)
    expect(pairs).toHaveLength(2)
    expect(pairs[0].map((p) => p.playerId).sort()).toEqual(['p2', 'p3'])
    expect(pairs[1].map((p) => p.playerId).sort()).toEqual(['p1', 'p4'])
  })

  it('is deterministic for the same pool', () => {
    const pool = [
      player({ playerId: 'p1' }),
      player({ playerId: 'p2' }),
      player({ playerId: 'p3' }),
      player({ playerId: 'p4' }),
    ]
    expect(suggestPairings(pool, DIVISIONS)).toEqual(suggestPairings(pool.slice().reverse(), DIVISIONS))
  })

  it('never crosses divisions', () => {
    const pool = [
      player({ playerId: 'p1' }),
      player({ playerId: 'w1', divisionId: 'womens', divisionName: "Women's Doubles", gender: 'female' }),
    ]
    expect(suggestPairings(pool, DIVISIONS)).toEqual([])
  })

  it('skips rejected registrations and already-paired players', () => {
    const pool = [
      player({ playerId: 'p1', status: 'rejected' }),
      player({ playerId: 'p2' }),
      player({ playerId: 'p3', teamId: 'existing' }),
      player({ playerId: 'p4' }),
    ]
    const pairs = suggestPairings(pool, DIVISIONS)
    expect(pairs).toHaveLength(1)
    expect(pairs[0].map((p) => p.playerId).sort()).toEqual(['p2', 'p4'])
  })
})

describe('filterTeams', () => {
  const mens = team({ id: 't1', name: 'Sleigh Servers', seed: 1 })
  const womens = team({
    id: 't2',
    divisionId: 'womens',
    divisionName: "Women's Doubles",
    name: 'Snowdrop Smashers',
    members: [
      player({ playerId: 'w1', name: 'Dana Fox', divisionId: 'womens', gender: 'female', teamId: 't2' }),
      player({ playerId: 'w2', name: 'Cleo Manu', divisionId: 'womens', gender: 'female', teamId: 't2' }),
    ],
  })
  const all = [mens, womens]
  const issues = validateTeams(all, DIVISIONS)

  it('returns everything by default', () => {
    expect(filterTeams(all, EMPTY_TEAM_FILTERS, issues)).toHaveLength(2)
  })

  it('filters by division', () => {
    const result = filterTeams(all, { ...EMPTY_TEAM_FILTERS, divisionId: 'womens' }, issues)
    expect(result.map((t) => t.id)).toEqual(['t2'])
  })

  it('searches team name, member names and seed', () => {
    expect(filterTeams(all, { ...EMPTY_TEAM_FILTERS, search: 'sleigh' }, issues)).toHaveLength(1)
    expect(filterTeams(all, { ...EMPTY_TEAM_FILTERS, search: 'dana' }, issues)).toHaveLength(1)
    expect(filterTeams(all, { ...EMPTY_TEAM_FILTERS, search: 'seed 1' }, issues)).toHaveLength(1)
  })

  it('can show only teams that need attention', () => {
    const broken = team({
      id: 't3',
      members: [player({ playerId: 'p9', teamId: 't3', paymentStatus: 'unpaid' })],
    })
    const withBroken = [...all, broken]
    const result = filterTeams(
      withBroken,
      { ...EMPTY_TEAM_FILTERS, issuesOnly: true },
      validateTeams(withBroken, DIVISIONS)
    )
    expect(result.map((t) => t.id)).toEqual(['t3'])
  })
})

describe('teamMatchesSearch', () => {
  it('is case and whitespace insensitive', () => {
    const t = team({ id: 't1', name: 'Sleigh Servers' })
    expect(teamMatchesSearch(t, '  SLEIGH ')).toBe(true)
  })

  it('matches an empty query', () => {
    expect(teamMatchesSearch(team({ id: 't1' }), '')).toBe(true)
  })
})

describe('sortTeams', () => {
  it('orders by division, then seed with unseeded teams last', () => {
    const teams = [
      team({ id: 'unseeded', name: 'Zzz' }),
      team({ id: 'seed2', seed: 2 }),
      team({ id: 'seed1', seed: 1 }),
      team({ id: 'womens', divisionId: 'womens', divisionName: "Women's Doubles", seed: 1 }),
    ]
    expect(sortTeams(teams).map((t) => t.id)).toEqual(['seed1', 'seed2', 'unseeded', 'womens'])
  })

  it('does not mutate the input', () => {
    const teams = [team({ id: 'b', seed: 2 }), team({ id: 'a', seed: 1 })]
    sortTeams(teams)
    expect(teams.map((t) => t.id)).toEqual(['b', 'a'])
  })
})

describe('sortFreeAgents', () => {
  it('groups by division then registration time', () => {
    const pool = [
      player({ playerId: 'p2', createdAt: '2026-09-08T00:00:00.000Z' }),
      player({
        playerId: 'w1',
        divisionId: 'womens',
        divisionName: "Women's Doubles",
        gender: 'female',
        createdAt: '2026-09-01T00:00:00.000Z',
      }),
      player({ playerId: 'p1', createdAt: '2026-09-07T00:00:00.000Z' }),
    ]
    expect(sortFreeAgents(pool).map((p) => p.playerId)).toEqual(['p1', 'p2', 'w1'])
  })
})

describe('teamAuditEntry', () => {
  it('builds a team audit row', () => {
    expect(
      teamAuditEntry('team.created', 'team-1', { division: 'mens', players: 'p1, p2' })
    ).toEqual({
      action: 'team.created',
      entity_type: 'team',
      entity_id: 'team-1',
      metadata: { division: 'mens', players: 'p1, p2' },
    })
  })

  it('tolerates a null entity id for a team that no longer exists', () => {
    expect(teamAuditEntry('team.dissolved', null, {}).entity_id).toBeNull()
  })
})
