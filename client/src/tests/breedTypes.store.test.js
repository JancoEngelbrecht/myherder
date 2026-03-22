import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useBreedTypesStore } from '../stores/breedTypes.js'
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
    breedTypes: {
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

const BREED_FIXTURE = {
  id: 'bt-1',
  code: 'holstein',
  name: 'Holstein',
  heat_cycle_days: 21,
  gestation_days: 280,
  preg_check_days: 35,
  dry_off_days: 60,
  is_active: true,
  sort_order: 0,
}

describe('useBreedTypesStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── fetchAll ───────────────────────────────────────────────────────────────

  describe('fetchAll', () => {
    it('fetches all breed types and stores them', async () => {
      api.get.mockResolvedValue({ data: [BREED_FIXTURE] })

      const store = useBreedTypesStore()
      await store.fetchAll()

      expect(api.get).toHaveBeenCalledWith('/breed-types?all=1')
      expect(store.types).toEqual([BREED_FIXTURE])
    })

    it('falls back to IndexedDB when API fails', async () => {
      const localData = [{ ...BREED_FIXTURE, id: 'local-1' }]
      api.get.mockRejectedValue(new Error('Network error'))
      db.breedTypes.toArray.mockResolvedValue(localData)

      const store = useBreedTypesStore()
      await store.fetchAll()

      expect(store.types).toEqual(localData)
    })

    it('falls back to FALLBACK when API fails and IndexedDB is empty', async () => {
      api.get.mockRejectedValue(new Error('Network error'))
      db.breedTypes.toArray.mockResolvedValue([])

      const store = useBreedTypesStore()
      await store.fetchAll()

      // FALLBACK has 5 items
      expect(store.types.length).toBe(5)
      expect(store.types[0].code).toBe('holstein')
    })

    it('persists API data to IndexedDB', async () => {
      api.get.mockResolvedValue({ data: [BREED_FIXTURE] })

      const store = useBreedTypesStore()
      await store.fetchAll()

      expect(db.breedTypes.bulkPut).toHaveBeenCalledWith([BREED_FIXTURE])
    })
  })

  // ─── fetchActive ────────────────────────────────────────────────────────────

  describe('fetchActive', () => {
    it('fetches active-only breed types', async () => {
      api.get.mockResolvedValue({ data: [BREED_FIXTURE] })

      const store = useBreedTypesStore()
      await store.fetchActive()

      expect(api.get).toHaveBeenCalledWith('/breed-types')
      expect(store.types).toEqual([BREED_FIXTURE])
    })
  })

  // ─── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('posts to /breed-types and adds to store', async () => {
      const created = { ...BREED_FIXTURE, id: 'new-1' }
      api.post.mockResolvedValue({ data: created })

      const store = useBreedTypesStore()
      const result = await store.create({ name: 'Holstein' })

      expect(api.post).toHaveBeenCalledWith('/breed-types', { name: 'Holstein' })
      expect(store.types).toContainEqual(created)
      expect(result).toEqual(created)
    })
  })

  // ─── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('puts to /breed-types/:id and replaces in state', async () => {
      const updated = { ...BREED_FIXTURE, name: 'Holstein Friesian' }
      api.put.mockResolvedValue({ data: updated })
      db.breedTypes.get.mockResolvedValue(BREED_FIXTURE)

      const store = useBreedTypesStore()
      store.types = [BREED_FIXTURE]

      const result = await store.update('bt-1', { name: 'Holstein Friesian' })

      expect(api.put).toHaveBeenCalledWith('/breed-types/bt-1', { name: 'Holstein Friesian' })
      expect(store.types[0].name).toBe('Holstein Friesian')
      expect(result).toEqual(updated)
    })
  })

  // ─── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes from /breed-types/:id and removes from state', async () => {
      api.delete.mockResolvedValue({})

      const store = useBreedTypesStore()
      store.types = [BREED_FIXTURE, { ...BREED_FIXTURE, id: 'bt-2', code: 'jersey' }]

      await store.remove('bt-1')

      expect(api.delete).toHaveBeenCalledWith('/breed-types/bt-1')
      expect(store.types).toHaveLength(1)
      expect(store.types[0].id).toBe('bt-2')
    })
  })

  // ─── getById ────────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('returns correct breed type by id', () => {
      const store = useBreedTypesStore()
      store.types = [
        BREED_FIXTURE,
        { ...BREED_FIXTURE, id: 'bt-2', code: 'jersey', name: 'Jersey' },
      ]

      const result = store.getById('bt-2')
      expect(result).not.toBeNull()
      expect(result.name).toBe('Jersey')
    })

    it('returns null when not found', () => {
      const store = useBreedTypesStore()
      store.types = [BREED_FIXTURE]

      expect(store.getById('nonexistent')).toBeNull()
    })
  })

  // ─── $reset ─────────────────────────────────────────────────────────────────

  describe('activeTypes', () => {
    it('returns only active types sorted by sort_order', () => {
      const store = useBreedTypesStore()
      store.types = [
        { ...BREED_FIXTURE, id: 'bt-2', is_active: false, sort_order: 0 },
        { ...BREED_FIXTURE, id: 'bt-1', is_active: true, sort_order: 1 },
        { ...BREED_FIXTURE, id: 'bt-3', is_active: true, sort_order: 0 },
      ]

      expect(store.activeTypes).toHaveLength(2)
      expect(store.activeTypes[0].id).toBe('bt-3') // sort_order 0 first
      expect(store.activeTypes[1].id).toBe('bt-1') // sort_order 1 second
    })
  })
})
