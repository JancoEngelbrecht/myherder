import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useSyncStore } from '../stores/sync.js'
import db from '../db/indexedDB.js'
import {
  isOnline,
  pendingCount,
  isSyncing,
  lastSyncTime,
  failedItems,
  destroyListeners,
} from '../services/syncManager.js'

// Mock only the API layer
vi.mock('../services/api.js', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    head: vi.fn(),
  },
}))

let _onLine = true
Object.defineProperty(navigator, 'onLine', { get: () => _onLine, configurable: true })

// ── Helpers ─────────────────────────────────────────────────────

async function clearAllTables() {
  for (const t of db.tables.map((t) => t.name)) {
    await db.table(t).clear()
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  _onLine = true
  isOnline.value = true
  isSyncing.value = false
  pendingCount.value = 0
  lastSyncTime.value = null
  failedItems.value = []
  if (!db.isOpen()) await db.open()
  await clearAllTables()
})

afterEach(() => {
  destroyListeners()
})

// ═══════════════════════════════════════════════════════════════
// Computed status
// ═══════════════════════════════════════════════════════════════

describe('sync store — isStaleData computed', () => {
  it('returns true when lastSyncTime is over 24h ago', () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    lastSyncTime.value = old
    const store = useSyncStore()
    expect(store.isStaleData).toBe(true)
  })

  it('returns false when lastSyncTime is recent', () => {
    lastSyncTime.value = new Date().toISOString()
    const store = useSyncStore()
    expect(store.isStaleData).toBe(false)
  })

  it('returns false when lastSyncTime is null (first use)', () => {
    lastSyncTime.value = null
    const store = useSyncStore()
    expect(store.isStaleData).toBe(false)
  })
})

describe('sync store — queueOverflow computed', () => {
  it('returns true when pendingCount > 100', () => {
    pendingCount.value = 101
    const store = useSyncStore()
    expect(store.queueOverflow).toBe(true)
  })

  it('returns false when pendingCount <= 100', () => {
    pendingCount.value = 100
    const store = useSyncStore()
    expect(store.queueOverflow).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════
// Actions
// ═══════════════════════════════════════════════════════════════

describe('sync store — retryFailed', () => {
  it('resets attempts to 0 on failed items', async () => {
    // Seed a failed queue entry
    await db.syncQueue.add({
      id: 'cow-1',
      entityType: 'cows',
      action: 'create',
      data: { id: 'cow-1' },
      createdAt: '2026-01-01T00:00:00Z',
      attempts: 5,
      lastError: 'Server error',
    })

    const store = useSyncStore()
    await store.retryFailed()

    const entries = await db.syncQueue.toArray()
    expect(entries).toHaveLength(1)
    expect(entries[0].attempts).toBe(0)
    expect(entries[0].lastError).toBeNull()
  })
})

describe('sync store — clearFailed', () => {
  it('removes items with attempts >= 5', async () => {
    await db.syncQueue.add({
      id: 'cow-fail',
      entityType: 'cows',
      action: 'create',
      data: {},
      createdAt: '2026-01-01T00:00:00Z',
      attempts: 5,
      lastError: 'Gave up',
    })
    await db.syncQueue.add({
      id: 'cow-ok',
      entityType: 'cows',
      action: 'create',
      data: {},
      createdAt: '2026-01-01T00:01:00Z',
      attempts: 2,
      lastError: null,
    })

    const store = useSyncStore()
    await store.clearFailed()

    const remaining = await db.syncQueue.toArray()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe('cow-ok')
  })
})

describe('sync store — getPendingByType', () => {
  it('groups pending items by entityType', async () => {
    await db.syncQueue.add({
      id: 'cow-1',
      entityType: 'cows',
      action: 'create',
      data: {},
      createdAt: '2026-01-01T00:00:00Z',
      attempts: 0,
    })
    await db.syncQueue.add({
      id: 'cow-2',
      entityType: 'cows',
      action: 'update',
      data: {},
      createdAt: '2026-01-01T00:01:00Z',
      attempts: 0,
    })
    await db.syncQueue.add({
      id: 'treat-1',
      entityType: 'treatments',
      action: 'create',
      data: {},
      createdAt: '2026-01-01T00:02:00Z',
      attempts: 0,
    })

    const store = useSyncStore()
    const grouped = await store.getPendingByType()

    expect(grouped).toEqual({ cows: 2, treatments: 1 })
  })
})
