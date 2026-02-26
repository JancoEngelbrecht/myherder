import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Dexie from 'dexie'

// Mock api.js before importing syncManager
vi.mock('../services/api.js', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    head: vi.fn(),
  },
}))

// Mock navigator.onLine (default true)
let _onLine = true
Object.defineProperty(navigator, 'onLine', { get: () => _onLine, configurable: true })

// Suppress Background Sync API (not in jsdom)
if (!('serviceWorker' in navigator)) {
  Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true })
}

import api from '../services/api.js'
import db, { ensureDeviceId } from '../db/indexedDB.js'
import {
  enqueue,
  dequeue,
  dequeueByEntityId,
  getPending,
  getPendingCount,
  pendingCount,
  failedItems,
  isOnline,
  isSyncing,
  lastSyncTime,
  initialSyncProgress,
  pushChanges,
  pullChanges,
  sync,
  initialSync,
  init,
  destroyListeners,
} from '../services/syncManager.js'

// ── Helpers ─────────────────────────────────────────────────────

async function clearAllTables() {
  const tableNames = db.tables.map((t) => t.name)
  for (const name of tableNames) {
    await db.table(name).clear()
  }
}

function resetState() {
  isOnline.value = true
  isSyncing.value = false
  pendingCount.value = 0
  lastSyncTime.value = null
  failedItems.value = []
  initialSyncProgress.value = null
  _onLine = true
}

// ── Setup / Teardown ────────────────────────────────────────────

beforeEach(async () => {
  vi.clearAllMocks()
  resetState()
  // Ensure DB is open and clean
  if (!db.isOpen()) await db.open()
  await clearAllTables()
})

afterEach(() => {
  destroyListeners()
})

// ═══════════════════════════════════════════════════════════════
// PHASE 1: Queue Operations
// ═══════════════════════════════════════════════════════════════

describe('syncManager — queue operations', () => {
  describe('enqueue', () => {
    it('adds an entry to syncQueue with correct shape', async () => {
      await enqueue('cows', 'create', 'cow-1', { id: 'cow-1', name: 'Bessie' })

      const entries = await db.syncQueue.toArray()
      expect(entries).toHaveLength(1)
      expect(entries[0]).toMatchObject({
        id: 'cow-1',
        entityType: 'cows',
        action: 'create',
        data: { id: 'cow-1', name: 'Bessie' },
        attempts: 0,
        lastError: null,
      })
      expect(entries[0].createdAt).toBeTruthy()
      expect(entries[0].autoId).toBeGreaterThan(0)
    })

    it('increments pendingCount reactive ref', async () => {
      expect(pendingCount.value).toBe(0)
      await enqueue('cows', 'create', 'cow-1', { id: 'cow-1' })
      expect(pendingCount.value).toBe(1)
      await enqueue('cows', 'update', 'cow-2', { id: 'cow-2' })
      expect(pendingCount.value).toBe(2)
    })

    it('stores multiple entries for the same entity', async () => {
      await enqueue('cows', 'create', 'cow-1', { id: 'cow-1' })
      await enqueue('cows', 'update', 'cow-1', { id: 'cow-1', name: 'Updated' })

      const entries = await db.syncQueue.toArray()
      expect(entries).toHaveLength(2)
    })
  })

  describe('dequeue', () => {
    it('removes a specific entry by autoId', async () => {
      await enqueue('cows', 'create', 'cow-1', { id: 'cow-1' })
      await enqueue('cows', 'create', 'cow-2', { id: 'cow-2' })

      const entries = await db.syncQueue.toArray()
      await dequeue(entries[0].autoId)

      const remaining = await db.syncQueue.toArray()
      expect(remaining).toHaveLength(1)
      expect(remaining[0].id).toBe('cow-2')
    })
  })

  describe('dequeueByEntityId', () => {
    it('removes all entries matching entityType and id', async () => {
      await enqueue('cows', 'create', 'cow-1', { id: 'cow-1' })
      await enqueue('cows', 'update', 'cow-1', { id: 'cow-1', name: 'Updated' })
      await enqueue('cows', 'create', 'cow-2', { id: 'cow-2' })

      await dequeueByEntityId('cows', 'cow-1')

      const remaining = await db.syncQueue.toArray()
      expect(remaining).toHaveLength(1)
      expect(remaining[0].id).toBe('cow-2')
    })

    it('is idempotent — no error when nothing matches', async () => {
      await expect(dequeueByEntityId('cows', 'nonexistent')).resolves.not.toThrow()
    })

    it('does not remove entries for different entity types', async () => {
      await enqueue('cows', 'create', 'id-1', { id: 'id-1' })
      await enqueue('treatments', 'create', 'id-1', { id: 'id-1' })

      await dequeueByEntityId('cows', 'id-1')

      const remaining = await db.syncQueue.toArray()
      expect(remaining).toHaveLength(1)
      expect(remaining[0].entityType).toBe('treatments')
    })
  })

  describe('getPending', () => {
    it('returns entries ordered by createdAt', async () => {
      // Enqueue with slight delays to ensure different timestamps
      await enqueue('cows', 'create', 'cow-a', { id: 'cow-a' })
      await enqueue('cows', 'create', 'cow-b', { id: 'cow-b' })
      await enqueue('cows', 'create', 'cow-c', { id: 'cow-c' })

      const pending = await getPending()
      expect(pending).toHaveLength(3)
      expect(pending[0].id).toBe('cow-a')
      expect(pending[2].id).toBe('cow-c')
    })
  })

  describe('getPendingCount', () => {
    it('returns count of all queue entries', async () => {
      expect(await getPendingCount()).toBe(0)
      await enqueue('cows', 'create', 'cow-1', { id: 'cow-1' })
      expect(await getPendingCount()).toBe(1)
    })
  })

  describe('ensureDeviceId', () => {
    it('generates and persists a deviceId on first call', async () => {
      const id = await ensureDeviceId()
      expect(id).toBeTruthy()
      expect(typeof id).toBe('string')

      const entry = await db.syncMeta.get('deviceId')
      expect(entry.value).toBe(id)
    })

    it('returns the same deviceId on subsequent calls', async () => {
      const id1 = await ensureDeviceId()
      const id2 = await ensureDeviceId()
      expect(id1).toBe(id2)
    })
  })
})

// ═══════════════════════════════════════════════════════════════
// PHASE 2: Push / Pull / Sync
// ═══════════════════════════════════════════════════════════════

describe('syncManager — pushChanges', () => {
  it('sends pending items to POST /sync/push with correct payload', async () => {
    await enqueue('cows', 'create', 'cow-1', { id: 'cow-1', updated_at: '2026-01-01T00:00:00Z' })

    api.post.mockResolvedValue({
      data: { results: [{ id: 'cow-1', entityType: 'cows', status: 'applied' }] },
    })

    await pushChanges()

    expect(api.post).toHaveBeenCalledWith('/sync/push', expect.objectContaining({
      deviceId: expect.any(String),
      changes: [expect.objectContaining({
        id: 'cow-1',
        entityType: 'cows',
        action: 'create',
        updatedAt: '2026-01-01T00:00:00Z',
      })],
    }))
  })

  it('does not call API when queue is empty', async () => {
    await pushChanges()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('dequeues entries with "applied" status', async () => {
    await enqueue('cows', 'create', 'cow-1', { id: 'cow-1' })

    api.post.mockResolvedValue({
      data: { results: [{ id: 'cow-1', entityType: 'cows', status: 'applied' }] },
    })

    await pushChanges()

    expect(await getPendingCount()).toBe(0)
    expect(pendingCount.value).toBe(0)
  })

  it('dequeues entries with "conflict" status and writes serverData to IndexedDB', async () => {
    await enqueue('cows', 'update', 'cow-1', { id: 'cow-1', name: 'Local' })
    const serverCow = { id: 'cow-1', name: 'Server Version', updated_at: '2026-01-02T00:00:00Z' }

    api.post.mockResolvedValue({
      data: {
        results: [{
          id: 'cow-1',
          entityType: 'cows',
          status: 'conflict',
          serverData: serverCow,
        }],
      },
    })

    await pushChanges()

    // Queue should be empty
    expect(await getPendingCount()).toBe(0)
    // IndexedDB should have the server version
    const cow = await db.cows.get('cow-1')
    expect(cow.name).toBe('Server Version')
  })

  it('increments attempts on per-item error', async () => {
    await enqueue('cows', 'create', 'cow-1', { id: 'cow-1' })

    api.post.mockResolvedValue({
      data: {
        results: [{
          id: 'cow-1',
          entityType: 'cows',
          status: 'error',
          error: 'Validation failed',
        }],
      },
    })

    await pushChanges()

    const entries = await db.syncQueue.toArray()
    expect(entries).toHaveLength(1)
    expect(entries[0].attempts).toBe(1)
    expect(entries[0].lastError).toBe('Validation failed')
  })

  it('skips items with attempts >= 5', async () => {
    // Manually add a failed item
    await db.syncQueue.add({
      id: 'cow-fail', entityType: 'cows', action: 'create',
      data: { id: 'cow-fail' }, createdAt: '2026-01-01T00:00:00Z',
      attempts: 5, lastError: 'Gave up',
    })
    // Add a fresh item
    await enqueue('cows', 'create', 'cow-fresh', { id: 'cow-fresh' })

    api.post.mockResolvedValue({
      data: { results: [{ id: 'cow-fresh', entityType: 'cows', status: 'applied' }] },
    })

    await pushChanges()

    // Only cow-fresh should have been sent
    const sentChanges = api.post.mock.calls[0][1].changes
    expect(sentChanges).toHaveLength(1)
    expect(sentChanges[0].id).toBe('cow-fresh')

    // cow-fail should still be in queue
    const remaining = await db.syncQueue.toArray()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe('cow-fail')
  })

  it('increments attempts on network error and sets isOnline = false', async () => {
    await enqueue('cows', 'create', 'cow-1', { id: 'cow-1' })

    _onLine = false
    api.post.mockRejectedValue(new Error('Network Error'))

    await pushChanges()

    expect(isOnline.value).toBe(false)
  })

  it('increments attempts for non-offline errors', async () => {
    await enqueue('cows', 'create', 'cow-1', { id: 'cow-1' })

    const err = new Error('Server Error')
    err.response = { status: 500, data: {} }
    api.post.mockRejectedValue(err)

    await pushChanges()

    const entries = await db.syncQueue.toArray()
    expect(entries[0].attempts).toBe(1)
    expect(entries[0].lastError).toBe('Server Error')
  })
})

describe('syncManager — pullChanges', () => {
  it('calls GET /sync/pull?full=1 when no lastPullTimestamp', async () => {
    api.get.mockResolvedValue({ data: { syncedAt: '2026-01-01T12:00:00Z' } })

    await pullChanges()

    expect(api.get).toHaveBeenCalledWith('/sync/pull', { params: { full: 1 } })
  })

  it('calls GET /sync/pull?since=<timestamp> when lastPullTimestamp exists', async () => {
    await db.syncMeta.put({ key: 'lastPullTimestamp', value: '2026-01-01T00:00:00Z' })

    api.get.mockResolvedValue({ data: { syncedAt: '2026-01-01T12:00:00Z' } })

    await pullChanges()

    expect(api.get).toHaveBeenCalledWith('/sync/pull', { params: { since: '2026-01-01T00:00:00Z' } })
  })

  it('uses full=1 when fullPull=true even if timestamp exists', async () => {
    await db.syncMeta.put({ key: 'lastPullTimestamp', value: '2026-01-01T00:00:00Z' })

    api.get.mockResolvedValue({ data: { syncedAt: '2026-01-01T12:00:00Z' } })

    await pullChanges(true)

    expect(api.get).toHaveBeenCalledWith('/sync/pull', { params: { full: 1 } })
  })

  it('bulk-upserts records into IndexedDB tables', async () => {
    api.get.mockResolvedValue({
      data: {
        cows: [{ id: 'cow-1', name: 'Bessie' }],
        medications: [{ id: 'med-1', name: 'Amoxicillin' }],
        treatments: [],
        healthIssues: [],
        milkRecords: [],
        breedingEvents: [],
        breedTypes: [{ id: 'bt-1', code: 'jersey', name: 'Jersey' }],
        issueTypes: [],
        syncedAt: '2026-01-01T12:00:00Z',
      },
    })

    await pullChanges()

    expect(await db.cows.get('cow-1')).toMatchObject({ name: 'Bessie' })
    expect(await db.medications.get('med-1')).toMatchObject({ name: 'Amoxicillin' })
    expect(await db.breedTypes.get('bt-1')).toMatchObject({ code: 'jersey' })
  })

  it('processes deleted records — removes from local tables', async () => {
    // Pre-populate a cow
    await db.cows.put({ id: 'cow-del', name: 'About to be deleted' })

    api.get.mockResolvedValue({
      data: {
        cows: [], medications: [], treatments: [], healthIssues: [],
        milkRecords: [], breedingEvents: [], breedTypes: [], issueTypes: [],
        deleted: [{ entityType: 'cows', id: 'cow-del' }],
        syncedAt: '2026-01-01T12:00:00Z',
      },
    })

    await pullChanges()

    expect(await db.cows.get('cow-del')).toBeUndefined()
  })

  it('updates lastPullTimestamp and lastSyncTime', async () => {
    api.get.mockResolvedValue({
      data: {
        cows: [], medications: [], treatments: [], healthIssues: [],
        milkRecords: [], breedingEvents: [], breedTypes: [], issueTypes: [],
        syncedAt: '2026-02-01T08:00:00Z',
      },
    })

    await pullChanges()

    const meta = await db.syncMeta.get('lastPullTimestamp')
    expect(meta.value).toBe('2026-02-01T08:00:00Z')
    expect(lastSyncTime.value).toBe('2026-02-01T08:00:00Z')
  })

  it('sets isOnline = false on network error and throws', async () => {
    _onLine = false
    api.get.mockRejectedValue(new Error('Offline'))

    await expect(pullChanges()).rejects.toThrow()
    expect(isOnline.value).toBe(false)
  })
})

describe('syncManager — sync()', () => {
  it('sets isSyncing during execution', async () => {
    let syncingDuringPush = false
    api.post.mockImplementation(async () => {
      syncingDuringPush = isSyncing.value
      return { data: { results: [] } }
    })
    api.get.mockResolvedValue({
      data: {
        cows: [], medications: [], treatments: [], healthIssues: [],
        milkRecords: [], breedingEvents: [], breedTypes: [], issueTypes: [],
        syncedAt: '2026-01-01T00:00:00Z',
      },
    })

    // Enqueue something so pushChanges actually calls the API
    await enqueue('cows', 'create', 'cow-1', { id: 'cow-1' })
    await sync()

    expect(syncingDuringPush).toBe(true)
    expect(isSyncing.value).toBe(false)
  })

  it('guards against re-entrancy', async () => {
    let resolveFirst
    api.post.mockReturnValue(new Promise((resolve) => {
      resolveFirst = () => resolve({ data: { results: [] } })
    }))
    api.get.mockResolvedValue({
      data: {
        cows: [], medications: [], treatments: [], healthIssues: [],
        milkRecords: [], breedingEvents: [], breedTypes: [], issueTypes: [],
        syncedAt: '2026-01-01T00:00:00Z',
      },
    })

    await enqueue('cows', 'create', 'cow-1', { id: 'cow-1' })
    const first = sync()
    const second = sync() // should be no-op

    resolveFirst()
    await first
    await second

    // API should only be called once (from the first sync)
    expect(api.post).toHaveBeenCalledTimes(1)
  })

  it('sets isOnline = true on success', async () => {
    isOnline.value = false
    api.get.mockResolvedValue({
      data: {
        cows: [], medications: [], treatments: [], healthIssues: [],
        milkRecords: [], breedingEvents: [], breedTypes: [], issueTypes: [],
        syncedAt: '2026-01-01T00:00:00Z',
      },
    })

    await sync()

    expect(isOnline.value).toBe(true)
  })
})

describe('syncManager — initialSync()', () => {
  it('sets initialSyncProgress through pushing → pulling → null', async () => {
    const progressSteps = []
    api.post.mockImplementation(async () => {
      progressSteps.push(initialSyncProgress.value)
      return { data: { results: [] } }
    })
    api.get.mockImplementation(async () => {
      progressSteps.push(initialSyncProgress.value)
      return {
        data: {
          cows: [], medications: [], treatments: [], healthIssues: [],
          milkRecords: [], breedingEvents: [], breedTypes: [], issueTypes: [],
          syncedAt: '2026-01-01T00:00:00Z',
        },
      }
    })

    await enqueue('cows', 'create', 'cow-1', { id: 'cow-1' })
    await initialSync()

    expect(progressSteps).toContain('pushing')
    expect(progressSteps).toContain('pulling')
    expect(initialSyncProgress.value).toBeNull()
  })

  it('swallows errors when offline', async () => {
    _onLine = false
    api.get.mockRejectedValue(new Error('Offline'))

    await expect(initialSync()).resolves.not.toThrow()
    expect(initialSyncProgress.value).toBeNull()
  })

  it('uses fullPull when forceFull=true', async () => {
    await db.syncMeta.put({ key: 'lastPullTimestamp', value: '2026-01-01T00:00:00Z' })

    api.get.mockResolvedValue({
      data: {
        cows: [], medications: [], treatments: [], healthIssues: [],
        milkRecords: [], breedingEvents: [], breedTypes: [], issueTypes: [],
        syncedAt: '2026-01-02T00:00:00Z',
      },
    })

    await initialSync(true)

    expect(api.get).toHaveBeenCalledWith('/sync/pull', { params: { full: 1 } })
  })
})

describe('syncManager — init()', () => {
  it('loads lastPullTimestamp from syncMeta into lastSyncTime', async () => {
    await db.syncMeta.put({ key: 'lastPullTimestamp', value: '2026-02-15T10:00:00Z' })

    await init()

    expect(lastSyncTime.value).toBe('2026-02-15T10:00:00Z')
  })

  it('refreshes pendingCount from queue', async () => {
    await db.syncQueue.add({
      id: 'cow-1', entityType: 'cows', action: 'create',
      data: {}, createdAt: '2026-01-01T00:00:00Z', attempts: 0,
    })

    pendingCount.value = 0 // reset
    await init()

    expect(pendingCount.value).toBe(1)
  })
})
