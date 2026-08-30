/**
 * Committee readiness checklist for tournament day.
 *
 * CLIENT-SAFE: no `next/headers`, no Supabase server client. Fetching lives
 * in `src/app/admin/checklist/data.ts`, mutations in `actions.ts`.
 *
 * The point of this module is that **quantities are never typed in**. Loot
 * bag counts, shirt-size breakdowns and prize money all fall out of the real
 * approved registrations (`shirtSizeTally` from `@/lib/admin`) and the saved
 * prize configuration, so the number on the printed sheet can't drift from
 * the number of people who actually entered.
 *
 * SCHEMA NOTE: `public.checklist_items` is a *per-player collection* table
 * (`player_id` + `item_type in (loot_bag, shirt, medal, trophy,
 * prize_money)`), which answers "did Nadia pick up her loot bag?" — not
 * "has the committee bought the medals?". This board is therefore persisted
 * as JSON in `site_content` under `COMMITTEE_CHECKLIST_SLUG`, the same
 * pattern the settings console uses for config with no column yet. A
 * dedicated `committee_checklist` table would be better — see the report.
 */

import { csvEscape, csvFilename, formatCents, type AdminRegistration } from './admin'
import { shirtSizeTally } from './admin'
import type { PrizeSettings } from './settings'

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const CHECKLIST_CATEGORIES = [
  'Prizes & trophies',
  'Loot bags & shirts',
  'Court kit',
  'Paperwork',
  'Venue & safety',
  'Food & drink',
] as const

export type ChecklistCategory = (typeof CHECKLIST_CATEGORIES)[number]

export const CATEGORY_BLURBS: Record<ChecklistCategory, string> = {
  'Prizes & trophies': 'Cash envelopes, trophies and medals — the poster promised them.',
  'Loot bags & shirts': 'One bag for every single player. No exceptions, no leftovers.',
  'Court kit': 'Shuttles, nets, posts and everything that makes a game possible.',
  Paperwork: 'Scoresheets, draws, pens and the rules on the wall.',
  'Venue & safety': 'Keys, first aid, music and the bits that keep everyone upright.',
  'Food & drink': 'Snacks, water and the all-important eggnog.',
}

export function isChecklistCategory(value: string): value is ChecklistCategory {
  return (CHECKLIST_CATEGORIES as readonly string[]).includes(value)
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/**
 * Which derived quantity fills this row's "how many" cell. `null` means the
 * committee sets it by hand.
 */
export type DerivedQuantityKey =
  | 'lootBags'
  | 'players'
  | 'shirts'
  | 'teams'
  | 'medals'
  | 'trophies'
  | 'prizeMoney'
  | 'shuttleTubes'

export interface ChecklistItem {
  id: string
  category: ChecklistCategory
  label: string
  detail: string
  /** Committee member responsible. Free text — no accounts required. */
  owner: string
  /** ISO date (`YYYY-MM-DD`) or `''`. */
  dueDate: string
  notes: string
  done: boolean
  /** Set when the quantity is auto-derived rather than typed in. */
  derivedQuantity: DerivedQuantityKey | null
  /** Manual quantity text, used when `derivedQuantity` is null. */
  quantity: string
  sortOrder: number
}

let seedCounter = 0
function seedItem(
  category: ChecklistCategory,
  label: string,
  detail: string,
  extra: Partial<ChecklistItem> = {},
): ChecklistItem {
  seedCounter += 1
  return {
    id: `seed-${seedCounter}`,
    category,
    label,
    detail,
    owner: '',
    dueDate: '',
    notes: '',
    done: false,
    derivedQuantity: null,
    quantity: '',
    sortOrder: seedCounter * 10,
    ...extra,
  }
}

/**
 * The starter board. Everything the poster promises plus the operational
 * kit a badminton event cannot run without.
 */
export function defaultChecklistItems(): ChecklistItem[] {
  seedCounter = 0
  return [
    seedItem('Prizes & trophies', 'Cash prize envelopes', 'One labelled envelope per placing, per division.', {
      derivedQuantity: 'prizeMoney',
    }),
    seedItem('Prizes & trophies', 'Trophies engraved', 'Champion trophy for each division.', {
      derivedQuantity: 'trophies',
    }),
    seedItem('Prizes & trophies', 'Medals sorted by placing', 'Doubles means two medals per placing.', {
      derivedQuantity: 'medals',
    }),
    seedItem('Prizes & trophies', 'Award certificates printed', 'MVP, Most Improved, Sportsmanship, Best Outfit.'),
    seedItem('Prizes & trophies', 'Presentation table dressed', 'Tinsel, table cloth, trophy risers.'),

    seedItem('Loot bags & shirts', 'Loot bags packed', 'One per player — count comes from approved registrations.', {
      derivedQuantity: 'lootBags',
    }),
    seedItem('Loot bags & shirts', 'Event shirts ordered', 'Ordered against the live shirt-size tally.', {
      derivedQuantity: 'shirts',
    }),
    seedItem('Loot bags & shirts', 'Shirts sorted into size piles', 'Lay them out by size before doors open.', {
      derivedQuantity: 'shirts',
    }),
    seedItem('Loot bags & shirts', 'Santa hats counted', 'Mandatory festive headwear.', {
      derivedQuantity: 'players',
    }),

    seedItem('Court kit', 'Shuttlecock tubes', 'Match shuttles plus spares for the finals.', {
      derivedQuantity: 'shuttleTubes',
    }),
    seedItem('Court kit', 'Nets and posts checked', 'Height gauge, no sagging nets.'),
    seedItem('Court kit', 'Court lines taped', 'Tape down anything that curls.'),
    seedItem('Court kit', 'Spare grips and grip tape', 'Sweaty December hands.'),
    seedItem('Court kit', 'Scoreboards / flip charts', 'One per court, plus a marker that works.'),

    seedItem('Paperwork', 'Scoresheets printed', 'Round robin plus knockout, two spares per court.'),
    seedItem('Paperwork', 'Pens', 'They always vanish. Buy more than you need.', { quantity: '20' }),
    seedItem('Paperwork', 'Draw sheets on the wall', 'Round robin grid and the semis bracket.'),
    seedItem('Paperwork', 'Rules poster displayed', 'First to 15 no deuce, top 4 to the semis.'),
    seedItem('Paperwork', 'Duty roster printed', 'Umpire, scorer and line judge per match.'),
    seedItem('Paperwork', 'Player check-in list', 'One line per registered player.', {
      derivedQuantity: 'players',
    }),

    seedItem('Venue & safety', 'First-aid kit', 'Stocked, in date, and by the scorers table.'),
    seedItem('Venue & safety', 'Ice packs', 'Rolled ankles happen.'),
    seedItem('Venue & safety', 'Venue keys and access', 'Who opens up, who locks up.'),
    seedItem('Venue & safety', 'Speaker and Christmas playlist', 'Festive, but not deafening.'),
    seedItem('Venue & safety', 'Camera / phone tripod', 'For the podium photos and the gallery.'),
    seedItem('Venue & safety', 'Bin bags and clean-up kit', 'Leave the hall better than we found it.'),

    seedItem('Food & drink', 'Water and cups', 'Two bottles per player is the safe number.', {
      derivedQuantity: 'players',
    }),
    seedItem('Food & drink', 'Snacks and mince pies', 'Half-time sugar.'),
    seedItem('Food & drink', 'Eggnog for the presentation', 'Non-alcoholic option too.'),
  ]
}

// ---------------------------------------------------------------------------
// Derived quantities
// ---------------------------------------------------------------------------

export interface ShirtSizeLine {
  size: string
  count: number
}

export interface DerivedQuantities {
  /** Players who are actually playing (approved or waitlisted). */
  playerCount: number
  /** Approved players only — the number the loot bag order is placed for. */
  approvedPlayers: number
  lootBags: number
  teamCount: number
  shirtSizes: ShirtSizeLine[]
  medalsNeeded: number
  medalsConfigured: number
  trophiesNeeded: number
  trophiesConfigured: number
  prizePoolCents: number
  /** Loot bag contents multiplied out by player count. */
  lootBagLines: { name: string; perPlayer: number; total: number; notes: string }[]
  /** Tubes of shuttles: roughly one per court-hour plus finals spares. */
  shuttleTubes: number
  divisionCount: number
}

export interface DeriveInput {
  registrations: readonly AdminRegistration[]
  prizes: PrizeSettings
  /** Enabled division count — drives trophy/medal targets. */
  divisionCount: number
}

/** Players who count for loot bags: everyone not rejected. */
export function playingRegistrations(
  rows: readonly AdminRegistration[],
): AdminRegistration[] {
  return rows.filter((row) => row.status !== 'rejected')
}

/**
 * Every quantity on the board, derived from real data.
 *
 * Loot bags follow the poster promise ("loot bags for everyone"), so the
 * count is *every player who will be in the hall*, not just approved ones —
 * a waitlisted player who gets in on the day still needs a bag.
 */
export function deriveQuantities(input: DeriveInput): DerivedQuantities {
  const playing = playingRegistrations(input.registrations)
  const approved = input.registrations.filter((row) => row.status === 'approved')
  const shirtSizes = shirtSizeTally(input.registrations)

  const teamIds = new Set(
    approved.map((row) => row.teamId).filter((id): id is string => id != null),
  )
  const teamCount = teamIds.size

  const podiumSpots = 3 * input.divisionCount
  const medalsNeeded = podiumSpots * 2

  const prizePoolCents = input.prizes.divisionPrizes.reduce(
    (total, prize) => total + prize.championCents + prize.runnerUpCents + prize.thirdPlaceCents,
    0,
  )

  const lootBagLines = input.prizes.lootBagItems.map((item) => ({
    name: item.name,
    perPlayer: item.quantity,
    total: item.quantity * playing.length,
    notes: item.notes,
  }))

  // A tube of 12 covers about six games; round robin + knockout across the
  // divisions plus two spare tubes for the finals.
  const gamesish = Math.max(1, teamCount * 5)
  const shuttleTubes = Math.ceil(gamesish / 6) + 2

  return {
    playerCount: playing.length,
    approvedPlayers: approved.length,
    lootBags: playing.length,
    teamCount,
    shirtSizes,
    medalsNeeded,
    medalsConfigured: input.prizes.medalCount,
    trophiesNeeded: input.divisionCount,
    trophiesConfigured: input.prizes.trophyCount,
    prizePoolCents,
    lootBagLines,
    shuttleTubes,
    divisionCount: input.divisionCount,
  }
}

/** The display string for an auto-derived quantity. */
export function quantityText(key: DerivedQuantityKey, derived: DerivedQuantities): string {
  switch (key) {
    case 'lootBags':
      return `${derived.lootBags} bags`
    case 'players':
      return `${derived.playerCount} players`
    case 'shirts':
      return derived.shirtSizes.length
        ? derived.shirtSizes.map((line) => `${line.size}×${line.count}`).join(', ')
        : 'No shirt sizes yet'
    case 'teams':
      return `${derived.teamCount} pairs`
    case 'medals':
      return `${derived.medalsNeeded} needed · ${derived.medalsConfigured} ordered`
    case 'trophies':
      return `${derived.trophiesNeeded} needed · ${derived.trophiesConfigured} ordered`
    case 'prizeMoney':
      return formatCents(derived.prizePoolCents)
    case 'shuttleTubes':
      return `${derived.shuttleTubes} tubes`
    default:
      return ''
  }
}

/** The quantity cell for any item, derived or manual. */
export function itemQuantity(item: ChecklistItem, derived: DerivedQuantities): string {
  if (item.derivedQuantity) return quantityText(item.derivedQuantity, derived)
  return item.quantity
}

/** True when the derived quantity has nothing behind it yet. */
export function quantityIsPending(item: ChecklistItem, derived: DerivedQuantities): boolean {
  if (!item.derivedQuantity) return false
  switch (item.derivedQuantity) {
    case 'lootBags':
    case 'players':
      return derived.playerCount === 0
    case 'shirts':
      return derived.shirtSizes.length === 0
    case 'teams':
      return derived.teamCount === 0
    case 'prizeMoney':
      return derived.prizePoolCents === 0
    default:
      return false
  }
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export interface Progress {
  done: number
  total: number
  /** 0–100, rounded to a whole number. */
  percent: number
}

export function progressOf(items: readonly ChecklistItem[]): Progress {
  const total = items.length
  const done = items.filter((item) => item.done).length
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) }
}

export interface CategoryProgress extends Progress {
  category: ChecklistCategory
  items: ChecklistItem[]
}

/** Progress per category, in `CHECKLIST_CATEGORIES` order, empties dropped. */
export function categoryProgress(items: readonly ChecklistItem[]): CategoryProgress[] {
  return CHECKLIST_CATEGORIES.map((category) => {
    const bucket = sortChecklist(items.filter((item) => item.category === category))
    return { category, items: bucket, ...progressOf(bucket) }
  }).filter((group) => group.items.length > 0)
}

export type ProgressTone = 'danger' | 'warn' | 'info' | 'success'

export function progressTone(percent: number): ProgressTone {
  if (percent >= 100) return 'success'
  if (percent >= 66) return 'info'
  if (percent >= 33) return 'warn'
  return 'danger'
}

/** Encouraging, festive copy for a progress percentage. */
export function progressCheer(percent: number): string {
  if (percent >= 100) return 'Everything ticked. Go have an eggnog. 🥛'
  if (percent >= 80) return 'Nearly there — the sleigh is almost packed.'
  if (percent >= 50) return 'Halfway. Keep the elves moving.'
  if (percent > 0) return 'A start! Plenty still on the list.'
  return 'Nothing ticked yet. Santa is watching.'
}

export function sortChecklist(items: readonly ChecklistItem[]): ChecklistItem[] {
  return [...items].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.label.localeCompare(b.label)
  })
}

// ---------------------------------------------------------------------------
// Due dates & alerts
// ---------------------------------------------------------------------------

/**
 * Whole days between `now` and an item's due date. Negative when overdue,
 * `null` when the item has no due date or is already done.
 *
 * `now` is a parameter, never `Date.now()` inside a component.
 */
export function daysUntilDue(item: ChecklistItem, now: Date): number | null {
  if (!item.dueDate || item.done) return null
  const due = Date.parse(`${item.dueDate}T00:00:00Z`)
  if (Number.isNaN(due)) return null
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((due - today) / 86_400_000)
}

export type DueState = 'none' | 'overdue' | 'today' | 'soon' | 'later'

export function dueState(item: ChecklistItem, now: Date): DueState {
  const days = daysUntilDue(item, now)
  if (days === null) return 'none'
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days <= 7) return 'soon'
  return 'later'
}

export function dueLabel(item: ChecklistItem, now: Date): string {
  const days = daysUntilDue(item, now)
  if (days === null) return item.dueDate ? item.dueDate : ''
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `Due in ${days} days`
}

export interface ChecklistAlert {
  tone: 'info' | 'warn' | 'danger' | 'success'
  title: string
  detail: string
}

/**
 * The things a committee member should be told the second the page loads:
 * overdue rows, under-ordered medals/trophies, and unassigned work.
 */
export function checklistAlerts(
  items: readonly ChecklistItem[],
  derived: DerivedQuantities,
  now: Date,
): ChecklistAlert[] {
  const alerts: ChecklistAlert[] = []

  const overdue = items.filter((item) => dueState(item, now) === 'overdue')
  if (overdue.length > 0) {
    alerts.push({
      tone: 'danger',
      title: `${overdue.length} item${overdue.length === 1 ? ' is' : 's are'} overdue`,
      detail: overdue.map((item) => item.label).slice(0, 3).join(', '),
    })
  }

  if (derived.medalsConfigured < derived.medalsNeeded) {
    alerts.push({
      tone: 'warn',
      title: 'Not enough medals ordered',
      detail: `Doubles podiums need ${derived.medalsNeeded}; only ${derived.medalsConfigured} are configured in Settings → Prizes.`,
    })
  }

  if (derived.trophiesConfigured < derived.trophiesNeeded) {
    alerts.push({
      tone: 'warn',
      title: 'Not enough trophies',
      detail: `One champion trophy per division means ${derived.trophiesNeeded}; ${derived.trophiesConfigured} are configured.`,
    })
  }

  const unknownShirts = derived.shirtSizes.find((line) => line.size === 'Unknown')
  if (unknownShirts && unknownShirts.count > 0) {
    alerts.push({
      tone: 'info',
      title: `${unknownShirts.count} player${unknownShirts.count === 1 ? ' has' : 's have'} no shirt size`,
      detail: 'Chase them before the shirt order goes in, or they get whatever is left.',
    })
  }

  const unowned = items.filter((item) => !item.done && item.owner.trim() === '')
  if (unowned.length > 0) {
    alerts.push({
      tone: 'info',
      title: `${unowned.length} job${unowned.length === 1 ? ' has' : 's have'} no owner`,
      detail: 'Unassigned jobs are the ones that get forgotten on the morning.',
    })
  }

  const progress = progressOf(items)
  if (alerts.length === 0 && progress.percent === 100) {
    alerts.push({
      tone: 'success',
      title: 'The whole board is ticked',
      detail: 'Loot bags packed, medals counted, shuttles bought. Nothing left to do. 🎄',
    })
  }

  return alerts
}

// ---------------------------------------------------------------------------
// Mutations (pure — the client holds the array, the action persists it)
// ---------------------------------------------------------------------------

export function toggleItem(
  items: readonly ChecklistItem[],
  id: string,
  done?: boolean,
): ChecklistItem[] {
  return items.map((item) =>
    item.id === id ? { ...item, done: done ?? !item.done } : item,
  )
}

export function updateItem(
  items: readonly ChecklistItem[],
  id: string,
  patch: Partial<Omit<ChecklistItem, 'id'>>,
): ChecklistItem[] {
  return items.map((item) => (item.id === id ? { ...item, ...patch, id: item.id } : item))
}

export function removeItem(items: readonly ChecklistItem[], id: string): ChecklistItem[] {
  return items.filter((item) => item.id !== id)
}

/** Appends a committee-added row at the end of its category. */
export function addItem(
  items: readonly ChecklistItem[],
  input: { category: ChecklistCategory; label: string; detail?: string; owner?: string; dueDate?: string; quantity?: string },
): ChecklistItem[] {
  const maxOrder = items.reduce((max, item) => Math.max(max, item.sortOrder), 0)
  const item: ChecklistItem = {
    id: nextChecklistId(items),
    category: input.category,
    label: input.label.trim(),
    detail: input.detail?.trim() ?? '',
    owner: input.owner?.trim() ?? '',
    dueDate: input.dueDate ?? '',
    notes: '',
    done: false,
    derivedQuantity: null,
    quantity: input.quantity?.trim() ?? '',
    sortOrder: maxOrder + 10,
  }
  return [...items, item]
}

/** Collision-free id for a new row. */
export function nextChecklistId(items: readonly ChecklistItem[]): string {
  const used = new Set(items.map((item) => item.id))
  let n = items.length + 1
  while (used.has(`item-${n}`)) n += 1
  return `item-${n}`
}

// ---------------------------------------------------------------------------
// Persistence (JSON blob in `site_content`)
// ---------------------------------------------------------------------------

export const COMMITTEE_CHECKLIST_SLUG = 'committee-checklist'

export interface ChecklistBlob {
  version: 1
  items: ChecklistItem[]
  updatedAt: string
}

export function serialiseChecklist(items: readonly ChecklistItem[], updatedAt: string): string {
  const blob: ChecklistBlob = { version: 1, items: sortChecklist(items), updatedAt }
  return JSON.stringify(blob)
}

/**
 * Tolerant parse — a hand-edited or half-migrated blob must never take the
 * page down, so anything unrecognised falls back to the seed board.
 */
export function parseChecklist(raw: string | null | undefined): ChecklistItem[] | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    const list = Array.isArray(parsed)
      ? parsed
      : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as ChecklistBlob).items)
        ? (parsed as ChecklistBlob).items
        : null
    if (!list) return null
    const items = list.map(coerceItem).filter((item): item is ChecklistItem => item !== null)
    return items.length > 0 ? sortChecklist(items) : null
  } catch {
    return null
  }
}

function coerceItem(value: unknown, index: number): ChecklistItem | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  const label = typeof raw.label === 'string' ? raw.label.trim() : ''
  if (label === '') return null
  const category =
    typeof raw.category === 'string' && isChecklistCategory(raw.category)
      ? raw.category
      : CHECKLIST_CATEGORIES[0]
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `item-${index + 1}`,
    category,
    label,
    detail: typeof raw.detail === 'string' ? raw.detail : '',
    owner: typeof raw.owner === 'string' ? raw.owner : '',
    dueDate: typeof raw.dueDate === 'string' ? raw.dueDate : '',
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    done: raw.done === true,
    derivedQuantity: isDerivedKey(raw.derivedQuantity) ? raw.derivedQuantity : null,
    quantity: typeof raw.quantity === 'string' ? raw.quantity : '',
    sortOrder: typeof raw.sortOrder === 'number' && Number.isFinite(raw.sortOrder) ? raw.sortOrder : (index + 1) * 10,
  }
}

const DERIVED_KEYS: readonly DerivedQuantityKey[] = [
  'lootBags',
  'players',
  'shirts',
  'teams',
  'medals',
  'trophies',
  'prizeMoney',
  'shuttleTubes',
]

function isDerivedKey(value: unknown): value is DerivedQuantityKey {
  return typeof value === 'string' && (DERIVED_KEYS as readonly string[]).includes(value)
}

/**
 * The board a page should render: the saved blob if there is one, otherwise
 * the seed template so a fresh committee starts with a full checklist.
 */
export function checklistOrDefault(raw: string | null | undefined): ChecklistItem[] {
  return parseChecklist(raw) ?? defaultChecklistItems()
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export const CHECKLIST_CSV_HEADERS = [
  'Category',
  'Item',
  'Detail',
  'Quantity',
  'Owner',
  'Due date',
  'Done',
  'Notes',
] as const

/** Reuses `csvEscape` from `@/lib/admin` — same formula-injection defences. */
export function toChecklistCsv(
  items: readonly ChecklistItem[],
  derived: DerivedQuantities,
): string {
  const lines = [CHECKLIST_CSV_HEADERS.join(',')]
  for (const group of categoryProgress(items)) {
    for (const item of group.items) {
      lines.push(
        [
          item.category,
          item.label,
          item.detail,
          itemQuantity(item, derived),
          item.owner,
          item.dueDate,
          item.done ? 'Yes' : 'No',
          item.notes,
        ]
          .map(csvEscape)
          .join(','),
      )
    }
  }
  return `${lines.join('\r\n')}\r\n`
}

/** `sunday-smashers-checklist-2026-12-13.csv` */
export function checklistCsvFilename(isoDate: string): string {
  return csvFilename('checklist', isoDate)
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export interface ChecklistAuditEntry {
  action: string
  entity_type: string
  entity_id: string | null
  metadata: Record<string, string | number | boolean | null>
}

export function checklistAuditEntry(
  items: readonly ChecklistItem[],
  before: readonly ChecklistItem[],
): ChecklistAuditEntry {
  const after = progressOf(items)
  const previous = progressOf(before)
  return {
    action: 'checklist.update',
    entity_type: 'tournament',
    entity_id: null,
    metadata: {
      items: items.length,
      done: after.done,
      done_before: previous.done,
      percent: after.percent,
    },
  }
}
