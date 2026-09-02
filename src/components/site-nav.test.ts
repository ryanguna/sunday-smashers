import { describe, expect, it } from 'vitest'
import {
  accountDisplayName,
  accountLinks,
  accountNavState,
  shouldShowRegisterCta,
  FOOTER_LINKS,
  NAV_LINKS,
} from './site-nav'

describe('NAV_LINKS', () => {
  it('includes announcements — day-of changes are posted there', () => {
    expect(NAV_LINKS.map((link) => link.href)).toContain('/announcements')
  })

  it('has no duplicate destinations', () => {
    const hrefs = NAV_LINKS.map((link) => link.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('only points at internal routes', () => {
    for (const link of [...NAV_LINKS, ...FOOTER_LINKS]) {
      expect(link.href.startsWith('/')).toBe(true)
      expect(link.label.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('FOOTER_LINKS', () => {
  it('covers every previously orphaned route', () => {
    const hrefs = FOOTER_LINKS.map((link) => link.href)
    for (const href of ['/bracket', '/live', '/announcements', '/dashboard']) {
      expect(hrefs).toContain(href)
    }
  })

  it('repeats the primary nav destinations apart from home', () => {
    const hrefs = FOOTER_LINKS.map((link) => link.href)
    for (const link of NAV_LINKS) {
      if (link.href === '/') continue
      expect(hrefs).toContain(link.href)
    }
  })

  it('has no duplicate destinations', () => {
    const hrefs = FOOTER_LINKS.map((link) => link.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })
})

describe('accountNavState', () => {
  it('is demo whenever Supabase is unconfigured, whatever else is true', () => {
    expect(accountNavState({ configured: false, loading: true, signedIn: false })).toBe('demo')
    expect(accountNavState({ configured: false, loading: false, signedIn: true })).toBe('demo')
  })

  it('is pending while the session is still resolving', () => {
    expect(accountNavState({ configured: true, loading: true, signedIn: false })).toBe('pending')
  })

  it('distinguishes signed in from signed out once resolved', () => {
    expect(accountNavState({ configured: true, loading: false, signedIn: true })).toBe('signed-in')
    expect(accountNavState({ configured: true, loading: false, signedIn: false })).toBe('signed-out')
  })
})

describe('accountLinks', () => {
  it('always offers the dashboard first', () => {
    expect(accountLinks([])).toEqual([{ href: '/dashboard', label: 'My dashboard' }])
  })

  it('adds a console for each role held, in a stable order', () => {
    expect(accountLinks(['admin', 'duty_official', 'tabulator']).map((link) => link.href)).toEqual([
      '/dashboard',
      '/scoring',
      '/tabulator',
      '/admin',
    ])
  })

  it('ignores roles with no console of their own', () => {
    expect(accountLinks(['player', 'public']).map((link) => link.href)).toEqual(['/dashboard'])
  })

  it('never surfaces a console the player has not been granted', () => {
    expect(accountLinks(['duty_official']).map((link) => link.href)).toEqual([
      '/dashboard',
      '/scoring',
    ])
  })
})

describe('accountDisplayName', () => {
  it('prefers the profile name', () => {
    expect(accountDisplayName('Ivy Novak', 'ivy@example.com')).toBe('Ivy Novak')
  })

  it('falls back to the email when the name is missing or blank', () => {
    expect(accountDisplayName(null, 'ivy@example.com')).toBe('ivy@example.com')
    expect(accountDisplayName('   ', 'ivy@example.com')).toBe('ivy@example.com')
  })

  it('falls back to generic copy when we know neither', () => {
    expect(accountDisplayName(null, undefined)).toBe('your account')
  })
})

describe('shouldShowRegisterCta', () => {
  it('hides the CTA once someone is signed in', () => {
    // The specific complaint: "the register button is always there, it's even
    // confusing". A signed-in player's entry lives on their dashboard.
    expect(
      shouldShowRegisterCta({ accountState: 'signed-in', registerPageVisible: true }),
    ).toBe(false)
  })

  it('shows the CTA to a signed-out visitor', () => {
    expect(
      shouldShowRegisterCta({ accountState: 'signed-out', registerPageVisible: true }),
    ).toBe(true)
  })

  it('shows the CTA while the session is still resolving', () => {
    // Signed-out is the common case on a public teaser site, and withholding
    // the button until JavaScript lands costs more than a brief flash.
    expect(shouldShowRegisterCta({ accountState: 'pending', registerPageVisible: true })).toBe(
      true,
    )
    expect(shouldShowRegisterCta({ accountState: 'demo', registerPageVisible: true })).toBe(true)
  })

  it('hides the CTA when the committee has switched /register off', () => {
    // Pointing at a page that renders "not open yet" is worse than no CTA,
    // whoever is looking.
    for (const accountState of ['signed-out', 'signed-in', 'pending', 'demo'] as const) {
      expect(shouldShowRegisterCta({ accountState, registerPageVisible: false })).toBe(false)
    }
  })
})
