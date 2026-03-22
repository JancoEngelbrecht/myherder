import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useBreedingEventsStore } from '../stores/breedingEvents.js'
import api from '../services/api.js'

vi.mock('../services/api.js', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../db/indexedDB.js', () => ({
  default: {
    breedingEvents: {
      bulkPut: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      orderBy: vi.fn(() => ({
        reverse: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
      })),
      where: vi.fn(() => ({ equals: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })) })),
      toArray: vi.fn().mockResolvedValue([]),
    },
  },
}))

vi.mock('../services/syncManager', () => ({
  enqueue: vi.fn().mockResolvedValue(undefined),
  dequeueByEntityId: vi.fn().mockResolvedValue(undefined),
  isOfflineError: vi.fn().mockReturnValue(false),
}))

// setup.js creates a fresh Pinia before each test

const EVENT_FIXTURE = {
  id: 'ev-1',
  cow_id: 'cow-1',
  event_type: 'ai_insemination',
  event_date: '2026-02-01T10:00',
  tag_number: 'T-001',
  cow_name: 'Daisy',
  expected_calving: '2026-11-11',
  expected_dry_off: '2026-09-12',
}

describe('useBreedingEventsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── fetchAll — paginated (no cow_id) ────────────────────────────────────

  describe('fetchAll (paginated, no cow_id)', () => {
    it('stores events and total from paginated response', async () => {
      const payload = { data: [EVENT_FIXTURE], total: 42 }
      api.get.mockResolvedValue({ data: payload })

      const store = useBreedingEventsStore()
      const result = await store.fetchAll({ page: 1, limit: 20 })

      expect(api.get).toHaveBeenCalledWith('/breeding-events', { params: { page: 1, limit: 20 } })
      expect(store.events).toEqual([EVENT_FIXTURE])
      expect(store.total).toBe(42)
      expect(result).toEqual([EVENT_FIXTURE])
    })

    it('caches paginated data to IndexedDB', async () => {
      const payload = { data: [EVENT_FIXTURE], total: 1 }
      api.get.mockResolvedValue({ data: payload })

      const { default: db } = await import('../db/indexedDB.js')
      const store = useBreedingEventsStore()
      await store.fetchAll({ page: 1, limit: 20 })

      expect(db.breedingEvents.bulkPut).toHaveBeenCalledWith([EVENT_FIXTURE])
    })

    it('passes event_type filter to API', async () => {
      const payload = { data: [], total: 0 }
      api.get.mockResolvedValue({ data: payload })

      const store = useBreedingEventsStore()
      await store.fetchAll({ page: 1, limit: 20, event_type: 'calving' })

      expect(api.get).toHaveBeenCalledWith('/breeding-events', {
        params: { page: 1, limit: 20, event_type: 'calving' },
      })
    })

    it('falls back to IndexedDB on error and sets total to local count', async () => {
      const localEvents = [EVENT_FIXTURE, { ...EVENT_FIXTURE, id: 'ev-2' }]
      api.get.mockRejectedValue(new Error('Network'))

      const { default: db } = await import('../db/indexedDB.js')
      db.breedingEvents.orderBy.mockReturnValue({
        reverse: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue(localEvents) })),
      })

      const store = useBreedingEventsStore()
      const result = await store.fetchAll({ page: 1, limit: 20 })

      expect(store.events).toEqual(localEvents)
      expect(store.total).toBe(2)
      expect(result).toEqual(localEvents)
      expect(store.error).not.toBeNull()
    })
  })

  // ─── fetchAll — per-cow (plain array) ────────────────────────────────────

  describe('fetchAll (per-cow, plain array)', () => {
    it('returns plain array and does NOT update events/total', async () => {
      const cowEvents = [EVENT_FIXTURE]
      api.get.mockResolvedValue({ data: cowEvents })

      const store = useBreedingEventsStore()
      const result = await store.fetchAll({ cow_id: 'cow-1' })

      expect(api.get).toHaveBeenCalledWith('/breeding-events', { params: { cow_id: 'cow-1' } })
      expect(result).toEqual(cowEvents)
      // Per-cow fetch should NOT overwrite the global events list
      expect(store.events).toEqual([])
      expect(store.total).toBe(0)
    })

    it('caches per-cow data to IndexedDB', async () => {
      api.get.mockResolvedValue({ data: [EVENT_FIXTURE] })

      const { default: db } = await import('../db/indexedDB.js')
      const store = useBreedingEventsStore()
      await store.fetchAll({ cow_id: 'cow-1' })

      expect(db.breedingEvents.bulkPut).toHaveBeenCalledWith([EVENT_FIXTURE])
    })

    it('falls back to IndexedDB filtered by cow_id on error', async () => {
      api.get.mockRejectedValue(new Error('Offline'))

      const { default: db } = await import('../db/indexedDB.js')
      const mockEquals = vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([EVENT_FIXTURE]) }))
      db.breedingEvents.where.mockReturnValue({ equals: mockEquals })

      const store = useBreedingEventsStore()
      const result = await store.fetchAll({ cow_id: 'cow-1' })

      expect(db.breedingEvents.where).toHaveBeenCalledWith('cow_id')
      expect(mockEquals).toHaveBeenCalledWith('cow-1')
      expect(result).toEqual([EVENT_FIXTURE])
    })
  })

  // ─── fetchForCow shorthand ───────────────────────────────────────────────

  describe('fetchForCow', () => {
    it('delegates to fetchAll with cow_id', async () => {
      api.get.mockResolvedValue({ data: [] })

      const store = useBreedingEventsStore()
      await store.fetchForCow('cow-1')

      expect(api.get).toHaveBeenCalledWith('/breeding-events', { params: { cow_id: 'cow-1' } })
    })
  })

  // ─── loading state ───────────────────────────────────────────────────────

  describe('loading state', () => {
    it('sets loading true during fetch, false after', async () => {
      let resolveReq
      api.get.mockReturnValue(
        new Promise((r) => {
          resolveReq = () => r({ data: { data: [], total: 0 } })
        })
      )

      const store = useBreedingEventsStore()
      const p = store.fetchAll({})
      expect(store.loading).toBe(true)

      resolveReq()
      await p
      expect(store.loading).toBe(false)
    })
  })

  // ─── fetchUpcoming ──────────────────────────────────────────────────────

  describe('fetchUpcoming', () => {
    it('populates upcoming categories from API response', async () => {
      const upcomingData = {
        heats: [{ id: 'h1' }],
        calvings: [{ id: 'c1' }],
        pregChecks: [{ id: 'p1' }],
        dryOffs: [{ id: 'd1' }],
        needsAttention: [{ id: 'n1', alert_type: 'heat' }],
      }
      api.get.mockResolvedValue({ data: upcomingData })

      const store = useBreedingEventsStore()
      await store.fetchUpcoming()

      expect(api.get).toHaveBeenCalledWith('/breeding-events/upcoming')
      expect(store.upcoming.heats).toEqual([{ id: 'h1' }])
      expect(store.upcoming.calvings).toEqual([{ id: 'c1' }])
      expect(store.upcoming.pregChecks).toEqual([{ id: 'p1' }])
      expect(store.upcoming.dryOffs).toEqual([{ id: 'd1' }])
      expect(store.upcoming.needsAttention).toEqual([{ id: 'n1', alert_type: 'heat' }])
    })

    it('handles missing keys gracefully', async () => {
      api.get.mockResolvedValue({ data: {} })

      const store = useBreedingEventsStore()
      await store.fetchUpcoming()

      expect(store.upcoming.heats).toEqual([])
      expect(store.upcoming.dryOffs).toEqual([])
      expect(store.upcoming.needsAttention).toEqual([])
    })
  })

  // ─── createEvent ────────────────────────────────────────────────────────

  describe('createEvent', () => {
    it('creates event and prepends to events list', async () => {
      const serverEvent = { ...EVENT_FIXTURE, id: 'server-id' }
      api.post.mockResolvedValue({ data: serverEvent })
      api.get.mockResolvedValue({
        data: { heats: [], calvings: [], pregChecks: [], dryOffs: [], needsAttention: [] },
      })

      const store = useBreedingEventsStore()
      const result = await store.createEvent({
        cow_id: 'cow-1',
        event_type: 'ai_insemination',
        event_date: '2026-02-01',
      })

      expect(api.post).toHaveBeenCalledWith('/breeding-events', expect.any(Object))
      expect(result).toEqual(serverEvent)
      expect(store.events[0]).toEqual(serverEvent)
    })

    it('stores locally and enqueues on offline error', async () => {
      api.post.mockRejectedValue(new Error('Network'))
      const { isOfflineError } = await import('../services/syncManager')
      isOfflineError.mockReturnValue(true)

      const store = useBreedingEventsStore()
      const result = await store.createEvent({
        cow_id: 'cow-1',
        event_type: 'heat_observed',
        event_date: '2026-02-01',
      })

      expect(result).toBeDefined()
      expect(result.cow_id).toBe('cow-1')
      expect(store.events).toHaveLength(1)
    })
  })

  // ─── updateEvent ────────────────────────────────────────────────────────

  describe('updateEvent', () => {
    it('updates event and replaces in events list', async () => {
      const updated = { ...EVENT_FIXTURE, notes: 'updated' }
      api.patch.mockResolvedValue({ data: updated })
      api.get.mockResolvedValue({
        data: { heats: [], calvings: [], pregChecks: [], dryOffs: [], needsAttention: [] },
      })

      const { default: db } = await import('../db/indexedDB.js')
      db.breedingEvents.get.mockResolvedValue(EVENT_FIXTURE)

      const store = useBreedingEventsStore()
      store.events = [EVENT_FIXTURE]
      const result = await store.updateEvent('ev-1', { notes: 'updated' })

      expect(api.patch).toHaveBeenCalledWith('/breeding-events/ev-1', { notes: 'updated' })
      expect(result.notes).toBe('updated')
      expect(store.events[0].notes).toBe('updated')
    })
  })

  // ─── dismissEvent ───────────────────────────────────────────────────────

  describe('dismissEvent', () => {
    it('dismisses event via API', async () => {
      const dismissed = { ...EVENT_FIXTURE, dismissed_at: '2026-02-01T00:00:00Z' }
      api.patch.mockResolvedValue({ data: dismissed })
      api.get.mockResolvedValue({
        data: { heats: [], calvings: [], pregChecks: [], dryOffs: [], needsAttention: [] },
      })

      const { default: db } = await import('../db/indexedDB.js')
      db.breedingEvents.get.mockResolvedValue(EVENT_FIXTURE)

      const store = useBreedingEventsStore()
      store.events = [EVENT_FIXTURE]
      const result = await store.dismissEvent('ev-1', 'Already handled')

      expect(api.patch).toHaveBeenCalledWith('/breeding-events/ev-1/dismiss', {
        reason: 'Already handled',
      })
      expect(result.dismissed_at).toBeDefined()
    })
  })

  // ─── deleteEvent ────────────────────────────────────────────────────────

  describe('deleteEvent', () => {
    it('deletes event and removes from list', async () => {
      api.delete.mockResolvedValue({})

      const store = useBreedingEventsStore()
      store.events = [EVENT_FIXTURE, { ...EVENT_FIXTURE, id: 'ev-2' }]
      await store.deleteEvent('ev-1')

      expect(api.delete).toHaveBeenCalledWith('/breeding-events/ev-1')
      expect(store.events).toHaveLength(1)
      expect(store.events[0].id).toBe('ev-2')
    })

    it('restores event on non-offline error', async () => {
      const err = new Error('Server error')
      api.delete.mockRejectedValue(err)
      const { isOfflineError } = await import('../services/syncManager')
      isOfflineError.mockReturnValue(false)

      const store = useBreedingEventsStore()
      store.events = [EVENT_FIXTURE]

      await expect(store.deleteEvent('ev-1')).rejects.toThrow('Server error')
      expect(store.events).toHaveLength(1)
    })
  })

  // ─── computed helpers ───────────────────────────────────────────────────

  describe('upcomingCount', () => {
    it('sums all upcoming categories', async () => {
      const data = {
        heats: [{ id: '1' }, { id: '2' }],
        calvings: [{ id: '3' }],
        pregChecks: [],
        dryOffs: [{ id: '4' }],
        needsAttention: [{ id: '5' }],
      }
      api.get.mockResolvedValue({ data })

      const store = useBreedingEventsStore()
      await store.fetchUpcoming()

      expect(store.upcomingCount).toBe(5)
    })
  })

  describe('latestForCow', () => {
    it('returns the latest event for a cow', () => {
      const store = useBreedingEventsStore()
      store.events = [
        { ...EVENT_FIXTURE, id: 'ev-old', cow_id: 'cow-1', event_date: '2026-01-01' },
        { ...EVENT_FIXTURE, id: 'ev-new', cow_id: 'cow-1', event_date: '2026-02-15' },
        { ...EVENT_FIXTURE, id: 'ev-other', cow_id: 'cow-2', event_date: '2026-03-01' },
      ]

      const latest = store.latestForCow('cow-1')
      expect(latest.id).toBe('ev-new')
    })

    it('returns null when no events for cow', () => {
      const store = useBreedingEventsStore()
      store.events = []
      expect(store.latestForCow('cow-1')).toBeNull()
    })
  })

  describe('gestationPercent', () => {
    it('returns 0-100 progress', () => {
      const store = useBreedingEventsStore()
      // Far future calving date → low progress
      const pct = store.gestationPercent('2027-01-01', 283)
      expect(pct).toBeGreaterThanOrEqual(0)
      expect(pct).toBeLessThanOrEqual(100)
    })

    it('returns null when no expected calving', () => {
      const store = useBreedingEventsStore()
      expect(store.gestationPercent(null)).toBeNull()
    })
  })
})
