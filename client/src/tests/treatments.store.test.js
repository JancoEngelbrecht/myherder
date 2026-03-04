import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useTreatmentsStore } from '../stores/treatments.js'
import api from '../services/api.js'
import db from '../db/indexedDB.js'

vi.mock('../services/api.js', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../db/indexedDB.js', () => ({
  default: {
    treatments: {
      bulkPut: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      where: vi.fn(() => ({
        equals: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
        above: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
      })),
    },
  },
}))

vi.mock('../services/syncManager', () => ({
  enqueue: vi.fn().mockResolvedValue(undefined),
  dequeueByEntityId: vi.fn().mockResolvedValue(undefined),
  isOfflineError: vi.fn().mockReturnValue(false),
}))

vi.mock('../utils/apiError', () => ({
  extractApiError: vi.fn((err) => err.message),
}))

const TREATMENT_FIXTURE = {
  id: 'treat-1',
  cow_id: 'cow-1',
  medication_id: 'med-1',
  medication_name: 'Penicillin',
  dosage: '10ml',
  route: 'IM',
  cost: 50,
  treatment_date: '2026-01-15',
  administered_by_name: 'Test Admin',
}

describe('useTreatmentsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── fetchByCow ─────────────────────────────────────────────────────────────

  describe('fetchByCow', () => {
    it('fetches treatments for a cow and stores them', async () => {
      api.get.mockResolvedValue({ data: [TREATMENT_FIXTURE] })

      const store = useTreatmentsStore()
      const result = await store.fetchByCow('cow-1')

      expect(api.get).toHaveBeenCalledWith('/treatments', { params: { cow_id: 'cow-1' } })
      expect(store.treatments).toContainEqual(TREATMENT_FIXTURE)
      expect(result).toEqual([TREATMENT_FIXTURE])
    })

    it('falls back to IndexedDB on failure', async () => {
      const localData = [TREATMENT_FIXTURE]
      api.get.mockRejectedValue(new Error('Network error'))
      const mockToArray = vi.fn().mockResolvedValue(localData)
      db.treatments.where.mockReturnValue({
        equals: vi.fn().mockReturnValue({ toArray: mockToArray }),
      })

      const store = useTreatmentsStore()
      const result = await store.fetchByCow('cow-1')

      expect(result).toEqual(localData)
      expect(store.error).toBe('Network error')
    })

    it('persists API data to IndexedDB', async () => {
      api.get.mockResolvedValue({ data: [TREATMENT_FIXTURE] })

      const store = useTreatmentsStore()
      await store.fetchByCow('cow-1')

      expect(db.treatments.bulkPut).toHaveBeenCalledWith([TREATMENT_FIXTURE])
    })
  })

  // ─── fetchWithdrawal ────────────────────────────────────────────────────────

  describe('fetchWithdrawal', () => {
    it('fetches withdrawal list from API', async () => {
      const withdrawalData = [{ ...TREATMENT_FIXTURE, withdrawal_end_milk: '2026-02-01' }]
      api.get.mockResolvedValue({ data: withdrawalData })

      const store = useTreatmentsStore()
      const result = await store.fetchWithdrawal()

      expect(api.get).toHaveBeenCalledWith('/treatments/withdrawal')
      expect(store.withdrawalCows).toEqual(withdrawalData)
      expect(result).toEqual(withdrawalData)
    })
  })

  // ─── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('posts to /treatments and adds to store', async () => {
      const created = { ...TREATMENT_FIXTURE, id: 'new-1' }
      api.post.mockResolvedValue({ data: created })

      const store = useTreatmentsStore()
      const result = await store.create({ cow_id: 'cow-1', medication_id: 'med-1' })

      expect(api.post).toHaveBeenCalledWith('/treatments', { cow_id: 'cow-1', medication_id: 'med-1' })
      expect(store.treatments).toContainEqual(created)
      expect(result).toEqual(created)
    })

    it('enqueues to sync queue when offline', async () => {
      const { isOfflineError } = await import('../services/syncManager')
      isOfflineError.mockReturnValue(true)
      api.post.mockRejectedValue(new Error('offline'))

      const store = useTreatmentsStore()
      const result = await store.create({ cow_id: 'cow-1' })

      expect(result).toBeDefined()
      expect(store.treatments.length).toBe(1)
    })
  })

  // ─── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes from /treatments/:id and removes from state', async () => {
      api.delete.mockResolvedValue({})

      const store = useTreatmentsStore()
      store.treatments = [TREATMENT_FIXTURE, { ...TREATMENT_FIXTURE, id: 'treat-2' }]

      await store.remove('treat-1')

      expect(api.delete).toHaveBeenCalledWith('/treatments/treat-1')
      expect(store.treatments).toHaveLength(1)
      expect(store.treatments[0].id).toBe('treat-2')
    })

    it('enqueues to sync queue when offline delete', async () => {
      const { isOfflineError, enqueue } = await import('../services/syncManager')
      isOfflineError.mockReturnValue(true)
      api.delete.mockRejectedValue(new Error('offline'))

      const store = useTreatmentsStore()
      store.treatments = [TREATMENT_FIXTURE]

      await store.remove('treat-1')

      expect(enqueue).toHaveBeenCalledWith('treatments', 'delete', 'treat-1', { id: 'treat-1' })
      expect(store.treatments).toHaveLength(0)
    })
  })

  // ─── getById / getCowTreatments ─────────────────────────────────────────────

  describe('getById', () => {
    it('returns treatment by id', () => {
      const store = useTreatmentsStore()
      store.treatments = [TREATMENT_FIXTURE]

      expect(store.getById('treat-1')).toEqual(TREATMENT_FIXTURE)
    })

    it('returns null when not found', () => {
      const store = useTreatmentsStore()
      store.treatments = []

      expect(store.getById('nonexistent')).toBeNull()
    })
  })

  describe('getCowTreatments', () => {
    it('returns treatments for a specific cow', () => {
      const store = useTreatmentsStore()
      store.treatments = [
        TREATMENT_FIXTURE,
        { ...TREATMENT_FIXTURE, id: 'treat-2', cow_id: 'cow-2' },
      ]

      const result = store.getCowTreatments('cow-1')
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('treat-1')
    })
  })
})
