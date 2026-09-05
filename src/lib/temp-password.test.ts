import { describe, expect, it } from 'vitest'
import { generateTemporaryPassword, TEMPORARY_PASSWORD_PATTERN } from './temp-password'

describe('generateTemporaryPassword', () => {
  it('produces the dictated-over-the-phone shape', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateTemporaryPassword()).toMatch(TEMPORARY_PASSWORD_PATTERN)
    }
  })

  it('never uses characters that are misheard when read aloud', () => {
    // 0/O and 1/l/I are the pairs that turn a working password into a support
    // call, which is the whole thing this feature exists to avoid.
    for (let i = 0; i < 50; i++) {
      const password = generateTemporaryPassword()
      expect(password).not.toMatch(/[01]/)
    }
  })

  it('does not repeat itself', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateTemporaryPassword()))
    // 590k combinations: 200 draws colliding more than a handful of times
    // would mean the randomness is broken.
    expect(seen.size).toBeGreaterThan(190)
  })

  it('satisfies a mixed-case-plus-digit password policy', () => {
    const password = generateTemporaryPassword()
    expect(password).toMatch(/[A-Z]/)
    expect(password).toMatch(/[a-z]/)
    expect(password).toMatch(/[0-9]/)
    expect(password.length).toBeGreaterThanOrEqual(12)
  })
})
