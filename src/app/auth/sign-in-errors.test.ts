import { describe, expect, it } from 'vitest'
import {
  isAlreadyRegisteredError,
  isEmailDeliveryError,
  isInvalidCredentialsError,
  isUnconfirmedEmailError,
} from './sign-in-errors'

describe('isAlreadyRegisteredError', () => {
  it('matches the messages Supabase uses for a duplicate address', () => {
    expect(isAlreadyRegisteredError('User already registered')).toBe(true)
    expect(isAlreadyRegisteredError('user already exists')).toBe(true)
  })

  it('ignores unrelated failures', () => {
    expect(isAlreadyRegisteredError('Invalid login credentials')).toBe(false)
    expect(isAlreadyRegisteredError(null)).toBe(false)
    expect(isAlreadyRegisteredError(undefined)).toBe(false)
  })
})

describe('isInvalidCredentialsError', () => {
  it('matches a wrong email/password pair', () => {
    expect(isInvalidCredentialsError('Invalid login credentials')).toBe(true)
    expect(isInvalidCredentialsError('invalid credentials')).toBe(true)
  })

  it('does not swallow other errors', () => {
    expect(isInvalidCredentialsError('Email not confirmed')).toBe(false)
    expect(isInvalidCredentialsError('')).toBe(false)
  })
})

describe('isUnconfirmedEmailError', () => {
  it('matches the confirmation-required messages', () => {
    expect(isUnconfirmedEmailError('Email not confirmed')).toBe(true)
    expect(isUnconfirmedEmailError('email_not_confirmed')).toBe(true)
    expect(isUnconfirmedEmailError('Please confirm your email address')).toBe(true)
  })

  it('ignores a plain credential failure', () => {
    expect(isUnconfirmedEmailError('Invalid login credentials')).toBe(false)
  })
})

describe('isEmailDeliveryError', () => {
  it('matches both delivery failure families', () => {
    expect(isEmailDeliveryError('Email address not authorized')).toBe(true)
    expect(isEmailDeliveryError('Error sending confirmation email')).toBe(true)
    expect(isEmailDeliveryError('Error sending recovery email')).toBe(true)
    expect(isEmailDeliveryError('Error sending magic link email')).toBe(true)
  })

  it('ignores unrelated failures', () => {
    expect(isEmailDeliveryError('Invalid login credentials')).toBe(false)
    expect(isEmailDeliveryError(null)).toBe(false)
  })
})
