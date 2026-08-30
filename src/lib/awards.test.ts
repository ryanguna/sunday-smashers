import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AWARD_DEFINITIONS,
  EMPTY_RECIPIENT,
  awardAuditEntry,
  awardDefinitionByKey,
  buildDivisionViews,
  buildPodium,
  compareAwards,
  dbTypeToKey,
  decodeCitation,
  derivePlacingAwards,
  encodeCitation,
  hasAnyWinners,
  hasRecipient,
  mergeAwardDefinitions,
  mergeSuggestions,
  pendingConfirmations,
  placingDefinitions,
  placingsConfirmed,
  planPublish,
  podiumLayoutOrder,
  publishAuditEntry,
  publishedAwards,
  recipientLabel,
  recipientSubtitle,
  revealDelay,
  revealOpacity,
  revealStatus,
  sortAwards,
  specialDefinitions,
  unpublishedAwards,
  type AwardRecord,
} from './awards'
import type { FinalPlacings } from './draw'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEAMS = [
  { id: 'm-tinsel', name: 'Tinsel Titans', playerNames: ['Aroha Ngata', 'Ben Cole'] },
  { id: 'm-sleigh', name: 'Sleigh Servers', playerNames: ['Chris Doyle', 'Dev Patel'] },
  { id: 'm-holly', name: 'Holly Jolly Smash', playerNames: ['Ezra Wills', 'Finn Ahern'] },
  { id: 'm-frost', name: 'Frostbite Flickers', playerNames: ['Gus Reyes', 'Hemi Ropata'] },
]

const FULL_PLACINGS: FinalPlacings = {
  champion: 'm-tinsel',
  runnerUp: 'm-sleigh',
  third: 'm-holly',
  fourth: 'm-frost',
}

function record(overrides: Partial<AwardRecord> = {}): AwardRecord {
  return {
    id: 'a1',
    divisionSlug: 'mens_doubles',
    divisionName: "Men's Doubles",
    key: 'champion',
    dbType: 'champion',
    recipient: {
      teamId: 'm-tinsel',
      teamName: 'Tinsel Titans',
      playerNames: ['Aroha Ngata', 'Ben Cole'],
      playerId: null,
      playerName: null,
    },
    citation: '',
    isPublished: true,
    derived: false,
    createdAt: '2026-12-13T12:00:00+11:00',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------

describe('award catalogue', () => {
  it('ships placing awards for all four podium spots', () => {
    const placings = placingDefinitions()
    expect(placings.map((def) => def.placing)).toEqual([1, 2, 3, 4])
    expect(placings.map((def) => def.key)).toEqual([
      'champion',
      'runner_up',
      'third_place',
      'fourth_place',
    ])
  })

  it('ships the discretionary gongs the committee asked for', () => {
    const keys = specialDefinitions().map((def) => def.key)
    expect(keys).toContain('mvp')
    expect(keys).toContain('most_improved')
    expect(keys).toContain('sportsmanship')
    expect(keys).toContain('best_outfit')
  })

  it('maps every custom award onto a real Postgres enum value', () => {
    const allowed = new Set([
      'champion',
      'runner_up',
      'third_place',
      'fourth_place',
      'sportsmanship',
      'special_mention',
    ])
    for (const def of DEFAULT_AWARD_DEFINITIONS) {
      expect(allowed.has(def.dbType)).toBe(true)
    }
  })

  it('looks definitions up by key and returns null for unknown ones', () => {
    expect(awardDefinitionByKey('mvp')?.label).toBe('MVP')
    expect(awardDefinitionByKey('nope')).toBeNull()
  })
})

describe('mergeAwardDefinitions', () => {
  it('appends brand new award types', () => {
    const merged = mergeAwardDefinitions([{ key: 'longest_rally', label: 'Longest Rally' }])
    const added = merged.find((def) => def.key === 'longest_rally')
    expect(added).toBeDefined()
    expect(added?.dbType).toBe('special_mention')
    expect(added?.category).toBe('special')
    expect(merged.length).toBe(DEFAULT_AWARD_DEFINITIONS.length + 1)
  })

  it('titleises a key when no label is given', () => {
    const merged = mergeAwardDefinitions([{ key: 'best_hair_day' }])
    expect(merged.find((d) => d.key === 'best_hair_day')?.label).toBe('Best Hair Day')
  })

  it('overrides an existing definition without duplicating it', () => {
    const merged = mergeAwardDefinitions([{ key: 'mvp', label: 'Most Valuable Smasher' }])
    expect(merged.filter((def) => def.key === 'mvp')).toHaveLength(1)
    expect(awardDefinitionByKey('mvp', merged)?.label).toBe('Most Valuable Smasher')
  })

  it('ignores entries with no key', () => {
    expect(mergeAwardDefinitions([{ label: 'Nameless' }])).toHaveLength(
      DEFAULT_AWARD_DEFINITIONS.length,
    )
  })

  it('returns a stable sort order', () => {
    const merged = mergeAwardDefinitions([{ key: 'z_award' }, { key: 'a_award' }])
    const orders = merged.map((def) => def.sortOrder)
    expect([...orders].sort((a, b) => a - b)).toEqual(orders)
  })

  it('does not mutate the defaults', () => {
    mergeAwardDefinitions([{ key: 'champion', label: 'Winners!' }])
    expect(awardDefinitionByKey('champion')?.label).toBe('Champions')
  })
})

describe('citation encoding', () => {
  it('stores enum-backed awards untagged', () => {
    expect(encodeCitation('champion', ' Unbeaten all day ', 'champion')).toBe('Unbeaten all day')
    expect(encodeCitation('champion', '   ', 'champion')).toBeNull()
  })

  it('tags custom awards so the key survives the round trip', () => {
    const encoded = encodeCitation('mvp', 'Ten straight wins', 'special_mention')
    expect(encoded).toBe('[[award:mvp]] Ten straight wins')
    expect(decodeCitation(encoded, 'special_mention')).toEqual({
      key: 'mvp',
      text: 'Ten straight wins',
    })
  })

  it('tags a custom award even with an empty citation', () => {
    const encoded = encodeCitation('best_outfit', '', 'special_mention')
    expect(decodeCitation(encoded, 'special_mention')).toEqual({ key: 'best_outfit', text: '' })
  })

  it('falls back to the enum value for legacy untagged rows', () => {
    expect(decodeCitation('Great spirit', 'sportsmanship')).toEqual({
      key: 'sportsmanship',
      text: 'Great spirit',
    })
    expect(decodeCitation(null, 'champion')).toEqual({ key: null, text: '' })
  })

  it('dbTypeToKey is the identity for enum-backed awards', () => {
    expect(dbTypeToKey('third_place')).toBe('third_place')
  })
})

describe('derivePlacingAwards', () => {
  it('derives all four placings from finalPlacings', () => {
    const derived = derivePlacingAwards({
      divisionSlug: 'mens_doubles',
      divisionName: "Men's Doubles",
      placings: FULL_PLACINGS,
      teams: TEAMS,
    })
    expect(derived.map((r) => r.key)).toEqual([
      'champion',
      'runner_up',
      'third_place',
      'fourth_place',
    ])
    expect(derived[0].recipient.teamName).toBe('Tinsel Titans')
    expect(derived[0].recipient.playerNames).toEqual(['Aroha Ngata', 'Ben Cole'])
    expect(derived.every((r) => r.derived && r.id === null && !r.isPublished)).toBe(true)
  })

  it('produces nothing when the bracket has not been played', () => {
    const derived = derivePlacingAwards({
      divisionSlug: 'womens_doubles',
      divisionName: "Women's Doubles",
      placings: { champion: null, runnerUp: null, third: null, fourth: null },
      teams: TEAMS,
    })
    expect(derived).toEqual([])
  })

  it('handles a played final with the third-place match still outstanding', () => {
    const derived = derivePlacingAwards({
      divisionSlug: 'mens_doubles',
      divisionName: "Men's Doubles",
      placings: { champion: 'm-tinsel', runnerUp: 'm-sleigh', third: null, fourth: null },
      teams: TEAMS,
    })
    expect(derived.map((r) => r.key)).toEqual(['champion', 'runner_up'])
  })

  it('falls back to the team id when the team is unknown', () => {
    const derived = derivePlacingAwards({
      divisionSlug: 'mens_doubles',
      divisionName: "Men's Doubles",
      placings: { champion: 'ghost', runnerUp: null, third: null, fourth: null },
      teams: TEAMS,
    })
    expect(derived[0].recipient.teamName).toBe('ghost')
    expect(derived[0].recipient.playerNames).toEqual([])
  })
})

describe('mergeSuggestions', () => {
  const suggestions = derivePlacingAwards({
    divisionSlug: 'mens_doubles',
    divisionName: "Men's Doubles",
    placings: FULL_PLACINGS,
    teams: TEAMS,
  })

  it('prefers a saved award over the derived suggestion', () => {
    const saved = [record({ id: 'saved-1', key: 'champion', citation: 'Confirmed' })]
    const merged = mergeSuggestions(saved, suggestions)
    const champions = merged.filter((r) => r.key === 'champion')
    expect(champions).toHaveLength(1)
    expect(champions[0].id).toBe('saved-1')
    expect(merged).toHaveLength(4)
  })

  it('keeps suggestions for other divisions separate', () => {
    const saved = [record({ id: 's', key: 'champion', divisionSlug: 'womens_doubles' })]
    const merged = mergeSuggestions(saved, suggestions)
    expect(merged.filter((r) => r.key === 'champion')).toHaveLength(2)
  })

  it('reports which rows still need confirming', () => {
    const merged = mergeSuggestions([record({ id: 'saved-1' })], suggestions)
    expect(pendingConfirmations(merged).map((r) => r.key)).toEqual([
      'runner_up',
      'third_place',
      'fourth_place',
    ])
  })
})

describe('sorting', () => {
  it('orders placings before discretionary awards', () => {
    const unsorted = [
      record({ key: 'mvp', dbType: 'special_mention' }),
      record({ key: 'third_place', dbType: 'third_place' }),
      record({ key: 'champion' }),
    ]
    expect(sortAwards(unsorted).map((r) => r.key)).toEqual(['champion', 'third_place', 'mvp'])
  })

  it('pushes unknown keys to the end, alphabetically', () => {
    const sorted = sortAwards([
      record({ key: 'zzz_mystery' }),
      record({ key: 'aaa_mystery' }),
      record({ key: 'champion' }),
    ])
    expect(sorted.map((r) => r.key)).toEqual(['champion', 'aaa_mystery', 'zzz_mystery'])
  })

  it('compareAwards is symmetric-ish', () => {
    const a = record({ key: 'champion' })
    const b = record({ key: 'mvp' })
    expect(compareAwards(a, b)).toBeLessThan(0)
    expect(compareAwards(b, a)).toBeGreaterThan(0)
    expect(compareAwards(a, a)).toBe(0)
  })
})

describe('recipients', () => {
  it('prefers a player name over the team name', () => {
    const recipient = {
      teamId: 't',
      teamName: 'Tinsel Titans',
      playerNames: ['Aroha Ngata', 'Ben Cole'],
      playerId: 'p1',
      playerName: 'Aroha Ngata',
    }
    expect(recipientLabel(recipient)).toBe('Aroha Ngata')
    expect(recipientSubtitle(recipient)).toBe('Tinsel Titans')
  })

  it('falls back through team name to a placeholder', () => {
    expect(recipientLabel({ ...EMPTY_RECIPIENT, teamName: 'Cocoa Crushers' })).toBe('Cocoa Crushers')
    expect(recipientLabel(EMPTY_RECIPIENT)).toBe('To be decided')
    expect(recipientSubtitle({ ...EMPTY_RECIPIENT, playerNames: ['A', 'B'] })).toBe('A & B')
  })

  it('knows when an award has nobody attached', () => {
    expect(hasRecipient(record())).toBe(true)
    expect(hasRecipient(record({ recipient: EMPTY_RECIPIENT }))).toBe(false)
  })
})

describe('publish filtering', () => {
  const records = [
    record({ id: '1', key: 'champion', isPublished: true }),
    record({ id: '2', key: 'runner_up', dbType: 'runner_up', isPublished: false }),
    record({ id: '3', key: 'mvp', dbType: 'special_mention', isPublished: true, recipient: EMPTY_RECIPIENT }),
  ]

  it('publishes only rows that are published AND have a recipient', () => {
    expect(publishedAwards(records).map((r) => r.id)).toEqual(['1'])
  })

  it('lists saved-but-hidden rows', () => {
    expect(unpublishedAwards(records).map((r) => r.id)).toEqual(['2'])
  })

  it('never treats an unsaved suggestion as unpublished-but-saved', () => {
    expect(unpublishedAwards([record({ id: null, isPublished: false })])).toEqual([])
  })
})

describe('planPublish', () => {
  it('publishes every saved, filled-in, currently-hidden award', () => {
    const plan = planPublish(
      [
        record({ id: '1', isPublished: false }),
        record({ id: '2', key: 'runner_up', dbType: 'runner_up', isPublished: false }),
        record({ id: '3', key: 'third_place', dbType: 'third_place', isPublished: true }),
      ],
      true,
    )
    expect(plan.ids).toEqual(['1', '2'])
    expect(plan.publish).toBe(true)
    expect(plan.summary).toBe('Publish 2 awards.')
    expect(plan.blockers).toEqual([])
  })

  it('blocks publishing an award with no recipient', () => {
    const plan = planPublish(
      [record({ id: '1', key: 'mvp', dbType: 'special_mention', isPublished: false, recipient: EMPTY_RECIPIENT })],
      true,
    )
    expect(plan.ids).toEqual([])
    expect(plan.blockers[0]).toContain('mvp')
  })

  it('tells the admin to confirm the derived placings first', () => {
    const plan = planPublish([record({ id: null, derived: true, isPublished: false })], true)
    expect(plan.blockers).toContain('Confirm the derived placings first — nothing is saved yet.')
  })

  it('unpublishes everything currently public, recipient or not', () => {
    const plan = planPublish(
      [
        record({ id: '1', isPublished: true }),
        record({ id: '2', isPublished: true, recipient: EMPTY_RECIPIENT }),
        record({ id: '3', isPublished: false }),
      ],
      false,
    )
    expect(plan.ids).toEqual(['1', '2'])
    expect(plan.summary).toBe('Hide 2 awards.')
  })

  it('reports a no-op honestly', () => {
    expect(planPublish([], true).summary).toBe('Nothing new to publish.')
    expect(planPublish([], false).summary).toBe('Nothing is published right now.')
    expect(planPublish([record({ id: '1', isPublished: false })], true).summary).toBe(
      'Publish 1 award.',
    )
  })
})

describe('placingsConfirmed', () => {
  it('is true only when all four placings are saved', () => {
    const saved = ['champion', 'runner_up', 'third_place', 'fourth_place'].map((key, i) =>
      record({ id: `x${i}`, key }),
    )
    expect(placingsConfirmed(saved)).toBe(true)
    expect(placingsConfirmed(saved.slice(0, 3))).toBe(false)
  })

  it('ignores unsaved suggestions', () => {
    const suggestions = derivePlacingAwards({
      divisionSlug: 'mens_doubles',
      divisionName: "Men's Doubles",
      placings: FULL_PLACINGS,
      teams: TEAMS,
    })
    expect(placingsConfirmed(suggestions)).toBe(false)
  })
})

describe('buildPodium', () => {
  const full = [
    record({ id: '1', key: 'champion' }),
    record({
      id: '2',
      key: 'runner_up',
      dbType: 'runner_up',
      recipient: {
        teamId: 'm-sleigh',
        teamName: 'Sleigh Servers',
        playerNames: ['Chris Doyle', 'Dev Patel'],
        playerId: null,
        playerName: null,
      },
    }),
    record({
      id: '3',
      key: 'third_place',
      dbType: 'third_place',
      recipient: {
        teamId: 'm-holly',
        teamName: 'Holly Jolly Smash',
        playerNames: ['Ezra Wills', 'Finn Ahern'],
        playerId: null,
        playerName: null,
      },
    }),
  ]

  it('builds three blocks with descending plinth heights', () => {
    const podium = buildPodium(full)
    expect(podium.map((spot) => spot.placing)).toEqual([1, 2, 3])
    expect(podium[0].height).toBeGreaterThan(podium[1].height)
    expect(podium[1].height).toBeGreaterThan(podium[2].height)
    expect(podium.map((spot) => spot.tone)).toEqual(['gold', 'silver', 'bronze'])
  })

  it('reveals bronze first and gold last', () => {
    const podium = buildPodium(full)
    expect(podium.find((s) => s.placing === 3)?.revealIndex).toBe(0)
    expect(podium.find((s) => s.placing === 1)?.revealIndex).toBe(2)
  })

  it('renders nothing without a champion', () => {
    expect(buildPodium(full.filter((r) => r.key !== 'champion'))).toEqual([])
    expect(buildPodium([])).toEqual([])
  })

  it('copes with a champion but no third place yet', () => {
    const podium = buildPodium(full.slice(0, 2))
    expect(podium.map((s) => s.placing)).toEqual([1, 2])
  })

  it('lays the blocks out silver-gold-bronze', () => {
    expect(podiumLayoutOrder(buildPodium(full)).map((s) => s.placing)).toEqual([2, 1, 3])
  })
})

describe('hydration-safe style helpers', () => {
  it('stringifies reveal delays with units at fixed precision', () => {
    expect(revealDelay(0)).toBe('0.10s')
    expect(revealDelay(2)).toBe('0.80s')
    expect(revealDelay(1, 0.333333)).toBe('0.43s')
  })

  it('stringifies and clamps opacity', () => {
    expect(revealOpacity(1 / 3)).toBe('0.33')
    expect(revealOpacity(-2)).toBe('0.00')
    expect(revealOpacity(5)).toBe('1.00')
  })
})

describe('revealStatus', () => {
  const base = {
    tournamentDate: '2026-12-13T09:00:00+11:00',
    tournamentDateLabel: 'Sunday, 13 December 2026',
  }

  it('counts down before tournament day', () => {
    const status = revealStatus({ ...base, now: new Date('2026-10-01T00:00:00Z'), publishedCount: 0 })
    expect(status.state).toBe('countdown')
    expect(status.celebrate).toBe(false)
    expect(status.heading).toContain('13 December')
  })

  it('switches to "ceremony warming up" once play has started', () => {
    const status = revealStatus({ ...base, now: new Date('2026-12-13T12:00:00+11:00'), publishedCount: 0 })
    expect(status.state).toBe('in_progress')
    expect(status.celebrate).toBe(false)
  })

  it('celebrates as soon as anything is published, even mid-event', () => {
    const status = revealStatus({ ...base, now: new Date('2026-12-13T12:00:00+11:00'), publishedCount: 2 })
    expect(status.state).toBe('revealed')
    expect(status.celebrate).toBe(true)
  })

  it('celebrates published awards even before the event date (a test publish)', () => {
    const status = revealStatus({ ...base, now: new Date('2026-01-01T00:00:00Z'), publishedCount: 1 })
    expect(status.state).toBe('revealed')
  })
})

describe('buildDivisionViews', () => {
  const divisions = [
    { slug: 'mens_doubles', name: "Men's Doubles" },
    { slug: 'womens_doubles', name: "Women's Doubles" },
  ]

  const records = [
    record({ id: '1', key: 'champion' }),
    record({ id: '2', key: 'runner_up', dbType: 'runner_up' }),
    record({ id: '3', key: 'third_place', dbType: 'third_place' }),
    record({ id: '4', key: 'fourth_place', dbType: 'fourth_place' }),
    record({
      id: '5',
      key: 'mvp',
      dbType: 'special_mention',
      recipient: {
        teamId: null,
        teamName: 'Tinsel Titans',
        playerNames: [],
        playerId: 'p1',
        playerName: 'Aroha Ngata',
      },
    }),
  ]

  it('splits placings from discretionary awards per division', () => {
    const views = buildDivisionViews(records, divisions)
    expect(views).toHaveLength(2)
    expect(views[0].podium).toHaveLength(3)
    expect(views[0].specials.map((r) => r.key)).toEqual(['mvp'])
    expect(views[0].fourth?.key).toBe('fourth_place')
    expect(views[0].all).toHaveLength(5)
  })

  it('returns an empty view for a division with no awards', () => {
    const views = buildDivisionViews(records, divisions)
    expect(views[1].podium).toEqual([])
    expect(views[1].specials).toEqual([])
    expect(views[1].fourth).toBeNull()
  })

  it('hasAnyWinners is false only when every division is empty', () => {
    expect(hasAnyWinners(buildDivisionViews(records, divisions))).toBe(true)
    expect(hasAnyWinners(buildDivisionViews([], divisions))).toBe(false)
  })
})

describe('audit entries', () => {
  it('records who won what', () => {
    const entry = awardAuditEntry('award.create', record({ id: 'a9' }))
    expect(entry).toEqual({
      action: 'award.create',
      entity_type: 'award',
      entity_id: 'a9',
      metadata: {
        award_key: 'champion',
        division: 'mens_doubles',
        recipient: 'Tinsel Titans',
        team_id: 'm-tinsel',
        player_id: null,
      },
    })
  })

  it('records a bulk publish', () => {
    const plan = planPublish([record({ id: '1', isPublished: false })], true)
    const entry = publishAuditEntry(plan, 'mens_doubles')
    expect(entry.action).toBe('award.publish')
    expect(entry.metadata.count).toBe(1)
    expect(entry.metadata.ids).toBe('1')
  })

  it('records an unpublish', () => {
    const plan = planPublish([record({ id: '1', isPublished: true })], false)
    expect(publishAuditEntry(plan, 'womens_doubles').action).toBe('award.unpublish')
  })
})
