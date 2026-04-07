import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSpeciesStore } from '../stores/species'
import api from '../services/api.js'

vi.mock('../services/api.js', () => ({
  default: { get: vi.fn() },
}))

vi.mock('../services/syncManager.js', () => {
  const { ref } = require('vue')
  return {
    isOnline: ref(true),
    pendingCount: ref(0),
    isSyncing: ref(false),
    lastSyncTime: ref(null),
    failedItems: ref([]),
    sync: vi.fn(),
    initialSync: vi.fn(),
    getPending: vi.fn().mockResolvedValue([]),
    init: vi.fn(),
    destroyListeners: vi.fn(),
    isOfflineError: vi.fn((err) => err.message === 'Network Error'),
    enqueue: vi.fn(),
    dequeueByEntityId: vi.fn(),
  }
})

const { mockSpeciesTable } = vi.hoisted(() => ({
  mockSpeciesTable: {
    bulkPut: vi.fn().mockResolvedValue(undefined),
    toArray: vi.fn().mockResolvedValue([]),
    put: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../db/indexedDB.js', () => ({
  default: {
    species: mockSpeciesTable,
    auth: { get: vi.fn().mockResolvedValue(null), put: vi.fn(), delete: vi.fn() },
    featureFlags: { toArray: vi.fn().mockResolvedValue([]), put: vi.fn(), bulkPut: vi.fn() },
  },
  initDb: vi.fn(),
  closeDb: vi.fn(),
}))

const CATTLE = {
  id: 'sp-cattle',
  code: 'cattle',
  name: 'Cattle',
  is_active: true,
  config: {
    terminology: {
      singular: 'Cow',
      plural: 'Cows',
      maleSingular: 'Bull',
      femaleSingular: 'Cow',
      youngSingular: 'Calf',
      youngPlural: 'Calves',
      collectiveNoun: 'Herd',
      birthEvent: 'Calving',
      birthEventPast: 'Calved',
      maleService: 'Bull Service',
    },
    emoji: { female: '🐄', male: '🐂', young: '🐮' },
    life_phases: {
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
    },
    event_types: [
      'heat_observed',
      'ai_insemination',
      'bull_service',
      'calving',
      'abortion',
      'dry_off',
    ],
    typical_multiple_births: 1,
    max_offspring: 2,
  },
}

const SHEEP = {
  id: 'sp-sheep',
  code: 'sheep',
  name: 'Sheep',
  is_active: true,
  config: {
    terminology: {
      singular: 'Sheep',
      plural: 'Sheep',
      maleSingular: 'Ram',
      femaleSingular: 'Ewe',
      youngSingular: 'Lamb',
      youngPlural: 'Lambs',
      collectiveNoun: 'Flock',
      birthEvent: 'Lambing',
      birthEventPast: 'Lambed',
      maleService: 'Ram Service',
    },
    emoji: { female: '🐑', male: '🐏', young: '🐑' },
    life_phases: {
      female: [
        { code: 'lamb', maxMonths: 6 },
        { code: 'ewe', minMonths: 6 },
      ],
      male: [
        { code: 'lamb', maxMonths: 6 },
        { code: 'ram', minMonths: 6 },
      ],
    },
    event_types: ['heat_observed', 'ai_insemination', 'ram_service', 'lambing', 'abortion'],
    typical_multiple_births: 2,
    max_offspring: 4,
  },
}

describe('useSpeciesStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSpeciesTable.toArray.mockResolvedValue([])
  })

  describe('fetchAll', () => {
    it('fetches species from API and updates state', async () => {
      api.get.mockResolvedValue({ data: [CATTLE, SHEEP] })

      const store = useSpeciesStore()
      await store.fetchAll()

      expect(api.get).toHaveBeenCalledWith('/species')
      expect(store.all).toHaveLength(2)
      expect(store.all[0].code).toBe('cattle')
      expect(store.all[1].code).toBe('sheep')
    })

    it('caches species to IndexedDB with stringified config', async () => {
      api.get.mockResolvedValue({ data: [CATTLE] })

      const store = useSpeciesStore()
      await store.fetchAll()

      expect(mockSpeciesTable.bulkPut).toHaveBeenCalledTimes(1)
      const stored = mockSpeciesTable.bulkPut.mock.calls[0][0]
      expect(stored[0].code).toBe('cattle')
      expect(typeof stored[0].config).toBe('string')
    })

    it('falls back to IndexedDB when offline', async () => {
      api.get.mockRejectedValue(new Error('Network Error'))
      mockSpeciesTable.toArray.mockResolvedValue([
        {
          ...SHEEP,
          config: JSON.stringify(SHEEP.config),
        },
      ])

      const store = useSpeciesStore()
      await store.fetchAll()

      expect(store.all).toHaveLength(1)
      expect(store.all[0].code).toBe('sheep')
      expect(store.all[0].config.terminology.singular).toBe('Sheep')
    })

    it('re-throws non-offline errors', async () => {
      api.get.mockRejectedValue(new Error('Server Error'))

      const store = useSpeciesStore()
      await expect(store.fetchAll()).rejects.toThrow('Server Error')
    })
  })

  describe('getById', () => {
    it('returns species by ID', async () => {
      api.get.mockResolvedValue({ data: [CATTLE, SHEEP] })
      const store = useSpeciesStore()
      await store.fetchAll()

      expect(store.getById('sp-sheep').code).toBe('sheep')
    })

    it('returns cattle fallback for unknown ID', () => {
      const store = useSpeciesStore()
      const result = store.getById('nonexistent')
      expect(result.code).toBe('cattle')
      expect(result.config.terminology.singular).toBe('Cow')
    })
  })

  describe('getByCode', () => {
    it('returns species by code', async () => {
      api.get.mockResolvedValue({ data: [CATTLE, SHEEP] })
      const store = useSpeciesStore()
      await store.fetchAll()

      expect(store.getByCode('sheep').config.terminology.collectiveNoun).toBe('Flock')
    })

    it('returns cattle fallback for unknown code', () => {
      const store = useSpeciesStore()
      expect(store.getByCode('goat').code).toBe('cattle')
    })
  })

  describe('farmSpecies', () => {
    it('returns cattle fallback when species_code not in user', () => {
      const store = useSpeciesStore()
      expect(store.farmSpecies.code).toBe('cattle')
      expect(store.farmSpecies.config.terminology.collectiveNoun).toBe('Herd')
    })
  })

  describe('helper getters', () => {
    it('getTerminology returns species terminology', async () => {
      api.get.mockResolvedValue({ data: [CATTLE, SHEEP] })
      const store = useSpeciesStore()
      await store.fetchAll()

      expect(store.getTerminology('sp-sheep').femaleSingular).toBe('Ewe')
    })

    it('getLifePhases returns species life phases', async () => {
      api.get.mockResolvedValue({ data: [CATTLE, SHEEP] })
      const store = useSpeciesStore()
      await store.fetchAll()

      const phases = store.getLifePhases('sp-sheep')
      expect(phases.female).toHaveLength(2)
      expect(phases.female[1].code).toBe('ewe')
    })

    it('getEmoji returns species emoji', async () => {
      api.get.mockResolvedValue({ data: [CATTLE, SHEEP] })
      const store = useSpeciesStore()
      await store.fetchAll()

      expect(store.getEmoji('sp-sheep').female).toBe('🐑')
    })
  })

  describe('hasData', () => {
    it('is false when store is empty', () => {
      const store = useSpeciesStore()
      expect(store.hasData).toBe(false)
    })

    it('is true after fetchAll succeeds', async () => {
      api.get.mockResolvedValue({ data: [CATTLE] })
      const store = useSpeciesStore()
      await store.fetchAll()

      expect(store.hasData).toBe(true)
    })
  })
})
