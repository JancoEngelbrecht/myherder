import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useCowsStore, computeLifePhase, computeIsReadyToBreed } from '../stores/cows.js'
import api from '../services/api.js'
import db from '../db/indexedDB.js'
import { destroyListeners, pendingCount, isOnline } from '../services/syncManager.js'

// Mock only the API layer — let real IndexedDB + syncManager run
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

// Mock navigator.onLine
let _onLine = true
Object.defineProperty(navigator, 'onLine', { get: () => _onLine, configurable: true })

// ── Helpers ─────────────────────────────────────────────────────

async function clearAllTables() {
  for (const t of db.tables.map((t) => t.name)) {
    await db.table(t).clear()
  }
}

const COW_DATA = { tag_number: 'T-001', name: 'Bessie', status: 'active', sex: 'female' }
const SERVER_COW = {
  id: 'server-uuid',
  ...COW_DATA,
  updated_at: '2026-01-01T12:00:00Z',
  created_at: '2026-01-01T12:00:00Z',
}

// ── Setup / Teardown ────────────────────────────────────────────

beforeEach(async () => {
  vi.clearAllMocks()
  _onLine = true
  isOnline.value = true
  pendingCount.value = 0
  if (!db.isOpen()) await db.open()
  await clearAllTables()
})

afterEach(() => {
  destroyListeners()
})

// ═══════════════════════════════════════════════════════════════
// Integration: create
// ═══════════════════════════════════════════════════════════════

describe('cowsStore.create — integration', () => {
  it('online success: cow in IndexedDB matches server version, syncQueue empty', async () => {
    api.post.mockResolvedValue({ data: SERVER_COW })

    const store = useCowsStore()
    const result = await store.create(COW_DATA)

    // Returns server cow
    expect(result.id).toBe('server-uuid')

    // IndexedDB has the server version (local UUID was replaced)
    const dbCow = await db.cows.get('server-uuid')
    expect(dbCow).toMatchObject({ name: 'Bessie' })

    // syncQueue is empty
    expect(await db.syncQueue.count()).toBe(0)

    // Store state has the server cow
    expect(store.cows[0].id).toBe('server-uuid')
  })

  it('offline: cow in IndexedDB with local UUID, syncQueue has create entry', async () => {
    _onLine = false
    api.post.mockRejectedValue(new Error('Network Error'))

    const store = useCowsStore()
    const result = await store.create(COW_DATA)

    // Returns a local cow with a UUID
    expect(result.id).toBeTruthy()
    expect(result.name).toBe('Bessie')

    // IndexedDB has the local version
    const dbCow = await db.cows.get(result.id)
    expect(dbCow).toBeTruthy()
    expect(dbCow.name).toBe('Bessie')

    // syncQueue has exactly 1 create entry
    const queue = await db.syncQueue.toArray()
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({
      entityType: 'cows',
      action: 'create',
      id: result.id,
    })

    // Store state has the local cow
    expect(store.cows[0].id).toBe(result.id)
  })

  it('API error (non-network): cow removed from IndexedDB, syncQueue empty, throws', async () => {
    const err = new Error('Validation failed')
    err.response = { status: 422, data: { error: 'Invalid data' } }
    api.post.mockRejectedValue(err)

    const store = useCowsStore()
    await expect(store.create(COW_DATA)).rejects.toThrow('Validation failed')

    // IndexedDB should be clean (local cow was removed)
    const allCows = await db.cows.toArray()
    expect(allCows).toHaveLength(0)

    // syncQueue should be clean
    expect(await db.syncQueue.count()).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════
// Integration: update
// ═══════════════════════════════════════════════════════════════

describe('cowsStore.update — integration', () => {
  const EXISTING_COW = { id: 'cow-1', ...COW_DATA, updated_at: '2026-01-01T00:00:00Z' }

  beforeEach(async () => {
    await db.cows.put(EXISTING_COW)
  })

  it('online success: cow in IndexedDB matches server version, syncQueue empty', async () => {
    const updatedServer = { ...EXISTING_COW, name: 'Bessie II', updated_at: '2026-01-01T12:00:00Z' }
    api.put.mockResolvedValue({ data: updatedServer })

    const store = useCowsStore()
    store.cows = [EXISTING_COW]
    const result = await store.update('cow-1', { name: 'Bessie II' })

    expect(result.name).toBe('Bessie II')

    const dbCow = await db.cows.get('cow-1')
    expect(dbCow.name).toBe('Bessie II')
    expect(dbCow.updated_at).toBe('2026-01-01T12:00:00Z')

    expect(await db.syncQueue.count()).toBe(0)
  })

  it('offline: cow in IndexedDB has local changes, syncQueue has update entry', async () => {
    _onLine = false
    api.put.mockRejectedValue(new Error('Network Error'))

    const store = useCowsStore()
    store.cows = [EXISTING_COW]
    const result = await store.update('cow-1', { name: 'Offline Edit' })

    expect(result.name).toBe('Offline Edit')

    const dbCow = await db.cows.get('cow-1')
    expect(dbCow.name).toBe('Offline Edit')

    const queue = await db.syncQueue.toArray()
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({
      entityType: 'cows',
      action: 'update',
      id: 'cow-1',
    })

    // Store state updated
    expect(store.cows[0].name).toBe('Offline Edit')
  })
})

// ═══════════════════════════════════════════════════════════════
// Integration: remove
// ═══════════════════════════════════════════════════════════════

describe('cowsStore.remove — integration', () => {
  const EXISTING_COW = { id: 'cow-1', ...COW_DATA }

  beforeEach(async () => {
    await db.cows.put(EXISTING_COW)
  })

  it('online success: cow removed from IndexedDB, syncQueue empty', async () => {
    api.delete.mockResolvedValue({})

    const store = useCowsStore()
    store.cows = [EXISTING_COW]
    await store.remove('cow-1')

    expect(await db.cows.get('cow-1')).toBeUndefined()
    expect(await db.syncQueue.count()).toBe(0)
    expect(store.cows).toHaveLength(0)
  })

  it('offline: syncQueue has delete entry, cow removed from store', async () => {
    _onLine = false
    api.delete.mockRejectedValue(new Error('Network Error'))

    const store = useCowsStore()
    store.cows = [EXISTING_COW]
    await store.remove('cow-1')

    const queue = await db.syncQueue.toArray()
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({
      entityType: 'cows',
      action: 'delete',
      id: 'cow-1',
    })

    expect(store.cows).toHaveLength(0)
  })

  it('API error (non-network): cow restored to store, syncQueue clean, throws', async () => {
    const err = new Error('Forbidden')
    err.response = { status: 403, data: {} }
    api.delete.mockRejectedValue(err)

    const store = useCowsStore()
    store.cows = [EXISTING_COW]
    await expect(store.remove('cow-1')).rejects.toThrow('Forbidden')

    // Cow restored to store state
    expect(store.cows).toHaveLength(1)
    expect(store.cows[0].id).toBe('cow-1')

    // syncQueue clean
    expect(await db.syncQueue.count()).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════
// Integration: fetchAll
// ═══════════════════════════════════════════════════════════════

describe('cowsStore.fetchAll — integration', () => {
  it('online: data mirrored to IndexedDB', async () => {
    const cowList = [
      { id: 'cow-1', name: 'Bessie' },
      { id: 'cow-2', name: 'Daisy' },
    ]
    api.get.mockResolvedValue({ data: cowList })

    const store = useCowsStore()
    await store.fetchAll()

    // Store state
    expect(store.cows).toHaveLength(2)
    // IndexedDB
    expect(await db.cows.get('cow-1')).toMatchObject({ name: 'Bessie' })
    expect(await db.cows.get('cow-2')).toMatchObject({ name: 'Daisy' })
  })

  it('offline: falls back to IndexedDB data', async () => {
    await db.cows.bulkPut([
      { id: 'cow-1', name: 'Cached Bessie' },
      { id: 'cow-2', name: 'Cached Daisy' },
    ])

    _onLine = false
    api.get.mockRejectedValue(new Error('Network Error'))

    const store = useCowsStore()
    await store.fetchAll()

    expect(store.cows).toHaveLength(2)
    expect(store.cows.find((c) => c.id === 'cow-1').name).toBe('Cached Bessie')
  })

  it('filtered fetch does not mirror to IndexedDB', async () => {
    api.get.mockResolvedValue({
      data: [{ id: 'cow-1', name: 'Filtered' }],
      headers: { 'x-total-count': '1' },
    })

    const store = useCowsStore()
    await store.fetchAll({ status: 'active' })

    expect(store.cows).toHaveLength(1)
    // IndexedDB should be empty — filtered fetches don't cache
    expect(await db.cows.count()).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════
// Integration: fetchOne
// ═══════════════════════════════════════════════════════════════

describe('cowsStore.fetchOne — integration', () => {
  it('online: cow cached in IndexedDB', async () => {
    api.get.mockResolvedValue({ data: { id: 'cow-1', name: 'Bessie' } })

    const store = useCowsStore()
    const result = await store.fetchOne('cow-1')

    expect(result.name).toBe('Bessie')
    expect(await db.cows.get('cow-1')).toMatchObject({ name: 'Bessie' })
  })

  it('offline: returns from IndexedDB cache', async () => {
    await db.cows.put({ id: 'cow-1', name: 'Cached Bessie' })

    api.get.mockRejectedValue(new Error('Network Error'))

    const store = useCowsStore()
    const result = await store.fetchOne('cow-1')

    expect(result.name).toBe('Cached Bessie')
  })

  it('offline with no cache: throws', async () => {
    api.get.mockRejectedValue(new Error('Network Error'))

    const store = useCowsStore()
    await expect(store.fetchOne('nonexistent')).rejects.toThrow()
  })
})

// ═══════════════════════════════════════════════════════════════
// Pure unit tests: computeLifePhase + computeIsReadyToBreed
// ═══════════════════════════════════════════════════════════════

describe('computeLifePhase', () => {
  it('returns override if set', () => {
    expect(
      computeLifePhase({ sex: 'female', dob: '2020-01-01', life_phase_override: 'heifer' })
    ).toBe('heifer')
  })

  it('returns cow/bull when no dob', () => {
    expect(computeLifePhase({ sex: 'female' })).toBe('cow')
    expect(computeLifePhase({ sex: 'male' })).toBe('bull')
  })

  it('returns calf for young animal', () => {
    const dob = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString() // 60 days
    expect(computeLifePhase({ sex: 'female', dob })).toBe('calf')
    expect(computeLifePhase({ sex: 'male', dob })).toBe('calf')
  })

  it('returns heifer for female between calf and cow age', () => {
    const dob = new Date(Date.now() - 300 * 24 * 60 * 60 * 1000).toISOString() // ~10 months
    expect(computeLifePhase({ sex: 'female', dob })).toBe('heifer')
  })

  it('returns cow for mature female', () => {
    const dob = new Date(Date.now() - 600 * 24 * 60 * 60 * 1000).toISOString() // ~20 months
    expect(computeLifePhase({ sex: 'female', dob })).toBe('cow')
  })

  it('uses breed-specific thresholds when provided', () => {
    const dob = new Date(Date.now() - 240 * 24 * 60 * 60 * 1000).toISOString() // ~8 months
    const breedType = { calf_max_months: 10 }
    expect(computeLifePhase({ sex: 'female', dob }, breedType)).toBe('calf')
  })

  // ── Species-aware (3rd parameter) ──

  const SHEEP_PHASES = {
    female: [
      { code: 'lamb', maxMonths: 6 },
      { code: 'ewe', minMonths: 6 },
    ],
    male: [
      { code: 'lamb', maxMonths: 6 },
      { code: 'ram', minMonths: 6 },
    ],
  }

  const CATTLE_PHASES = {
    female: [
      { code: 'calf', maxMonths: 6 },
      { code: 'heifer', minMonths: 6 },
      { code: 'cow', minMonths: 15 },
    ],
    male: [
      { code: 'calf', maxMonths: 6 },
      { code: 'young_bull', minMonths: 6 },
      { code: 'bull', minMonths: 15 },
    ],
  }

  it('returns sheep lamb for young female with species config', () => {
    const dob = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString() // ~2 months
    expect(computeLifePhase({ sex: 'female', dob }, null, SHEEP_PHASES)).toBe('lamb')
  })

  it('returns sheep ewe for mature female with species config', () => {
    const dob = new Date(Date.now() - 300 * 24 * 60 * 60 * 1000).toISOString() // ~10 months
    expect(computeLifePhase({ sex: 'female', dob }, null, SHEEP_PHASES)).toBe('ewe')
  })

  it('returns sheep lamb for young male with species config', () => {
    const dob = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
    expect(computeLifePhase({ sex: 'male', dob }, null, SHEEP_PHASES)).toBe('lamb')
  })

  it('returns sheep ram for mature male with species config', () => {
    const dob = new Date(Date.now() - 300 * 24 * 60 * 60 * 1000).toISOString()
    expect(computeLifePhase({ sex: 'male', dob }, null, SHEEP_PHASES)).toBe('ram')
  })

  it('returns last phase (adult) when no dob with species config', () => {
    expect(computeLifePhase({ sex: 'female' }, null, SHEEP_PHASES)).toBe('ewe')
    expect(computeLifePhase({ sex: 'male' }, null, SHEEP_PHASES)).toBe('ram')
  })

  it('respects breed override in species path', () => {
    const dob = new Date(Date.now() - 240 * 24 * 60 * 60 * 1000).toISOString() // ~8 months
    const breedType = { calf_max_months: 10 }
    expect(computeLifePhase({ sex: 'female', dob }, breedType, SHEEP_PHASES)).toBe('lamb')
  })

  it('returns cattle heifer with species config for 10-month female', () => {
    const dob = new Date(Date.now() - 300 * 24 * 60 * 60 * 1000).toISOString()
    expect(computeLifePhase({ sex: 'female', dob }, null, CATTLE_PHASES)).toBe('heifer')
  })

  it('returns cattle cow with species config for 20-month female', () => {
    const dob = new Date(Date.now() - 600 * 24 * 60 * 60 * 1000).toISOString()
    expect(computeLifePhase({ sex: 'female', dob }, null, CATTLE_PHASES)).toBe('cow')
  })

  it('override still applies to species-aware path', () => {
    expect(
      computeLifePhase(
        { sex: 'female', dob: '2020-01-01', life_phase_override: 'lamb' },
        null,
        SHEEP_PHASES
      )
    ).toBe('lamb')
  })
})

describe('computeIsReadyToBreed', () => {
  it('returns false for males', () => {
    expect(computeIsReadyToBreed({ sex: 'male', dob: '2020-01-01' })).toBe(false)
  })

  it('returns false for pregnant cows', () => {
    expect(computeIsReadyToBreed({ sex: 'female', dob: '2020-01-01', status: 'pregnant' })).toBe(
      false
    )
  })

  it('returns false when no dob', () => {
    expect(computeIsReadyToBreed({ sex: 'female', status: 'active' })).toBe(false)
  })

  it('returns true for heifer old enough', () => {
    const dob = new Date(Date.now() - 500 * 24 * 60 * 60 * 1000).toISOString() // ~16 months
    expect(computeIsReadyToBreed({ sex: 'female', dob, status: 'active' })).toBe(true)
  })

  it('returns false for heifer too young', () => {
    const dob = new Date(Date.now() - 300 * 24 * 60 * 60 * 1000).toISOString() // ~10 months
    expect(computeIsReadyToBreed({ sex: 'female', dob, status: 'active' })).toBe(false)
  })

  it('returns true when past voluntary waiting period after calving', () => {
    const dob = '2020-01-01'
    const lastCalving = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString() // 60 days ago
    expect(computeIsReadyToBreed({ sex: 'female', dob, status: 'active' }, null, lastCalving)).toBe(
      true
    )
  })

  it('returns false when within voluntary waiting period', () => {
    const dob = '2020-01-01'
    const lastCalving = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString() // 20 days ago
    expect(computeIsReadyToBreed({ sex: 'female', dob, status: 'active' }, null, lastCalving)).toBe(
      false
    )
  })
})
