/**
 * Announcements domain logic + data access.
 *
 * Everything the announcements feature needs lives here:
 *   - the UI-facing `Announcement` shape (camelCase, decoupled from the raw
 *     `announcements` row in `src/lib/supabase/types.ts`),
 *   - the *pure* helpers the pages/components render with (pinned-first
 *     sorting, draft/published filtering, relative time formatting, markdown
 *     excerpting) — all unit tested in `./announcements.test.ts`,
 *   - festive demo fixtures + the async fetchers that fall back to them
 *     whenever `isSupabaseConfigured()` is false or a query fails.
 *
 * The async fetchers take an *injected* Supabase client, so this module never
 * imports `@/lib/supabase/server` (which pulls in `next/headers`) and stays
 * importable from Client Components and vitest's plain node environment.
 */

import { isSupabaseConfigured } from '@/lib/supabase/config'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AnnouncementRow, Database } from '@/lib/supabase/types'

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface Announcement {
  id: string
  tournamentId: string
  title: string
  /** Markdown body — render with `@/components/Markdown`. */
  body: string
  isPublished: boolean
  isPinned: boolean
  createdAt: string
  updatedAt: string
}

/** Draft vs published filter used by the admin composer. */
export type AnnouncementStatusFilter = 'all' | 'published' | 'draft'

export interface AnnouncementFilter {
  status?: AnnouncementStatusFilter
  /** Case-insensitive substring match against title + body. */
  query?: string
}

/** Translates a raw `announcements` row into the UI shape. */
export function toAnnouncement(row: AnnouncementRow): Announcement {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    title: row.title,
    body: row.body,
    isPublished: row.is_published,
    isPinned: row.is_pinned,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ---------------------------------------------------------------------------
// Sorting & filtering (pure)
// ---------------------------------------------------------------------------

function createdAtMs(a: Announcement): number {
  const ms = Date.parse(a.createdAt)
  return Number.isNaN(ms) ? 0 : ms
}

/**
 * Pinned notices float to the top, then newest first. Stable and
 * non-mutating — always returns a new array.
 */
export function sortAnnouncements(list: readonly Announcement[]): Announcement[] {
  return [...list].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
    return createdAtMs(b) - createdAtMs(a)
  })
}

/** Published-only, pinned first — what the public feed shows. */
export function selectPublished(list: readonly Announcement[]): Announcement[] {
  return sortAnnouncements(list.filter((a) => a.isPublished))
}

/** Drafts only, pinned first — admin-only view. */
export function selectDrafts(list: readonly Announcement[]): Announcement[] {
  return sortAnnouncements(list.filter((a) => !a.isPublished))
}

/** Admin list filter: draft/published + free-text search, always sorted. */
export function filterAnnouncements(
  list: readonly Announcement[],
  filter: AnnouncementFilter = {},
): Announcement[] {
  const { status = 'all', query = '' } = filter
  const needle = query.trim().toLowerCase()

  const matched = list.filter((a) => {
    if (status === 'published' && !a.isPublished) return false
    if (status === 'draft' && a.isPublished) return false
    if (needle === '') return true
    return `${a.title}\n${a.body}`.toLowerCase().includes(needle)
  })

  return sortAnnouncements(matched)
}

/** The first `count` published notices, pinned first — for the landing strip / TV panel. */
export function latestAnnouncements(list: readonly Announcement[], count = 3): Announcement[] {
  return selectPublished(list).slice(0, Math.max(0, count))
}

/** How many published notices are pinned — used for the feed's festive subheading. */
export function countPinned(list: readonly Announcement[]): number {
  return list.filter((a) => a.isPinned && a.isPublished).length
}

// ---------------------------------------------------------------------------
// Time formatting (pure)
// ---------------------------------------------------------------------------

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

/**
 * Friendly relative timestamp ("just now", "5 min ago", "3 days ago",
 * "in 2 hours" for scheduled/clock-skewed rows). Falls back to an absolute
 * date once something is more than ~4 weeks away in either direction.
 *
 * Deterministic for a given (`iso`, `now`) pair so callers can render it on
 * the server without risking a hydration mismatch.
 */
export function formatRelativeTime(iso: string, now: Date | number = Date.now()): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''
  const nowMs = typeof now === 'number' ? now : now.getTime()
  const diff = nowMs - then
  const abs = Math.abs(diff)
  const future = diff < 0

  if (abs < 45 * 1000) return 'just now'
  if (abs >= 4 * WEEK) return formatAnnouncementDate(iso)

  const [value, unit] =
    abs < HOUR
      ? [Math.round(abs / MINUTE), 'min']
      : abs < DAY
        ? [Math.round(abs / HOUR), 'hour']
        : abs < WEEK
          ? [Math.round(abs / DAY), 'day']
          : [Math.round(abs / WEEK), 'week']

  const plural = unit === 'min' ? 'min' : value === 1 ? unit : `${unit}s`
  return future ? `in ${value} ${plural}` : `${value} ${plural} ago`
}

/** Absolute, timezone-stable date, e.g. "13 Dec 2026". */
export function formatAnnouncementDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Australia/Sydney',
  }).format(date)
}

/** Absolute date + time, e.g. "13 Dec 2026, 9:05 am" — used in `title=` tooltips. */
export function formatAnnouncementDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Australia/Sydney',
  }).format(date)
}

// ---------------------------------------------------------------------------
// Markdown helpers (pure)
// ---------------------------------------------------------------------------

/**
 * Flattens the small Markdown subset `@/components/Markdown` understands
 * (`#`/`##` headings, `-` bullets, `**bold**`) into a single plain-text
 * line, for excerpts, meta descriptions and the TV ticker.
 */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) =>
      line
        .trim()
        .replace(/^#{1,6}\s*/, '')
        .replace(/^[-*+]\s+/, '')
        .replace(/^>\s?/, ''),
    )
    .join(' ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * A one-glance excerpt of a markdown body, truncated on a word boundary and
 * suffixed with an ellipsis when shortened.
 */
export function excerpt(markdown: string, maxChars = 160): string {
  const text = markdownToPlainText(markdown)
  if (maxChars <= 0) return ''
  if (text.length <= maxChars) return text

  const clipped = text.slice(0, maxChars)
  const lastSpace = clipped.lastIndexOf(' ')
  const base = lastSpace > maxChars * 0.5 ? clipped.slice(0, lastSpace) : clipped
  return `${base.replace(/[.,;:!?-]+$/, '')}…`
}

/** Rough read time in minutes (min 1), for the feed's playful meta line. */
export function readingTimeMinutes(markdown: string, wordsPerMinute = 200): number {
  const words = markdownToPlainText(markdown).split(' ').filter(Boolean).length
  if (words === 0) return 1
  return Math.max(1, Math.round(words / wordsPerMinute))
}

// ---------------------------------------------------------------------------
// Festive accents (pure)
// ---------------------------------------------------------------------------

export type AnnouncementAccent = 'pink' | 'lilac' | 'mint' | 'sky'

const ACCENTS: AnnouncementAccent[] = ['pink', 'lilac', 'mint', 'sky']

/**
 * Deterministic pastel accent for a notice, so a given announcement always
 * gets the same bauble colour on the server and the client (no hydration
 * mismatch, no `Math.random()`).
 */
export function accentForAnnouncement(id: string): AnnouncementAccent {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  }
  return ACCENTS[hash % ACCENTS.length]
}

/** Validation shared by the admin composer + tests. */
export function validateAnnouncementDraft(input: { title: string; body: string }): {
  title?: string
  body?: string
} {
  const errors: { title?: string; body?: string } = {}
  if (input.title.trim().length < 3) errors.title = 'Give your notice a title (3+ characters).'
  if (input.title.trim().length > 140) errors.title = 'Titles are capped at 140 characters.'
  if (input.body.trim().length < 3) errors.body = 'Write something for the team to read.'
  return errors
}

// ---------------------------------------------------------------------------
// Demo fixtures
// ---------------------------------------------------------------------------

export const DEMO_TOURNAMENT_ID = 'demo-tournament'

interface DemoSeed {
  id: string
  title: string
  body: string
  isPublished: boolean
  isPinned: boolean
  /** Minutes before `now` this notice was posted. */
  minutesAgo: number
}

const DEMO_SEEDS: DemoSeed[] = [
  {
    id: 'demo-ann-pinned-callroom',
    title: '📣 Call room opens 8:30am — please arrive early',
    body: [
      'Doors open at **8:15am** and the call room opens at **8:30am** sharp.',
      '',
      '- Check in with the desk before you warm up',
      '- Collect your loot bag at the same time',
      '- First shuttle in the air at **9:00am**',
      '',
      'Late arrivals forfeit their first game, so give yourself a buffer — Christmas traffic is real. 🎄',
    ].join('\n'),
    isPublished: true,
    isPinned: true,
    minutesAgo: 90,
  },
  {
    id: 'demo-ann-pinned-parking',
    title: '🅿️ Parking: use the north car park, not the loading dock',
    body: [
      'The loading dock is closed for the day. Free parking is available in the **north car park** off Holly Street, a two minute walk from the courts.',
      '',
      'Overflow parking is on the grass oval — please leave the fire lane clear.',
    ].join('\n'),
    isPublished: true,
    isPinned: true,
    minutesAgo: 260,
  },
  {
    id: 'demo-ann-draw-live',
    title: '🏸 The draw is live!',
    body: [
      'Pools for **Men\u2019s Doubles** and **Women\u2019s Doubles** are up on the schedule page. Have a squiz and find your first court.',
      '',
      'Remember: the pair playing next on your court umpires the current match. Check the duty roster so nobody gets caught out.',
    ].join('\n'),
    isPublished: true,
    isPinned: false,
    minutesAgo: 26 * 60,
  },
  {
    id: 'demo-ann-lootbags',
    title: '🎁 Loot bags and a very serious raffle',
    body: [
      'Everyone who plays gets a loot bag — shuttle, snacks and a candy cane the organisers swear they did not sample.',
      '',
      'The raffle is drawn between the semis and the final. Tickets are at the desk; all proceeds go to the club shuttle fund.',
    ].join('\n'),
    isPublished: true,
    isPinned: false,
    minutesAgo: 3 * 24 * 60,
  },
  {
    id: 'demo-ann-scoresheets',
    title: '📝 Scoresheets must be signed after every game',
    body: [
      'Both pairs sign the scoresheet at the end of **every** game, then the scoresheet person walks it to the Tabulator.',
      '',
      'No signature, no result — and a very sad tabulator.',
    ].join('\n'),
    isPublished: true,
    isPinned: false,
    minutesAgo: 9 * 24 * 60,
  },
  {
    id: 'demo-ann-draft-afterparty',
    title: '🥂 Draft: after-party details',
    body: [
      'Holding this until the venue confirms numbers.',
      '',
      'Provisionally: **6:00pm at the clubhouse**, pizza and carols, families welcome.',
    ].join('\n'),
    isPublished: false,
    isPinned: false,
    minutesAgo: 5 * 60,
  },
]

/**
 * Demo announcements, dated relative to `now` so relative timestamps read
 * naturally ("90 min ago") whenever the app runs without Supabase env vars.
 */
export function getDemoAnnouncements(now: Date | number = Date.now()): Announcement[] {
  const nowMs = typeof now === 'number' ? now : now.getTime()
  return DEMO_SEEDS.map((seed) => {
    const iso = new Date(nowMs - seed.minutesAgo * MINUTE).toISOString()
    return {
      id: seed.id,
      tournamentId: DEMO_TOURNAMENT_ID,
      title: seed.title,
      body: seed.body,
      isPublished: seed.isPublished,
      isPinned: seed.isPinned,
      createdAt: iso,
      updatedAt: iso,
    }
  })
}

// ---------------------------------------------------------------------------
// Data access (never throws; demo fixtures in demo mode only)
// ---------------------------------------------------------------------------

/**
 * The Supabase client is *injected* rather than imported here: this module is
 * also pulled into client bundles (the admin composer and the reusable
 * components use its pure helpers), and importing `@/lib/supabase/server`
 * — even dynamically — makes the bundler drag `next/headers` into the
 * browser build. Server Components create the client and hand it in; pass
 * `null` (or omit it) for demo mode.
 */
export type AnnouncementsClient = SupabaseClient<Database>

async function fetchRows(
  client: AnnouncementsClient | null | undefined,
  publishedOnly: boolean,
): Promise<Announcement[] | null> {
  if (!client || !isSupabaseConfigured()) return null
  try {
    let query = client.from('announcements').select('*')
    if (publishedOnly) query = query.eq('is_published', true)
    const { data, error } = await query.order('created_at', { ascending: false })
    // A real project with no notices yet — or a failed read — is an empty
    // board, never the demo seeds. See `@/lib/demo-mode` for the one rule.
    if (error) return []
    return ((data ?? []) as AnnouncementRow[]).map(toAnnouncement)
  } catch {
    return []
  }
}

/** Published notices for the public feed / landing strip / TV panel, pinned first. */
export async function getPublishedAnnouncements(
  client?: AnnouncementsClient | null,
  now: Date | number = Date.now(),
): Promise<Announcement[]> {
  const rows = await fetchRows(client, true)
  if (rows) return selectPublished(rows)
  return selectPublished(getDemoAnnouncements(now))
}

/**
 * Convenience wrapper for the public feed: resolves the notices *and* the
 * `now` reference used to render their relative timestamps.
 *
 * Reading the clock here (rather than in the page component) keeps Server
 * Components free of impure calls — see the `react-hooks/purity` lint rule.
 */
export async function getAnnouncementsFeed(client?: AnnouncementsClient | null): Promise<{
  now: number
  announcements: Announcement[]
}> {
  const now = Date.now()
  return { now, announcements: await getPublishedAnnouncements(client, now) }
}

/** Every notice (drafts included) for the admin composer. */
export async function getAllAnnouncements(
  client?: AnnouncementsClient | null,
  now: Date | number = Date.now(),
): Promise<Announcement[]> {
  const rows = await fetchRows(client, false)
  if (rows) return sortAnnouncements(rows)
  return sortAnnouncements(getDemoAnnouncements(now))
}

/**
 * The tournament new notices are posted against. Returns
 * `DEMO_TOURNAMENT_ID` in demo mode (nothing is persisted there anyway), and
 * `null` against a real project with no tournament row yet — the composer
 * refuses to post rather than inventing a tournament id.
 */
export async function getAnnouncementTournamentId(
  client?: AnnouncementsClient | null,
): Promise<string | null> {
  if (!client || !isSupabaseConfigured()) return DEMO_TOURNAMENT_ID
  try {
    const { data } = await client
      .from('tournaments')
      .select('id')
      .order('tournament_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    const row = data as { id: string } | null
    return row?.id ?? null
  } catch {
    return null
  }
}
