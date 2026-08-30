import { describe, expect, it } from 'vitest'
import {
  CHECKLIST_CATEGORIES,
  CHECKLIST_CSV_HEADERS,
  COMMITTEE_CHECKLIST_SLUG,
  addItem,
  categoryProgress,
  checklistAlerts,
  checklistAuditEntry,
  checklistCsvFilename,
  checklistOrDefault,
  daysUntilDue,
  defaultChecklistItems,
  deriveQuantities,
  dueLabel,
  dueState,
  isChecklistCategory,
  itemQuantity,
  nextChecklistId,
  parseChecklist,
  playingRegistrations,
  progressCheer,
  progressOf,
  progressTone,
  quantityIsPending,
  quantityText,
  removeItem,
  serialiseChecklist,
  sortChecklist,
  toChecklistCsv,
  toggleItem,
  updateItem,
  type ChecklistItem,
  type DerivedQuantities,
} from './checklist'
import type { AdminRegistration } from './admin'
import type { PrizeSettings } from './settings'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function registration(overrides: Partial<AdminRegistration> = {}): AdminRegistration {
  return {
    id: 'r1',
    playerId: 'p1',
    playerName: 'Aroha Ngata',
    nickname: null,
    email: null,
    phone: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    shirtSize: 'M',
    skillLevel: null,
    divisionId: 'div-mens',
    divisionName: "Men's Doubles",
    status: 'approved',
    teamId: 'team-1',
    teamName: 'Tinsel Titans',
    partnerName: 'Ben Cole',
    notes: null,
    createdAt: '2026-09-10T00:00:00Z',
    payment: {
      id: null,
      amountCents: 2500,
      amountPaidCents: 2500,
      status: 'paid',
      method: null,
      reference: null,
    },
    ...overrides,
  }
}

const REGISTRATIONS: AdminRegistration[] = [
  registration({ id: 'r1', playerId: 'p1', shirtSize: 'M', teamId: 'team-1' }),
  registration({ id: 'r2', playerId: 'p2', shirtSize: 'L', teamId: 'team-1' }),
  registration({ id: 'r3', playerId: 'p3', shirtSize: 'S', teamId: 'team-2' }),
  registration({ id: 'r4', playerId: 'p4', shirtSize: null, teamId: 'team-2' }),
  registration({ id: 'r5', playerId: 'p5', shirtSize: 'M', status: 'waitlisted', teamId: null }),
  registration({ id: 'r6', playerId: 'p6', shirtSize: 'XL', status: 'rejected', teamId: null }),
]

const PRIZES: PrizeSettings = {
  divisionPrizes: [
    { divisionId: 'div-mens', championCents: 30000, runnerUpCents: 15000, thirdPlaceCents: 7500 },
    { divisionId: 'div-womens', championCents: 30000, runnerUpCents: 15000, thirdPlaceCents: 7500 },
  ],
  trophyCount: 2,
  medalCount: 12,
  lootBagItems: [
    { id: 'loot-shuttle', name: 'Shuttlecock tube', quantity: 1, notes: 'Feather' },
    { id: 'loot-grip', name: 'Overgrip', quantity: 2, notes: '' },
  ],
}

const DERIVED = deriveQuantities({
  registrations: REGISTRATIONS,
  prizes: PRIZES,
  divisionCount: 2,
})

function item(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  return {
    id: 'i1',
    category: 'Court kit',
    label: 'Shuttlecock tubes',
    detail: '',
    owner: '',
    dueDate: '',
    notes: '',
    done: false,
    derivedQuantity: null,
    quantity: '',
    sortOrder: 10,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------

describe('categories', () => {
  it('recognises its own categories and nothing else', () => {
    for (const category of CHECKLIST_CATEGORIES) expect(isChecklistCategory(category)).toBe(true)
    expect(isChecklistCategory('Reindeer')).toBe(false)
  })
})

describe('defaultChecklistItems', () => {
  const items = defaultChecklistItems()

  it('covers everything the poster and the hall need', () => {
    const labels = items.map((i) => i.label.toLowerCase()).join(' | ')
    for (const needle of [
      'loot bags',
      'shirts',
      'medals',
      'trophies',
      'cash prize',
      'shuttlecock',
      'first-aid',
      'scoresheets',
      'pens',
    ]) {
      expect(labels).toContain(needle)
    }
  })

  it('uses every category', () => {
    const used = new Set(items.map((i) => i.category))
    for (const category of CHECKLIST_CATEGORIES) expect(used.has(category)).toBe(true)
  })

  it('has unique ids and starts entirely un-ticked', () => {
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
    expect(items.every((i) => !i.done)).toBe(true)
  })

  it('is stable across calls', () => {
    expect(defaultChecklistItems().map((i) => i.id)).toEqual(items.map((i) => i.id))
  })

  it('marks loot bags and shirts as auto-derived, never hand-typed', () => {
    const loot = items.find((i) => i.label === 'Loot bags packed')
    const shirts = items.find((i) => i.label === 'Event shirts ordered')
    expect(loot?.derivedQuantity).toBe('lootBags')
    expect(shirts?.derivedQuantity).toBe('shirts')
    expect(loot?.quantity).toBe('')
  })
})

describe('deriveQuantities', () => {
  it('counts loot bags from everyone who will be in the hall', () => {
    // 5 non-rejected players out of 6 registrations.
    expect(DERIVED.lootBags).toBe(5)
    expect(DERIVED.playerCount).toBe(5)
    expect(DERIVED.approvedPlayers).toBe(4)
  })

  it('uses shirtSizeTally from @/lib/admin (rejected players excluded)', () => {
    expect(DERIVED.shirtSizes).toEqual([
      { size: 'S', count: 1 },
      { size: 'M', count: 2 },
      { size: 'L', count: 1 },
      { size: 'Unknown', count: 1 },
    ])
  })

  it('counts distinct approved pairs', () => {
    expect(DERIVED.teamCount).toBe(2)
  })

  it('needs two medals per podium spot per division', () => {
    expect(DERIVED.medalsNeeded).toBe(12)
    expect(DERIVED.medalsConfigured).toBe(12)
    expect(DERIVED.trophiesNeeded).toBe(2)
  })

  it('totals prize money across every division', () => {
    expect(DERIVED.prizePoolCents).toBe(105000)
  })

  it('multiplies loot bag contents out by player count', () => {
    expect(DERIVED.lootBagLines).toEqual([
      { name: 'Shuttlecock tube', perPlayer: 1, total: 5, notes: 'Feather' },
      { name: 'Overgrip', perPlayer: 2, total: 10, notes: '' },
    ])
  })

  it('always orders at least a few shuttle tubes', () => {
    const empty = deriveQuantities({ registrations: [], prizes: PRIZES, divisionCount: 2 })
    expect(empty.shuttleTubes).toBeGreaterThanOrEqual(3)
    expect(DERIVED.shuttleTubes).toBeGreaterThan(empty.shuttleTubes - 1)
  })

  it('survives an empty tournament', () => {
    const empty = deriveQuantities({
      registrations: [],
      prizes: { divisionPrizes: [], trophyCount: 0, medalCount: 0, lootBagItems: [] },
      divisionCount: 0,
    })
    expect(empty.lootBags).toBe(0)
    expect(empty.shirtSizes).toEqual([])
    expect(empty.prizePoolCents).toBe(0)
    expect(empty.medalsNeeded).toBe(0)
  })

  it('excludes rejected registrations from the playing list', () => {
    expect(playingRegistrations(REGISTRATIONS)).toHaveLength(5)
  })
})

describe('quantityText', () => {
  it('renders each derived quantity for the board', () => {
    expect(quantityText('lootBags', DERIVED)).toBe('5 bags')
    expect(quantityText('players', DERIVED)).toBe('5 players')
    expect(quantityText('teams', DERIVED)).toBe('2 pairs')
    expect(quantityText('shirts', DERIVED)).toBe('S×1, M×2, L×1, Unknown×1')
    expect(quantityText('medals', DERIVED)).toBe('12 needed · 12 ordered')
    expect(quantityText('trophies', DERIVED)).toBe('2 needed · 2 ordered')
    expect(quantityText('prizeMoney', DERIVED)).toBe('$1,050.00')
    expect(quantityText('shuttleTubes', DERIVED)).toContain('tubes')
  })

  it('says so when there are no shirt sizes at all', () => {
    const empty = deriveQuantities({ registrations: [], prizes: PRIZES, divisionCount: 2 })
    expect(quantityText('shirts', empty)).toBe('No shirt sizes yet')
  })

  it('prefers the derived quantity over any manual one', () => {
    const row = item({ derivedQuantity: 'lootBags', quantity: '999' })
    expect(itemQuantity(row, DERIVED)).toBe('5 bags')
    expect(itemQuantity(item({ quantity: '20' }), DERIVED)).toBe('20')
    expect(itemQuantity(item(), DERIVED)).toBe('')
  })

  it('flags derived quantities with no data behind them', () => {
    const empty: DerivedQuantities = deriveQuantities({
      registrations: [],
      prizes: { divisionPrizes: [], trophyCount: 0, medalCount: 0, lootBagItems: [] },
      divisionCount: 0,
    })
    expect(quantityIsPending(item({ derivedQuantity: 'lootBags' }), empty)).toBe(true)
    expect(quantityIsPending(item({ derivedQuantity: 'shirts' }), empty)).toBe(true)
    expect(quantityIsPending(item({ derivedQuantity: 'prizeMoney' }), empty)).toBe(true)
    expect(quantityIsPending(item({ derivedQuantity: 'lootBags' }), DERIVED)).toBe(false)
    expect(quantityIsPending(item(), empty)).toBe(false)
  })
})

describe('progress', () => {
  it('counts done over total', () => {
    expect(progressOf([item({ done: true }), item({ id: 'i2' })])).toEqual({
      done: 1,
      total: 2,
      percent: 50,
    })
  })

  it('never divides by zero', () => {
    expect(progressOf([])).toEqual({ done: 0, total: 0, percent: 0 })
  })

  it('rounds to whole percentages', () => {
    const three = [item({ id: 'a', done: true }), item({ id: 'b' }), item({ id: 'c' })]
    expect(progressOf(three).percent).toBe(33)
  })

  it('groups by category in declared order and drops empty groups', () => {
    const groups = categoryProgress([
      item({ id: 'a', category: 'Paperwork', done: true }),
      item({ id: 'b', category: 'Prizes & trophies' }),
    ])
    expect(groups.map((g) => g.category)).toEqual(['Prizes & trophies', 'Paperwork'])
    expect(groups[1].percent).toBe(100)
  })

  it('maps percentages to tones', () => {
    expect(progressTone(0)).toBe('danger')
    expect(progressTone(40)).toBe('warn')
    expect(progressTone(70)).toBe('info')
    expect(progressTone(100)).toBe('success')
  })

  it('cheers appropriately', () => {
    expect(progressCheer(100)).toContain('eggnog')
    expect(progressCheer(85)).toContain('sleigh')
    expect(progressCheer(60)).toContain('Halfway')
    expect(progressCheer(10)).toContain('start')
    expect(progressCheer(0)).toContain('Santa')
  })

  it('sorts by sortOrder then label', () => {
    const sorted = sortChecklist([
      item({ id: 'b', label: 'Bravo', sortOrder: 20 }),
      item({ id: 'a', label: 'Alpha', sortOrder: 10 }),
      item({ id: 'c', label: 'Charlie', sortOrder: 10 }),
    ])
    expect(sorted.map((i) => i.id)).toEqual(['a', 'c', 'b'])
  })
})

describe('due dates', () => {
  const now = new Date('2026-12-01T10:00:00Z')

  it('counts whole days to the due date', () => {
    expect(daysUntilDue(item({ dueDate: '2026-12-06' }), now)).toBe(5)
    expect(daysUntilDue(item({ dueDate: '2026-12-01' }), now)).toBe(0)
    expect(daysUntilDue(item({ dueDate: '2026-11-28' }), now)).toBe(-3)
  })

  it('has no opinion about done rows or rows with no date', () => {
    expect(daysUntilDue(item({ dueDate: '2026-11-01', done: true }), now)).toBeNull()
    expect(daysUntilDue(item(), now)).toBeNull()
    expect(daysUntilDue(item({ dueDate: 'not-a-date' }), now)).toBeNull()
  })

  it('classifies the due state', () => {
    expect(dueState(item({ dueDate: '2026-11-01' }), now)).toBe('overdue')
    expect(dueState(item({ dueDate: '2026-12-01' }), now)).toBe('today')
    expect(dueState(item({ dueDate: '2026-12-05' }), now)).toBe('soon')
    expect(dueState(item({ dueDate: '2026-12-30' }), now)).toBe('later')
    expect(dueState(item(), now)).toBe('none')
  })

  it('labels the due state in plain English', () => {
    expect(dueLabel(item({ dueDate: '2026-11-30' }), now)).toBe('1 day overdue')
    expect(dueLabel(item({ dueDate: '2026-11-28' }), now)).toBe('3 days overdue')
    expect(dueLabel(item({ dueDate: '2026-12-01' }), now)).toBe('Due today')
    expect(dueLabel(item({ dueDate: '2026-12-02' }), now)).toBe('Due tomorrow')
    expect(dueLabel(item({ dueDate: '2026-12-08' }), now)).toBe('Due in 7 days')
    expect(dueLabel(item({ dueDate: '2026-12-08', done: true }), now)).toBe('2026-12-08')
    expect(dueLabel(item(), now)).toBe('')
  })
})

describe('checklistAlerts', () => {
  const now = new Date('2026-12-01T10:00:00Z')

  it('shouts about overdue rows first', () => {
    const alerts = checklistAlerts([item({ dueDate: '2026-11-01' })], DERIVED, now)
    expect(alerts[0].tone).toBe('danger')
    expect(alerts[0].title).toContain('overdue')
  })

  it('warns when fewer medals are ordered than podiums need', () => {
    const short = deriveQuantities({
      registrations: REGISTRATIONS,
      prizes: { ...PRIZES, medalCount: 4 },
      divisionCount: 2,
    })
    const alerts = checklistAlerts([item({ done: true })], short, now)
    expect(alerts.some((a) => a.title === 'Not enough medals ordered')).toBe(true)
  })

  it('warns when a division would have no trophy', () => {
    const short = deriveQuantities({
      registrations: REGISTRATIONS,
      prizes: { ...PRIZES, trophyCount: 1 },
      divisionCount: 2,
    })
    expect(
      checklistAlerts([item({ done: true })], short, now).some(
        (a) => a.title === 'Not enough trophies',
      ),
    ).toBe(true)
  })

  it('chases missing shirt sizes', () => {
    const alerts = checklistAlerts([item({ done: true })], DERIVED, now)
    expect(alerts.some((a) => a.title.includes('no shirt size'))).toBe(true)
  })

  it('nags about unassigned jobs', () => {
    const alerts = checklistAlerts([item({ owner: '' })], DERIVED, now)
    expect(alerts.some((a) => a.title.includes('no owner'))).toBe(true)
  })

  it('congratulates a fully ticked, fully stocked board', () => {
    const perfect = deriveQuantities({
      registrations: [registration({ shirtSize: 'M' })],
      prizes: PRIZES,
      divisionCount: 2,
    })
    const alerts = checklistAlerts([item({ done: true, owner: 'Nadia' })], perfect, now)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].tone).toBe('success')
  })
})

describe('mutations', () => {
  const items = [item({ id: 'a' }), item({ id: 'b', done: true })]

  it('toggles without mutating the input', () => {
    const next = toggleItem(items, 'a')
    expect(next[0].done).toBe(true)
    expect(items[0].done).toBe(false)
    expect(toggleItem(items, 'b', true)[1].done).toBe(true)
  })

  it('patches a row but never its id', () => {
    const next = updateItem(items, 'a', { owner: 'Nadia', id: 'hacked' } as Partial<ChecklistItem>)
    expect(next[0].owner).toBe('Nadia')
    expect(next[0].id).toBe('a')
  })

  it('removes a row', () => {
    expect(removeItem(items, 'a').map((i) => i.id)).toEqual(['b'])
    expect(removeItem(items, 'nope')).toHaveLength(2)
  })

  it('appends a committee-added row at the end', () => {
    const next = addItem(items, { category: 'Food & drink', label: '  Candy canes  ' })
    expect(next).toHaveLength(3)
    expect(next[2].label).toBe('Candy canes')
    expect(next[2].sortOrder).toBeGreaterThan(items[1].sortOrder)
    expect(next[2].derivedQuantity).toBeNull()
  })

  it('generates collision-free ids', () => {
    const existing = [item({ id: 'item-1' }), item({ id: 'item-2' }), item({ id: 'item-3' })]
    expect(existing.map((i) => i.id)).not.toContain(nextChecklistId(existing))
  })
})

describe('persistence', () => {
  it('round-trips through JSON', () => {
    const items = defaultChecklistItems()
    const parsed = parseChecklist(serialiseChecklist(items, '2026-12-01T00:00:00Z'))
    expect(parsed).toHaveLength(items.length)
    expect(parsed?.[0].label).toBe(items[0].label)
  })

  it('accepts a bare array as well as a versioned blob', () => {
    const raw = JSON.stringify([{ id: 'x', category: 'Paperwork', label: 'Pens', done: true }])
    const parsed = parseChecklist(raw)
    expect(parsed).toHaveLength(1)
    expect(parsed?.[0].done).toBe(true)
  })

  it('repairs half-written rows rather than throwing', () => {
    const raw = JSON.stringify([
      { id: 'x', category: 'Nonsense', label: 'Pens', derivedQuantity: 'wat', sortOrder: 'many' },
      { label: '' },
      'not an object',
    ])
    const parsed = parseChecklist(raw)
    expect(parsed).toHaveLength(1)
    expect(parsed?.[0].category).toBe(CHECKLIST_CATEGORIES[0])
    expect(parsed?.[0].derivedQuantity).toBeNull()
    expect(parsed?.[0].sortOrder).toBe(10)
  })

  it('returns null for junk, empty lists and nothing at all', () => {
    expect(parseChecklist('{{{')).toBeNull()
    expect(parseChecklist('[]')).toBeNull()
    expect(parseChecklist(null)).toBeNull()
    expect(parseChecklist('')).toBeNull()
    expect(parseChecklist('{"version":1}')).toBeNull()
  })

  it('falls back to the seed board so a fresh committee is never empty', () => {
    expect(checklistOrDefault(null)).toHaveLength(defaultChecklistItems().length)
    expect(checklistOrDefault('[{"label":"Pens","category":"Paperwork"}]')).toHaveLength(1)
  })

  it('uses a site_content slug that is nobody else\u2019s', () => {
    expect(COMMITTEE_CHECKLIST_SLUG).toBe('committee-checklist')
  })
})

describe('CSV export', () => {
  const items = [
    item({ id: 'a', category: 'Loot bags & shirts', label: 'Loot bags packed', derivedQuantity: 'lootBags', owner: 'Nadia', done: true }),
    item({ id: 'b', category: 'Paperwork', label: 'Pens', quantity: '20', notes: 'Blue, please' }),
  ]

  it('writes a header row and one line per item', () => {
    const csv = toChecklistCsv(items, DERIVED)
    const lines = csv.trimEnd().split('\r\n')
    expect(lines[0]).toBe(CHECKLIST_CSV_HEADERS.join(','))
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain('5 bags')
    expect(lines[1]).toContain('Yes')
    expect(lines[2]).toContain('20')
    expect(lines[2]).toContain('No')
  })

  it('groups by category, not insertion order', () => {
    const lines = toChecklistCsv(items, DERIVED).trimEnd().split('\r\n')
    expect(lines[1]).toContain('Loot bags & shirts')
    expect(lines[2]).toContain('Paperwork')
  })

  it('escapes commas and defuses formula injection via csvEscape', () => {
    const csv = toChecklistCsv(
      [item({ label: 'Pens, lots', notes: '=cmd()' })],
      DERIVED,
    )
    expect(csv).toContain('"Pens, lots"')
    expect(csv).toContain("'=cmd()")
  })

  it('ends with CRLF so spreadsheets agree on the row count', () => {
    expect(toChecklistCsv(items, DERIVED).endsWith('\r\n')).toBe(true)
  })

  it('names the file after the tournament date', () => {
    expect(checklistCsvFilename('2026-12-13T09:00:00+11:00')).toBe(
      'sunday-smashers-checklist-2026-12-13.csv',
    )
  })
})

describe('checklistAuditEntry', () => {
  it('records the before/after tick counts', () => {
    const before = [item({ id: 'a' }), item({ id: 'b' })]
    const after = [item({ id: 'a', done: true }), item({ id: 'b' })]
    const entry = checklistAuditEntry(after, before)
    expect(entry.action).toBe('checklist.update')
    expect(entry.entity_type).toBe('tournament')
    expect(entry.metadata).toEqual({ items: 2, done: 1, done_before: 0, percent: 50 })
  })
})
