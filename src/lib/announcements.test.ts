import { describe, expect, it } from 'vitest'
import {
  accentForAnnouncement,
  countPinned,
  excerpt,
  filterAnnouncements,
  formatAnnouncementDate,
  formatAnnouncementDateTime,
  formatRelativeTime,
  getDemoAnnouncements,
  latestAnnouncements,
  markdownToPlainText,
  readingTimeMinutes,
  selectDrafts,
  selectPublished,
  sortAnnouncements,
  toAnnouncement,
  validateAnnouncementDraft,
  type Announcement,
} from './announcements'
import type { AnnouncementRow } from '@/lib/supabase/types'

function make(overrides: Partial<Announcement> & { id: string }): Announcement {
  return {
    tournamentId: 't1',
    title: `Notice ${overrides.id}`,
    body: 'Body copy',
    isPublished: true,
    isPinned: false,
    createdAt: '2026-12-01T00:00:00.000Z',
    updatedAt: '2026-12-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('toAnnouncement', () => {
  it('maps a raw row to the camelCase UI shape', () => {
    const row: AnnouncementRow = {
      id: 'a1',
      tournament_id: 't1',
      title: 'Call room opens',
      body: '**Early** start',
      is_published: true,
      is_pinned: true,
      created_by: 'u1',
      created_at: '2026-12-13T09:00:00.000Z',
      updated_at: '2026-12-13T09:30:00.000Z',
    }
    expect(toAnnouncement(row)).toEqual({
      id: 'a1',
      tournamentId: 't1',
      title: 'Call room opens',
      body: '**Early** start',
      isPublished: true,
      isPinned: true,
      createdAt: '2026-12-13T09:00:00.000Z',
      updatedAt: '2026-12-13T09:30:00.000Z',
    })
  })
})

describe('sortAnnouncements', () => {
  const list: Announcement[] = [
    make({ id: 'old', createdAt: '2026-12-01T00:00:00.000Z' }),
    make({ id: 'new', createdAt: '2026-12-05T00:00:00.000Z' }),
    make({ id: 'pinned-old', isPinned: true, createdAt: '2026-11-01T00:00:00.000Z' }),
    make({ id: 'pinned-new', isPinned: true, createdAt: '2026-12-04T00:00:00.000Z' }),
  ]

  it('floats pinned notices to the top, then sorts newest first', () => {
    expect(sortAnnouncements(list).map((a) => a.id)).toEqual([
      'pinned-new',
      'pinned-old',
      'new',
      'old',
    ])
  })

  it('does not mutate the input array', () => {
    const input = [...list]
    sortAnnouncements(input)
    expect(input.map((a) => a.id)).toEqual(list.map((a) => a.id))
  })

  it('treats unparseable dates as the epoch instead of throwing', () => {
    const sorted = sortAnnouncements([
      make({ id: 'bad', createdAt: 'not-a-date' }),
      make({ id: 'good', createdAt: '2026-12-05T00:00:00.000Z' }),
    ])
    expect(sorted.map((a) => a.id)).toEqual(['good', 'bad'])
  })
})

describe('published / draft selection', () => {
  const list: Announcement[] = [
    make({ id: 'p1' }),
    make({ id: 'd1', isPublished: false }),
    make({ id: 'p2', isPinned: true }),
    make({ id: 'd2', isPublished: false, isPinned: true }),
  ]

  it('selectPublished keeps only published rows, pinned first', () => {
    expect(selectPublished(list).map((a) => a.id)).toEqual(['p2', 'p1'])
  })

  it('selectDrafts keeps only unpublished rows', () => {
    expect(selectDrafts(list).map((a) => a.id)).toEqual(['d2', 'd1'])
  })

  it('countPinned only counts pinned *published* notices', () => {
    expect(countPinned(list)).toBe(1)
  })

  it('latestAnnouncements caps the published list', () => {
    expect(latestAnnouncements(list, 1).map((a) => a.id)).toEqual(['p2'])
    expect(latestAnnouncements(list, 0)).toEqual([])
    expect(latestAnnouncements(list, -3)).toEqual([])
    expect(latestAnnouncements(list, 99)).toHaveLength(2)
  })
})

describe('filterAnnouncements', () => {
  const list: Announcement[] = [
    make({ id: 'a', title: 'Parking update', body: 'North car park is open' }),
    make({ id: 'b', title: 'Draw is live', body: 'Pools are up', isPublished: false }),
    make({ id: 'c', title: 'Loot bags', body: 'Candy canes for everyone', isPinned: true }),
  ]

  it('defaults to everything, sorted', () => {
    expect(filterAnnouncements(list).map((a) => a.id)).toEqual(['c', 'a', 'b'])
  })

  it('filters by published status', () => {
    expect(filterAnnouncements(list, { status: 'published' }).map((a) => a.id)).toEqual(['c', 'a'])
    expect(filterAnnouncements(list, { status: 'draft' }).map((a) => a.id)).toEqual(['b'])
  })

  it('searches title and body case-insensitively', () => {
    expect(filterAnnouncements(list, { query: 'CANDY' }).map((a) => a.id)).toEqual(['c'])
    expect(filterAnnouncements(list, { query: 'parking' }).map((a) => a.id)).toEqual(['a'])
    expect(filterAnnouncements(list, { query: '   ' }).map((a) => a.id)).toHaveLength(3)
    expect(filterAnnouncements(list, { query: 'tinsel' })).toEqual([])
  })

  it('combines status and query', () => {
    expect(filterAnnouncements(list, { status: 'draft', query: 'pools' }).map((a) => a.id)).toEqual([
      'b',
    ])
    expect(filterAnnouncements(list, { status: 'published', query: 'pools' })).toEqual([])
  })
})

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-12-13T12:00:00.000Z')
  const at = (iso: string) => formatRelativeTime(iso, now)

  it('handles the recent past', () => {
    expect(at('2026-12-13T11:59:40.000Z')).toBe('just now')
    expect(at('2026-12-13T11:55:00.000Z')).toBe('5 min ago')
    expect(at('2026-12-13T11:00:00.000Z')).toBe('1 hour ago')
    expect(at('2026-12-13T09:00:00.000Z')).toBe('3 hours ago')
    expect(at('2026-12-12T12:00:00.000Z')).toBe('1 day ago')
    expect(at('2026-12-10T12:00:00.000Z')).toBe('3 days ago')
    expect(at('2026-12-01T12:00:00.000Z')).toBe('2 weeks ago')
  })

  it('handles the near future (clock skew / scheduled posts)', () => {
    expect(at('2026-12-13T14:00:00.000Z')).toBe('in 2 hours')
    expect(at('2026-12-14T12:00:00.000Z')).toBe('in 1 day')
  })

  it('falls back to an absolute date beyond four weeks', () => {
    expect(at('2026-10-01T12:00:00.000Z')).toBe('1 Oct 2026')
  })

  it('accepts a Date and returns empty string for junk input', () => {
    expect(formatRelativeTime('2026-12-13T11:55:00.000Z', new Date(now))).toBe('5 min ago')
    expect(formatRelativeTime('nope', now)).toBe('')
  })

  it('is deterministic for a fixed now (hydration-safe)', () => {
    expect(at('2026-12-13T10:30:00.000Z')).toBe(at('2026-12-13T10:30:00.000Z'))
  })
})

describe('absolute formatting', () => {
  it('formats dates in the tournament timezone', () => {
    // 12:00 UTC on 12 Dec is already 13 Dec in Sydney (AEDT, +11).
    expect(formatAnnouncementDate('2026-12-12T23:00:00.000Z')).toBe('13 Dec 2026')
    expect(formatAnnouncementDateTime('2026-12-12T22:05:00.000Z')).toContain('13 Dec 2026')
  })

  it('returns an empty string for junk input', () => {
    expect(formatAnnouncementDate('nope')).toBe('')
    expect(formatAnnouncementDateTime('nope')).toBe('')
  })
})

describe('markdownToPlainText', () => {
  it('strips headings, bullets, bold, code, links and collapses whitespace', () => {
    const md = [
      '## Call room',
      '',
      '- Check in **early**',
      '- Bring `non-marking` shoes',
      '',
      'See the [schedule](/schedule) for details.',
    ].join('\n')
    expect(markdownToPlainText(md)).toBe(
      'Call room Check in early Bring non-marking shoes See the schedule for details.',
    )
  })

  it('handles CRLF line endings and empty input', () => {
    expect(markdownToPlainText('a\r\n\r\nb')).toBe('a b')
    expect(markdownToPlainText('')).toBe('')
  })
})

describe('excerpt', () => {
  const long = 'The call room opens at 8:30am sharp and the first shuttle is in the air at 9:00am.'

  it('returns the whole text when it fits', () => {
    expect(excerpt('**Short** note', 100)).toBe('Short note')
  })

  it('truncates on a word boundary with an ellipsis', () => {
    const out = excerpt(long, 30)
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(31)
    expect(out).toBe('The call room opens at 8:30am…')
  })

  it('never splits mid-word when a space is reasonably close', () => {
    expect(excerpt(long, 30).slice(0, -1).endsWith(' ')).toBe(false)
    expect(long.startsWith(excerpt(long, 30).slice(0, -1))).toBe(true)
  })

  it('handles a zero/negative budget', () => {
    expect(excerpt(long, 0)).toBe('')
    expect(excerpt(long, -5)).toBe('')
  })
})

describe('readingTimeMinutes', () => {
  it('is at least one minute', () => {
    expect(readingTimeMinutes('')).toBe(1)
    expect(readingTimeMinutes('short note')).toBe(1)
  })

  it('scales with word count', () => {
    const words = Array.from({ length: 600 }, () => 'shuttle').join(' ')
    expect(readingTimeMinutes(words)).toBe(3)
  })
})

describe('accentForAnnouncement', () => {
  it('is deterministic and within the pastel palette', () => {
    const palette = ['pink', 'lilac', 'mint', 'sky']
    for (const id of ['a', 'demo-ann-pinned-callroom', '9d3f-uuid-like', '']) {
      expect(palette).toContain(accentForAnnouncement(id))
      expect(accentForAnnouncement(id)).toBe(accentForAnnouncement(id))
    }
  })

  it('spreads ids across more than one accent', () => {
    const seen = new Set(
      Array.from({ length: 24 }, (_, i) => accentForAnnouncement(`notice-${i}`)),
    )
    expect(seen.size).toBeGreaterThan(1)
  })
})

describe('validateAnnouncementDraft', () => {
  it('accepts a sensible draft', () => {
    expect(validateAnnouncementDraft({ title: 'Parking', body: 'Use the north car park.' })).toEqual(
      {},
    )
  })

  it('rejects short titles and bodies', () => {
    const errors = validateAnnouncementDraft({ title: ' a ', body: '  ' })
    expect(errors.title).toBeTruthy()
    expect(errors.body).toBeTruthy()
  })

  it('rejects overly long titles', () => {
    expect(validateAnnouncementDraft({ title: 'x'.repeat(141), body: 'ok body' }).title).toBeTruthy()
  })
})

describe('getDemoAnnouncements', () => {
  const now = Date.parse('2026-12-13T12:00:00.000Z')

  it('produces a mix of pinned, published and draft fixtures', () => {
    const demo = getDemoAnnouncements(now)
    expect(demo.length).toBeGreaterThan(3)
    expect(demo.some((a) => a.isPinned && a.isPublished)).toBe(true)
    expect(demo.some((a) => !a.isPublished)).toBe(true)
  })

  it('dates every fixture in the past relative to now', () => {
    for (const a of getDemoAnnouncements(now)) {
      expect(Date.parse(a.createdAt)).toBeLessThan(now)
      expect(Date.parse(a.createdAt)).not.toBeNaN()
    }
  })

  it('has unique ids and sorts pinned-first through the public selector', () => {
    const demo = getDemoAnnouncements(now)
    expect(new Set(demo.map((a) => a.id)).size).toBe(demo.length)
    const published = selectPublished(demo)
    expect(published[0].isPinned).toBe(true)
    expect(published.every((a) => a.isPublished)).toBe(true)
  })
})
