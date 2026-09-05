import { describe, expect, it } from 'vitest'
import {
  GATED_PREFIXES,
  REGISTRATION_STATUS_PATH,
  resolveRegistrationGate,
} from './registration-gate'
import type { RegistrationStatus } from '@/lib/supabase/types'

describe('resolveRegistrationGate', () => {
  it('lets an approved player through', () => {
    expect(resolveRegistrationGate({ status: 'approved', isStaff: false })).toBe('allow')
  })

  it('holds a pending entry on the status page', () => {
    expect(resolveRegistrationGate({ status: 'pending', isStaff: false })).toBe('pending')
  })

  it('distinguishes waitlisted from declined', () => {
    expect(resolveRegistrationGate({ status: 'waitlisted', isStaff: false })).toBe('waitlisted')
    expect(resolveRegistrationGate({ status: 'rejected', isStaff: false })).toBe('declined')
  })

  it('lets a signed-up player with no entry through to register', () => {
    // Not "pending": they have an account but never submitted an entry, and
    // the dashboard is where the form is offered. Bouncing them to a page
    // about an entry they never made is a dead end.
    expect(resolveRegistrationGate({ status: null, isStaff: false })).toBe('allow')
  })

  it('never locks staff out, whatever their own entry says', () => {
    // Organisers are players too. An admin whose own entry is still pending
    // must not be locked out of the console they need in order to approve it.
    const statuses: (RegistrationStatus | null)[] = [
      'pending',
      'waitlisted',
      'rejected',
      'approved',
      null,
    ]
    for (const status of statuses) {
      expect(resolveRegistrationGate({ status, isStaff: true })).toBe('allow')
    }
  })
})

describe('GATED_PREFIXES', () => {
  it('covers the player-only surfaces and nothing public', () => {
    expect([...GATED_PREFIXES].sort()).toEqual([
      '/dashboard',
      '/scoresheets',
      '/scoring',
      '/tabulator',
    ])
    // The public site stays open to everyone, including declined entrants —
    // it is public information, and hiding it would be pointless as well as
    // unkind.
    for (const publicPath of ['/', '/schedule', '/standings', '/live', '/tv', '/rules']) {
      expect(GATED_PREFIXES).not.toContain(publicPath)
    }
  })

  it('does not gate the page it redirects to', () => {
    // A gated status page is an infinite redirect.
    expect(GATED_PREFIXES).not.toContain(REGISTRATION_STATUS_PATH)
  })
})
