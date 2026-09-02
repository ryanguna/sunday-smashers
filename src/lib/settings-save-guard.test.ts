import { describe, expect, it } from 'vitest'

import { blockerIsSuccess, settingsSaveBlocker } from './settings-save-guard'

describe('settingsSaveBlocker', () => {
  it('blocks with "demo" when no Supabase project is configured', () => {
    expect(settingsSaveBlocker(false, null)).toBe('demo')
  })

  it('still reports demo mode even if a tournament id is somehow present', () => {
    expect(settingsSaveBlocker(false, 'tour-1')).toBe('demo')
  })

  it('lets the save through on a configured project with a tournament', () => {
    expect(settingsSaveBlocker(true, 'tour-1')).toBeNull()
  })

  /**
   * The regression this module exists for. A live project with no tournament
   * row must never be described as demo mode — the database is right there.
   */
  it('distinguishes a missing tournament from a missing database', () => {
    expect(settingsSaveBlocker(true, null)).toBe('no-tournament')
    expect(settingsSaveBlocker(true, undefined)).toBe('no-tournament')
    expect(settingsSaveBlocker(true, '')).toBe('no-tournament')
  })
})

describe('blockerIsSuccess', () => {
  it('treats demo mode as a successful no-op so e2e runs stay green', () => {
    expect(blockerIsSuccess('demo')).toBe(true)
  })

  /**
   * The second half of the original bug: returning `ok: true` made the console
   * claim it had saved. Silently discarding a volunteer's work is a failure and
   * has to be reported as one.
   */
  it('treats a missing tournament as a failure, never a silent success', () => {
    expect(blockerIsSuccess('no-tournament')).toBe(false)
  })
})
