import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useMedicationsStore } from '../stores/medications'
import api from '../services/api.js'
import db from '../db/indexedDB.js'

vi.mock('../services/api.js', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../db/indexedDB.js', () => ({
  default: {
    medications: {
      bulkPut: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      toArray: vi.fn().mockResolvedValue([]),
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

const MED_FIXTURE = {
  id: 'med-1',
  name: 'Penicillin',
  active_ingredient: 'Penicillin G',
  withdrawal_milk_hours: 72,
  withdrawal_meat_days: 14,
  is_active: true,
}

describe('useMedicationsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── fetchAll ───────────────────────────────────────────────────────────────

  describe('fetchAll', () => {
    it('fetches active medications by default', async () => {
      api.get.mockResolvedValue({ data: [MED_FIXTURE], headers: { 'x-total-count': '1' } })

      const store = useMedicationsStore()
      await store.fetchAll()

      expect(api.get).toHaveBeenCalledWith('/medications', { params: {} })
      expect(store.medications).toEqual([MED_FIXTURE])
      expect(store.total).toBe(1)
    })

    it('sends ?all=1 when includeInactive is true', async () => {
      api.get.mockResolvedValue({ data: [], headers: { 'x-total-count': '0' } })

      const store = useMedicationsStore()
      await store.fetchAll(true)

      expect(api.get).toHaveBeenCalledWith('/medications', { params: { all: 1 } })
    })

    it('falls back to IndexedDB on failure', async () => {
      const localData = [MED_FIXTURE]
      api.get.mockRejectedValue(new Error('Network error'))
      db.medications.toArray.mockResolvedValue(localData)

      const store = useMedicationsStore()
      await store.fetchAll()

      expect(store.medications).toEqual(localData)
    })

    it('persists to IndexedDB on success', async () => {
      api.get.mockResolvedValue({ data: [MED_FIXTURE], headers: { 'x-total-count': '1' } })

      const store = useMedicationsStore()
      await store.fetchAll()

      expect(db.medications.bulkPut).toHaveBeenCalledWith([MED_FIXTURE])
    })

    it('filters inactive meds in offline fallback when not includeInactive', async () => {
      const allMeds = [
        MED_FIXTURE,
        { ...MED_FIXTURE, id: 'med-2', name: 'Inactive Med', is_active: false },
      ]
      api.get.mockRejectedValue(new Error('offline'))
      db.medications.toArray.mockResolvedValue(allMeds)

      const store = useMedicationsStore()
      await store.fetchAll(false)

      expect(store.medications).toHaveLength(1)
      expect(store.medications[0].id).toBe('med-1')
    })
  })

  // ─── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('posts to /medications and adds to store', async () => {
      const created = { ...MED_FIXTURE, id: 'new-1' }
      api.post.mockResolvedValue({ data: created })

      const store = useMedicationsStore()
      const result = await store.create({ name: 'Penicillin' })

      expect(api.post).toHaveBeenCalledWith('/medications', { name: 'Penicillin' })
      expect(store.medications).toContainEqual(created)
      expect(result).toEqual(created)
    })
  })

  // ─── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('puts to /medications/:id and replaces in state', async () => {
      const updated = { ...MED_FIXTURE, name: 'Amoxicillin' }
      api.put.mockResolvedValue({ data: updated })
      db.medications.get.mockResolvedValue(MED_FIXTURE)

      const store = useMedicationsStore()
      store.medications = [MED_FIXTURE]

      const result = await store.update('med-1', { name: 'Amoxicillin' })

      expect(api.put).toHaveBeenCalledWith('/medications/med-1', { name: 'Amoxicillin' })
      expect(store.medications[0].name).toBe('Amoxicillin')
      expect(result).toEqual(updated)
    })
  })

  // ─── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes from /medications/:id and removes from state', async () => {
      api.delete.mockResolvedValue({})

      const store = useMedicationsStore()
      store.medications = [MED_FIXTURE, { ...MED_FIXTURE, id: 'med-2' }]

      await store.remove('med-1')

      expect(api.delete).toHaveBeenCalledWith('/medications/med-1')
      expect(store.medications).toHaveLength(1)
      expect(store.medications[0].id).toBe('med-2')
    })
  })
})
