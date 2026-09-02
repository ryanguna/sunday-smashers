import { describe, expect, it } from 'vitest'
import { MIN_PASSWORD_LENGTH, hasIssues, validateNewPassword } from './password'

describe('validateNewPassword', () => {
  it('accepts a long enough, matching password', () => {
    expect(validateNewPassword('sleighbells', 'sleighbells')).toEqual({})
  })

  it('rejects anything under the minimum', () => {
    const issues = validateNewPassword('short', 'short')
    expect(issues.password).toBe(`Use at least ${MIN_PASSWORD_LENGTH} characters.`)
  })

  it('accepts exactly the minimum', () => {
    expect(validateNewPassword('a'.repeat(MIN_PASSWORD_LENGTH), 'a'.repeat(MIN_PASSWORD_LENGTH))).toEqual({})
  })

  it('rejects one character under the minimum', () => {
    expect(
      validateNewPassword('a'.repeat(MIN_PASSWORD_LENGTH - 1), 'a'.repeat(MIN_PASSWORD_LENGTH - 1)).password,
    ).toBeDefined()
  })

  it('flags a mismatched confirmation', () => {
    const issues = validateNewPassword('sleighbells', 'sleighbell')
    expect(issues.confirmPassword).toBe('Passwords don’t match.')
    expect(issues.password).toBeUndefined()
  })

  it('reports both problems at once rather than one at a time', () => {
    const issues = validateNewPassword('nope', 'different')
    expect(issues.password).toBeDefined()
    expect(issues.confirmPassword).toBeDefined()
  })

  it('rejects reusing the current password', () => {
    // "Change your password" that accepts the one you already have has not
    // changed anything, and the user would believe it had.
    const issues = validateNewPassword('sleighbells', 'sleighbells', 'sleighbells')
    expect(issues.password).toContain('already have')
  })

  it('allows a new password when a current one is supplied and differs', () => {
    expect(validateNewPassword('sleighbells', 'sleighbells', 'jinglebells')).toEqual({})
  })

  it('ignores an empty current password rather than treating "" as a match', () => {
    expect(validateNewPassword('sleighbells', 'sleighbells', '')).toEqual({})
  })

  it('prefers the length complaint over the reuse complaint', () => {
    // Both are true for a short reused password; length is the one that also
    // tells them what to do.
    const issues = validateNewPassword('short', 'short', 'short')
    expect(issues.password).toContain('at least')
  })
})

describe('hasIssues', () => {
  it('is false for a clean result', () => {
    expect(hasIssues({})).toBe(false)
  })

  it('is true when any field failed', () => {
    expect(hasIssues({ confirmPassword: 'Passwords don’t match.' })).toBe(true)
  })
})
