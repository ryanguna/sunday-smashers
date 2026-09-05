import { describe, expect, it } from 'vitest'
import {
  type TournamentDetails,
  describeLiveStatus,
  diffLiveStatus,
  validateLiveStatus,
  type LiveStatus,
  analyseRoleChange,
  analyseRulesChange,
  analyseSettingsRulesChange,
  buildAuditEntry,
  countRole,
  defaultRulesConfig,
  defaultTournamentSettings,
  isPersistedId,
  type PrizeSettings,
  normalisePrizes,
  PRIZE_BASIS,
  PLAYERS_PER_PAIR,
  describeDivisionFormat,
  describeStage,
  diffDetails,
  diffDivisions,
  diffPrizes,
  diffSettings,
  divisionExtras,
  divisionRowPatch,
  divisionSettingsFromRow,
  estimateDayLoad,
  firstErrorFor,
  formatCents,
  fromDateTimeLocal,
  generateTimeSlots,
  hasErrors,
  hasUnsavedChanges,
  knockoutGameCount,
  lootBagTotals,
  newId,
  parseIntOr,
  parseMoneyToCents,
  roundRobinPreview,
  searchUsers,
  slotDurationMinutes,
  summariseChanges,
  summariseStage,
  toDateTimeLocal,
  toStageRules,
  toStageRulesMap,
  totalPrizePoolCents,
  validateCourts,
  validateDivision,
  validatePrizes,
  validateRules,
  validateSettings,
  validateStageRules,
  validateTimeSlots,
  validateTournamentDetails,
  type DivisionSettings,
  type DrawState,
  type ManagedUser,
  type TournamentSettings,
} from './settings'
import {
  computeStandings,
  DEFAULT_ELIMS_RULES,
  evaluateGame,
  gamesPerTeam,
  generateRoundRobin,
  totalRoundRobinMatches,
} from './draw'
import { REGISTRATION_CLOSES_AT, TOURNAMENT_DATE } from './tournament'

function settings(): TournamentSettings {
  return structuredClone(defaultTournamentSettings())
}

function division(): DivisionSettings {
  return settings().divisions[0]
}

// ---------------------------------------------------------------------------

describe('defaultTournamentSettings', () => {
  it('mirrors the draft rules from src/lib/draw.ts', () => {
    const s = defaultTournamentSettings()
    expect(s.divisions).toHaveLength(2)
    for (const d of s.divisions) {
      expect(d.rules.stages.elims).toEqual({ pointsToWin: 15, deuce: false, cap: null })
      expect(d.rules.stages.semi).toEqual({ pointsToWin: 21, deuce: false, cap: null })
      expect(d.rules.stages.third_place.pointsToWin).toBe(21)
      expect(d.rules.stages.final.pointsToWin).toBe(21)
      expect(d.rules.qualifyingPlaces).toBe(4)
    }
  })

  it('takes its dates from the tournament module', () => {
    const s = defaultTournamentSettings()
    expect(s.details.tournamentDate).toBe(TOURNAMENT_DATE)
    expect(s.details.registrationClosesAt).toBe(REGISTRATION_CLOSES_AT)
  })

  it('flags the assumed registration close date as unconfirmed', () => {
    expect(defaultTournamentSettings().details.registrationCloseConfirmed).toBe(false)
  })

  it('validates cleanly apart from the unconfirmed-date warning', () => {
    const issues = validateSettings(defaultTournamentSettings())
    expect(hasErrors(issues)).toBe(false)
    expect(issues.some((i) => i.path === 'details.registrationClosesAt' && i.severity === 'warning')).toBe(true)
  })
})

// ---------------------------------------------------------------------------

describe('toStageRules', () => {
  it('omits the cap when deuce is off', () => {
    expect(toStageRules({ pointsToWin: 15, deuce: false, cap: 30 })).toEqual({
      pointsToWin: 15,
      deuce: false,
    })
  })

  it('includes the cap when deuce is on', () => {
    expect(toStageRules({ pointsToWin: 21, deuce: true, cap: 30 })).toEqual({
      pointsToWin: 21,
      deuce: true,
      cap: 30,
    })
  })

  it('produces rules the draw engine actually accepts', () => {
    const map = toStageRulesMap(defaultRulesConfig())
    expect(evaluateGame(15, 14, map.elims)).toEqual({ complete: true, winner: 'a' })
    expect(evaluateGame(20, 19, map.final)).toEqual({ complete: false, winner: null })
    expect(evaluateGame(21, 19, map.final)).toEqual({ complete: true, winner: 'a' })
  })

  it('round trips deuce rules through the engine', () => {
    const rules = toStageRules({ pointsToWin: 21, deuce: true, cap: 30 })
    expect(evaluateGame(21, 20, rules).complete).toBe(false)
    expect(evaluateGame(22, 20, rules).complete).toBe(true)
    expect(evaluateGame(30, 29, rules)).toEqual({ complete: true, winner: 'a' })
  })

  it('drives computeStandings with the configured target', () => {
    const rows = computeStandings(
      ['a', 'b'],
      [{ teamA: 'a', teamB: 'b', pointsA: 11, pointsB: 9 }],
      toStageRules({ pointsToWin: 11, deuce: false, cap: null }),
    )
    expect(rows[0].teamId).toBe('a')
    expect(rows[0].wins).toBe(1)
    // Under the default 15-point rule the same score is not a completed game.
    const unfinished = computeStandings(
      ['a', 'b'],
      [{ teamA: 'a', teamB: 'b', pointsA: 11, pointsB: 9 }],
      DEFAULT_ELIMS_RULES,
    )
    expect(unfinished[0].played).toBe(0)
  })
})

// ---------------------------------------------------------------------------

describe('division row mapping', () => {
  it('round trips through a divisions row + extras blob', () => {
    const d = division()
    d.rules.stages.elims = { pointsToWin: 11, deuce: true, cap: 20 }
    d.rules.stages.final = { pointsToWin: 25, deuce: false, cap: null }
    d.entryFeeCents = 3000

    const patch = divisionRowPatch(d)
    const extras = divisionExtras(d)
    const restored = divisionSettingsFromRow(
      { id: d.id, gender: d.gender, ...patch },
      extras,
    )

    expect(restored).toEqual(d)
  })

  it('nulls the cap in the row when deuce is off', () => {
    const d = division()
    d.rules.stages.elims = { pointsToWin: 15, deuce: false, cap: 30 }
    expect(divisionRowPatch(d).cap_elims).toBeNull()
  })

  it('falls back to the semi final rules when there are no extras', () => {
    const d = division()
    const restored = divisionSettingsFromRow({ id: d.id, gender: d.gender, ...divisionRowPatch(d) }, null)
    expect(restored.rules.stages.final).toEqual(restored.rules.stages.semi)
    expect(restored.entryFeeCents).toBe(2500)
  })
})

// ---------------------------------------------------------------------------

describe('roundRobinPreview', () => {
  it('matches the draft rules: 11 pairs -> 55 games, 10 each', () => {
    const preview = roundRobinPreview(11)
    expect(preview.totalGames).toBe(55)
    expect(preview.gamesEach).toBe(10)
    expect(preview.hasBye).toBe(true)
    expect(preview.rounds).toBe(11)
  })

  it('agrees with the real draw engine', () => {
    for (const count of [2, 5, 8, 11, 12]) {
      const teams = Array.from({ length: count }, (_, i) => `t${i}`)
      const fixtures = generateRoundRobin(teams)
      const preview = roundRobinPreview(count)
      expect(preview.totalGames).toBe(fixtures.length)
      expect(preview.totalGames).toBe(totalRoundRobinMatches(count))
      expect(preview.gamesEach).toBe(gamesPerTeam(count))
      expect(preview.rounds).toBe(Math.max(...fixtures.map((f) => f.round)))
    }
  })

  it('handles degenerate entry counts', () => {
    expect(roundRobinPreview(0).totalGames).toBe(0)
    expect(roundRobinPreview(1)).toMatchObject({ totalGames: 0, gamesEach: 0, hasBye: true })
    expect(roundRobinPreview(-4).totalGames).toBe(0)
  })
})

describe('knockoutGameCount', () => {
  it('is 4 for the draft top-4 format', () => {
    expect(knockoutGameCount(4)).toBe(4)
  })
  it('is 1 for a straight final and 0 when disabled', () => {
    expect(knockoutGameCount(2)).toBe(1)
    expect(knockoutGameCount(0)).toBe(0)
  })
})

describe('estimateDayLoad', () => {
  it('counts round robin plus knockout games', () => {
    const load = estimateDayLoad(division(), 11, 3)
    expect(load.totalGames).toBe(59)
    expect(load.estimatedMinutes).toBeLessThan(load.totalCourtMinutes)
  })

  it('never divides by zero courts', () => {
    expect(estimateDayLoad(division(), 4, 0).estimatedMinutes).toBeGreaterThan(0)
  })
})

describe('describeStage / describeDivisionFormat', () => {
  it('spells out no-deuce scoring', () => {
    expect(describeStage('elims', { pointsToWin: 15, deuce: false, cap: null })).toContain('no deuce')
  })

  it('spells out deuce and the cap', () => {
    const text = describeStage('final', { pointsToWin: 21, deuce: true, cap: 30 })
    expect(text).toContain('win by 2')
    expect(text).toContain('30')
  })

  it('quotes the games maths for the division', () => {
    const lines = describeDivisionFormat(division(), 11)
    expect(lines[0]).toContain('55')
    expect(lines[0]).toContain('10 each')
    expect(lines.join(' ')).toContain('Battle for 3rd')
  })

  it('describes a straight final when only 2 qualify', () => {
    const d = division()
    d.rules.qualifyingPlaces = 2
    const text = describeDivisionFormat(d, 6).join(' ')
    expect(text).toContain('no semi finals')
  })

  it('describes a knockout-free format', () => {
    const d = division()
    d.rules.qualifyingPlaces = 0
    expect(describeDivisionFormat(d, 6).join(' ')).toContain('No knockout stage')
  })
})

// ---------------------------------------------------------------------------

describe('validateTournamentDetails', () => {
  it('rejects a closing date after tournament day', () => {
    const s = settings()
    s.details.registrationClosesAt = '2026-12-20T00:00:00.000Z'
    expect(firstErrorFor(validateTournamentDetails(s.details), 'details.registrationClosesAt')).toContain(
      'on or before',
    )
  })

  it('rejects closing before opening', () => {
    const s = settings()
    s.details.registrationClosesAt = '2026-08-01T00:00:00.000Z'
    expect(hasErrors(validateTournamentDetails(s.details))).toBe(true)
  })

  it('warns about a tight turnaround', () => {
    const s = settings()
    s.details.registrationCloseConfirmed = true
    s.details.registrationClosesAt = '2026-12-12T09:00:00.000Z'
    const issues = validateTournamentDetails(s.details)
    expect(hasErrors(issues)).toBe(false)
    expect(issues.some((i) => i.message.includes('tight turnaround'))).toBe(true)
  })

  it('drops the confirmation nag once confirmed', () => {
    const s = settings()
    s.details.registrationCloseConfirmed = true
    expect(
      validateTournamentDetails(s.details).some((i) => i.message.includes('assumed one week')),
    ).toBe(false)
  })

  it('rejects a bad email and a too-short name', () => {
    const s = settings()
    s.details.contactEmail = 'nope'
    s.details.name = 'Ho'
    const issues = validateTournamentDetails(s.details)
    expect(firstErrorFor(issues, 'details.contactEmail')).toBeDefined()
    expect(firstErrorFor(issues, 'details.name')).toBeDefined()
  })
})

describe('validateStageRules / validateRules', () => {
  it('rejects an out-of-range target', () => {
    expect(hasErrors(validateStageRules('s', { pointsToWin: 0, deuce: false, cap: null }))).toBe(true)
    expect(hasErrors(validateStageRules('s', { pointsToWin: 120, deuce: false, cap: null }))).toBe(true)
    expect(hasErrors(validateStageRules('s', { pointsToWin: 15.5, deuce: false, cap: null }))).toBe(true)
  })

  it('rejects a cap at or below the target', () => {
    expect(firstErrorFor(validateStageRules('s', { pointsToWin: 21, deuce: true, cap: 21 }), 's.cap')).toBeDefined()
  })

  it('warns about deuce with no cap but does not block it', () => {
    const issues = validateStageRules('s', { pointsToWin: 21, deuce: true, cap: null })
    expect(hasErrors(issues)).toBe(false)
    expect(issues[0].severity).toBe('warning')
  })

  it('ignores the cap entirely when deuce is off', () => {
    expect(validateStageRules('s', { pointsToWin: 15, deuce: false, cap: 2 })).toHaveLength(0)
  })

  it('rejects impossible qualifier counts', () => {
    const rules = defaultRulesConfig()
    rules.qualifyingPlaces = 3
    expect(hasErrors(validateRules('r', rules))).toBe(true)
    rules.qualifyingPlaces = 10
    expect(hasErrors(validateRules('r', rules))).toBe(true)
  })

  // 0 used to be allowed here, but `divisions.qualifying_places` carries
  // `check (qualifying_places >= 2)`, so a division with no knockout could
  // never be saved. See qualifying-places.test.ts.
  it('allows 2 and 4 qualifiers', () => {
    for (const places of [2, 4]) {
      const rules = defaultRulesConfig()
      rules.qualifyingPlaces = places
      expect(hasErrors(validateRules('r', rules))).toBe(false)
    }
  })
})

describe('validateDivision', () => {
  it('rejects duplicate names', () => {
    const s = settings()
    s.divisions[1].name = s.divisions[0].name
    expect(hasErrors(validateDivision(s.divisions[1], s.divisions))).toBe(true)
  })

  it('rejects a cap smaller than the qualifier count', () => {
    const d = division()
    d.maxTeams = 3
    expect(firstErrorFor(validateDivision(d, [d]), `divisions.${d.id}.maxTeams`)).toContain('cannot be smaller')
  })

  it('warns when uncapped', () => {
    const d = division()
    d.maxTeams = null
    expect(validateDivision(d, [d]).some((i) => i.message.includes('No entry cap'))).toBe(true)
  })

  it('rejects a negative entry fee', () => {
    const d = division()
    d.entryFeeCents = -100
    expect(hasErrors(validateDivision(d, [d]))).toBe(true)
  })
})

describe('validateCourts / validateTimeSlots', () => {
  it('requires at least one court', () => {
    expect(hasErrors(validateCourts([]))).toBe(true)
  })

  it('rejects duplicate court names', () => {
    const issues = validateCourts([
      { id: 'a', name: 'Court 1', sortOrder: 1 },
      { id: 'b', name: 'court 1', sortOrder: 2 },
    ])
    expect(hasErrors(issues)).toBe(true)
  })

  it('rejects a slot ending before it starts', () => {
    const issues = validateTimeSlots([
      { id: 's1', startsAt: '2026-12-13T00:00:00.000Z', endsAt: '2026-12-12T23:00:00.000Z', label: 'Slot 1' },
    ])
    expect(hasErrors(issues)).toBe(true)
  })

  it('warns about overlapping slots', () => {
    const issues = validateTimeSlots([
      { id: 's1', startsAt: '2026-12-13T00:00:00.000Z', endsAt: '2026-12-13T00:30:00.000Z', label: 'Slot 1' },
      { id: 's2', startsAt: '2026-12-13T00:15:00.000Z', endsAt: '2026-12-13T00:45:00.000Z', label: 'Slot 2' },
    ])
    expect(hasErrors(issues)).toBe(false)
    expect(issues.some((i) => i.message.includes('Overlaps'))).toBe(true)
  })
})

describe('validatePrizes', () => {
  it('warns when the runner-up out-earns the champion', () => {
    const s = settings()
    s.prizes.divisionPrizes[0].runnerUpCents = 99999
    expect(validatePrizes(s.prizes, s.divisions).some((i) => i.message.includes('runner-up is being paid'))).toBe(
      true,
    )
  })

  it('warns when there are not enough medals for doubles', () => {
    const s = settings()
    s.prizes.medalCount = 4
    expect(validatePrizes(s.prizes, s.divisions).some((i) => i.path === 'prizes.medalCount')).toBe(true)
  })

  it('rejects a loot bag item with no name or zero quantity', () => {
    const s = settings()
    s.prizes.lootBagItems[0].name = ''
    s.prizes.lootBagItems[1].quantity = 0
    expect(hasErrors(validatePrizes(s.prizes, s.divisions))).toBe(true)
  })

  it('warns about empty loot bags', () => {
    const s = settings()
    s.prizes.lootBagItems = []
    expect(validatePrizes(s.prizes, s.divisions).some((i) => i.path === 'prizes.loot')).toBe(true)
  })
})

describe('validateSettings', () => {
  it('requires at least one enabled division', () => {
    const s = settings()
    for (const d of s.divisions) d.enabled = false
    expect(firstErrorFor(validateSettings(s), 'divisions')).toContain('must be enabled')
  })

  it('warns when court capacity cannot fit the games', () => {
    const s = settings()
    s.timeSlots = s.timeSlots.slice(0, 2)
    expect(validateSettings(s).some((i) => i.message.includes('court slots'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------

describe('analyseRulesChange', () => {
  const published: DrawState = {
    drawPublished: true,
    matchesScheduled: 55,
    matchesInProgress: 0,
    matchesCompleted: 0,
  }

  it('reports no change when nothing moved', () => {
    const impact = analyseRulesChange(defaultRulesConfig(), defaultRulesConfig(), published)
    expect(impact.level).toBe('none')
    expect(impact.requiresConfirmation).toBe(false)
  })

  it('treats a cap change as no change while deuce is off', () => {
    const after = defaultRulesConfig()
    after.stages.elims.cap = 30
    expect(analyseRulesChange(defaultRulesConfig(), after, published).level).toBe('none')
  })

  it('is safe before the draw is published', () => {
    const after = defaultRulesConfig()
    after.stages.elims.pointsToWin = 21
    const impact = analyseRulesChange(defaultRulesConfig(), after)
    expect(impact.level).toBe('safe')
    expect(impact.requiresConfirmation).toBe(false)
    expect(impact.changedStages).toEqual(['elims'])
  })

  it('is caution once published but unplayed', () => {
    const after = defaultRulesConfig()
    after.stages.semi.pointsToWin = 15
    const impact = analyseRulesChange(defaultRulesConfig(), after, published)
    expect(impact.level).toBe('caution')
    expect(impact.requiresConfirmation).toBe(true)
    expect(impact.requiresRegeneration).toBe(false)
  })

  it('requires regeneration when the qualifier count changes', () => {
    const after = defaultRulesConfig()
    after.qualifyingPlaces = 2
    const impact = analyseRulesChange(defaultRulesConfig(), after, published)
    expect(impact.qualifiersChanged).toBe(true)
    expect(impact.requiresRegeneration).toBe(true)
  })

  it('is danger once games have been played', () => {
    const after = defaultRulesConfig()
    after.stages.elims.pointsToWin = 11
    const impact = analyseRulesChange(defaultRulesConfig(), after, {
      ...published,
      matchesCompleted: 12,
      matchesInProgress: 2,
    })
    expect(impact.level).toBe('danger')
    expect(impact.requiresConfirmation).toBe(true)
    expect(impact.requiresRegeneration).toBe(true)
    expect(impact.reasons.join(' ')).toContain('12 completed games')
    expect(impact.reasons.join(' ')).toContain('2 games are in progress')
  })

  it('is danger while a single game is in progress', () => {
    const after = defaultRulesConfig()
    after.stages.final.pointsToWin = 25
    const impact = analyseRulesChange(defaultRulesConfig(), after, { ...published, matchesInProgress: 1 })
    expect(impact.level).toBe('danger')
    expect(impact.reasons.join(' ')).toContain('1 game is in progress')
  })
})

describe('analyseSettingsRulesChange', () => {
  it('reports the worst impact across divisions and names them', () => {
    const before = settings().divisions
    const after = structuredClone(before)
    after[1].rules.stages.elims.pointsToWin = 21
    const impact = analyseSettingsRulesChange(before, after, {
      drawPublished: true,
      matchesScheduled: 55,
      matchesInProgress: 0,
      matchesCompleted: 5,
    })
    expect(impact.level).toBe('danger')
    expect(impact.reasons.join(' ')).toContain("Women's Doubles")
  })

  it('is none when nothing changed', () => {
    const before = settings().divisions
    expect(analyseSettingsRulesChange(before, structuredClone(before)).level).toBe('none')
  })

  it('ignores brand new divisions with no previous rules', () => {
    const before = settings().divisions
    const after = [...structuredClone(before), { ...division(), id: 'div-new', name: 'Mixed' }]
    expect(analyseSettingsRulesChange(before, after).level).toBe('none')
  })
})

// ---------------------------------------------------------------------------

const USERS: ManagedUser[] = [
  { id: 'u1', fullName: 'Ryan Guna', nickname: 'Rye', email: 'ryan@example.com', roles: ['admin', 'player'] },
  { id: 'u2', fullName: 'Mrs Claus', nickname: null, email: 'claus@example.com', roles: ['tabulator'] },
  { id: 'u3', fullName: 'Buddy Elf', nickname: 'Buddy', email: null, roles: ['player'] },
]

describe('analyseRoleChange', () => {
  it('blocks revoking the last admin role', () => {
    const verdict = analyseRoleChange({
      actorUserId: 'u1',
      targetUserId: 'u1',
      role: 'admin',
      action: 'revoke',
      users: USERS,
    })
    expect(verdict.allowed).toBe(false)
    expect(verdict.isSelf).toBe(true)
    expect(verdict.blockedReason).toContain('last admin')
  })

  it('warns but allows revoking your own admin role when another admin exists', () => {
    const users = [...USERS, { id: 'u4', fullName: 'Santa', nickname: null, email: null, roles: ['admin' as const] }]
    const verdict = analyseRoleChange({
      actorUserId: 'u1',
      targetUserId: 'u1',
      role: 'admin',
      action: 'revoke',
      users,
    })
    expect(verdict.allowed).toBe(true)
    expect(verdict.warning).toContain('OWN admin role')
  })

  it('blocks granting a role the user already has', () => {
    expect(
      analyseRoleChange({
        actorUserId: 'u1',
        targetUserId: 'u2',
        role: 'tabulator',
        action: 'grant',
        users: USERS,
      }).allowed,
    ).toBe(false)
  })

  it('blocks revoking a role the user does not have', () => {
    expect(
      analyseRoleChange({
        actorUserId: 'u1',
        targetUserId: 'u3',
        role: 'tabulator',
        action: 'revoke',
        users: USERS,
      }).allowed,
    ).toBe(false)
  })

  it('warns when granting admin', () => {
    const verdict = analyseRoleChange({
      actorUserId: 'u1',
      targetUserId: 'u3',
      role: 'admin',
      action: 'grant',
      users: USERS,
    })
    expect(verdict.allowed).toBe(true)
    expect(verdict.warning).toBeDefined()
  })

  it('allows ordinary grants and revokes without fuss', () => {
    const verdict = analyseRoleChange({
      actorUserId: 'u1',
      targetUserId: 'u3',
      role: 'duty_official',
      action: 'grant',
      users: USERS,
    })
    expect(verdict).toEqual({ allowed: true, isSelf: false })
  })

  it('rejects an unknown user', () => {
    expect(
      analyseRoleChange({
        actorUserId: 'u1',
        targetUserId: 'ghost',
        role: 'player',
        action: 'grant',
        users: USERS,
      }).allowed,
    ).toBe(false)
  })
})

describe('searchUsers / countRole', () => {
  it('matches name, nickname and email case-insensitively', () => {
    expect(searchUsers(USERS, 'RYE')).toHaveLength(1)
    expect(searchUsers(USERS, 'claus@')).toHaveLength(1)
    expect(searchUsers(USERS, 'elf')[0].id).toBe('u3')
  })

  it('matches role labels and returns everything for an empty query', () => {
    expect(searchUsers(USERS, 'tabulator')).toHaveLength(1)
    expect(searchUsers(USERS, '   ')).toHaveLength(3)
  })

  it('counts roles', () => {
    expect(countRole(USERS, 'admin')).toBe(1)
    expect(countRole(USERS, 'player')).toBe(2)
  })
})

// ---------------------------------------------------------------------------

describe('diffing', () => {
  it('sees a changed detail field', () => {
    const before = settings()
    const after = settings()
    after.details.venueName = 'North Pole Sports Centre'
    const changes = diffDetails(before.details, after.details)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ path: 'details.venueName', label: 'Venue' })
  })

  it('formats booleans and money readably', () => {
    const before = settings()
    const after = settings()
    after.details.registrationCloseConfirmed = true
    after.divisions[0].entryFeeCents = 3000
    expect(diffDetails(before.details, after.details)[0].after).toBe('on')
    expect(diffDivisions(before.divisions, after.divisions)[0].after).toBe('$30.00')
  })

  it('reports added and removed divisions', () => {
    const before = settings()
    const after = settings()
    after.divisions = [after.divisions[0], { ...division(), id: 'div-mixed', name: 'Mixed Doubles' }]
    const changes = diffDivisions(before.divisions, after.divisions)
    expect(changes.some((c) => c.label === 'New division')).toBe(true)
    expect(changes.some((c) => c.label === 'Removed division')).toBe(true)
  })

  it('summarises stage rule changes in words', () => {
    const before = settings()
    const after = settings()
    after.divisions[0].rules.stages.elims = { pointsToWin: 21, deuce: true, cap: 30 }
    const change = diffDivisions(before.divisions, after.divisions)[0]
    expect(change.before).toBe('first to 15, no deuce')
    expect(change.after).toBe('first to 21, deuce, cap 30')
  })

  it('diffs prizes and loot bags', () => {
    const before = settings()
    const after = settings()
    after.prizes.trophyCount = 6
    after.prizes.lootBagItems.push({ id: 'loot-new', name: 'Mini candy cane', quantity: 1, notes: '' })
    after.prizes.lootBagItems[0].quantity = 2
    const changes = diffPrizes(before.prizes, after.prizes)
    expect(changes.some((c) => c.path === 'prizes.trophyCount')).toBe(true)
    expect(changes.some((c) => c.label === 'New loot bag item')).toBe(true)
  })

  it('detects unsaved changes across the whole bundle', () => {
    const before = settings()
    const after = settings()
    expect(hasUnsavedChanges(before, after)).toBe(false)
    after.courts.push({ id: 'court-4', name: 'Court 4', sortOrder: 4 })
    expect(hasUnsavedChanges(before, after)).toBe(true)
    expect(diffSettings(before, after).some((c) => c.label === 'New court')).toBe(true)
  })

  it('detects removed time slots', () => {
    const before = settings()
    const after = settings()
    after.timeSlots = after.timeSlots.slice(0, 3)
    expect(diffSettings(before, after).filter((c) => c.label === 'Removed time slot')).toHaveLength(5)
  })
})

describe('audit entries', () => {
  it('builds an audit_log payload with a readable summary', () => {
    const before = settings()
    const after = settings()
    after.details.venueName = 'North Pole Sports Centre'
    const entry = buildAuditEntry('settings.details.update', 'tournament', 't1', diffDetails(before.details, after.details), {
      actorNote: 'x',
    })
    expect(entry).toMatchObject({ action: 'settings.details.update', entity_type: 'tournament', entity_id: 't1' })
    expect(entry.metadata.summary).toContain('North Pole Sports Centre')
    expect(entry.metadata.actorNote).toBe('x')
  })

  it('truncates long summaries', () => {
    const changes = Array.from({ length: 6 }, (_, i) => ({
      path: `p${i}`,
      label: `L${i}`,
      before: 'a',
      after: 'b',
    }))
    expect(summariseChanges(changes)).toContain('+3 more')
    expect(summariseChanges([])).toBe('No changes')
  })
})

// ---------------------------------------------------------------------------

describe('formatting helpers', () => {
  it('formats and parses money', () => {
    expect(formatCents(2500)).toBe('$25.00')
    expect(formatCents(-2500)).toBe('-$25.00')
    expect(parseMoneyToCents('$25')).toBe(2500)
    expect(parseMoneyToCents('1,234.50')).toBe(123450)
    expect(parseMoneyToCents('')).toBeNull()
    expect(parseMoneyToCents('abc')).toBeNull()
    expect(parseMoneyToCents('1.234')).toBeNull()
  })

  it('parses ints with a fallback', () => {
    expect(parseIntOr('12', 0)).toBe(12)
    expect(parseIntOr('', 7)).toBe(7)
    expect(parseIntOr('nope', 3)).toBe(3)
  })

  it('round trips datetime-local values in Sydney time', () => {
    const local = toDateTimeLocal(TOURNAMENT_DATE)
    expect(local).toBe('2026-12-13T09:00')
    expect(fromDateTimeLocal(local)).toBe(new Date(TOURNAMENT_DATE).toISOString())
  })

  it('handles AEST (non-DST) timestamps', () => {
    expect(toDateTimeLocal('2026-07-01T02:00:00.000Z')).toBe('2026-07-01T12:00')
    expect(fromDateTimeLocal('2026-07-01T12:00')).toBe('2026-07-01T02:00:00.000Z')
  })

  it('returns empty strings for junk', () => {
    expect(toDateTimeLocal('not-a-date')).toBe('')
    expect(fromDateTimeLocal('nope')).toBe('')
  })

  it('measures slot duration', () => {
    expect(
      slotDurationMinutes({
        id: 's',
        startsAt: '2026-12-13T00:00:00.000Z',
        endsAt: '2026-12-13T00:15:00.000Z',
        label: '',
      }),
    ).toBe(15)
  })
})

describe('generateTimeSlots', () => {
  it('builds back-to-back slots', () => {
    const slots = generateTimeSlots({ startsAt: TOURNAMENT_DATE, durationMinutes: 20, count: 3 })
    expect(slots).toHaveLength(3)
    expect(slotDurationMinutes(slots[0])).toBe(20)
    expect(slots[1].startsAt).toBe(slots[0].endsAt)
    expect(slots[2].label).toBe('Slot 3')
  })

  it('honours a gap between slots', () => {
    const slots = generateTimeSlots({ startsAt: TOURNAMENT_DATE, durationMinutes: 20, count: 2, gapMinutes: 5 })
    expect(Date.parse(slots[1].startsAt) - Date.parse(slots[0].endsAt)).toBe(5 * 60_000)
  })

  it('refuses nonsense input', () => {
    expect(generateTimeSlots({ startsAt: 'x', durationMinutes: 20, count: 3 })).toHaveLength(0)
    expect(generateTimeSlots({ startsAt: TOURNAMENT_DATE, durationMinutes: 0, count: 3 })).toHaveLength(0)
    expect(generateTimeSlots({ startsAt: TOURNAMENT_DATE, durationMinutes: 15, count: 0 })).toHaveLength(0)
  })
})

describe('prize maths', () => {
  it('totals the prize pool across divisions', () => {
    expect(totalPrizePoolCents(settings().prizes)).toBe((30000 + 15000 + 7500) * 2)
  })

  it('multiplies loot bag items by player count', () => {
    const totals = lootBagTotals(settings().prizes, 44)
    expect(totals[0]).toEqual({ name: 'Shuttlecock tube', total: 44 })
    expect(totals[1].total).toBe(88)
    expect(lootBagTotals(settings().prizes, -3)[0].total).toBe(0)
  })
})

describe('newId', () => {
  it('avoids collisions with existing ids', () => {
    expect(newId('court', [{ id: 'court-1' }, { id: 'court-2' }])).toBe('court-3')
    expect(newId('court', [{ id: 'court-1' }, { id: 'court-3' }])).toBe('court-4')
    expect(newId('court', [])).toBe('court-1')
  })
})

describe('summariseStage', () => {
  it('describes every shape', () => {
    expect(summariseStage({ pointsToWin: 15, deuce: false, cap: null })).toBe('first to 15, no deuce')
    expect(summariseStage({ pointsToWin: 21, deuce: true, cap: null })).toBe('first to 21, deuce, no cap')
    expect(summariseStage({ pointsToWin: 21, deuce: true, cap: 30 })).toBe('first to 21, deuce, cap 30')
  })
})

describe('live status (going live)', () => {
  const status = (over: Partial<LiveStatus> = {}): LiveStatus => ({
    isPublished: false,
    isRegistrationOpen: null,
    ...over,
  })

  it('refuses registration open on an unpublished tournament', () => {
    // The trap: `tournament_public` filters to published rows, so the public
    // site would never see the flag. The committee would believe they had
    // opened registration while every player was still told it was closed.
    const issues = validateLiveStatus(status({ isRegistrationOpen: true }))
    expect(hasErrors(issues)).toBe(true)
    expect(issues[0]?.path).toBe('tournament.is_registration_open')
  })

  it('accepts every other combination', () => {
    expect(validateLiveStatus(status())).toEqual([])
    expect(validateLiveStatus(status({ isPublished: true }))).toEqual([])
    expect(validateLiveStatus(status({ isPublished: true, isRegistrationOpen: true }))).toEqual([])
  })

  it('describes what each state actually means for a player', () => {
    expect(describeLiveStatus(status())).toContain('Not published')
    expect(describeLiveStatus(status({ isPublished: true, isRegistrationOpen: true }))).toContain(
      'regardless of the calendar',
    )
  })

  // The three answers must read as three answers. The switch used to be a
  // boolean, and `false` was described to the committee as "registration
  // follows the calendar dates below" while `getRegistrationWindow` treated it
  // as "keep it shut" -- so the opening date could pass with the sheet closed
  // and the console still insisting the date was in charge.
  it('never tells the committee the dates are in charge when they are overridden', () => {
    const deferring = describeLiveStatus(status({ isPublished: true, isRegistrationOpen: null }))
    expect(deferring).toContain('dates below')

    const shut = describeLiveStatus(status({ isPublished: true, isRegistrationOpen: false }))
    expect(shut).toContain('ignored')
    expect(shut).not.toBe(deferring)
  })

  it('lets the organiser hold the sheet shut without that being an error', () => {
    expect(validateLiveStatus(status({ isPublished: true, isRegistrationOpen: false }))).toEqual([])
    expect(validateLiveStatus(status({ isRegistrationOpen: false }))).toEqual([])
  })

  it('distinguishes deferring from forcing in the change log', () => {
    const changes = diffLiveStatus(
      status({ isPublished: true, isRegistrationOpen: null }),
      status({ isPublished: true, isRegistrationOpen: false }),
    )
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ before: 'following the dates', after: 'held shut' })
  })

  it('reports only the switches that actually moved', () => {
    expect(diffLiveStatus(status(), status())).toEqual([])
    const changes = diffLiveStatus(status(), status({ isPublished: true }))
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ label: 'Published', before: 'off', after: 'on' })
  })
})

describe('entry fee and payment instructions', () => {
  const details = (over: Partial<TournamentDetails> = {}): TournamentDetails => ({
    ...defaultTournamentSettings().details,
    ...over,
  })

  it('rejects a negative or non-integer fee', () => {
    expect(hasErrors(validateTournamentDetails(details({ entryFeeCents: -1 })))).toBe(true)
    expect(hasErrors(validateTournamentDetails(details({ entryFeeCents: 12.5 })))).toBe(true)
  })

  it('warns when players are charged but never told how to pay', () => {
    // /pay renders these instructions verbatim; without them a player who is
    // told to pay has nothing to act on.
    const issues = validateTournamentDetails(details({ entryFeeCents: 2500, paymentInstructions: '  ' }))
    expect(issues.some((i) => i.path === 'details.paymentInstructions')).toBe(true)
  })

  it('is happy once instructions exist', () => {
    const issues = validateTournamentDetails(
      details({ entryFeeCents: 2500, paymentInstructions: 'Bank transfer, BSB 000-000.' }),
    )
    expect(issues.some((i) => i.path === 'details.paymentInstructions')).toBe(false)
  })

  it('does not nag about instructions for a free tournament', () => {
    const issues = validateTournamentDetails(details({ entryFeeCents: 0, paymentInstructions: '' }))
    expect(issues.some((i) => i.path === 'details.paymentInstructions')).toBe(false)
  })
})

describe('isPersistedId', () => {
  it('accepts a database uuid', () => {
    expect(isPersistedId('3f1b8f0c-2c3e-4a5b-9d6e-7f8a9b0c1d2e')).toBe(true)
  })

  it('rejects the placeholder ids the defaults ship with', () => {
    // These reach the save action whenever the tables are still empty, and
    // updating `where id = 'div-mens'` is what produced "invalid input syntax
    // for type uuid" on the very first save.
    for (const id of ['div-mens', 'div-womens', 'court-1', 'slot-1', 'division-3']) {
      expect(isPersistedId(id)).toBe(false)
    }
  })
})

describe('normalisePrizes', () => {
  const fallback = defaultTournamentSettings().prizes

  it('falls back wholesale when nothing is stored', () => {
    expect(normalisePrizes(null, fallback)).toEqual(fallback)
  })

  it('defaults fourth place on blobs written before it existed', () => {
    const stored = {
      divisionPrizes: [
        { divisionId: 'men', championCents: 100, runnerUpCents: 50, thirdPlaceCents: 25 },
      ],
    } as Partial<PrizeSettings>
    const prizes = normalisePrizes(stored, fallback)
    expect(prizes.divisionPrizes[0].fourthPlaceCents).toBe(0)
    // Without this the board rendered "$NaN".
    expect(Number.isFinite(totalPrizePoolCents(prizes))).toBe(true)
  })

  it('coerces junk money to zero', () => {
    const stored = {
      divisionPrizes: [
        {
          divisionId: 'men',
          championCents: Number.NaN,
          runnerUpCents: 'lots',
          thirdPlaceCents: 25,
          fourthPlaceCents: 10,
        },
      ],
    } as unknown as Partial<PrizeSettings>
    const prizes = normalisePrizes(stored, fallback)
    expect(prizes.divisionPrizes[0].championCents).toBe(0)
    expect(prizes.divisionPrizes[0].runnerUpCents).toBe(0)
  })
})

describe('totalPrizePoolCents', () => {
  it('pays every placing twice, because every placing is a pair', () => {
    const prizes: PrizeSettings = {
      ...defaultTournamentSettings().prizes,
      divisionPrizes: [
        { divisionId: 'men', championCents: 100, runnerUpCents: 50, thirdPlaceCents: 25, fourthPlaceCents: 10 },
      ],
    }
    expect(totalPrizePoolCents(prizes)).toBe((100 + 50 + 25 + 10) * PLAYERS_PER_PAIR)
  })
})

describe('normalisePrizes and the per-pair to per-player rebase', () => {
  const fallback = {
    basis: PRIZE_BASIS,
    divisionPrizes: [],
    trophyCount: 0,
    medalCount: 0,
    lootBagItems: [],
    showOnPublicSite: false,
  }

  it('halves the amounts in a blob written before the basis existed', () => {
    // These are the real figures sitting in production: entered per pair,
    // under a UI that has since been relabelled "per player". Read naively
    // the landing page would announce double the committee's budget.
    const rebased = normalisePrizes(
      {
        divisionPrizes: [
          { divisionId: 'a', championCents: 20000, runnerUpCents: 15000, thirdPlaceCents: 12000, fourthPlaceCents: 0 },
        ],
      },
      fallback,
    )
    expect(rebased.divisionPrizes[0]).toEqual({
      divisionId: 'a',
      championCents: 10000,
      runnerUpCents: 7500,
      thirdPlaceCents: 6000,
      fourthPlaceCents: 0,
    })
    expect(rebased.basis).toBe(PRIZE_BASIS)
  })

  it('keeps the total outlay identical across the rebase', () => {
    const rebased = normalisePrizes(
      {
        divisionPrizes: [
          { divisionId: 'a', championCents: 20000, runnerUpCents: 15000, thirdPlaceCents: 12000, fourthPlaceCents: 0 },
        ],
      },
      fallback,
    )
    // The committee still brings exactly the money they agreed to bring.
    expect(totalPrizePoolCents(rebased)).toBe(47000)
  })

  it('leaves a blob that already declares the basis untouched', () => {
    const kept = normalisePrizes(
      {
        basis: PRIZE_BASIS,
        divisionPrizes: [
          { divisionId: 'a', championCents: 10000, runnerUpCents: 7500, thirdPlaceCents: 6000, fourthPlaceCents: 0 },
        ],
      },
      fallback,
    )
    expect(kept.divisionPrizes[0].championCents).toBe(10000)
  })

  it('is idempotent, so a re-read never halves twice', () => {
    const once = normalisePrizes(
      {
        divisionPrizes: [
          { divisionId: 'a', championCents: 20000, runnerUpCents: 15000, thirdPlaceCents: 12000, fourthPlaceCents: 0 },
        ],
      },
      fallback,
    )
    const twice = normalisePrizes(once, fallback)
    expect(twice.divisionPrizes).toEqual(once.divisionPrizes)
  })
})
