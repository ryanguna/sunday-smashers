import { describe, expect, it } from 'vitest'
import { FOOTER_LINKS, NAV_LINKS } from '@/components/site-nav'
import {
  completeVisibility,
  diffSitePageVisibility,
  isPageVisible,
  isPathVisible,
  isSitePageKey,
  SITE_PAGES,
  SITE_PAGE_PHASES,
  sitePageByKey,
  sitePageForPath,
  visibleNavLinks,
  type SitePageVisibility,
} from './site-pages'

describe('SITE_PAGES catalogue', () => {
  it('has unique keys and unique routes', () => {
    const keys = SITE_PAGES.map((page) => page.key)
    const hrefs = SITE_PAGES.map((page) => page.href)
    expect(new Set(keys).size).toBe(keys.length)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('never lets the committee switch off the front page', () => {
    expect(SITE_PAGES.some((page) => page.href === '/')).toBe(false)
  })

  it('never lets the committee switch off the way back in', () => {
    // Hiding these would lock players (or the committee) out of their own site.
    for (const href of ['/login', '/signup', '/dashboard', '/admin', '/setup']) {
      expect(SITE_PAGES.some((page) => page.href === href)).toBe(false)
    }
  })

  it('gives every page copy for the hidden state', () => {
    for (const page of SITE_PAGES) {
      expect(page.hiddenTitle.trim().length).toBeGreaterThan(0)
      expect(page.hiddenMessage.trim().length).toBeGreaterThan(0)
      expect(page.label.trim().length).toBeGreaterThan(0)
      expect(page.description.trim().length).toBeGreaterThan(0)
    }
  })

  it('only lists internal routes', () => {
    for (const page of SITE_PAGES) {
      expect(page.href.startsWith('/')).toBe(true)
      expect(page.href.endsWith('/')).toBe(false)
    }
  })

  it('puts every page in a phase the admin console renders', () => {
    const phases = new Set(SITE_PAGE_PHASES.map((group) => group.phase))
    for (const page of SITE_PAGES) {
      expect(phases.has(page.phase)).toBe(true)
    }
  })

  it('covers every primary nav destination except home', () => {
    // If a nav link had no switch, the committee would be unable to hide it —
    // which is the whole feature failing silently for that one page.
    for (const link of NAV_LINKS) {
      if (link.href === '/') continue
      expect(sitePageForPath(link.href), `no switch governs ${link.href}`).not.toBeNull()
    }
  })
})

describe('sitePageByKey / isSitePageKey', () => {
  it('finds a known page', () => {
    expect(sitePageByKey('standings')?.href).toBe('/standings')
  })

  it('recognises only real keys', () => {
    expect(isSitePageKey('standings')).toBe(true)
    expect(isSitePageKey('nope')).toBe(false)
    expect(isSitePageKey(null)).toBe(false)
    expect(isSitePageKey(42)).toBe(false)
  })
})

describe('isPageVisible', () => {
  it('defaults to visible when the committee has never touched the switch', () => {
    expect(isPageVisible({}, 'standings')).toBe(true)
    expect(isPageVisible(null, 'standings')).toBe(true)
    expect(isPageVisible(undefined, 'standings')).toBe(true)
  })

  it('hides only on an explicit false', () => {
    expect(isPageVisible({ standings: false }, 'standings')).toBe(false)
    expect(isPageVisible({ standings: true }, 'standings')).toBe(true)
  })

  it('leaves other pages alone', () => {
    const visibility: SitePageVisibility = { standings: false }
    expect(isPageVisible(visibility, 'live')).toBe(true)
  })
})

describe('sitePageForPath', () => {
  it('matches an exact route', () => {
    expect(sitePageForPath('/live')?.key).toBe('live')
  })

  it('matches sub-routes via their parent switch', () => {
    expect(sitePageForPath('/players/holly-smasher')?.key).toBe('players')
    expect(sitePageForPath('/register/invites')?.key).toBe('register')
    expect(sitePageForPath('/tv/2')?.key).toBe('tv')
  })

  it('only matches on a segment boundary', () => {
    // The bug this guards: a naive startsWith would have `/registerings`
    // silently inherit the `/register` switch.
    expect(sitePageForPath('/registerings')).toBeNull()
    expect(sitePageForPath('/livestream')).toBeNull()
  })

  it('ignores a trailing slash, query string or hash', () => {
    expect(sitePageForPath('/live/')?.key).toBe('live')
    expect(sitePageForPath('/live?court=1')?.key).toBe('live')
    expect(sitePageForPath('/live#now')?.key).toBe('live')
  })

  it('returns null for routes nobody can hide', () => {
    expect(sitePageForPath('/')).toBeNull()
    expect(sitePageForPath('/login')).toBeNull()
    expect(sitePageForPath('/dashboard')).toBeNull()
    expect(sitePageForPath('/admin/settings')).toBeNull()
  })
})

describe('isPathVisible', () => {
  it('allows anything without a switch', () => {
    expect(isPathVisible({ standings: false }, '/')).toBe(true)
    expect(isPathVisible({ standings: false }, '/dashboard')).toBe(true)
  })

  it('blocks a hidden page and its sub-routes', () => {
    const visibility: SitePageVisibility = { players: false }
    expect(isPathVisible(visibility, '/players')).toBe(false)
    expect(isPathVisible(visibility, '/players/holly')).toBe(false)
  })
})

describe('visibleNavLinks', () => {
  it('drops hidden destinations from the header', () => {
    const links = visibleNavLinks(NAV_LINKS, { standings: false, live: false })
    const hrefs = links.map((link) => link.href)
    expect(hrefs).not.toContain('/standings')
    expect(hrefs).not.toContain('/live')
    expect(hrefs).toContain('/')
    expect(hrefs).toContain('/rules')
  })

  it('drops the same destinations from the footer', () => {
    // Header and footer must never disagree about what exists.
    const hidden: SitePageVisibility = { gallery: false }
    const header = visibleNavLinks(NAV_LINKS, hidden).map((link) => link.href)
    const footer = visibleNavLinks(FOOTER_LINKS, hidden).map((link) => link.href)
    expect(header).not.toContain('/gallery')
    expect(footer).not.toContain('/gallery')
  })

  it('returns everything when nothing is hidden', () => {
    expect(visibleNavLinks(NAV_LINKS, {})).toHaveLength(NAV_LINKS.length)
    expect(visibleNavLinks(NAV_LINKS, null)).toHaveLength(NAV_LINKS.length)
  })
})

describe('diffSitePageVisibility', () => {
  it('reports nothing when both sides agree', () => {
    expect(diffSitePageVisibility({ live: false }, { live: false })).toEqual([])
  })

  it('treats an absent key as visible on either side', () => {
    expect(diffSitePageVisibility({}, { live: true })).toEqual([])
    expect(diffSitePageVisibility({ live: true }, {})).toEqual([])
  })

  it('describes a page being hidden', () => {
    expect(diffSitePageVisibility({}, { live: false })).toEqual([
      { path: 'pages.live', label: sitePageByKey('live')!.label, before: 'visible', after: 'hidden' },
    ])
  })

  it('describes a page being revealed', () => {
    const changes = diffSitePageVisibility({ gallery: false }, { gallery: true })
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ before: 'hidden', after: 'visible' })
  })

  it('ignores keys that are not in the catalogue', () => {
    // A row left behind by a page that has since been deleted from the code
    // must never surface as a change the committee is asked to save.
    const stale = { 'ghost-page': false } as unknown as SitePageVisibility
    expect(diffSitePageVisibility({}, stale)).toEqual([])
  })
})

describe('completeVisibility', () => {
  it('fills in every catalogue key', () => {
    const complete = completeVisibility({ live: false })
    expect(Object.keys(complete).sort()).toEqual(SITE_PAGES.map((page) => page.key).sort())
    expect(complete.live).toBe(false)
    expect(complete.rules).toBe(true)
  })

  it('defaults everything to visible when nothing is configured', () => {
    expect(Object.values(completeVisibility(null)).every(Boolean)).toBe(true)
  })
})
