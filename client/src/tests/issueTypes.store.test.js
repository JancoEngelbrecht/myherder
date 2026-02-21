import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useIssueTypesStore } from '../stores/issueTypes.js'
import api from '../services/api.js'

vi.mock('../services/api.js', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

// setup.js creates a fresh Pinia before each test

describe('useIssueTypesStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── fetchAll ─────────────────────────────────────────────────────────────

  describe('fetchAll', () => {
    it('fetches active types and stores them', async () => {
      const types = [
        { id: '1', code: 'mastitis', name: 'Mastitis', emoji: '🩺', is_active: 1 },
        { id: '2', code: 'lameness', name: 'Lameness', emoji: '🦶', is_active: 1 },
      ]
      api.get.mockResolvedValue({ data: types, headers: { 'x-total-count': '2' } })

      const store = useIssueTypesStore()
      await store.fetchAll()

      expect(api.get).toHaveBeenCalledWith('/issue-types', { params: {} })
      expect(store.issueTypes).toEqual(types)
      expect(store.total).toBe(2)
    })

    it('passes all=1 when includeInactive is true', async () => {
      api.get.mockResolvedValue({ data: [], headers: { 'x-total-count': '0' } })

      const store = useIssueTypesStore()
      await store.fetchAll(true)

      expect(api.get).toHaveBeenCalledWith('/issue-types', { params: { all: '1' } })
    })

    it('passes pagination params when provided', async () => {
      api.get.mockResolvedValue({ data: [], headers: { 'x-total-count': '0' } })

      const store = useIssueTypesStore()
      await store.fetchAll(false, { page: 2, limit: 10 })

      expect(api.get).toHaveBeenCalledWith('/issue-types', { params: { page: 2, limit: 10 } })
    })

    it('sets loading true during fetch, false after', async () => {
      let resolveRequest
      api.get.mockReturnValue(
        new Promise((resolve) => {
          resolveRequest = () => resolve({ data: [], headers: { 'x-total-count': '0' } })
        }),
      )

      const store = useIssueTypesStore()
      const fetchPromise = store.fetchAll()
      expect(store.loading).toBe(true)

      resolveRequest()
      await fetchPromise
      expect(store.loading).toBe(false)
    })
  })

  // ─── activeTypes ──────────────────────────────────────────────────────────

  describe('activeTypes', () => {
    it('returns only is_active truthy types', () => {
      const store = useIssueTypesStore()
      store.issueTypes = [
        { id: '1', code: 'a', is_active: 1 },
        { id: '2', code: 'b', is_active: 0 },
        { id: '3', code: 'c', is_active: true },
      ]
      expect(store.activeTypes).toHaveLength(2)
      expect(store.activeTypes.map((t) => t.code)).toEqual(['a', 'c'])
    })
  })

  // ─── getByCode ────────────────────────────────────────────────────────────

  describe('getByCode', () => {
    it('returns the matching type by code', () => {
      const store = useIssueTypesStore()
      store.issueTypes = [
        { id: '1', code: 'mastitis', name: 'Mastitis', emoji: '🩺' },
        { id: '2', code: 'lameness', name: 'Lameness', emoji: '🦶' },
      ]
      const result = store.getByCode('mastitis')
      expect(result).not.toBeNull()
      expect(result.name).toBe('Mastitis')
    })

    it('returns null when the code is not found', () => {
      const store = useIssueTypesStore()
      store.issueTypes = [{ id: '1', code: 'mastitis', name: 'Mastitis' }]
      expect(store.getByCode('unknown')).toBeNull()
    })

    it('returns null when the store is empty', () => {
      const store = useIssueTypesStore()
      expect(store.getByCode('anything')).toBeNull()
    })
  })

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('posts to /issue-types and appends the new type', async () => {
      const newType = { id: 'new-1', code: 'pinkeye', name: 'Pink Eye', emoji: '👁️', is_active: 1 }
      api.post.mockResolvedValue({ data: newType })

      const store = useIssueTypesStore()
      const result = await store.create({ name: 'Pink Eye', emoji: '👁️' })

      expect(api.post).toHaveBeenCalledWith('/issue-types', { name: 'Pink Eye', emoji: '👁️' })
      expect(store.issueTypes).toContainEqual(newType)
      expect(result).toEqual(newType)
    })
  })

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('puts to /issue-types/:id and replaces the type in state', async () => {
      const original = { id: 'type-1', code: 'mastitis', name: 'Mastitis', emoji: '🩺' }
      const updated = { ...original, name: 'Bovine Mastitis' }
      api.put.mockResolvedValue({ data: updated })

      const store = useIssueTypesStore()
      store.issueTypes = [original]

      const result = await store.update('type-1', { name: 'Bovine Mastitis', emoji: '🩺' })

      expect(api.put).toHaveBeenCalledWith('/issue-types/type-1', {
        name: 'Bovine Mastitis',
        emoji: '🩺',
      })
      expect(store.issueTypes[0].name).toBe('Bovine Mastitis')
      expect(result).toEqual(updated)
    })

    it('does nothing to state if the id is not found locally', async () => {
      const existing = { id: 'other', code: 'lameness', name: 'Lameness', emoji: '🦶' }
      const updated = { id: 'missing', code: 'pinkeye', name: 'Pink Eye', emoji: '👁️' }
      api.put.mockResolvedValue({ data: updated })

      const store = useIssueTypesStore()
      store.issueTypes = [existing]

      await store.update('missing', { name: 'Pink Eye', emoji: '👁️' })

      expect(store.issueTypes).toHaveLength(1)
      expect(store.issueTypes[0].id).toBe('other')
    })
  })

  // ─── remove ───────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes from /issue-types/:id and removes from state', async () => {
      api.delete.mockResolvedValue({})

      const store = useIssueTypesStore()
      store.issueTypes = [
        { id: 'keep-1', code: 'lameness', name: 'Lameness' },
        { id: 'del-1', code: 'mastitis', name: 'Mastitis' },
      ]

      await store.remove('del-1')

      expect(api.delete).toHaveBeenCalledWith('/issue-types/del-1')
      expect(store.issueTypes).toHaveLength(1)
      expect(store.issueTypes[0].id).toBe('keep-1')
    })
  })
})
