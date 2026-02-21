import { describe, it, expect } from 'vitest'
import { formatDate, formatDateTime } from '../utils/format.js'

// Use noon UTC to avoid date-boundary issues across timezones
const SAMPLE_DATE = '2021-06-15T12:00:00Z'
const SAMPLE_DATE_OBJ = new Date(SAMPLE_DATE)

describe('formatDate', () => {
  it('returns em-dash for null', () => {
    expect(formatDate(null)).toBe('—')
  })

  it('returns em-dash for undefined', () => {
    expect(formatDate(undefined)).toBe('—')
  })

  it('returns em-dash for empty string', () => {
    expect(formatDate('')).toBe('—')
  })

  it('formats a valid ISO date string and includes the year', () => {
    const result = formatDate(SAMPLE_DATE)
    expect(result).not.toBe('—')
    expect(result).toContain('2021')
  })

  it('formats a Date object and includes the year', () => {
    const result = formatDate(SAMPLE_DATE_OBJ)
    expect(result).not.toBe('—')
    expect(result).toContain('2021')
  })

  it('returns a string (not the raw ISO value)', () => {
    const result = formatDate(SAMPLE_DATE)
    expect(result).not.toContain('T')
    expect(typeof result).toBe('string')
  })
})

describe('formatDateTime', () => {
  it('returns em-dash for null', () => {
    expect(formatDateTime(null)).toBe('—')
  })

  it('returns em-dash for undefined', () => {
    expect(formatDateTime(undefined)).toBe('—')
  })

  it('returns em-dash for empty string', () => {
    expect(formatDateTime('')).toBe('—')
  })

  it('formats a valid ISO datetime string and includes the year', () => {
    const result = formatDateTime(SAMPLE_DATE)
    expect(result).not.toBe('—')
    expect(result).toContain('2021')
  })

  it('formats a Date object and includes the year', () => {
    const result = formatDateTime(SAMPLE_DATE_OBJ)
    expect(result).not.toBe('—')
    expect(result).toContain('2021')
  })
})
