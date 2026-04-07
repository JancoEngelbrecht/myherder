import { describe, it, expect } from 'vitest'
import { extractApiError, resolveError } from '../utils/apiError'

describe('extractApiError', () => {
  it('extracts message from axios error response', () => {
    const err = { response: { data: { error: 'Username already exists' } } }
    expect(extractApiError(err)).toBe('Username already exists')
  })

  it('returns network error key for no response', () => {
    const err = { code: 'ECONNABORTED' }
    expect(extractApiError(err)).toBe('errors.network')
  })

  it('returns network key for missing response object', () => {
    const err = new Error('Network Error')
    expect(extractApiError(err)).toBe('errors.network')
  })

  it('returns permission denied key for 403', () => {
    const err = { response: { status: 403, data: {} } }
    expect(extractApiError(err)).toBe('errors.permissionDenied')
  })

  it('returns not found key for 404', () => {
    const err = { response: { status: 404, data: {} } }
    expect(extractApiError(err)).toBe('errors.notFound')
  })

  it('returns server key for 500+', () => {
    const err = { response: { status: 502, data: {} } }
    expect(extractApiError(err)).toBe('errors.server')
  })

  it('returns generic key for unexpected shape', () => {
    const err = { response: { status: 422, data: {} } }
    expect(extractApiError(err)).toBe('errors.generic')
  })
})

describe('resolveError', () => {
  it('resolves i18n keys via t()', () => {
    const t = (key) => `translated:${key}`
    expect(resolveError('errors.network', t)).toBe('translated:errors.network')
  })

  it('returns plain messages as-is', () => {
    const t = (key) => `translated:${key}`
    expect(resolveError('Username already exists', t)).toBe('Username already exists')
  })
})
