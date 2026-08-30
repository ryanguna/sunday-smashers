/**
 * Photo gallery domain logic + data access.
 *
 * Everything the `/gallery` and `/admin/gallery` surfaces need lives here:
 *   - the UI-facing `GalleryPhoto` shape (camelCase, decoupled from the raw
 *     `photos` row in `src/lib/supabase/types.ts`),
 *   - the *pure* helpers the components rely on — file validation, resize
 *     maths, MIME/extension handling, storage path + URL construction,
 *     moderation status transitions, filter predicates, alt-text derivation
 *     — all unit tested in `./gallery.test.ts`,
 *   - festive demo fixtures + async fetchers that fall back to them whenever
 *     `isSupabaseConfigured()` is false or a query fails.
 *
 * Like `@/lib/announcements`, the async fetchers take an *injected* Supabase
 * client so this module never imports `@/lib/supabase/server` (which pulls in
 * `next/headers`) and stays safe to import from Client Components and from
 * vitest's plain node environment.
 *
 * ### How moderation is stored
 *
 * `public.photos` carries real moderation columns (migration
 * `0003_photo_moderation.sql`): `moderation_status`, `is_featured`,
 * `moderated_at` and `rejection_reason`. A trigger keeps the legacy
 * `is_approved` boolean in sync in both directions and forces `is_featured`
 * to false whenever a photo is not approved, so:
 *   - **write `moderation_status`, never `is_approved`** — writing both in
 *     one statement is ambiguous. `moderationPatch()` enforces this.
 *   - `moderation_status` is the only source of truth the app reads
 *     (`photoStatus()`); `is_approved` is treated as a database-owned mirror
 *     that exists for the RLS policies and partial indexes.
 *   - the UI must not offer "feature" for anything that is not approved
 *     (`canFeature()`), rather than letting the database silently undo it.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabaseUrl } from '@/lib/supabase/config'
import type { Database, PhotoModerationStatus, PhotoRow } from '@/lib/supabase/types'

export type GallerySupabaseClient = SupabaseClient<Database>

/**
 * Re-exported so gallery code has one import for everything it needs. The
 * union itself is owned by `src/lib/supabase/types.ts`, where it mirrors the
 * `public.photo_moderation_status` enum.
 */
export type { PhotoModerationStatus }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Supabase Storage bucket the gallery writes to (public read). */
export const GALLERY_BUCKET = 'gallery'

/** MIME types a phone camera or gallery picker realistically produces. */
export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const

export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number]

/** `accept` attribute for the file input. */
export const FILE_INPUT_ACCEPT = `${ACCEPTED_IMAGE_TYPES.join(',')},.heic,.heif`

/** Hard limit on the *original* file picked from the phone (25 MB). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

/** Longest edge (px) we downscale to before uploading. */
export const MAX_IMAGE_EDGE = 1800

/** JPEG quality used by the client-side compressor. */
export const COMPRESSION_QUALITY = 0.82

/** How many files one drop / picker selection may contain. */
export const MAX_FILES_PER_UPLOAD = 12

/** Captions are a one-liner, not an essay. */
export const MAX_CAPTION_LENGTH = 180

/** Optional note an admin can leave when setting a photo aside. */
export const MAX_REJECTION_REASON_LENGTH = 300

/** Tournament id used when nothing is configured (demo mode only). */
export const DEMO_TOURNAMENT_ID = '00000000-0000-4000-8000-000000000001'

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export const MODERATION_STATUSES: readonly PhotoModerationStatus[] = [
  'pending',
  'approved',
  'rejected',
] as const

export interface GalleryPhoto {
  id: string
  /** Object path inside the `gallery` bucket. */
  storagePath: string
  /** Public URL, or `null` in demo mode (render generated festive art instead). */
  url: string | null
  /** Caption as shown to humans. */
  caption: string | null
  status: PhotoModerationStatus
  isFeatured: boolean
  /** Admin's note explaining a rejection, when they left one. */
  rejectionReason: string | null
  /** When the photo was last approved/rejected, `null` while pending. */
  moderatedAt: string | null
  matchId: string | null
  /** Division slug of the tagged match, when known. */
  division: string | null
  /** Human label of the tagged match, e.g. "Court 1 · Smash Sisters vs Tinsel Twins". */
  matchLabel: string | null
  createdAt: string
  uploadedBy: string | null
  /**
   * Deterministic seed (0-11) for the generated festive artwork used in demo
   * mode and as the loading placeholder. Derived from the id, never random.
   */
  artSeed: number
}

/** Minimal file description — lets the pure validators run without a DOM. */
export interface UploadCandidate {
  name: string
  type: string
  size: number
}

export interface ValidationResult {
  ok: boolean
  /** Festive, human-readable reason. Present only when `ok` is false. */
  message?: string
}

export interface GalleryFilters {
  /** Division slug, or `'all'`. */
  division: string
  /** Match id, or `'all'`. */
  matchId: string
  /** `YYYY-MM-DD` upload day, or `'all'`. */
  day: string
}

export const DEFAULT_GALLERY_FILTERS: GalleryFilters = {
  division: 'all',
  matchId: 'all',
  day: 'all',
}

/** Match metadata the gallery needs in order to label + filter a photo. */
export interface PhotoMatchInfo {
  id: string
  division: string
  label: string
}

// ---------------------------------------------------------------------------
// MIME types, extensions & file validation (pure)
// ---------------------------------------------------------------------------

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
}

/** Lower-cased extension of a filename, without the dot (`''` when absent). */
export function fileExtension(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return ''
  return base.slice(dot + 1).toLowerCase()
}

/**
 * Best-effort MIME type. Phones (notably older Androids and some HEIC
 * pickers) hand over an empty `type`, so fall back to the extension.
 */
export function normaliseMimeType(type: string, filename = ''): string {
  const declared = (type ?? '').trim().toLowerCase()
  if (declared && declared !== 'application/octet-stream') {
    return declared === 'image/jpg' ? 'image/jpeg' : declared
  }
  return MIME_BY_EXTENSION[fileExtension(filename)] ?? ''
}

export function isAcceptedImageType(mime: string): boolean {
  const normalised = mime === 'image/jpg' ? 'image/jpeg' : mime
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(normalised)
}

/** File extension we should store the (re-encoded) upload under. */
export function extensionForMimeType(mime: string): string {
  return EXTENSION_BY_MIME[mime === 'image/jpg' ? 'image/jpeg' : mime] ?? 'jpg'
}

/** `1.4 MB`, `812 KB`, `0 B` — used in upload rows and error copy. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Validates one picked file. Messages are festive but specific. */
export function validateUploadFile(file: UploadCandidate): ValidationResult {
  const mime = normaliseMimeType(file.type, file.name)
  if (!mime) {
    return {
      ok: false,
      message: `We can\u2019t tell what kind of file \u201c${file.name}\u201d is \u2014 try a JPEG, PNG or WebP photo. \u{1F384}`,
    }
  }
  if (!isAcceptedImageType(mime)) {
    return {
      ok: false,
      message: `\u201c${file.name}\u201d isn\u2019t a photo we can hang on the tree. Photos only, please \u2014 JPEG, PNG, WebP or HEIC. \u{1F4F8}`,
    }
  }
  if (file.size <= 0) {
    return { ok: false, message: `\u201c${file.name}\u201d looks empty \u2014 try picking it again.` }
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      message: `\u201c${file.name}\u201d is ${formatBytes(file.size)} \u2014 bigger than Santa\u2019s sack (max ${formatBytes(MAX_UPLOAD_BYTES)}).`,
    }
  }
  return { ok: true }
}

export interface BatchValidation {
  accepted: UploadCandidate[]
  rejected: { file: UploadCandidate; message: string }[]
}

/** Splits a picked batch into keepers and friendly rejections. */
export function validateUploadBatch(
  files: readonly UploadCandidate[],
  maxFiles = MAX_FILES_PER_UPLOAD
): BatchValidation {
  const accepted: UploadCandidate[] = []
  const rejected: { file: UploadCandidate; message: string }[] = []

  for (const file of files) {
    if (accepted.length >= maxFiles) {
      rejected.push({
        file,
        message: `Only ${maxFiles} photos per batch \u2014 pop \u201c${file.name}\u201d in the next one. \u{1F385}`,
      })
      continue
    }
    const result = validateUploadFile(file)
    if (result.ok) accepted.push(file)
    else rejected.push({ file, message: result.message ?? 'That file can\u2019t be uploaded.' })
  }

  return { accepted, rejected }
}

// ---------------------------------------------------------------------------
// Resize maths (pure)
// ---------------------------------------------------------------------------

export interface Dimensions {
  width: number
  height: number
}

/**
 * Scales `width`/`height` down so the longest edge is at most `maxEdge`,
 * preserving aspect ratio. Never upscales; always returns whole pixels ≥ 1.
 */
export function resizeDimensions(
  width: number,
  height: number,
  maxEdge = MAX_IMAGE_EDGE
): Dimensions {
  const safeWidth = Math.max(1, Math.round(width || 0))
  const safeHeight = Math.max(1, Math.round(height || 0))
  const longest = Math.max(safeWidth, safeHeight)
  if (longest <= maxEdge || maxEdge <= 0) return { width: safeWidth, height: safeHeight }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  }
}

// ---------------------------------------------------------------------------
// Storage paths & URLs (pure)
// ---------------------------------------------------------------------------

/** Filesystem/URL-safe slug of a filename stem, capped at 40 chars. */
export function slugifyFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  const slug = stem
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  return slug || 'photo'
}

/**
 * Object path inside the `gallery` bucket. The storage RLS policies and
 * `supabase/SCHEMA.md` document the convention `gallery/<photo-id>/...`, so
 * the photo row id is always the first path segment.
 */
export function galleryStoragePath(photoId: string, filename: string, mime = ''): string {
  const ext = extensionForMimeType(normaliseMimeType(mime, filename))
  return `${photoId}/${slugifyFilename(filename)}.${ext}`
}

/** Public URL for an object in the (public-read) `gallery` bucket. */
export function photoPublicUrl(baseUrl: string, storagePath: string): string | null {
  if (!baseUrl || !storagePath) return null
  const encoded = storagePath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `${baseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${GALLERY_BUCKET}/${encoded}`
}

/** REST endpoint used by the XHR uploader (so we get real progress events). */
export function storageUploadUrl(baseUrl: string, storagePath: string): string {
  const encoded = storagePath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `${baseUrl.replace(/\/+$/, '')}/storage/v1/object/${GALLERY_BUCKET}/${encoded}`
}

// ---------------------------------------------------------------------------
// Captions (pure)
// ---------------------------------------------------------------------------

/** Caption ready to show a human: whitespace collapsed, empty becomes `null`. */
export function displayCaption(caption: string | null | undefined): string | null {
  if (typeof caption !== 'string') return null
  const cleaned = caption.replace(/\s+/g, ' ').trim()
  return cleaned.length > 0 ? cleaned : null
}

/** Trims and caps a caption typed by a human. */
export function normaliseCaption(caption: string | null | undefined): string | null {
  const cleaned = (caption ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_CAPTION_LENGTH)
  return cleaned.length > 0 ? cleaned : null
}

/** Trims and caps an admin's rejection note. */
export function normaliseRejectionReason(reason: string | null | undefined): string | null {
  const cleaned = (reason ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_REJECTION_REASON_LENGTH)
  return cleaned.length > 0 ? cleaned : null
}

// ---------------------------------------------------------------------------
// Moderation (pure)
// ---------------------------------------------------------------------------

/**
 * Moderation status of a raw row.
 *
 * `moderation_status` is the single source of truth — the
 * `sync_photo_moderation` trigger derives `is_approved` from it, never the
 * other way round from the app's point of view. Every gallery query selects
 * `*`, so the column is always present.
 */
export function photoStatus(row: Pick<PhotoRow, 'moderation_status'>): PhotoModerationStatus {
  return row.moderation_status
}

/**
 * The columns a moderation action writes — derived from `PhotoRow` so it can
 * never drift from the table.
 */
export type ModerationPatch = Pick<
  PhotoRow,
  'moderation_status' | 'approved_by' | 'rejection_reason'
>

/**
 * The column patch that moves a photo into `status`.
 *
 * Deliberately never sets `is_approved` or `moderated_at`: the
 * `sync_photo_moderation` trigger derives both from `moderation_status`, and
 * writing them in the same statement would be ambiguous.
 */
export function moderationPatch(
  status: PhotoModerationStatus,
  adminId: string | null,
  reason: string | null = null
): ModerationPatch {
  switch (status) {
    case 'approved':
      return { moderation_status: 'approved', approved_by: adminId, rejection_reason: null }
    case 'rejected':
      return {
        moderation_status: 'rejected',
        approved_by: adminId,
        rejection_reason: normaliseRejectionReason(reason),
      }
    default:
      return { moderation_status: 'pending', approved_by: null, rejection_reason: null }
  }
}

/** Guards against no-op / nonsensical moderation clicks. */
export function canTransition(from: PhotoModerationStatus, to: PhotoModerationStatus): boolean {
  return from !== to && MODERATION_STATUSES.includes(to)
}

/**
 * Only an approved photo may be featured — the database enforces this, and
 * the UI disables the control rather than letting the write be silently
 * undone.
 */
export function canFeature(status: PhotoModerationStatus): boolean {
  return status === 'approved'
}

export function moderationLabel(status: PhotoModerationStatus): string {
  switch (status) {
    case 'approved':
      return 'On the tree'
    case 'rejected':
      return 'Not this one'
    default:
      return 'Awaiting elf review'
  }
}

export function moderationBadgeStatus(status: PhotoModerationStatus): 'approved' | 'pending' | 'forfeit' {
  if (status === 'approved') return 'approved'
  if (status === 'rejected') return 'forfeit'
  return 'pending'
}

// ---------------------------------------------------------------------------
// Alt text, art seeds & polaroid tilt (pure)
// ---------------------------------------------------------------------------

/**
 * Meaningful `alt` text: the caption when there is one, otherwise the match
 * it is tagged to, otherwise a generic-but-useful tournament description.
 */
export function altTextFor(
  photo: Pick<GalleryPhoto, 'caption' | 'matchLabel' | 'division'>
): string {
  const caption = displayCaption(photo.caption)
  if (caption) return caption
  if (photo.matchLabel) return `Tournament photo from ${photo.matchLabel}`
  if (photo.division) return `Tournament photo from the ${photo.division} division`
  return 'Sunday Smashers Christmas Mini Tournament photo'
}

/** Stable 32-bit-ish hash of a string. Same input → same number, always. */
export function hashString(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash)
}

/** Deterministic 0-11 artwork seed. */
export function artSeedFor(id: string): number {
  return hashString(id) % 12
}

/**
 * Deterministic polaroid tilt, already rounded and stringified with its unit.
 * Inline styles must be produced this way — React serialises float styles at
 * different precision on the server than in the browser, which shows up as a
 * hydration mismatch if you interpolate a raw number.
 */
export function polaroidTilt(id: string): string {
  const degrees = ((hashString(`tilt:${id}`) % 601) / 100 - 3) * 1
  return `rotate(${degrees.toFixed(2)}deg)`
}

// ---------------------------------------------------------------------------
// Days, sorting & filtering (pure)
// ---------------------------------------------------------------------------

/** `YYYY-MM-DD` day key for an ISO timestamp (UTC-stable, never throws). */
export function dayKeyOf(isoDate: string): string {
  const ms = Date.parse(isoDate)
  if (Number.isNaN(ms)) return 'unknown'
  return new Date(ms).toISOString().slice(0, 10)
}

/** `Sun 13 Dec 2026` — used for the day filter chips. */
export function dayLabel(dayKey: string): string {
  if (dayKey === 'unknown') return 'Undated'
  const ms = Date.parse(`${dayKey}T00:00:00Z`)
  if (Number.isNaN(ms)) return 'Undated'
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(ms))
}

/** Distinct upload days, newest first. */
export function uniqueDays(photos: readonly GalleryPhoto[]): string[] {
  const keys = new Set<string>()
  for (const photo of photos) keys.add(dayKeyOf(photo.createdAt))
  return [...keys].sort((a, b) => b.localeCompare(a))
}

/** Distinct division slugs present in the set, alphabetical. */
export function uniqueDivisions(photos: readonly GalleryPhoto[]): string[] {
  const keys = new Set<string>()
  for (const photo of photos) if (photo.division) keys.add(photo.division)
  return [...keys].sort((a, b) => a.localeCompare(b))
}

/**
 * Distinct tagged matches present in the set, in the order the photos appear.
 * The filter dropdown is built from this rather than the full schedule, so it
 * only ever offers matches that actually have photos.
 */
export function uniqueMatchOptions(photos: readonly GalleryPhoto[]): PhotoMatchInfo[] {
  const seen = new Map<string, PhotoMatchInfo>()
  for (const photo of photos) {
    if (!photo.matchId || seen.has(photo.matchId)) continue
    seen.set(photo.matchId, {
      id: photo.matchId,
      division: photo.division ?? '',
      label: photo.matchLabel ?? 'Tagged match',
    })
  }
  return [...seen.values()]
}

/** `mens_doubles` → `Mens Doubles`. Used when we have no division row to hand. */
export function prettifyDivision(slug: string): string {
  return slug
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function photoMatchesFilters(photo: GalleryPhoto, filters: GalleryFilters): boolean {
  if (filters.division !== 'all' && photo.division !== filters.division) return false
  if (filters.matchId !== 'all' && photo.matchId !== filters.matchId) return false
  if (filters.day !== 'all' && dayKeyOf(photo.createdAt) !== filters.day) return false
  return true
}

export function filterGalleryPhotos(
  photos: readonly GalleryPhoto[],
  filters: GalleryFilters
): GalleryPhoto[] {
  return photos.filter((photo) => photoMatchesFilters(photo, filters))
}

/** Newest first; ties broken by id so the order is stable across renders. */
export function sortGalleryPhotos(photos: readonly GalleryPhoto[]): GalleryPhoto[] {
  return [...photos].sort((a, b) => {
    const delta = (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)
    return delta !== 0 ? delta : a.id.localeCompare(b.id)
  })
}

/**
 * The highlights strip: approved + featured first, then the newest approved
 * photos to top it up. Never returns pending/rejected uploads.
 */
export function featuredPhotos(photos: readonly GalleryPhoto[], limit = 6): GalleryPhoto[] {
  const approved = sortGalleryPhotos(photos.filter((photo) => photo.status === 'approved'))
  const starred = approved.filter((photo) => photo.isFeatured)
  const rest = approved.filter((photo) => !photo.isFeatured)
  return [...starred, ...rest].slice(0, Math.max(0, limit))
}

export function countByStatus(
  photos: readonly GalleryPhoto[]
): Record<PhotoModerationStatus, number> {
  const counts: Record<PhotoModerationStatus, number> = { pending: 0, approved: 0, rejected: 0 }
  for (const photo of photos) counts[photo.status] += 1
  return counts
}

// ---------------------------------------------------------------------------
// Row → UI shape
// ---------------------------------------------------------------------------

export interface ToGalleryPhotoOptions {
  /** Match metadata keyed by match id, for division + label lookup. */
  matches?: Readonly<Record<string, PhotoMatchInfo>>
  /** Storage origin. Defaults to the configured Supabase URL. */
  baseUrl?: string
}

export function toGalleryPhoto(
  row: PhotoRow,
  options: ToGalleryPhotoOptions = {}
): GalleryPhoto {
  const base = options.baseUrl ?? supabaseUrl
  const match = row.match_id ? options.matches?.[row.match_id] : undefined
  const status = photoStatus(row)
  return {
    id: row.id,
    storagePath: row.storage_path,
    url: photoPublicUrl(base, row.storage_path),
    caption: displayCaption(row.caption),
    status,
    // The database forces this false unless approved; mirror that defensively
    // so a stale row can never surface an unapproved photo as a highlight.
    isFeatured: Boolean(row.is_featured) && status === 'approved',
    rejectionReason: status === 'rejected' ? displayCaption(row.rejection_reason) : null,
    moderatedAt: row.moderated_at ?? null,
    matchId: row.match_id,
    division: match?.division ?? null,
    matchLabel: match?.label ?? null,
    createdAt: row.created_at,
    uploadedBy: row.uploaded_by,
    artSeed: artSeedFor(row.id),
  }
}

// ---------------------------------------------------------------------------
// Demo fixtures
// ---------------------------------------------------------------------------

interface DemoSeed {
  id: string
  caption: string
  division: string | null
  matchLabel: string | null
  matchId: string | null
  featured: boolean
  minutesAgo: number
}

const DEMO_SEEDS: DemoSeed[] = [
  {
    id: 'demo-photo-01',
    caption: 'Tinsel Twins take the first set \u2014 the crowd went absolutely bauble.',
    division: 'womens_doubles',
    matchLabel: 'Court 1 \u00b7 Tinsel Twins vs Jingle Belles',
    matchId: 'demo-match-w1',
    featured: true,
    minutesAgo: 40,
  },
  {
    id: 'demo-photo-02',
    caption: 'Warm-ups, wearing far too much tinsel.',
    division: 'mens_doubles',
    matchLabel: 'Court 2 \u00b7 Smash Clauses vs Net Elves',
    matchId: 'demo-match-m1',
    featured: false,
    minutesAgo: 95,
  },
  {
    id: 'demo-photo-03',
    caption: 'That drop shot. Frozen mid-air, like the rest of us.',
    division: 'mens_doubles',
    matchLabel: 'Court 2 \u00b7 Smash Clauses vs Net Elves',
    matchId: 'demo-match-m1',
    featured: true,
    minutesAgo: 150,
  },
  {
    id: 'demo-photo-04',
    caption: 'Loot bag inspection \u2014 a very serious business.',
    division: null,
    matchLabel: null,
    matchId: null,
    featured: false,
    minutesAgo: 220,
  },
  {
    id: 'demo-photo-05',
    caption: 'Shuttle down! Umpire says it was in. Twice.',
    division: 'womens_doubles',
    matchLabel: 'Court 3 \u00b7 Snow Angels vs Mistletoe Mashers',
    matchId: 'demo-match-w2',
    featured: false,
    minutesAgo: 290,
  },
  {
    id: 'demo-photo-06',
    caption: 'Half-time gingerbread. Strategy fuel.',
    division: null,
    matchLabel: null,
    matchId: null,
    featured: false,
    minutesAgo: 1500,
  },
  {
    id: 'demo-photo-07',
    caption: 'Medal ceremony grins you could see from the car park.',
    division: 'mens_doubles',
    matchLabel: 'Court 1 \u00b7 Final',
    matchId: 'demo-match-m-final',
    featured: true,
    minutesAgo: 1580,
  },
  {
    id: 'demo-photo-08',
    caption: 'Team photo, everybody say \u201cshuttlecock\u201d!',
    division: null,
    matchLabel: null,
    matchId: null,
    featured: false,
    minutesAgo: 1700,
  },
  {
    id: 'demo-photo-09',
    caption: 'Someone brought a Santa hat for the net post. Legend.',
    division: 'womens_doubles',
    matchLabel: 'Court 3 \u00b7 Snow Angels vs Mistletoe Mashers',
    matchId: 'demo-match-w2',
    featured: false,
    minutesAgo: 2900,
  },
]

/**
 * Festive stand-in gallery for demo mode. There is no Storage bucket without
 * Supabase env vars, so every demo photo has `url: null` and the UI renders
 * generated SVG artwork instead of a broken `<img>`.
 */
export function getDemoGalleryPhotos(now: Date | number = Date.parse('2026-12-13T09:00:00Z')): GalleryPhoto[] {
  const base = typeof now === 'number' ? now : now.getTime()
  return DEMO_SEEDS.map((seed) => ({
    id: seed.id,
    storagePath: `${seed.id}/demo.jpg`,
    url: null,
    caption: seed.caption,
    status: 'approved' as const,
    isFeatured: seed.featured,
    rejectionReason: null,
    moderatedAt: new Date(base - seed.minutesAgo * 60_000 + 5 * 60_000).toISOString(),
    matchId: seed.matchId,
    division: seed.division,
    matchLabel: seed.matchLabel,
    createdAt: new Date(base - seed.minutesAgo * 60_000).toISOString(),
    uploadedBy: null,
    artSeed: artSeedFor(seed.id),
  }))
}

/** Demo queue for `/admin/gallery` — a mix of pending, approved and rejected. */
export function getDemoModerationQueue(now: Date | number = Date.parse('2026-12-13T09:00:00Z')): GalleryPhoto[] {
  const approved = getDemoGalleryPhotos(now)
  const base = typeof now === 'number' ? now : now.getTime()
  const pending: GalleryPhoto[] = [
    {
      id: 'demo-photo-10',
      storagePath: 'demo-photo-10/demo.jpg',
      url: null,
      caption: 'Blurry but joyful \u2014 the winning point on Court 2.',
      status: 'pending',
      isFeatured: false,
      rejectionReason: null,
      moderatedAt: null,
      matchId: 'demo-match-m1',
      division: 'mens_doubles',
      matchLabel: 'Court 2 \u00b7 Smash Clauses vs Net Elves',
      createdAt: new Date(base - 15 * 60_000).toISOString(),
      uploadedBy: null,
      artSeed: artSeedFor('demo-photo-10'),
    },
    {
      id: 'demo-photo-11',
      storagePath: 'demo-photo-11/demo.jpg',
      url: null,
      caption: null,
      status: 'pending',
      isFeatured: false,
      rejectionReason: null,
      moderatedAt: null,
      matchId: null,
      division: null,
      matchLabel: null,
      createdAt: new Date(base - 22 * 60_000).toISOString(),
      uploadedBy: null,
      artSeed: artSeedFor('demo-photo-11'),
    },
    {
      id: 'demo-photo-12',
      storagePath: 'demo-photo-12/demo.jpg',
      url: null,
      caption: 'Accidental photo of the sports hall ceiling.',
      status: 'rejected',
      isFeatured: false,
      rejectionReason: 'Lovely ceiling, but not one for the tree.',
      moderatedAt: new Date(base - 380 * 60_000).toISOString(),
      matchId: null,
      division: null,
      matchLabel: null,
      createdAt: new Date(base - 400 * 60_000).toISOString(),
      uploadedBy: null,
      artSeed: artSeedFor('demo-photo-12'),
    },
  ]
  return sortGalleryPhotos([...pending, ...approved])
}

// ---------------------------------------------------------------------------
// Data access (injected client, demo fallback)
// ---------------------------------------------------------------------------

async function fetchPhotoRows(
  client: GallerySupabaseClient | null | undefined,
  approvedOnly: boolean
): Promise<PhotoRow[] | null> {
  if (!client || !isSupabaseConfigured()) return null
  try {
    let query = client.from('photos').select('*').order('created_at', { ascending: false })
    // `is_approved` is trigger-maintained and carries the partial index used
    // by the public gallery.
    if (approvedOnly) query = query.eq('is_approved', true)
    const { data, error } = await query
    if (error || !data) return null
    return data
  } catch {
    return null
  }
}

/**
 * Approved photos for the public gallery. Falls back to the festive demo set
 * whenever Supabase isn't configured or the query fails — the gallery must
 * never render a broken grid.
 */
export async function getPublicGalleryPhotos(
  client?: GallerySupabaseClient | null,
  options: ToGalleryPhotoOptions = {}
): Promise<GalleryPhoto[]> {
  const rows = await fetchPhotoRows(client, true)
  if (!rows) return sortGalleryPhotos(getDemoGalleryPhotos())
  return sortGalleryPhotos(rows.map((row) => toGalleryPhoto(row, options)))
}

/** Everything (pending/approved/rejected) for the admin moderation queue. */
export async function getModerationQueue(
  client?: GallerySupabaseClient | null,
  options: ToGalleryPhotoOptions = {}
): Promise<GalleryPhoto[]> {
  const rows = await fetchPhotoRows(client, false)
  if (!rows) return getDemoModerationQueue()
  return sortGalleryPhotos(rows.map((row) => toGalleryPhoto(row, options)))
}

/** Photos uploaded by one user (their own pending ones included, via RLS). */
export async function getMyGalleryPhotos(
  client: GallerySupabaseClient | null | undefined,
  userId: string,
  options: ToGalleryPhotoOptions = {}
): Promise<GalleryPhoto[]> {
  if (!client || !isSupabaseConfigured() || !userId) return []
  try {
    const { data, error } = await client
      .from('photos')
      .select('*')
      .eq('uploaded_by', userId)
      .order('created_at', { ascending: false })
    if (error || !data) return []
    return sortGalleryPhotos(data.map((row) => toGalleryPhoto(row, options)))
  } catch {
    return []
  }
}

/**
 * Photos for the highlights strip, hitting `idx_photos_featured`
 * (`is_featured and is_approved`) first and topping the row up with the
 * newest approved photos when there aren't enough starred ones.
 */
export async function getFeaturedGalleryPhotos(
  client?: GallerySupabaseClient | null,
  limit = 6,
  options: ToGalleryPhotoOptions = {}
): Promise<GalleryPhoto[]> {
  const cap = Math.max(0, limit)
  if (cap === 0) return []
  if (!client || !isSupabaseConfigured()) {
    return featuredPhotos(getDemoGalleryPhotos(), cap)
  }
  try {
    const { data, error } = await client
      .from('photos')
      .select('*')
      .eq('is_featured', true)
      .eq('is_approved', true)
      .order('created_at', { ascending: false })
      .limit(cap)
    if (error) return featuredPhotos(getDemoGalleryPhotos(), cap)

    const starred = (data ?? []).map((row) => toGalleryPhoto(row, options))
    if (starred.length >= cap) return sortGalleryPhotos(starred).slice(0, cap)

    const topUp = await getPublicGalleryPhotos(client, options)
    const seen = new Set(starred.map((photo) => photo.id))
    return [
      ...sortGalleryPhotos(starred),
      ...topUp.filter((photo) => !seen.has(photo.id)),
    ].slice(0, cap)
  } catch {
    return featuredPhotos(getDemoGalleryPhotos(), cap)
  }
}

/** The tournament new uploads are attached to. */
export async function getGalleryTournamentId(
  client?: GallerySupabaseClient | null
): Promise<string> {
  if (!client || !isSupabaseConfigured()) return DEMO_TOURNAMENT_ID
  try {
    const { data } = await client
      .from('tournaments')
      .select('id')
      .order('tournament_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    const row = data as { id: string } | null
    return row?.id ?? DEMO_TOURNAMENT_ID
  } catch {
    return DEMO_TOURNAMENT_ID
  }
}
