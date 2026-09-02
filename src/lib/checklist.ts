/**
 * Committee readiness checklist for tournament day.
 *
 * CLIENT-SAFE: no `next/headers`, no Supabase server client. Fetching lives
 * in `src/app/admin/checklist/data.ts`, mutations in `actions.ts`.
 *
 * The point of this module is that **quantities are never typed in**. Loot
 * bag counts, medal counts and prize money all fall out of the real approved
 * registrations and the saved prize configuration, so the number on the
 * printed sheet can't drift from the number of people who actually entered.
 *
 * SCHEMA: the board lives in `public.committee_checklist`, one row per job
 * (migration 0005). Row-per-item matters here: two committee members ticking
 * jobs at the same time must not overwrite each other, which is exactly what
 * a single JSON blob would have done. `public.checklist_items` is a
 * different thing entirely — per-player loot bag/medal handout.
 *
 * The table stores the committee's data (category, label, owner, notes, due
 * date, done, position). The *copy* — each standard job's one-line detail and
 * which quantity is auto-derived for it — stays in the catalogue below and is
 * matched on label, so editorial tweaks never need a migration and no
 * structured state is smuggled into a text column.
 */

import { csvEscape, csvFilename, formatCents, type AdminRegistration } from './admin'
import type { PrizeSettings } from './settings'
import type { CommitteeChecklistRow } from './supabase/types'

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

/**
 * Slugs, because `committee_checklist_category_format` constrains the column
 * to `^[a-z0-9_\-]{1,48}$`. Display strings live in `CATEGORY_LABELS`.
 */
export const CHECKLIST_CATEGORIES = [
  'prizes',
  'loot_bags',
  'court_kit',
  'paperwork',
  'venue',
  'food',
] as const

export type ChecklistCategory = (typeof CHECKLIST_CATEGORIES)[number]

export const CATEGORY_LABELS: Record<ChecklistCategory, string> = {
  prizes: 'Prizes & trophies',
  loot_bags: 'Loot bags',
  court_kit: 'Court kit',
  paperwork: 'Paperwork',
  venue: 'Venue & safety',
  food: 'Food & drink',
}

export const CATEGORY_BLURBS: Record<ChecklistCategory, string> = {
  prizes: 'Cash envelopes, trophies and medals — the poster promised them.',
  loot_bags: 'One bag for every single player. No exceptions, no leftovers.',
  court_kit: 'Shuttles, nets, posts and everything that makes a game possible.',
  paperwork: 'Scoresheets, draws, pens and the rules on the wall.',
  venue: 'Keys, first aid, music and the bits that keep everyone upright.',
  food: 'Snacks, water and the all-important eggnog.',
}

export function isChecklistCategory(value: string): value is ChecklistCategory {
  return (CHECKLIST_CATEGORIES as readonly string[]).includes(value)
}

export function categoryLabel(category: string): string {
  return isChecklistCategory(category) ? CATEGORY_LABELS[category] : category
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/**
 * Which derived quantity fills this row's "how many" cell. `null` means the
 * job simply has no count worth showing.
 */
export type DerivedQuantityKey =
  | 'lootBags'
  | 'players'
  | 'teams'
  | 'medals'
  | 'trophies'
  | 'prizeMoney'
  | 'shuttleTubes'

export interface ChecklistItem {
  /** `committee_checklist.id`, or a local `seed-n` id in demo mode. */
  id: string
  category: ChecklistCategory
  label: string
  /** Editorial one-liner from the catalogue. Not persisted. */
  detail: string
  /** Committee member responsible. Free text — no accounts required. */
  owner: string
  /** ISO date (`YYYY-MM-DD`) or `''`. Maps to `due_on`. */
  dueDate: string
  notes: string
  done: boolean
  /** Derived from the catalogue, never typed in. */
  derivedQuantity: DerivedQuantityKey | null
  /** `committee_checklist.position` — the order jobs happen on the day. */
  position: number
}

/** A standard job: the committee's starting board. */
export interface ChecklistSeed {
  category: ChecklistCategory
  label: string
  detail: string
  derivedQuantity?: DerivedQuantityKey
}

/**
 * The starter board. Everything the poster promises plus the operational kit
 * a badminton event cannot run without, in the order it happens on the day.
 */
export const DEFAULT_CHECKLIST_SEEDS: readonly ChecklistSeed[] = [
  { category: 'prizes', label: 'Cash prize envelopes', detail: 'One labelled envelope per placing, per division.', derivedQuantity: 'prizeMoney' },
  { category: 'prizes', label: 'Trophies engraved', detail: 'Champion trophy for each division.', derivedQuantity: 'trophies' },
  { category: 'prizes', label: 'Medals sorted by placing', detail: 'Doubles means two medals per placing.', derivedQuantity: 'medals' },
  { category: 'prizes', label: 'Award certificates printed', detail: 'MVP, Most Improved, Sportsmanship, Best Outfit.' },
  { category: 'prizes', label: 'Presentation table dressed', detail: 'Tinsel, table cloth, trophy risers.' },

  { category: 'loot_bags', label: 'Loot bags packed', detail: 'One per player — count comes from approved registrations.', derivedQuantity: 'lootBags' },
  { category: 'loot_bags', label: 'Santa hats counted', detail: 'Mandatory festive headwear.', derivedQuantity: 'players' },

  { category: 'court_kit', label: 'Shuttlecock tubes', detail: 'Match shuttles plus spares for the finals.', derivedQuantity: 'shuttleTubes' },
  { category: 'court_kit', label: 'Nets and posts checked', detail: 'Height gauge, no sagging nets.' },
  { category: 'court_kit', label: 'Court lines taped', detail: 'Tape down anything that curls.' },
  { category: 'court_kit', label: 'Spare grips and grip tape', detail: 'Sweaty December hands.' },
  { category: 'court_kit', label: 'Scoreboards / flip charts', detail: 'One per court, plus a marker that works.' },

  { category: 'paperwork', label: 'Scoresheets printed', detail: 'Round robin plus knockout, two spares per court.' },
  { category: 'paperwork', label: 'Pens', detail: 'They always vanish. Buy more than you need.' },
  { category: 'paperwork', label: 'Draw sheets on the wall', detail: 'Round robin grid and the semis bracket.' },
  { category: 'paperwork', label: 'Rules poster displayed', detail: 'First to 15 no deuce, top 4 to the semis.' },
  { category: 'paperwork', label: 'Duty roster printed', detail: 'Umpire, scorer and line judge per match.' },
  { category: 'paperwork', label: 'Player check-in list', detail: 'One line per registered player.', derivedQuantity: 'players' },

  { category: 'venue', label: 'First-aid kit', detail: 'Stocked, in date, and by the scorers table.' },
  { category: 'venue', label: 'Ice packs', detail: 'Rolled ankles happen.' },
  { category: 'venue', label: 'Venue keys and access', detail: 'Who opens up, who locks up.' },
  { category: 'venue', label: 'Speaker and Christmas playlist', detail: 'Festive, but not deafening.' },
  { category: 'venue', label: 'Camera / phone tripod', detail: 'For the podium photos and the gallery.' },
  { category: 'venue', label: 'Bin bags and clean-up kit', detail: 'Leave the hall better than we found it.' },

  { category: 'food', label: 'Water and cups', detail: 'Two bottles per player is the safe number.', derivedQuantity: 'players' },
  { category: 'food', label: 'Snacks and mince pies', detail: 'Half-time sugar.' },
  { category: 'food', label: 'Eggnog for the presentation', detail: 'Non-alcoholic option too.' },
]

/** Positions are spaced so a job can be slotted between two later on. */
export function seedPosition(index: number): number {
  return (index + 1) * 10
}

const SEED_BY_LABEL = new Map(
  DEFAULT_CHECKLIST_SEEDS.map((seed) => [seed.label.toLowerCase(), seed]),
)

/**
 * The catalogue copy for a stored job, matched on label.
 *
 * A committee-added job simply has no catalogue entry and shows no detail or
 * derived quantity — which is correct: only the standard jobs have a number
 * the app can work out for them.
 */
export function jobMeta(label: string): { detail: string; derivedQuantity: DerivedQuantityKey | null } {
  const seed = SEED_BY_LABEL.get(label.trim().toLowerCase())
  return { detail: seed?.detail ?? '', derivedQuantity: seed?.derivedQuantity ?? null }
}

export function defaultChecklistItems(): ChecklistItem[] {
  return DEFAULT_CHECKLIST_SEEDS.map((seed, index) => ({
    id: `seed-${index + 1}`,
    category: seed.category,
    label: seed.label,
    detail: seed.detail,
    owner: '',
    dueDate: '',
    notes: '',
    done: false,
    derivedQuantity: seed.derivedQuantity ?? null,
    position: seedPosition(index),
  }))
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

/** `committee_checklist` row → the shape the UI works in. */
export function checklistItemFromRow(row: CommitteeChecklistRow): ChecklistItem {
  const meta = jobMeta(row.label)
  return {
    id: row.id,
    category: isChecklistCategory(row.category) ? row.category : 'venue',
    label: row.label,
    detail: meta.detail,
    owner: row.owner ?? '',
    dueDate: row.due_on ?? '',
    notes: row.notes ?? '',
    done: row.is_done,
    derivedQuantity: meta.derivedQuantity,
    position: row.position,
  }
}

export function checklistItemsFromRows(rows: readonly CommitteeChecklistRow[]): ChecklistItem[] {
  return sortChecklist(rows.map(checklistItemFromRow))
}

/** The insert payload for one standard job. */
export interface ChecklistInsert {
  tournament_id: string
  category: string
  label: string
  position: number
}

/** The 29 standard jobs, ready to insert for a tournament. */
export function checklistSeedRows(tournamentId: string): ChecklistInsert[] {
  return DEFAULT_CHECKLIST_SEEDS.map((seed, index) => ({
    tournament_id: tournamentId,
    category: seed.category,
    label: seed.label,
    position: seedPosition(index),
  }))
}

/**
 * Column patch for an edit. `is_done` is written on its own and `done_at` /
 * `done_by` are deliberately absent — the `sync_committee_checklist_done`
 * trigger owns those.
 */
export function checklistUpdatePatch(patch: Partial<Omit<ChecklistItem, 'id' | 'detail' | 'derivedQuantity'>>): {
  category?: string
  label?: string
  owner?: string | null
  notes?: string | null
  due_on?: string | null
  is_done?: boolean
  position?: number
} {
  const out: Record<string, unknown> = {}
  if (patch.category !== undefined) out.category = patch.category
  if (patch.label !== undefined) out.label = patch.label.trim()
  if (patch.owner !== undefined) out.owner = patch.owner.trim() === '' ? null : patch.owner.trim()
  if (patch.notes !== undefined) out.notes = patch.notes.trim() === '' ? null : patch.notes.trim()
  if (patch.dueDate !== undefined) out.due_on = patch.dueDate === '' ? null : patch.dueDate
  if (patch.done !== undefined) out.is_done = patch.done
  if (patch.position !== undefined) out.position = patch.position
  return out
}

/**
 * Rows that duplicate an earlier `(category, label)` pair.
 *
 * Seeding only runs against an empty board, but two admins pressing the
 * button in the same instant could still both see "empty". There is no unique
 * index to lean on, so this makes the outcome self-healing: keep the oldest
 * row for each job, hand back the rest to delete.
 */
export function duplicateChecklistRowIds(rows: readonly CommitteeChecklistRow[]): string[] {
  const keep = new Map<string, CommitteeChecklistRow>()
  const drop: string[] = []
  const ordered = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
  for (const row of ordered) {
    const key = `${row.category}::${row.label.trim().toLowerCase()}`
    const existing = keep.get(key)
    if (!existing) {
      keep.set(key, row)
      continue
    }
    // Never discard work: a ticked or annotated duplicate wins over a bare one.
    const informative = row.is_done || row.owner || row.notes || row.due_on
    const existingInformative = existing.is_done || existing.owner || existing.notes || existing.due_on
    if (informative && !existingInformative) {
      drop.push(existing.id)
      keep.set(key, row)
    } else {
      drop.push(row.id)
    }
  }
  return drop
}

// ---------------------------------------------------------------------------
// Derived quantities
// ---------------------------------------------------------------------------

export interface DerivedQuantities {
  /** Players who are actually playing (approved or waitlisted). */
  playerCount: number
  /** Approved players only — the number the loot bag order is placed for. */
  approvedPlayers: number
  lootBags: number
  teamCount: number
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

/** The quantity cell for an item, or `''` when nothing is derived for it. */
export function itemQuantity(item: ChecklistItem, derived: DerivedQuantities): string {
  if (item.derivedQuantity) return quantityText(item.derivedQuantity, derived)
  return ''
}

/** True when the derived quantity has nothing behind it yet. */
export function quantityIsPending(item: ChecklistItem, derived: DerivedQuantities): boolean {
  if (!item.derivedQuantity) return false
  switch (item.derivedQuantity) {
    case 'lootBags':
    case 'players':
      return derived.playerCount === 0
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
    if (a.position !== b.position) return a.position - b.position
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

/** Appends a committee-added job at the end of the board. */
export function addItem(
  items: readonly ChecklistItem[],
  input: { category: ChecklistCategory; label: string; owner?: string; dueDate?: string },
): ChecklistItem[] {
  const item: ChecklistItem = {
    id: nextChecklistId(items),
    category: input.category,
    label: input.label.trim(),
    detail: '',
    owner: input.owner?.trim() ?? '',
    dueDate: input.dueDate ?? '',
    notes: '',
    done: false,
    derivedQuantity: null,
    position: nextPosition(items),
  }
  return [...items, item]
}

/** Collision-free local id, used for optimistic rows and in demo mode. */
export function nextChecklistId(items: readonly ChecklistItem[]): string {
  const used = new Set(items.map((item) => item.id))
  let n = items.length + 1
  while (used.has(`item-${n}`)) n += 1
  return `item-${n}`
}

/** The next free `position`, leaving room to slot jobs in later. */
export function nextPosition(items: readonly ChecklistItem[]): number {
  return items.reduce((max, item) => Math.max(max, item.position), 0) + 10
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
          CATEGORY_LABELS[item.category],
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

export type ChecklistAuditAction =
  | 'checklist.toggle'
  | 'checklist.update'
  | 'checklist.add'
  | 'checklist.delete'

/** One audit row per job, matching the row-per-job storage. */
export function checklistAuditEntry(
  action: ChecklistAuditAction,
  item: Pick<ChecklistItem, 'id' | 'label' | 'category' | 'done'>,
): ChecklistAuditEntry {
  return {
    action,
    entity_type: 'committee_checklist',
    entity_id: item.id,
    metadata: {
      label: item.label,
      category: item.category,
      done: item.done,
    },
  }
}

export function checklistSeedAuditEntry(count: number, tournamentId: string): ChecklistAuditEntry {
  return {
    action: 'checklist.seed',
    entity_type: 'committee_checklist',
    entity_id: tournamentId,
    metadata: { items: count },
  }
}
