import { describe, it, expect } from 'vitest'
import { deriveSession } from '../utils/milkSession'

describe('deriveSession', () => {
  it('returns morning at midnight', () => {
    expect(deriveSession('00:00')).toBe('morning')
  })

  it('returns morning at 06:00', () => {
    expect(deriveSession('06:00')).toBe('morning')
  })

  it('returns morning at 10:59 (just before the afternoon boundary)', () => {
    expect(deriveSession('10:59')).toBe('morning')
  })

  it('returns afternoon at 11:00 (boundary)', () => {
    expect(deriveSession('11:00')).toBe('afternoon')
  })

  it('returns afternoon at 12:00', () => {
    expect(deriveSession('12:00')).toBe('afternoon')
  })

  it('returns afternoon at 15:59 (just before the evening boundary)', () => {
    expect(deriveSession('15:59')).toBe('afternoon')
  })

  it('returns evening at 16:00 (boundary)', () => {
    expect(deriveSession('16:00')).toBe('evening')
  })

  it('returns evening at 18:00', () => {
    expect(deriveSession('18:00')).toBe('evening')
  })

  it('returns evening at 23:59', () => {
    expect(deriveSession('23:59')).toBe('evening')
  })

  it('falls back to morning for empty string', () => {
    expect(deriveSession('')).toBe('morning')
  })

  it('falls back to morning for null', () => {
    expect(deriveSession(null)).toBe('morning')
  })

  it('falls back to morning for undefined', () => {
    expect(deriveSession(undefined)).toBe('morning')
  })

  it('falls back to morning for malformed input', () => {
    expect(deriveSession('not-a-time')).toBe('morning')
  })
})
