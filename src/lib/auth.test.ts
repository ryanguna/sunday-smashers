import { describe, expect, it } from 'vitest'
import { isProfileComplete, loginRedirectPath, sanitiseNextPath } from './auth-utils'
import type { ProfileRow } from '@/lib/supabase/types'

function baseProfile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: 'user-1',
    full_name: 'Holly Smasher',
    nickname: null,
    gender: 'female',
    phone: '+61 400 000 000',
    shirt_size: 'M',
    skill_level: 'intermediate',
    emergency_contact_name: 'Rudolph',
    emergency_contact_phone: '+61 400 111 111',
    avatar_url: null,
    bio: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('isProfileComplete', () => {
  it('is false for null profile', () => {
    expect(isProfileComplete(null)).toBe(false)
  })

  it('is true when every required field is filled in', () => {
    expect(isProfileComplete(baseProfile())).toBe(true)
  })

  it.each([
    'full_name',
    'gender',
    'phone',
    'shirt_size',
    'skill_level',
    'emergency_contact_name',
    'emergency_contact_phone',
  ] as const)('is false when %s is missing', (field) => {
    expect(isProfileComplete(baseProfile({ [field]: null }))).toBe(false)
  })

  it('is false when a required field is only whitespace', () => {
    expect(isProfileComplete(baseProfile({ full_name: '   ' }))).toBe(false)
  })

  it('does not require optional fields like nickname/bio/avatar', () => {
    expect(
      isProfileComplete(baseProfile({ nickname: null, bio: null, avatar_url: null }))
    ).toBe(true)
  })
})

describe('loginRedirectPath', () => {
  it('encodes the next path as a query param', () => {
    expect(loginRedirectPath('/dashboard')).toBe('/login?next=%2Fdashboard')
  })

  it('prefixes a leading slash if missing', () => {
    expect(loginRedirectPath('dashboard')).toBe('/login?next=%2Fdashboard')
  })

  it('encodes nested paths with query strings', () => {
    expect(loginRedirectPath('/admin/players?tab=pending')).toBe(
      '/login?next=%2Fadmin%2Fplayers%3Ftab%3Dpending'
    )
  })
})

describe('sanitiseNextPath', () => {
  it('falls back to /dashboard for null/undefined', () => {
    expect(sanitiseNextPath(null)).toBe('/dashboard')
    expect(sanitiseNextPath(undefined)).toBe('/dashboard')
  })

  it('falls back to /dashboard for empty string', () => {
    expect(sanitiseNextPath('')).toBe('/dashboard')
  })

  it('rejects protocol-relative URLs (open redirect)', () => {
    expect(sanitiseNextPath('//evil.example.com')).toBe('/dashboard')
  })

  it('rejects paths not starting with a slash', () => {
    expect(sanitiseNextPath('https://evil.example.com')).toBe('/dashboard')
  })

  it('accepts a well-formed internal path', () => {
    expect(sanitiseNextPath('/admin/players')).toBe('/admin/players')
  })
})
