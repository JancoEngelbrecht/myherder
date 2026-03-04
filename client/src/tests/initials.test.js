import { describe, it, expect } from 'vitest'
import { getInitials } from '../utils/initials.js'

describe('getInitials', () => {
  it('returns initials from two-word name', () => {
    expect(getInitials({ full_name: 'John Doe' })).toBe('JD')
  })

  it('returns single initial from single-word name', () => {
    expect(getInitials({ full_name: 'Admin' })).toBe('A')
  })

  it('returns first 2 chars of username when no full_name', () => {
    expect(getInitials({ username: 'sipho' })).toBe('SI')
  })

  it('returns ? for null/undefined user', () => {
    expect(getInitials(null)).toBe('?')
    expect(getInitials(undefined)).toBe('?')
  })

  it('handles three-word names (max 2 initials)', () => {
    expect(getInitials({ full_name: 'John James Doe' })).toBe('JJ')
  })
})
