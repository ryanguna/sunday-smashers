import { describe, expect, it } from 'vitest'
import {
  ACCEPTED_IMAGE_TYPES,
  DEFAULT_GALLERY_FILTERS,
  FEATURED_MARKER,
  GALLERY_BUCKET,
  MAX_CAPTION_LENGTH,
  MAX_FILES_PER_UPLOAD,
  MAX_IMAGE_EDGE,
  MAX_UPLOAD_BYTES,
  altTextFor,
  artSeedFor,
  canTransition,
  captionForStorage,
  countByStatus,
  dayKeyOf,
  dayLabel,
  displayCaption,
  extensionForMimeType,
  featuredPhotos,
  fileExtension,
  filterGalleryPhotos,
  formatBytes,
  galleryStoragePath,
  getDemoGalleryPhotos,
  getDemoModerationQueue,
  hashString,
  isAcceptedImageType,
  isFeaturedCaption,
  moderationBadgeStatus,
  moderationLabel,
  moderationPatch,
  normaliseCaption,
  normaliseMimeType,
  photoMatchesFilters,
  photoPublicUrl,
  photoStatus,
  prettifyDivision,
  polaroidTilt,
  resizeDimensions,
  slugifyFilename,
  sortGalleryPhotos,
  storageUploadUrl,
  toGalleryPhoto,
  uniqueDays,
  uniqueDivisions,
  uniqueMatchOptions,
  validateUploadBatch,
  validateUploadFile,
  type GalleryPhoto,
  type PhotoModerationStatus,
} from './gallery'
import type { PhotoRow } from '@/lib/supabase/types'

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function row(overrides: Partial<PhotoRow> = {}): PhotoRow {
  return {
    id: 'photo-1',
    tournament_id: 'tournament-1',
    match_id: null,
    storage_path: 'photo-1/shot.jpg',
    caption: 'A festive smash',
    uploaded_by: 'user-1',
    is_approved: true,
    approved_by: 'admin-1',
    created_at: '2026-12-13T02:00:00.000Z',
    ...overrides,
  }
}

function photo(overrides: Partial<GalleryPhoto> = {}): GalleryPhoto {
  return {
    id: 'p1',
    storagePath: 'p1/shot.jpg',
    url: null,
    caption: 'Caption',
    status: 'approved',
    isFeatured: false,
    matchId: null,
    division: null,
    matchLabel: null,
    createdAt: '2026-12-13T02:00:00.000Z',
    uploadedBy: null,
    artSeed: 0,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------

describe('mime types & extensions', () => {
  it('reads the extension from a filename', () => {
    expect(fileExtension('IMG_1234.JPG')).toBe('jpg')
    expect(fileExtension('/photos/holiday.final.png')).toBe('png')
    expect(fileExtension('noextension')).toBe('')
    expect(fileExtension('.gitignore')).toBe('')
    expect(fileExtension('trailing.')).toBe('')
  })

  it('normalises declared mime types and falls back to the extension', () => {
    expect(normaliseMimeType('image/jpeg')).toBe('image/jpeg')
    expect(normaliseMimeType('IMAGE/JPG', 'a.jpg')).toBe('image/jpeg')
    expect(normaliseMimeType('', 'photo.HEIC')).toBe('image/heic')
    expect(normaliseMimeType('application/octet-stream', 'photo.webp')).toBe('image/webp')
    expect(normaliseMimeType('', 'mystery.txt')).toBe('')
  })

  it('accepts only real photo types', () => {
    for (const type of ACCEPTED_IMAGE_TYPES) expect(isAcceptedImageType(type)).toBe(true)
    expect(isAcceptedImageType('image/jpg')).toBe(true)
    expect(isAcceptedImageType('image/gif')).toBe(false)
    expect(isAcceptedImageType('application/pdf')).toBe(false)
  })

  it('maps mime types to storage extensions, defaulting to jpg', () => {
    expect(extensionForMimeType('image/png')).toBe('png')
    expect(extensionForMimeType('image/jpg')).toBe('jpg')
    expect(extensionForMimeType('image/webp')).toBe('webp')
    expect(extensionForMimeType('nonsense')).toBe('jpg')
  })
})

describe('formatBytes', () => {
  it('formats sensible units', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(-5)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})

describe('validateUploadFile', () => {
  it('accepts a normal phone photo', () => {
    expect(validateUploadFile({ name: 'IMG_0001.jpg', type: 'image/jpeg', size: 4_000_000 })).toEqual({
      ok: true,
    })
  })

  it('rejects non-image types with a friendly message', () => {
    const result = validateUploadFile({ name: 'draw.pdf', type: 'application/pdf', size: 1000 })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('draw.pdf')
  })

  it('rejects unknown files', () => {
    const result = validateUploadFile({ name: 'mystery', type: '', size: 1000 })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/can.t tell/i)
  })

  it('rejects empty files', () => {
    const result = validateUploadFile({ name: 'a.jpg', type: 'image/jpeg', size: 0 })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/empty/i)
  })

  it('rejects files above the size cap', () => {
    const result = validateUploadFile({
      name: 'huge.jpg',
      type: 'image/jpeg',
      size: MAX_UPLOAD_BYTES + 1,
    })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Santa')
  })

  it('trusts the extension when the browser gives no type', () => {
    expect(validateUploadFile({ name: 'party.HEIC', type: '', size: 2_000_000 }).ok).toBe(true)
  })
})

describe('validateUploadBatch', () => {
  it('splits keepers from rejects and enforces the batch cap', () => {
    const files = [
      { name: 'a.jpg', type: 'image/jpeg', size: 100 },
      { name: 'b.pdf', type: 'application/pdf', size: 100 },
      { name: 'c.png', type: 'image/png', size: 100 },
    ]
    const result = validateUploadBatch(files)
    expect(result.accepted.map((f) => f.name)).toEqual(['a.jpg', 'c.png'])
    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0].file.name).toBe('b.pdf')
  })

  it('rejects overflow beyond maxFiles', () => {
    const files = Array.from({ length: 4 }, (_unused, index) => ({
      name: `p${index}.jpg`,
      type: 'image/jpeg',
      size: 100,
    }))
    const result = validateUploadBatch(files, 2)
    expect(result.accepted).toHaveLength(2)
    expect(result.rejected).toHaveLength(2)
    expect(result.rejected[0].message).toContain('2 photos per batch')
  })

  it('defaults to the documented batch cap', () => {
    const files = Array.from({ length: MAX_FILES_PER_UPLOAD + 3 }, (_unused, index) => ({
      name: `p${index}.jpg`,
      type: 'image/jpeg',
      size: 100,
    }))
    expect(validateUploadBatch(files).accepted).toHaveLength(MAX_FILES_PER_UPLOAD)
  })
})

describe('resizeDimensions', () => {
  it('never upscales', () => {
    expect(resizeDimensions(800, 600)).toEqual({ width: 800, height: 600 })
  })

  it('scales the longest edge down preserving aspect ratio', () => {
    expect(resizeDimensions(4000, 3000, 1800)).toEqual({ width: 1800, height: 1350 })
    expect(resizeDimensions(3000, 4000, 1800)).toEqual({ width: 1350, height: 1800 })
  })

  it('uses the module default max edge', () => {
    const { width } = resizeDimensions(6000, 6000)
    expect(width).toBe(MAX_IMAGE_EDGE)
  })

  it('is robust to junk input', () => {
    expect(resizeDimensions(0, 0)).toEqual({ width: 1, height: 1 })
    expect(resizeDimensions(Number.NaN, Number.NaN)).toEqual({ width: 1, height: 1 })
    expect(resizeDimensions(100, 50, 0)).toEqual({ width: 100, height: 50 })
  })

  it('keeps very wide panoramas at least 1px tall', () => {
    expect(resizeDimensions(10000, 10, 100).height).toBeGreaterThanOrEqual(1)
  })
})

describe('storage paths & urls', () => {
  it('slugifies filenames', () => {
    expect(slugifyFilename('IMG_1234 (1).JPG')).toBe('img-1234-1')
    expect(slugifyFilename('  ???.png')).toBe('photo')
    expect(slugifyFilename('/a/b/Christmas Smash!.jpeg')).toBe('christmas-smash')
    expect(slugifyFilename('x'.repeat(80) + '.jpg')).toHaveLength(40)
  })

  it('puts the photo id first, per the storage RLS convention', () => {
    expect(galleryStoragePath('abc-123', 'IMG_1.jpg', 'image/jpeg')).toBe('abc-123/img-1.jpg')
    expect(galleryStoragePath('abc-123', 'photo.HEIC', '')).toBe('abc-123/photo.heic')
    expect(galleryStoragePath('abc-123', 'weird', '')).toBe('abc-123/weird.jpg')
  })

  it('builds public urls in the gallery bucket', () => {
    expect(photoPublicUrl('https://x.supabase.co/', 'abc/img 1.jpg')).toBe(
      `https://x.supabase.co/storage/v1/object/public/${GALLERY_BUCKET}/abc/img%201.jpg`
    )
    expect(photoPublicUrl('', 'abc/x.jpg')).toBeNull()
    expect(photoPublicUrl('https://x.supabase.co', '')).toBeNull()
  })

  it('builds the REST upload endpoint', () => {
    expect(storageUploadUrl('https://x.supabase.co', 'abc/x.jpg')).toBe(
      `https://x.supabase.co/storage/v1/object/${GALLERY_BUCKET}/abc/x.jpg`
    )
  })
})

describe('captions & the featured marker', () => {
  it('detects and strips the marker', () => {
    expect(isFeaturedCaption(`Great shot ${FEATURED_MARKER}`)).toBe(true)
    expect(isFeaturedCaption('Great shot')).toBe(false)
    expect(isFeaturedCaption(null)).toBe(false)
    expect(displayCaption(`Great shot ${FEATURED_MARKER}`)).toBe('Great shot')
    expect(displayCaption(FEATURED_MARKER)).toBeNull()
    expect(displayCaption(null)).toBeNull()
  })

  it('normalises whitespace and caps length', () => {
    expect(normaliseCaption('  lots   of \n space  ')).toBe('lots of space')
    expect(normaliseCaption('   ')).toBeNull()
    expect(normaliseCaption('x'.repeat(500))).toHaveLength(MAX_CAPTION_LENGTH)
  })

  it('round-trips caption + featured through one column', () => {
    expect(captionForStorage('Great shot', true)).toBe(`Great shot ${FEATURED_MARKER}`)
    expect(captionForStorage(`Great shot ${FEATURED_MARKER}`, false)).toBe('Great shot')
    expect(captionForStorage(null, true)).toBe(FEATURED_MARKER)
    expect(captionForStorage('', false)).toBeNull()
    const stored = captionForStorage('Great shot', true)
    expect(displayCaption(stored)).toBe('Great shot')
    expect(isFeaturedCaption(stored)).toBe(true)
  })
})

describe('moderation', () => {
  it('derives status from the row', () => {
    expect(photoStatus({ is_approved: true, approved_by: 'a' })).toBe('approved')
    expect(photoStatus({ is_approved: false, approved_by: null })).toBe('pending')
    expect(photoStatus({ is_approved: false, approved_by: 'a' })).toBe('rejected')
  })

  it('builds the column patch for each target status', () => {
    expect(moderationPatch('approved', 'admin-1')).toEqual({
      is_approved: true,
      approved_by: 'admin-1',
    })
    expect(moderationPatch('rejected', 'admin-1')).toEqual({
      is_approved: false,
      approved_by: 'admin-1',
    })
    expect(moderationPatch('pending', 'admin-1')).toEqual({ is_approved: false, approved_by: null })
  })

  it('round-trips patch → status', () => {
    const statuses: PhotoModerationStatus[] = ['pending', 'approved', 'rejected']
    for (const status of statuses) {
      expect(photoStatus(moderationPatch(status, 'admin-1'))).toBe(status)
    }
  })

  it('blocks no-op transitions', () => {
    expect(canTransition('pending', 'approved')).toBe(true)
    expect(canTransition('approved', 'approved')).toBe(false)
    expect(canTransition('rejected', 'pending')).toBe(true)
  })

  it('has festive labels and badge mappings', () => {
    expect(moderationLabel('approved')).toBe('On the tree')
    expect(moderationLabel('pending')).toMatch(/elf/i)
    expect(moderationLabel('rejected')).toBeTruthy()
    expect(moderationBadgeStatus('approved')).toBe('approved')
    expect(moderationBadgeStatus('pending')).toBe('pending')
    expect(moderationBadgeStatus('rejected')).toBe('forfeit')
  })
})

describe('alt text', () => {
  it('prefers the caption', () => {
    expect(altTextFor({ caption: 'A smash', matchLabel: 'Court 1', division: 'md' })).toBe('A smash')
  })

  it('falls back to the match, then the division, then a generic description', () => {
    expect(altTextFor({ caption: null, matchLabel: 'Court 1 · Final', division: 'md' })).toBe(
      'Tournament photo from Court 1 · Final'
    )
    expect(altTextFor({ caption: null, matchLabel: null, division: 'mens_doubles' })).toContain(
      'mens_doubles'
    )
    expect(altTextFor({ caption: null, matchLabel: null, division: null })).toContain(
      'Sunday Smashers'
    )
  })

  it('ignores a marker-only caption', () => {
    expect(altTextFor({ caption: FEATURED_MARKER, matchLabel: null, division: null })).toContain(
      'Sunday Smashers'
    )
  })
})

describe('deterministic visuals', () => {
  it('hashes stably and non-negatively', () => {
    expect(hashString('abc')).toBe(hashString('abc'))
    expect(hashString('abc')).toBeGreaterThanOrEqual(0)
    expect(hashString('')).toBe(0)
  })

  it('art seeds stay inside the artwork range', () => {
    for (const id of ['a', 'b', 'photo-99', 'demo-photo-01']) {
      const seed = artSeedFor(id)
      expect(seed).toBeGreaterThanOrEqual(0)
      expect(seed).toBeLessThan(12)
      expect(artSeedFor(id)).toBe(seed)
    }
  })

  it('produces pre-rounded transform strings (hydration safety)', () => {
    const tilt = polaroidTilt('photo-1')
    expect(tilt).toMatch(/^rotate\(-?\d+\.\d{2}deg\)$/)
    expect(polaroidTilt('photo-1')).toBe(tilt)
    const degrees = Number(tilt.replace(/[^-\d.]/g, ''))
    expect(Math.abs(degrees)).toBeLessThanOrEqual(3)
  })
})

describe('days, filters & sorting', () => {
  it('derives and labels day keys', () => {
    expect(dayKeyOf('2026-12-13T02:00:00.000Z')).toBe('2026-12-13')
    expect(dayKeyOf('not-a-date')).toBe('unknown')
    expect(dayLabel('2026-12-13')).toContain('13')
    expect(dayLabel('unknown')).toBe('Undated')
    expect(dayLabel('nonsense')).toBe('Undated')
  })

  it('lists unique days newest first, and divisions alphabetically', () => {    const photos = [
      photo({ id: 'a', createdAt: '2026-12-12T10:00:00Z', division: 'womens_doubles' }),
      photo({ id: 'b', createdAt: '2026-12-13T10:00:00Z', division: 'mens_doubles' }),
      photo({ id: 'c', createdAt: '2026-12-13T22:00:00Z', division: null }),
    ]
    expect(uniqueDays(photos)).toEqual(['2026-12-13', '2026-12-12'])
    expect(uniqueDivisions(photos)).toEqual(['mens_doubles', 'womens_doubles'])
  })

  it('matches the default (all) filters against everything', () => {
    expect(photoMatchesFilters(photo(), DEFAULT_GALLERY_FILTERS)).toBe(true)
  })

  it('lists distinct tagged matches, first label wins', () => {
    const options = uniqueMatchOptions([
      photo({ id: 'a', matchId: 'm1', matchLabel: 'Court 1', division: 'mens_doubles' }),
      photo({ id: 'b', matchId: 'm1', matchLabel: 'Court 1', division: 'mens_doubles' }),
      photo({ id: 'c', matchId: null }),
      photo({ id: 'd', matchId: 'm2', matchLabel: null, division: null }),
    ])
    expect(options).toEqual([
      { id: 'm1', division: 'mens_doubles', label: 'Court 1' },
      { id: 'm2', division: '', label: 'Tagged match' },
    ])
  })

  it('prettifies division slugs', () => {
    expect(prettifyDivision('mens_doubles')).toBe('Mens Doubles')
    expect(prettifyDivision('womens-doubles')).toBe('Womens Doubles')
    expect(prettifyDivision('')).toBe('')
  })

  it('filters by division, match and day', () => {
    const photos = [
      photo({ id: 'a', division: 'mens_doubles', matchId: 'm1', createdAt: '2026-12-13T01:00:00Z' }),
      photo({ id: 'b', division: 'womens_doubles', matchId: 'm2', createdAt: '2026-12-13T02:00:00Z' }),
      photo({ id: 'c', division: 'mens_doubles', matchId: 'm2', createdAt: '2026-12-12T02:00:00Z' }),
    ]
    expect(
      filterGalleryPhotos(photos, { ...DEFAULT_GALLERY_FILTERS, division: 'mens_doubles' }).map(
        (p) => p.id
      )
    ).toEqual(['a', 'c'])
    expect(
      filterGalleryPhotos(photos, { ...DEFAULT_GALLERY_FILTERS, matchId: 'm2' }).map((p) => p.id)
    ).toEqual(['b', 'c'])
    expect(
      filterGalleryPhotos(photos, { ...DEFAULT_GALLERY_FILTERS, day: '2026-12-12' }).map((p) => p.id)
    ).toEqual(['c'])
    expect(
      filterGalleryPhotos(photos, {
        division: 'mens_doubles',
        matchId: 'm2',
        day: '2026-12-12',
      }).map((p) => p.id)
    ).toEqual(['c'])
  })

  it('sorts newest first with a stable tiebreak', () => {
    const photos = [
      photo({ id: 'b', createdAt: '2026-12-13T01:00:00Z' }),
      photo({ id: 'a', createdAt: '2026-12-13T01:00:00Z' }),
      photo({ id: 'c', createdAt: '2026-12-13T05:00:00Z' }),
    ]
    expect(sortGalleryPhotos(photos).map((p) => p.id)).toEqual(['c', 'a', 'b'])
    expect(photos.map((p) => p.id)).toEqual(['b', 'a', 'c'])
  })

  it('counts by status', () => {
    expect(
      countByStatus([
        photo({ id: '1', status: 'pending' }),
        photo({ id: '2', status: 'pending' }),
        photo({ id: '3', status: 'approved' }),
        photo({ id: '4', status: 'rejected' }),
      ])
    ).toEqual({ pending: 2, approved: 1, rejected: 1 })
  })
})

describe('featuredPhotos', () => {
  it('puts starred approved photos first and tops up with the newest', () => {
    const photos = [
      photo({ id: 'old-star', isFeatured: true, createdAt: '2026-12-01T00:00:00Z' }),
      photo({ id: 'new', createdAt: '2026-12-13T00:00:00Z' }),
      photo({ id: 'older', createdAt: '2026-12-10T00:00:00Z' }),
    ]
    expect(featuredPhotos(photos, 3).map((p) => p.id)).toEqual(['old-star', 'new', 'older'])
  })

  it('never leaks unapproved photos', () => {
    const photos = [
      photo({ id: 'pending', status: 'pending', isFeatured: true }),
      photo({ id: 'rejected', status: 'rejected' }),
      photo({ id: 'ok' }),
    ]
    expect(featuredPhotos(photos).map((p) => p.id)).toEqual(['ok'])
  })

  it('respects the limit', () => {
    const photos = Array.from({ length: 10 }, (_unused, index) => photo({ id: `p${index}` }))
    expect(featuredPhotos(photos, 4)).toHaveLength(4)
    expect(featuredPhotos(photos, 0)).toHaveLength(0)
    expect(featuredPhotos(photos, -2)).toHaveLength(0)
  })
})

describe('toGalleryPhoto', () => {
  it('maps a row into the UI shape', () => {
    const result = toGalleryPhoto(row({ caption: `Smash ${FEATURED_MARKER}` }), {
      baseUrl: 'https://x.supabase.co',
    })
    expect(result).toMatchObject({
      id: 'photo-1',
      caption: 'Smash',
      isFeatured: true,
      status: 'approved',
      division: null,
      matchLabel: null,
      url: `https://x.supabase.co/storage/v1/object/public/${GALLERY_BUCKET}/photo-1/shot.jpg`,
    })
  })

  it('resolves division + label from the match index', () => {
    const result = toGalleryPhoto(row({ match_id: 'm1' }), {
      baseUrl: 'https://x.supabase.co',
      matches: { m1: { id: 'm1', division: 'mens_doubles', label: 'Court 1 · Final' } },
    })
    expect(result.division).toBe('mens_doubles')
    expect(result.matchLabel).toBe('Court 1 · Final')
  })

  it('leaves the url null when there is no storage origin (demo mode)', () => {
    expect(toGalleryPhoto(row(), { baseUrl: '' }).url).toBeNull()
  })

  it('reports pending for an unmoderated row', () => {
    expect(toGalleryPhoto(row({ is_approved: false, approved_by: null })).status).toBe('pending')
  })
})

describe('demo fixtures', () => {
  it('are all approved, url-less and internally consistent', () => {
    const photos = getDemoGalleryPhotos()
    expect(photos.length).toBeGreaterThan(4)
    for (const item of photos) {
      expect(item.status).toBe('approved')
      expect(item.url).toBeNull()
      expect(item.artSeed).toBe(artSeedFor(item.id))
      expect(Number.isNaN(Date.parse(item.createdAt))).toBe(false)
    }
    expect(photos.some((item) => item.isFeatured)).toBe(true)
    expect(featuredPhotos(photos, 3)).toHaveLength(3)
  })

  it('are deterministic for a given "now"', () => {
    const a = getDemoGalleryPhotos(Date.parse('2026-12-13T09:00:00Z'))
    const b = getDemoGalleryPhotos(Date.parse('2026-12-13T09:00:00Z'))
    expect(a).toEqual(b)
  })

  it('give the moderation queue a mix of statuses', () => {
    const counts = countByStatus(getDemoModerationQueue())
    expect(counts.pending).toBeGreaterThan(0)
    expect(counts.approved).toBeGreaterThan(0)
    expect(counts.rejected).toBeGreaterThan(0)
  })
})
