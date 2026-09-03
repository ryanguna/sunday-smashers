/**
 * Awards & MVP logic for the Sunday Smashers Christmas Mini Tournament.
 *
 * CLIENT-SAFE: this module must never import `@/lib/supabase/server` (which
 * pulls in `next/headers`) or anything that does. Server-side fetching lives
 * in `src/app/awards/data.ts` and `src/app/admin/awards/data.ts`; mutations
 * live in `src/app/admin/awards/actions.ts`.
 *
 * Two concepts to keep apart:
 *
 *  - **Placing awards** are *derived*. `finalPlacings()` in `@/lib/draw`
 *    already resolves 1st/2nd/3rd/4th from the Championship and Battle for
 *    3rd, so an admin should only ever confirm them, never type them in.
 *  - **Discretionary awards** (MVP, Most Improved, Best Christmas Outfit…)
 *    are chosen by the committee and cannot be derived from scores.
 *
 * The award *catalogue* is deliberately open: `DEFAULT_AWARD_DEFINITIONS` is
 * a starting point, and `mergeAwardDefinitions()` lets an admin-configured
 * list add or override entries at runtime.
 *
 * SCHEMA: `public.award_type` is a closed Postgres enum, so the catalogue key
 * lives in its own `awards.award_key` column (migration 0005) while
 * `award_type` keeps the coarse enum value. `citation` is user-visible prose
 * and carries nothing else. `(division_id, award_key)` is unique — a division
 * hands out a given award exactly once.
 */

import type { FinalPlacings, TeamId } from './draw'
import { formatTournamentDayMonth } from './tournament'
import type { AwardType } from './supabase/types'

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export type AwardCategory = 'placing' | 'special'

/** Whether the gong goes to a pair or to a single named player. */
export type AwardScope = 'team' | 'player'

/** Icon hint — resolved to a real component in the UI layer. */
export type AwardIconKey = 'trophy' | 'medal' | 'sparkle' | 'gift' | 'holly' | 'bauble' | 'racket'

export interface AwardDefinition {
  /** Stable machine key, e.g. `champion` or `mvp`. */
  key: string
  label: string
  /** One-liner shown under the award name. */
  blurb: string
  category: AwardCategory
  scope: AwardScope
  /** The Postgres enum value this award is stored as. */
  dbType: AwardType
  /** 1–4 for placing awards, `null` for discretionary ones. */
  placing: 1 | 2 | 3 | 4 | null
  icon: AwardIconKey
  /** Lower sorts first. */
  sortOrder: number
}

export const DEFAULT_AWARD_DEFINITIONS: AwardDefinition[] = [
  {
    key: 'champion',
    label: 'Champions',
    blurb: 'Won the Championship — first to 21, no deuce, no mercy.',
    category: 'placing',
    scope: 'team',
    dbType: 'champion',
    placing: 1,
    icon: 'trophy',
    sortOrder: 10,
  },
  {
    key: 'runner_up',
    label: 'Runners-up',
    blurb: 'Went the distance in the Championship.',
    category: 'placing',
    scope: 'team',
    dbType: 'runner_up',
    placing: 2,
    icon: 'medal',
    sortOrder: 20,
  },
  {
    key: 'third_place',
    label: '3rd place',
    blurb: 'Won the Battle for 3rd.',
    category: 'placing',
    scope: 'team',
    dbType: 'third_place',
    placing: 3,
    icon: 'medal',
    sortOrder: 30,
  },
  {
    key: 'fourth_place',
    label: '4th place',
    blurb: 'Made the semis — a top-four finish.',
    category: 'placing',
    scope: 'team',
    dbType: 'fourth_place',
    placing: 4,
    icon: 'medal',
    sortOrder: 40,
  },
  {
    key: 'mvp',
    label: 'MVP',
    blurb: 'The player who lit up the hall.',
    category: 'special',
    scope: 'player',
    dbType: 'special_mention',
    placing: null,
    icon: 'sparkle',
    sortOrder: 50,
  },
  {
    key: 'most_improved',
    label: 'Most Improved',
    blurb: 'Biggest glow-up since last season.',
    category: 'special',
    scope: 'player',
    dbType: 'special_mention',
    placing: null,
    icon: 'racket',
    sortOrder: 60,
  },
  {
    key: 'sportsmanship',
    label: 'Best Sportsmanship',
    blurb: 'Called their own faults and clapped the winners.',
    category: 'special',
    scope: 'team',
    dbType: 'sportsmanship',
    placing: null,
    icon: 'holly',
    sortOrder: 70,
  },
  {
    key: 'best_outfit',
    label: 'Best Christmas Outfit',
    blurb: 'Tinsel, antlers and questionable knitwear.',
    category: 'special',
    scope: 'player',
    dbType: 'special_mention',
    placing: null,
    icon: 'bauble',
    sortOrder: 80,
  },
]

/**
 * Merges admin-configured award definitions over the defaults. Entries with
 * a matching `key` override the default; new keys are appended. Anything the
 * admin adds is a `special_mention` unless it explicitly says otherwise.
 */
export function mergeAwardDefinitions(
  custom: readonly Partial<AwardDefinition>[] = [],
  base: readonly AwardDefinition[] = DEFAULT_AWARD_DEFINITIONS,
): AwardDefinition[] {
  const byKey = new Map<string, AwardDefinition>(base.map((def) => [def.key, { ...def }]))
  let nextOrder = base.reduce((max, def) => Math.max(max, def.sortOrder), 0)

  for (const entry of custom) {
    if (!entry.key) continue
    const existing = byKey.get(entry.key)
    if (existing) {
      byKey.set(entry.key, { ...existing, ...entry, key: entry.key })
      continue
    }
    nextOrder += 10
    byKey.set(entry.key, {
      key: entry.key,
      label: entry.label ?? titleiseKey(entry.key),
      blurb: entry.blurb ?? 'A special Sunday Smashers gong.',
      category: entry.category ?? 'special',
      scope: entry.scope ?? 'player',
      dbType: entry.dbType ?? 'special_mention',
      placing: entry.placing ?? null,
      icon: entry.icon ?? 'sparkle',
      sortOrder: entry.sortOrder ?? nextOrder,
    })
  }

  return [...byKey.values()].sort(compareDefinitions)
}

function compareDefinitions(a: AwardDefinition, b: AwardDefinition): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
  return a.key.localeCompare(b.key)
}

function titleiseKey(key: string): string {
  return key
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

export function awardDefinitionByKey(
  key: string,
  definitions: readonly AwardDefinition[] = DEFAULT_AWARD_DEFINITIONS,
): AwardDefinition | null {
  return definitions.find((def) => def.key === key) ?? null
}

/** The placing awards, in podium order. */
export function placingDefinitions(
  definitions: readonly AwardDefinition[] = DEFAULT_AWARD_DEFINITIONS,
): AwardDefinition[] {
  return definitions
    .filter((def) => def.category === 'placing' && def.placing != null)
    .sort((a, b) => (a.placing ?? 9) - (b.placing ?? 9))
}

export function specialDefinitions(
  definitions: readonly AwardDefinition[] = DEFAULT_AWARD_DEFINITIONS,
): AwardDefinition[] {
  return definitions.filter((def) => def.category === 'special').sort(compareDefinitions)
}

// ---------------------------------------------------------------------------
// Award keys
// ---------------------------------------------------------------------------

/** Matches the `award_key_format` check constraint from migration 0005. */
const AWARD_KEY_FORMAT = /^[a-z0-9_-]{1,48}$/

export function isValidAwardKey(key: string): boolean {
  return AWARD_KEY_FORMAT.test(key)
}

/**
 * The `citation` column carries user-visible prose and nothing else — the
 * award's identity lives in `awards.award_key` (migration 0005). This just
 * normalises whitespace and maps "nothing typed" onto SQL `NULL`.
 *
 * Square brackets, quotes and any other punctuation an organiser fancies
 * survive untouched; there is no marker syntax left to collide with.
 */
export function citationForStorage(text: string): string | null {
  const trimmed = text.trim()
  return trimmed === '' ? null : trimmed
}

/** The inverse: a missing citation reads as an empty string in the UI. */
export function citationFromRow(citation: string | null): string {
  return citation?.trim() ?? ''
}

/** Award keys already used in a division. */
export function usedAwardKeys(records: readonly AwardRecord[]): Set<string> {
  return new Set(records.map((record) => record.key))
}

/**
 * The catalogue entries a division can still hand out.
 *
 * `idx_awards_division_key` makes `(division_id, award_key)` unique, so the
 * UI offers each award once rather than letting Postgres reject the second
 * one with a raw constraint error.
 */
export function availableDefinitions(
  records: readonly AwardRecord[],
  definitions: readonly AwardDefinition[] = DEFAULT_AWARD_DEFINITIONS,
): AwardDefinition[] {
  const used = usedAwardKeys(records)
  return definitions.filter((definition) => !used.has(definition.key))
}

/** Keys handed out more than once in one division — never valid to save. */
export function duplicateAwardKeys(records: readonly AwardRecord[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const record of records) {
    if (seen.has(record.key)) duplicates.add(record.key)
    seen.add(record.key)
  }
  return [...duplicates].sort()
}

/**
 * True when saving `key` into `divisionSlug` would collide with a row that
 * already exists (ignoring the row being edited).
 */
export function wouldCollide(
  records: readonly AwardRecord[],
  key: string,
  selfId: string | null,
): boolean {
  return records.some((record) => record.key === key && record.id !== selfId)
}

/** Plain-English version of the `(division_id, award_key)` unique violation. */
export function awardCollisionMessage(
  key: string,
  definitions: readonly AwardDefinition[] = DEFAULT_AWARD_DEFINITIONS,
): string {
  const label = awardDefinitionByKey(key, definitions)?.label ?? key
  return `${label} has already been awarded in this division — edit the existing one instead of adding a second.`
}

/** Postgres unique-violation code, so a collision reads as English not SQL. */
export function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '23505' || /duplicate key value/i.test(error.message ?? '')
}

// ---------------------------------------------------------------------------
// Award records
// ---------------------------------------------------------------------------

export interface AwardRecipient {
  teamId: TeamId | null
  teamName: string | null
  /** Player names to print on the certificate / podium card. */
  playerNames: string[]
  /** Set for `scope: 'player'` awards. */
  playerId: string | null
  playerName: string | null
}

export const EMPTY_RECIPIENT: AwardRecipient = {
  teamId: null,
  teamName: null,
  playerNames: [],
  playerId: null,
  playerName: null,
}

export interface AwardRecord {
  /** Row id, or `null` for a suggestion that has never been saved. */
  id: string | null
  divisionSlug: string
  divisionName: string
  /** Catalogue key (`champion`, `mvp`, …). */
  key: string
  dbType: AwardType
  recipient: AwardRecipient
  citation: string
  isPublished: boolean
  /** True when this row was derived from `finalPlacings`, not typed in. */
  derived: boolean
  createdAt: string | null
}

export function recipientLabel(recipient: AwardRecipient): string {
  if (recipient.playerName) return recipient.playerName
  if (recipient.teamName) return recipient.teamName
  return 'To be decided'
}

export function recipientSubtitle(recipient: AwardRecipient): string {
  if (recipient.playerName && recipient.teamName) return recipient.teamName
  return recipient.playerNames.join(' & ')
}

export function hasRecipient(record: AwardRecord): boolean {
  return record.recipient.teamId != null || record.recipient.playerId != null || record.recipient.playerName != null
}

/**
 * Sorts awards for display: placings first (1st → 4th), then discretionary
 * awards in catalogue order, then anything unknown alphabetically.
 */
export function compareAwards(
  a: AwardRecord,
  b: AwardRecord,
  definitions: readonly AwardDefinition[] = DEFAULT_AWARD_DEFINITIONS,
): number {
  const defA = awardDefinitionByKey(a.key, definitions)
  const defB = awardDefinitionByKey(b.key, definitions)
  const orderA = defA?.sortOrder ?? 9_000
  const orderB = defB?.sortOrder ?? 9_000
  if (orderA !== orderB) return orderA - orderB
  return a.key.localeCompare(b.key)
}

export function sortAwards(
  records: readonly AwardRecord[],
  definitions: readonly AwardDefinition[] = DEFAULT_AWARD_DEFINITIONS,
): AwardRecord[] {
  return [...records].sort((a, b) => compareAwards(a, b, definitions))
}

/** Only the awards the public may see. */
export function publishedAwards(records: readonly AwardRecord[]): AwardRecord[] {
  return records.filter((record) => record.isPublished && hasRecipient(record))
}

/** Awards saved but still hidden from the public. */
export function unpublishedAwards(records: readonly AwardRecord[]): AwardRecord[] {
  return records.filter((record) => !record.isPublished && record.id != null)
}

// ---------------------------------------------------------------------------
// Deriving placing awards
// ---------------------------------------------------------------------------

export interface PlacingTeam {
  id: TeamId
  name: string
  playerNames: string[]
}

export interface DerivePlacingInput {
  divisionSlug: string
  divisionName: string
  placings: FinalPlacings
  /** Team lookup so we can print names, not ids. */
  teams: readonly PlacingTeam[]
}

/**
 * Turns `finalPlacings()` into ready-to-confirm award records. Slots with no
 * resolved team are skipped entirely — a half-played bracket produces no
 * champion, and inventing a placeholder award would be worse than nothing.
 */
export function derivePlacingAwards(
  input: DerivePlacingInput,
  definitions: readonly AwardDefinition[] = DEFAULT_AWARD_DEFINITIONS,
): AwardRecord[] {
  const byId = new Map(input.teams.map((team) => [team.id, team]))
  const slots: { placing: 1 | 2 | 3 | 4; teamId: TeamId | null }[] = [
    { placing: 1, teamId: input.placings.champion },
    { placing: 2, teamId: input.placings.runnerUp },
    { placing: 3, teamId: input.placings.third },
    { placing: 4, teamId: input.placings.fourth },
  ]

  const records: AwardRecord[] = []
  for (const slot of slots) {
    if (!slot.teamId) continue
    const def = placingDefinitions(definitions).find((d) => d.placing === slot.placing)
    if (!def) continue
    const team = byId.get(slot.teamId) ?? null
    records.push({
      id: null,
      divisionSlug: input.divisionSlug,
      divisionName: input.divisionName,
      key: def.key,
      dbType: def.dbType,
      recipient: {
        teamId: slot.teamId,
        teamName: team?.name ?? slot.teamId,
        playerNames: team?.playerNames ?? [],
        playerId: null,
        playerName: null,
      },
      citation: '',
      isPublished: false,
      derived: true,
      createdAt: null,
    })
  }
  return records
}

/**
 * Overlays saved awards on top of the derived suggestions so the admin sees
 * one row per award: a saved row wins, a derived-but-unsaved row is offered
 * for confirmation.
 */
export function mergeSuggestions(
  saved: readonly AwardRecord[],
  suggestions: readonly AwardRecord[],
  definitions: readonly AwardDefinition[] = DEFAULT_AWARD_DEFINITIONS,
): AwardRecord[] {
  const savedKeys = new Set(saved.map((record) => `${record.divisionSlug}::${record.key}`))
  const merged = [
    ...saved,
    ...suggestions.filter((s) => !savedKeys.has(`${s.divisionSlug}::${s.key}`)),
  ]
  return sortAwards(merged, definitions)
}

/** Derived placing awards that have not been saved yet. */
export function pendingConfirmations(records: readonly AwardRecord[]): AwardRecord[] {
  return records.filter((record) => record.derived && record.id === null)
}

// ---------------------------------------------------------------------------
// Podium
// ---------------------------------------------------------------------------

export type PodiumTone = 'gold' | 'silver' | 'bronze'

export interface PodiumSpot {
  placing: 1 | 2 | 3
  label: string
  tone: PodiumTone
  /** Relative plinth height, 0–1, used for the CSS block height. */
  height: number
  teamName: string | null
  playerNames: string[]
  citation: string
  /** Reveal order — 3rd, then 2nd, then 1st, like a real ceremony. */
  revealIndex: number
}

const PODIUM_META: Record<1 | 2 | 3, { label: string; tone: PodiumTone; height: number; revealIndex: number }> = {
  1: { label: 'Champions', tone: 'gold', height: 1, revealIndex: 2 },
  2: { label: 'Runners-up', tone: 'silver', height: 0.76, revealIndex: 1 },
  3: { label: '3rd place', tone: 'bronze', height: 0.58, revealIndex: 0 },
}

const PODIUM_KEYS: { placing: 1 | 2 | 3; key: string }[] = [
  { placing: 1, key: 'champion' },
  { placing: 2, key: 'runner_up' },
  { placing: 3, key: 'third_place' },
]

/**
 * Builds the podium from published award records.
 *
 * Empty only when no placing at all has been confirmed — the caller shows a
 * "still being decided" state for that. As soon as *any* placing exists the
 * full three blocks come back, with the unconfirmed ones left blank: the two
 * divisions will not finish together on the day, and a half-finished podium
 * that says "to be decided" is honest where showing nothing is not.
 */
export function buildPodium(records: readonly AwardRecord[]): PodiumSpot[] {
  const byKey = new Map(records.map((record) => [record.key, record]))
  if (!PODIUM_KEYS.some((entry) => byKey.has(entry.key))) return []

  const spots: PodiumSpot[] = []

  for (const entry of PODIUM_KEYS) {
    const record = byKey.get(entry.key)
    const meta = PODIUM_META[entry.placing]
    spots.push({
      placing: entry.placing,
      label: meta.label,
      tone: meta.tone,
      height: meta.height,
      revealIndex: meta.revealIndex,
      teamName: record?.recipient.teamName ?? null,
      playerNames: record?.recipient.playerNames ?? [],
      citation: record?.citation ?? '',
    })
  }

  // Visual order on wide screens: 2nd, 1st, 3rd (1st in the middle).
  return spots
}

/** Left-to-right layout order for a classic podium: silver, gold, bronze. */
export function podiumLayoutOrder(spots: readonly PodiumSpot[]): PodiumSpot[] {
  const order: Record<number, number> = { 2: 0, 1: 1, 3: 2 }
  return [...spots].sort((a, b) => (order[a.placing] ?? 9) - (order[b.placing] ?? 9))
}

/**
 * Reveal delays in seconds, pre-stringified with units.
 *
 * HYDRATION: React serialises inline-style numbers at a different precision
 * on the server than in the browser, which produces a mismatch warning on
 * exactly this kind of staggered animation. Always emit strings.
 */
export function revealDelay(index: number, step = 0.35, offset = 0.1): string {
  return `${(offset + index * step).toFixed(2)}s`
}

/** Pre-stringified opacity, for the same reason as `revealDelay`. */
export function revealOpacity(value: number): string {
  return Math.max(0, Math.min(1, value)).toFixed(2)
}

// ---------------------------------------------------------------------------
// Reveal gating
// ---------------------------------------------------------------------------

export type AwardsRevealState = 'countdown' | 'in_progress' | 'revealed'

export interface RevealStatus {
  state: AwardsRevealState
  heading: string
  blurb: string
  /** True when the page should fire confetti. */
  celebrate: boolean
}

/**
 * Decides what the public `/awards` page renders.
 *
 * `now` is passed in rather than read from `Date.now()` inside a component:
 * calling the clock during render trips React's purity lint and risks a
 * hydration mismatch.
 */
export function revealStatus(input: {
  now: Date
  tournamentDate: string
  tournamentDateLabel: string
  publishedCount: number
}): RevealStatus {
  if (input.publishedCount > 0) {
    return {
      state: 'revealed',
      heading: 'The champions are crowned',
      blurb: 'Medals handed out, trophies lifted, loot bags raided. Here is the roll of honour.',
      celebrate: true,
    }
  }

  const started = input.now.getTime() >= new Date(input.tournamentDate).getTime()
  if (started) {
    return {
      state: 'in_progress',
      heading: 'The ceremony is warming up',
      blurb: 'Shuttles are still flying. Winners appear here the moment the committee publishes them.',
      celebrate: false,
    }
  }

  return {
    state: 'countdown',
    heading: `To be crowned on ${formatTournamentDayMonth(input.tournamentDate)}`,
    blurb: `Trophies polished, medals counted, loot bags stuffed. The roll of honour fills in on ${input.tournamentDateLabel}.`,
    celebrate: false,
  }
}

// ---------------------------------------------------------------------------
// Publish gating
// ---------------------------------------------------------------------------

export interface PublishPlan {
  /** Award ids that will change state. */
  ids: string[]
  publish: boolean
  /** Human summary for the confirm dialog. */
  summary: string
  /** Reasons the admin should not press the button. */
  blockers: string[]
}

/**
 * Works out what "Publish all" / "Unpublish all" will do for one division.
 * Publishing an award with no recipient is blocked — an empty podium on the
 * public page is a worse outcome than a delayed one.
 */
export function planPublish(
  records: readonly AwardRecord[],
  publish: boolean,
): PublishPlan {
  const saved = records.filter((record) => record.id != null)
  const targets = saved.filter((record) => record.isPublished !== publish)
  const blockers: string[] = []

  if (publish) {
    const emptyOnes = targets.filter((record) => !hasRecipient(record))
    for (const record of emptyOnes) {
      blockers.push(`${record.key} has no recipient yet.`)
    }
    const unsaved = records.filter((record) => record.id === null)
    if (unsaved.length > 0 && targets.length === 0) {
      blockers.push('Confirm the derived placings first — nothing is saved yet.')
    }
  }

  // `(division_id, award_key)` is unique, so a duplicate can only be a
  // half-finished edit in the browser. Say so before Postgres has to.
  for (const key of duplicateAwardKeys(records)) {
    blockers.push(awardCollisionMessage(key))
  }

  const ids = targets
    .filter((record) => (publish ? hasRecipient(record) : true))
    .map((record) => record.id as string)

  const verb = publish ? 'Publish' : 'Hide'
  const summary =
    ids.length === 0
      ? publish
        ? 'Nothing new to publish.'
        : 'Nothing is published right now.'
      : `${verb} ${ids.length} award${ids.length === 1 ? '' : 's'}.`

  return { ids, publish, summary, blockers }
}

/** True when every placing award for a division has been saved. */
export function placingsConfirmed(
  records: readonly AwardRecord[],
  definitions: readonly AwardDefinition[] = DEFAULT_AWARD_DEFINITIONS,
): boolean {
  const placingKeys = placingDefinitions(definitions).map((def) => def.key)
  const saved = new Set(records.filter((r) => r.id != null).map((r) => r.key))
  return placingKeys.every((key) => saved.has(key))
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export interface AwardAuditEntry {
  action: string
  entity_type: string
  entity_id: string | null
  metadata: Record<string, string | number | boolean | null>
}

export function awardAuditEntry(
  action: 'award.create' | 'award.update' | 'award.delete' | 'award.publish' | 'award.unpublish',
  record: Pick<AwardRecord, 'id' | 'key' | 'divisionSlug' | 'recipient'>,
): AwardAuditEntry {
  return {
    action,
    entity_type: 'award',
    entity_id: record.id,
    metadata: {
      award_key: record.key,
      division: record.divisionSlug,
      recipient: recipientLabel(record.recipient),
      team_id: record.recipient.teamId,
      player_id: record.recipient.playerId,
    },
  }
}

/** Audit row for a bulk publish/unpublish. */
export function publishAuditEntry(
  plan: PublishPlan,
  divisionSlug: string,
): AwardAuditEntry {
  return {
    action: plan.publish ? 'award.publish' : 'award.unpublish',
    entity_type: 'award',
    entity_id: null,
    metadata: {
      division: divisionSlug,
      count: plan.ids.length,
      ids: plan.ids.join(','),
    },
  }
}

// ---------------------------------------------------------------------------
// Grouping for the UI
// ---------------------------------------------------------------------------

export interface AwardsDivisionView {
  divisionSlug: string
  divisionName: string
  podium: PodiumSpot[]
  /** Discretionary awards, already sorted. */
  specials: AwardRecord[]
  /** Every award for the division, sorted. */
  all: AwardRecord[]
  /** 4th place, shown as an honourable mention under the podium. */
  fourth: AwardRecord | null
}

export function buildDivisionViews(
  records: readonly AwardRecord[],
  divisions: readonly { slug: string; name: string }[],
  definitions: readonly AwardDefinition[] = DEFAULT_AWARD_DEFINITIONS,
): AwardsDivisionView[] {
  return divisions.map((division) => {
    const all = sortAwards(
      records.filter((record) => record.divisionSlug === division.slug),
      definitions,
    )
    const placingKeys = new Set(placingDefinitions(definitions).map((def) => def.key))
    return {
      divisionSlug: division.slug,
      divisionName: division.name,
      podium: buildPodium(all),
      specials: all.filter((record) => !placingKeys.has(record.key)),
      all,
      fourth: all.find((record) => record.key === 'fourth_place') ?? null,
    }
  })
}

/** True when at least one division has something worth celebrating. */
export function hasAnyWinners(views: readonly AwardsDivisionView[]): boolean {
  return views.some(divisionHasContent)
}

/** True when this particular division has anything to show yet. */
export function divisionHasContent(view: AwardsDivisionView): boolean {
  return view.all.length > 0
}

/**
 * How far through the ceremony one division is.
 *
 * `pending` and "the division does not exist" are emphatically different
 * things: the two divisions will not finish at the same time on the day, and
 * during that window a division that is still playing must still appear on
 * the page. Dropping it makes the page look broken to exactly the players
 * who are refreshing it hardest.
 */
export type DivisionAwardState = 'crowned' | 'partial' | 'pending'

export function divisionAwardState(view: AwardsDivisionView): DivisionAwardState {
  const crowned = view.podium.some((spot) => spot.placing === 1 && spot.teamName !== null)
  if (crowned) return 'crowned'
  return divisionHasContent(view) ? 'partial' : 'pending'
}

/** Honest one-liner for a division that is not finished yet. */
export function divisionStateBlurb(view: AwardsDivisionView): string {
  switch (divisionAwardState(view)) {
    case 'crowned':
      return 'Champions crowned, medals handed out.'
    case 'partial':
      return 'Partly decided — the rest of the podium is still being played out.'
    default:
      return 'Still being decided out on court. Check back once the final is done.'
  }
}

/** Divisions with nothing published yet, in page order. */
export function pendingDivisions(views: readonly AwardsDivisionView[]): AwardsDivisionView[] {
  return views.filter((view) => divisionAwardState(view) !== 'crowned')
}
