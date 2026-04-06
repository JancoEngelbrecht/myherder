import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAnimalsStore, computeLifePhase, computeIsReadyToBreed } from '../stores/animals.js'
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

const ANIMAL_DATA = { tag_number: 'T-001', name: 'Bessie', status: 'active', sex: 'female' }
const SERVER_ANIMAL = {
  id: 'server-uuid',
  ...ANIMAL_DATA,
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

describe('animalsStore.create — integration', () => {
  it('online success: animal in IndexedDB matches server version, syncQueue empty', async () => {
    api.post.mockResolvedValue({ data: SERVER_ANIMAL })

    const store = useAnimalsStore()
    const result = await store.create(ANIMAL_DATA)

    // Returns server animal
    expect(result.id).toBe('server-uuid')

    // IndexedDB has the server version (local UUID was replaced)
    const dbAnimal = await db.animals.get('server-uuid')
    expect(dbAnimal).toMatchObject({ name: 'Bessie' })

    // syncQueue is empty
    expect(await db.syncQueue.count()).toBe(0)

    // Store state has the server animal
    expect(store.animals[0].id).toBe('server-uuid')
  })

  it('offline: animal in IndexedDB with local UUID, syncQueue has create entry', async () => {
    _onLine = false
    api.post.mockRejectedValue(new Error('Network Error'))

    const store = useAnimalsStore()
    const result = await store.create(ANIMAL_DATA)

    // Returns a local animal with a UUID
    expect(result.id).toBeTruthy()
    expect(result.name).toBe('Bessie')

    // IndexedDB has the local version
    const dbAnimal = await db.animals.get(result.id)
    expect(dbAnimal).toBeTruthy()
    expect(dbAnimal.name).toBe('Bessie')

    // syncQueue has exactly 1 create entry
    const queue = await db.syncQueue.toArray()
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({
      entityType: 'animals',
      action: 'create',
      id: result.id,
    })

    // Store state has the local animal
    expect(store.animals[0].id).toBe(result.id)
  })

  it('API error (non-network): animal removed from IndexedDB, syncQueue empty, throws', async () => {
    const err = new Error('Validation failed')
    err.response = { status: 422, data: { error: 'Invalid data' } }
    api.post.mockRejectedValue(err)

    const store = useAnimalsStore()
    await expect(store.create(ANIMAL_DATA)).rejects.toThrow('Validation failed')

    // IndexedDB should be clean (local animal was removed)
    const allAnimals = await db.animals.toArray()
    expect(allAnimals).toHaveLength(0)

    // syncQueue should be clean
    expect(await db.syncQueue.count()).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════
// Integration: update
// ═══════════════════════════════════════════════════════════════

describe('animalsStore.update — integration', () => {
  const EXISTING_ANIMAL = { id: 'animal-1', ...ANIMAL_DATA, updated_at: '2026-01-01T00:00:00Z' }

  beforeEach(async () => {
    await db.animals.put(EXISTING_ANIMAL)
  })

  it('online success: animal in IndexedDB matches server version, syncQueue empty', async () => {
    const updatedServer = {
      ...EXISTING_ANIMAL,
      name: 'Bessie II',
      updated_at: '2026-01-01T12:00:00Z',
    }
    api.put.mockResolvedValue({ data: updatedServer })

    const store = useAnimalsStore()
    store.animals = [EXISTING_ANIMAL]
    const result = await store.update('animal-1', { name: 'Bessie II' })

    expect(result.name).toBe('Bessie II')

    const dbAnimal = await db.animals.get('animal-1')
    expect(dbAnimal.name).toBe('Bessie II')
    expect(dbAnimal.updated_at).toBe('2026-01-01T12:00:00Z')

    expect(await db.syncQueue.count()).toBe(0)
  })

  it('offline: animal in IndexedDB has local changes, syncQueue has update entry', async () => {
    _onLine = false
    api.put.mockRejectedValue(new Error('Network Error'))

    const store = useAnimalsStore()
    store.animals = [EXISTING_ANIMAL]
    const result = await store.update('animal-1', { name: 'Offline Edit' })

    expect(result.name).toBe('Offline Edit')

    const dbAnimal = await db.animals.get('animal-1')
    expect(dbAnimal.name).toBe('Offline Edit')

    const queue = await db.syncQueue.toArray()
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({
      entityType: 'animals',
      action: 'update',
      id: 'animal-1',
    })

    // Store state updated
    expect(store.animals[0].name).toBe('Offline Edit')
  })
})

// ═══════════════════════════════════════════════════════════════
// Integration: remove
// ═══════════════════════════════════════════════════════════════

describe('animalsStore.remove — integration', () => {
  const EXISTING_ANIMAL = { id: 'animal-1', ...ANIMAL_DATA }

  beforeEach(async () => {
    await db.animals.put(EXISTING_ANIMAL)
  })

  it('online success: animal removed from IndexedDB, syncQueue empty', async () => {
    api.delete.mockResolvedValue({})

    const store = useAnimalsStore()
    store.animals = [EXISTING_ANIMAL]
    await store.remove('animal-1')

    expect(await db.animals.get('animal-1')).toBeUndefined()
    expect(await db.syncQueue.count()).toBe(0)
    expect(store.animals).toHaveLength(0)
  })

  it('offline: syncQueue has delete entry, animal removed from store', async () => {
    _onLine = false
    api.delete.mockRejectedValue(new Error('Network Error'))

    const store = useAnimalsStore()
    store.animals = [EXISTING_ANIMAL]
    await store.remove('animal-1')

    const queue = await db.syncQueue.toArray()
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({
      entityType: 'animals',
      action: 'delete',
      id: 'animal-1',
    })

    expect(store.animals).toHaveLength(0)
  })

  it('API error (non-network): animal restored to store, syncQueue clean, throws', async () => {
    const err = new Error('Forbidden')
    err.response = { status: 403, data: {} }
    api.delete.mockRejectedValue(err)

    const store = useAnimalsStore()
    store.animals = [EXISTING_ANIMAL]
    await expect(store.remove('animal-1')).rejects.toThrow('Forbidden')

    // Animal restored to store state
    expect(store.animals).toHaveLength(1)
    expect(store.animals[0].id).toBe('animal-1')

    // syncQueue clean
    expect(await db.syncQueue.count()).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════
// Integration: fetchAll
// ═══════════════════════════════════════════════════════════════

describe('animalsStore.fetchAll — integration', () => {
  it('online: data mirrored to IndexedDB', async () => {
    const animalList = [
      { id: 'animal-1', name: 'Bessie' },
      { id: 'animal-2', name: 'Daisy' },
    ]
    api.get.mockResolvedValue({ data: animalList })

    const store = useAnimalsStore()
    await store.fetchAll()

    // Store state
    expect(store.animals).toHaveLength(2)
    // IndexedDB
    expect(await db.animals.get('animal-1')).toMatchObject({ name: 'Bessie' })
    expect(await db.animals.get('animal-2')).toMatchObject({ name: 'Daisy' })
  })

  it('offline: falls back to IndexedDB data', async () => {
    await db.animals.bulkPut([
      { id: 'animal-1', name: 'Cached Bessie' },
      { id: 'animal-2', name: 'Cached Daisy' },
    ])

    _onLine = false
    api.get.mockRejectedValue(new Error('Network Error'))

    const store = useAnimalsStore()
    await store.fetchAll()

    expect(store.animals).toHaveLength(2)
    expect(store.animals.find((a) => a.id === 'animal-1').name).toBe('Cached Bessie')
  })

  it('filtered fetch does not mirror to IndexedDB', async () => {
    api.get.mockResolvedValue({
      data: [{ id: 'animal-1', name: 'Filtered' }],
      headers: { 'x-total-count': '1' },
    })

    const store = useAnimalsStore()
    await store.fetchAll({ status: 'active' })

    expect(store.animals).toHaveLength(1)
    // IndexedDB should be empty — filtered fetches don't cache
    expect(await db.animals.count()).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════
// Integration: fetchOne
// ═══════════════════════════════════════════════════════════════

describe('animalsStore.fetchOne — integration', () => {
  it('online: animal cached in IndexedDB', async () => {
    api.get.mockResolvedValue({ data: { id: 'animal-1', name: 'Bessie' } })

    const store = useAnimalsStore()
    const result = await store.fetchOne('animal-1')

    expect(result.name).toBe('Bessie')
    expect(await db.animals.get('animal-1')).toMatchObject({ name: 'Bessie' })
  })

  it('offline: returns from IndexedDB cache', async () => {
    await db.animals.put({ id: 'animal-1', name: 'Cached Bessie' })

    api.get.mockRejectedValue(new Error('Network Error'))

    const store = useAnimalsStore()
    const result = await store.fetchOne('animal-1')

    expect(result.name).toBe('Cached Bessie')
  })

  it('offline with no cache: throws', async () => {
    api.get.mockRejectedValue(new Error('Network Error'))

    const store = useAnimalsStore()
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

  it('returns false for pregnant animals', () => {
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
