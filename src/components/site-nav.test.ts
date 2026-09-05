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
  /**
   * The role consoles are the security-relevant part of this menu, so the
   * assertions below filter out the always-present account chores. Appending
   * '/account/password' to every expectation instead would have meant a new
   * chore link silently satisfying "never surfaces a console".
   */
  const consoles = (roles: Parameters<typeof accountLinks>[0]) =>
    accountLinks(roles)
      .map((link) => link.href)
      .filter((href) => href !== '/account/password')

  it('always offers the dashboard first', () => {
    expect(accountLinks([])[0]).toEqual({ href: '/dashboard', label: 'My dashboard' })
  })

  it('always offers a way to change the password', () => {
    // The only password-change control in the app. If it is not in this menu
    // it cannot be reached at all without typing the URL.
    for (const roles of [[], ['player'], ['admin']] as const) {
      expect(accountLinks(roles).map((link) => link.href)).toContain('/account/password')
    }
  })

  it('keeps account chores below the role consoles', () => {
    const hrefs = accountLinks(['admin']).map((link) => link.href)
    expect(hrefs.indexOf('/account/password')).toBeGreaterThan(hrefs.indexOf('/admin'))
  })

  it('adds a console for each role held, in a stable order', () => {
    expect(consoles(['admin', 'duty_official', 'tabulator'])).toEqual([
      '/dashboard',
      '/scoring',
      '/tabulator',
      '/admin',
    ])
  })

  it('ignores roles with no console of their own', () => {
    expect(consoles(['player', 'public'])).toEqual(['/dashboard'])
  })

  it('never surfaces a console the player has not been granted', () => {
    expect(consoles(['duty_official'])).toEqual(['/dashboard', '/scoring'])
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

describe('accountLinks while an entry is under review', () => {
  it('offers the status page instead of a dashboard that would bounce them', () => {
    // The approval gate redirects a pending/waitlisted/declined player off
    // /dashboard, so linking them there reads as a broken menu item.
    expect(accountLinks([], { awaitingApproval: true })[0]).toEqual({
      href: '/status',
      label: 'My entry',
    })
  })

  it('still offers every console a role holder has', () => {
    // Staff are never gated, but the flag must not eat their consoles even if
    // a caller passes it by mistake.
    const hrefs = accountLinks(['admin'], { awaitingApproval: true }).map((link) => link.href)
    expect(hrefs).toContain('/admin')
    expect(hrefs).toContain('/account/password')
  })
})
