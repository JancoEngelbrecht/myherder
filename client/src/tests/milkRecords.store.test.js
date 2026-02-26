import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useMilkRecordsStore } from '../stores/milkRecords.js'
import api from '../services/api.js'

vi.mock('../services/api.js', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

vi.mock('../db/indexedDB.js', () => ({
  default: {
    milkRecords: {
      bulkPut: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          and: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
        })),
        toArray: vi.fn().mockResolvedValue([]),
      })),
    },
  },
}))

vi.mock('../services/syncManager', () => ({
  enqueue: vi.fn().mockResolvedValue(undefined),
  dequeueByEntityId: vi.fn().mockResolvedValue(undefined),
  isOfflineError: vi.fn().mockReturnValue(false),
}))

const RECORD = {
  id: 'rec-1',
  cow_id: 'cow-1',
  session: 'morning',
  recording_date: '2026-02-22',
  litres: 12.5,
  milk_discarded: false,
  discard_reason: null,
  tag_number: 'T-001',
  cow_name: 'Bessie',
}

describe('useMilkRecordsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ─── fetchSession ─────────────────────────────────────────────────────────

  describe('fetchSession', () => {
    it('fetches records for a session and populates the records map', async () => {
      api.get.mockResolvedValue({ data: [RECORD] })

      const store = useMilkRecordsStore()
      await store.fetchSession('2026-02-22', 'morning')

      expect(api.get).toHaveBeenCalledWith('/milk-records', {
        params: { date: '2026-02-22', session: 'morning' },
      })
      expect(store.getRecord('cow-1')).toEqual(RECORD)
      expect(store.currentDate).toBe('2026-02-22')
      expect(store.currentSession).toBe('morning')
    })

    it('clears stale records before loading new session', async () => {
      api.get.mockResolvedValueOnce({ data: [RECORD] })
      api.get.mockResolvedValueOnce({ data: [] })

      const store = useMilkRecordsStore()
      await store.fetchSession('2026-02-22', 'morning')
      expect(store.getRecord('cow-1')).not.toBeNull()

      await store.fetchSession('2026-02-22', 'afternoon')
      expect(store.getRecord('cow-1')).toBeNull()
    })

    it('falls back to IndexedDB on network error and sets error', async () => {
      const localRecord = { ...RECORD, id: 'local-1' }
      api.get.mockRejectedValue(new Error('Network error'))

      const { default: db } = await import('../db/indexedDB.js')
      db.milkRecords.where.mockReturnValue({
        equals: vi.fn(() => ({
          and: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([localRecord]) })),
        })),
      })

      const store = useMilkRecordsStore()
      await store.fetchSession('2026-02-22', 'morning')

      expect(store.getRecord('cow-1')).toEqual(localRecord)
      expect(store.error).not.toBeNull()
    })

    it('sets loading true during fetch, false after', async () => {
      let resolve
      api.get.mockReturnValue(new Promise((r) => { resolve = () => r({ data: [] }) }))

      const store = useMilkRecordsStore()
      const p = store.fetchSession('2026-02-22', 'morning')
      expect(store.loading).toBe(true)

      resolve()
      await p
      expect(store.loading).toBe(false)
    })
  })

  // ─── autoSave / _persist ──────────────────────────────────────────────────

  describe('autoSave', () => {
    it('sets syncStatus to saving immediately', () => {
      api.post.mockResolvedValue({ data: RECORD })

      const store = useMilkRecordsStore()
      store.currentSession = 'morning'
      store.currentDate = '2026-02-22'

      store.autoSave('cow-1', 12.5, 'morning', '2026-02-22')
      expect(store.getStatus('cow-1')).toBe('saving')
    })

    it('POSTs a new record after debounce when no existing record', async () => {
      api.get.mockResolvedValue({ data: [] })
      api.post.mockResolvedValue({ data: RECORD })

      const store = useMilkRecordsStore()
      await store.fetchSession('2026-02-22', 'morning')

      store.autoSave('cow-1', 12.5, 'morning', '2026-02-22')
      await vi.runAllTimersAsync()

      expect(api.post).toHaveBeenCalledWith('/milk-records', expect.objectContaining({
        cow_id: 'cow-1',
        session: 'morning',
        recording_date: '2026-02-22',
        litres: 12.5,
      }))
      expect(store.getRecord('cow-1')).toEqual(RECORD)
      expect(store.getStatus('cow-1')).toBe('saved')
    })

    it('PUTs an existing record after debounce', async () => {
      api.get.mockResolvedValue({ data: [RECORD] })
      api.put.mockResolvedValue({ data: { ...RECORD, litres: 15 } })

      const store = useMilkRecordsStore()
      await store.fetchSession('2026-02-22', 'morning')

      store.autoSave('cow-1', 15, 'morning', '2026-02-22')
      await vi.runAllTimersAsync()

      expect(api.put).toHaveBeenCalledWith('/milk-records/rec-1', expect.objectContaining({ litres: 15 }))
      expect(store.getRecord('cow-1').litres).toBe(15)
      expect(store.getStatus('cow-1')).toBe('saved')
    })

    it('debounces — only one API call when typed rapidly', async () => {
      api.get.mockResolvedValue({ data: [] })
      api.post.mockResolvedValue({ data: RECORD })

      const store = useMilkRecordsStore()
      await store.fetchSession('2026-02-22', 'morning')

      store.autoSave('cow-1', 1, 'morning', '2026-02-22')
      store.autoSave('cow-1', 2, 'morning', '2026-02-22')
      store.autoSave('cow-1', 3, 'morning', '2026-02-22')
      await vi.runAllTimersAsync()

      expect(api.post).toHaveBeenCalledTimes(1)
      expect(api.post).toHaveBeenCalledWith('/milk-records', expect.objectContaining({ litres: 3 }))
    })

    it('recovers from 409 by PUTting the existing record id', async () => {
      api.get.mockResolvedValue({ data: [] })
      const conflictError = Object.assign(new Error('Conflict'), {
        response: { status: 409, data: { id: 'existing-id' } },
      })
      api.post.mockRejectedValue(conflictError)
      api.put.mockResolvedValue({ data: { ...RECORD, id: 'existing-id' } })

      const store = useMilkRecordsStore()
      await store.fetchSession('2026-02-22', 'morning')

      store.autoSave('cow-1', 12.5, 'morning', '2026-02-22')
      await vi.runAllTimersAsync()

      expect(api.put).toHaveBeenCalledWith('/milk-records/existing-id', expect.any(Object))
      expect(store.getStatus('cow-1')).toBe('saved')
    })

    it('sets syncStatus to error on unrecoverable failure', async () => {
      api.get.mockResolvedValue({ data: [] })
      api.post.mockRejectedValue(new Error('Server error'))

      const store = useMilkRecordsStore()
      await store.fetchSession('2026-02-22', 'morning')

      store.autoSave('cow-1', 12.5, 'morning', '2026-02-22')
      await vi.runAllTimersAsync()

      expect(store.getStatus('cow-1')).toBe('error')
    })
  })

  // ─── Race condition guard ─────────────────────────────────────────────────

  describe('race condition guard', () => {
    it('flushes pending write before switching session, then debounce is a no-op', async () => {
      api.get.mockResolvedValue({ data: [] })
      api.post.mockResolvedValue({ data: RECORD })

      const store = useMilkRecordsStore()
      await store.fetchSession('2026-02-22', 'morning')

      // User types in morning session
      store.autoSave('cow-1', 12.5, 'morning', '2026-02-22')

      // User switches to afternoon BEFORE debounce fires —
      // fetchSession calls flushPending() which persists the morning data immediately
      await store.fetchSession('2026-02-22', 'afternoon')

      // POST was called once by flushPending (morning data saved, not lost)
      expect(api.post).toHaveBeenCalledTimes(1)
      expect(api.post).toHaveBeenCalledWith('/milk-records', expect.objectContaining({
        cow_id: 'cow-1',
        session: 'morning',
        recording_date: '2026-02-22',
      }))

      // Debounce timer should have been cleared — no additional calls
      api.post.mockClear()
      await vi.runAllTimersAsync()
      expect(api.post).not.toHaveBeenCalled()

      // Current session is afternoon, so morning record is not in reactive state
      expect(store.getRecord('cow-1')).toBeNull()
    })
  })

  // ─── getRecord / getStatus ────────────────────────────────────────────────

  describe('getRecord', () => {
    it('returns null when no record exists for a cow', () => {
      const store = useMilkRecordsStore()
      expect(store.getRecord('unknown-cow')).toBeNull()
    })

    it('returns the record when it exists', async () => {
      api.get.mockResolvedValue({ data: [RECORD] })
      const store = useMilkRecordsStore()
      await store.fetchSession('2026-02-22', 'morning')
      expect(store.getRecord('cow-1')).toEqual(RECORD)
    })
  })

  describe('getStatus', () => {
    it('returns idle for an untouched cow', () => {
      const store = useMilkRecordsStore()
      expect(store.getStatus('cow-1')).toBe('idle')
    })

    it('reflects syncStatus after autoSave is called', () => {
      const store = useMilkRecordsStore()
      store.currentSession = 'morning'
      store.currentDate = '2026-02-22'

      store.autoSave('cow-1', 5, 'morning', '2026-02-22')
      expect(store.getStatus('cow-1')).toBe('saving')
    })
  })

  // ─── fetchCowHistory ──────────────────────────────────────────────────────

  describe('fetchCowHistory', () => {
    it('fetches all records for a cow', async () => {
      api.get.mockResolvedValue({ data: [RECORD] })

      const store = useMilkRecordsStore()
      const result = await store.fetchCowHistory('cow-1')

      expect(api.get).toHaveBeenCalledWith('/milk-records', { params: { cow_id: 'cow-1' } })
      expect(result).toEqual([RECORD])
    })

    it('falls back to IndexedDB on error and sets error', async () => {
      const localRecord = { ...RECORD }
      api.get.mockRejectedValue(new Error('Offline'))

      const { default: db } = await import('../db/indexedDB.js')
      db.milkRecords.where.mockReturnValue({
        equals: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([localRecord]) })),
        toArray: vi.fn().mockResolvedValue([localRecord]),
      })

      const store = useMilkRecordsStore()
      const result = await store.fetchCowHistory('cow-1')

      expect(store.error).not.toBeNull()
      expect(Array.isArray(result)).toBe(true)
    })
  })
})
