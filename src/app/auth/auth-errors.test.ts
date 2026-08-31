import { describe, expect, it } from 'vitest'
import {
  AUTH_CALLBACK_ERROR_CODES,
  callbackErrorCodeFromParams,
  isAuthCallbackErrorCode,
  loginErrorPath,
  resolveAuthCallbackError,
} from './auth-errors'

const noParams = { code: null, error: null, errorCode: null }

describe('isAuthCallbackErrorCode', () => {
  it('accepts every published code', () => {
    for (const code of AUTH_CALLBACK_ERROR_CODES) {
      expect(isAuthCallbackErrorCode(code)).toBe(true)
    }
  })

  it('rejects anything else', () => {
    expect(isAuthCallbackErrorCode('auth_callback_failed')).toBe(false)
    expect(isAuthCallbackErrorCode('')).toBe(false)
    expect(isAuthCallbackErrorCode(null)).toBe(false)
    expect(isAuthCallbackErrorCode(42)).toBe(false)
  })
})

describe('resolveAuthCallbackError', () => {
  it('returns null when there is no error param', () => {
    expect(resolveAuthCallbackError(null)).toBeNull()
    expect(resolveAuthCallbackError(undefined)).toBeNull()
    expect(resolveAuthCallbackError('')).toBeNull()
  })

  it('returns the matching copy for a known code', () => {
    const expired = resolveAuthCallbackError('link_expired')
    expect(expired?.code).toBe('link_expired')
    expect(expired?.title).toMatch(/expired/i)
  })

  it('falls back to generic copy for an unknown code so the page is never silent', () => {
    expect(resolveAuthCallbackError('something_new')?.code).toBe('verification_failed')
  })

  it('always offers at least one way forward', () => {
    for (const code of AUTH_CALLBACK_ERROR_CODES) {
      const message = resolveAuthCallbackError(code)
      expect(message?.actions.length).toBeGreaterThan(0)
      for (const action of message!.actions) {
        expect(action.href.startsWith('/')).toBe(true)
        expect(action.label.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('callbackErrorCodeFromParams', () => {
  it('maps Supabase otp_expired to link_expired', () => {
    expect(
      callbackErrorCodeFromParams({ ...noParams, error: 'access_denied', errorCode: 'otp_expired' }),
    ).toBe('link_expired')
  })

  it('maps an expired exchange failure to link_expired', () => {
    expect(
      callbackErrorCodeFromParams({
        ...noParams,
        code: 'abc123',
        exchangeErrorMessage: 'Email link is invalid or has expired',
      }),
    ).toBe('link_expired')
  })

  it('maps a missing code with no Supabase error to link_invalid', () => {
    expect(callbackErrorCodeFromParams(noParams)).toBe('link_invalid')
  })

  it('maps other Supabase errors to verification_failed', () => {
    expect(callbackErrorCodeFromParams({ ...noParams, error: 'server_error' })).toBe('verification_failed')
    expect(
      callbackErrorCodeFromParams({ ...noParams, code: 'abc123', exchangeErrorMessage: 'code verifier missing' }),
    ).toBe('verification_failed')
  })

  it('only ever returns published codes', () => {
    expect(AUTH_CALLBACK_ERROR_CODES).toContain(callbackErrorCodeFromParams({ ...noParams, code: 'abc' }))
  })
})

describe('loginErrorPath', () => {
  it('includes the error code', () => {
    expect(loginErrorPath('link_expired')).toBe('/login?error=link_expired')
  })

  it('preserves a non-default next path', () => {
    expect(loginErrorPath('link_invalid', '/onboarding')).toBe('/login?error=link_invalid&next=%2Fonboarding')
  })

  it('omits the default dashboard next path', () => {
    expect(loginErrorPath('link_invalid', '/dashboard')).toBe('/login?error=link_invalid')
  })
})
