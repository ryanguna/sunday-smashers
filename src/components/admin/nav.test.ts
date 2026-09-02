import { describe, expect, it } from 'vitest'

import {
  ADMIN_NAV,
  ADMIN_NAV_GROUPS,
  adminNavByGroup,
  findAdminNavItem,
  isAdminNavItemActive,
} from './nav'

describe('ADMIN_NAV', () => {
  it('points every entry inside /admin, or at a role-gated console', () => {
    for (const item of ADMIN_NAV) {
      expect(item.href.startsWith('/admin') || item.href === '/tabulator').toBe(true)
    }
  })

  it('uses only declared groups', () => {
    for (const item of ADMIN_NAV) {
      expect(ADMIN_NAV_GROUPS).toContain(item.group)
    }
  })

  it('has no duplicate hrefs', () => {
    const hrefs = ADMIN_NAV.map((item) => item.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('surfaces role management at the top level, not buried in settings', () => {
    // The roles manager existed for weeks reachable only from the Settings
    // sub-nav, so nobody could find it and roles could not be granted without
    // the Supabase SQL editor.
    const roles = ADMIN_NAV.find((item) => item.href === '/admin/settings/roles')
    expect(roles).toBeDefined()
    expect(roles?.group).toBe('People & money')
  })

  it('groups every entry so none is dropped from the sidebar', () => {
    const grouped = adminNavByGroup().flatMap((section) => section.items)
    expect(grouped).toHaveLength(ADMIN_NAV.length)
  })
})

describe('isAdminNavItemActive', () => {
  const settings = ADMIN_NAV.find((item) => item.href === '/admin/settings')!
  const roles = ADMIN_NAV.find((item) => item.href === '/admin/settings/roles')!
  const dashboard = ADMIN_NAV.find((item) => item.href === '/admin')!

  it('keeps the dashboard link dark on sub-pages', () => {
    expect(isAdminNavItemActive(dashboard, '/admin')).toBe(true)
    expect(isAdminNavItemActive(dashboard, '/admin/payments')).toBe(false)
  })

  it('lights a section for its own children', () => {
    expect(isAdminNavItemActive(settings, '/admin/settings')).toBe(true)
    expect(isAdminNavItemActive(settings, '/admin/settings/courts')).toBe(true)
  })

  /**
   * The regression that adding "People & roles" would otherwise have caused:
   * `/admin/settings/roles` prefix-matches `/admin/settings` too, so both
   * links highlighted at once.
   */
  it('lights only the deepest match when nav entries nest', () => {
    expect(isAdminNavItemActive(roles, '/admin/settings/roles')).toBe(true)
    expect(isAdminNavItemActive(settings, '/admin/settings/roles')).toBe(false)
  })

  it('never lights more than one entry for any nav destination', () => {
    for (const item of ADMIN_NAV) {
      const lit = ADMIN_NAV.filter((candidate) => isAdminNavItemActive(candidate, item.href))
      expect(lit.map((entry) => entry.href)).toEqual([item.href])
    }
  })
})

describe('findAdminNavItem', () => {
  it('resolves the deepest matching entry, for the page title', () => {
    expect(findAdminNavItem('/admin/settings/roles')?.href).toBe('/admin/settings/roles')
    expect(findAdminNavItem('/admin/settings/courts')?.href).toBe('/admin/settings')
  })

  it('returns undefined for a path outside the console', () => {
    expect(findAdminNavItem('/standings')).toBeUndefined()
  })
})
