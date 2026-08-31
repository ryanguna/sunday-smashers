import { describe, expect, it } from 'vitest'
import {
  RESEND_COOLDOWN_SECONDS,
  canResend,
  isAlreadyRegisteredError,
  isRateLimitedError,
  isUnconfirmedEmailError,
  resendButtonLabel,
  secondsUntilResendAllowed,
} from './resend-cooldown'

const NOW = 1_700_000_000_000

describe('secondsUntilResendAllowed', () => {
  it('allows the first send immediately', () => {
    expect(secondsUntilResendAllowed(null, NOW)).toBe(0)
    expect(canResend(null, NOW)).toBe(true)
  })

  it('blocks a second send during the cooldown', () => {
    expect(secondsUntilResendAllowed(NOW, NOW)).toBe(RESEND_COOLDOWN_SECONDS)
    expect(secondsUntilResendAllowed(NOW, NOW + 1_000)).toBe(RESEND_COOLDOWN_SECONDS - 1)
    expect(canResend(NOW, NOW + 1_000)).toBe(false)
  })

  it('allows again once the cooldown elapses', () => {
    expect(secondsUntilResendAllowed(NOW, NOW + RESEND_COOLDOWN_SECONDS * 1000)).toBe(0)
    expect(canResend(NOW, NOW + RESEND_COOLDOWN_SECONDS * 1000)).toBe(true)
  })

  it('never returns a negative countdown', () => {
    expect(secondsUntilResendAllowed(NOW, NOW + 10 * 60 * 1000)).toBe(0)
  })

  it('honours a custom cooldown', () => {
    expect(secondsUntilResendAllowed(NOW, NOW + 2_000, 5)).toBe(3)
  })
})

describe('resendButtonLabel', () => {
  it('shows progress while sending', () => {
    expect(resendButtonLabel(0, true)).toBe('Sending…')
    expect(resendButtonLabel(12, true)).toBe('Sending…')
  })

  it('counts down while cooling off', () => {
    expect(resendButtonLabel(12, false)).toBe('Resend in 12s')
  })

  it('invites another send when ready', () => {
    expect(resendButtonLabel(0, false)).toBe('Resend confirmation email')
  })
})

describe('error message classifiers', () => {
  it('spots an unconfirmed email', () => {
    expect(isUnconfirmedEmailError('Email not confirmed')).toBe(true)
    expect(isUnconfirmedEmailError('email_not_confirmed')).toBe(true)
    expect(isUnconfirmedEmailError('Invalid login credentials')).toBe(false)
    expect(isUnconfirmedEmailError(null)).toBe(false)
  })

  it('spots an existing account', () => {
    expect(isAlreadyRegisteredError('User already registered')).toBe(true)
    expect(isAlreadyRegisteredError('user already exists')).toBe(true)
    expect(isAlreadyRegisteredError('Password is too short')).toBe(false)
    expect(isAlreadyRegisteredError(undefined)).toBe(false)
  })

  it('spots a rate limit', () => {
    expect(isRateLimitedError('Email rate limit exceeded')).toBe(true)
    expect(isRateLimitedError('For security purposes, you can only request this after 44 seconds')).toBe(true)
    expect(isRateLimitedError('Network error')).toBe(false)
  })
})
