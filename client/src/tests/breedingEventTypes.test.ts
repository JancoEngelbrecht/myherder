import { describe, it, expect } from 'vitest'
import {
  BREEDING_EVENT_TYPES,
  getEventType,
  getEventTypesForSpecies,
} from '../config/breedingEventTypes'

describe('breedingEventTypes', () => {
  describe('getEventType', () => {
    it('returns event type by code', () => {
      const heat = getEventType('heat_observed')
      expect(heat.emoji).toBe('🔥')
    })

    it('returns null for unknown code', () => {
      expect(getEventType('unknown')).toBeNull()
    })

    it('returns ram_service event type', () => {
      const rs = getEventType('ram_service')
      expect(rs.emoji).toBe('🐏')
      expect(rs.species).toEqual(['sheep'])
    })

    it('returns lambing event type', () => {
      const l = getEventType('lambing')
      expect(l.emoji).toBe('🐑')
      expect(l.species).toEqual(['sheep'])
    })

    it('every event type has an icon field', () => {
      for (const et of BREEDING_EVENT_TYPES) {
        expect(typeof et.icon).toBe('string')
        expect(et.icon.length).toBeGreaterThan(0)
      }
    })

    it('heat_observed icon is flame', () => {
      const heat = getEventType('heat_observed')
      expect(heat.icon).toBe('flame')
    })

    it('calving and lambing share baby icon', () => {
      expect(getEventType('calving').icon).toBe('baby')
      expect(getEventType('lambing').icon).toBe('baby')
    })

    it('dry_off icon is leaf', () => {
      expect(getEventType('dry_off').icon).toBe('leaf')
    })
  })

  describe('getEventTypesForSpecies', () => {
    it('returns cattle-specific events for cattle', () => {
      const types = getEventTypesForSpecies('cattle')
      const codes = types.map((t) => t.code)
      expect(codes).toContain('bull_service')
      expect(codes).toContain('calving')
      expect(codes).toContain('dry_off')
      expect(codes).not.toContain('ram_service')
      expect(codes).not.toContain('lambing')
    })

    it('returns sheep-specific events for sheep', () => {
      const types = getEventTypesForSpecies('sheep')
      const codes = types.map((t) => t.code)
      expect(codes).toContain('ram_service')
      expect(codes).toContain('lambing')
      expect(codes).not.toContain('bull_service')
      expect(codes).not.toContain('calving')
      expect(codes).not.toContain('dry_off')
    })

    it('includes universal events for both species', () => {
      const cattleCodes = getEventTypesForSpecies('cattle').map((t) => t.code)
      const sheepCodes = getEventTypesForSpecies('sheep').map((t) => t.code)
      for (const code of [
        'heat_observed',
        'ai_insemination',
        'preg_check_positive',
        'preg_check_negative',
        'abortion',
      ]) {
        expect(cattleCodes).toContain(code)
        expect(sheepCodes).toContain(code)
      }
    })

    it('returns only universal events for unknown species', () => {
      const types = getEventTypesForSpecies('goat')
      const codes = types.map((t) => t.code)
      expect(codes).not.toContain('bull_service')
      expect(codes).not.toContain('ram_service')
      expect(codes).toContain('heat_observed')
    })

    it('returns events sorted by sort order', () => {
      const types = getEventTypesForSpecies('cattle')
      for (let i = 1; i < types.length; i++) {
        expect(types[i].sort).toBeGreaterThanOrEqual(types[i - 1].sort)
      }
    })
  })
})
