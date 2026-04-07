import { describe, it, expect, vi } from 'vitest'
import { useSpeciesTerms } from '../composables/useSpeciesTerms'

vi.mock('../i18n', () => ({
  default: {
    global: {
      t: (key: string) => key,
      te: () => false,
    },
  },
}))

vi.mock('../services/api', () => ({
  default: { get: vi.fn() },
}))

vi.mock('../services/syncManager', () => {
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
    isOfflineError: vi.fn(),
    enqueue: vi.fn(),
    dequeueByEntityId: vi.fn(),
  }
})

vi.mock('../db/indexedDB', () => ({
  default: {
    species: { toArray: vi.fn().mockResolvedValue([]), bulkPut: vi.fn(), put: vi.fn() },
    auth: { get: vi.fn().mockResolvedValue(null), put: vi.fn(), delete: vi.fn() },
    featureFlags: { toArray: vi.fn().mockResolvedValue([]), put: vi.fn(), bulkPut: vi.fn() },
  },
  initDb: vi.fn(),
  closeDb: vi.fn(),
}))

describe('useSpeciesTerms', () => {
  it('returns cattle terminology by default', () => {
    const terms = useSpeciesTerms()
    expect(terms.singular.value).toBe('Cow')
    expect(terms.plural.value).toBe('Cows')
    expect(terms.collectiveNoun.value).toBe('Herd')
    expect(terms.birthEvent.value).toBe('Calving')
    expect(terms.maleService.value).toBe('Bull Service')
  })

  it('returns cattle emoji by default', () => {
    const terms = useSpeciesTerms()
    expect(terms.emoji.value.female).toBe('🐄')
    expect(terms.emoji.value.male).toBe('🐂')
  })

  it('returns cattle species code by default', () => {
    const terms = useSpeciesTerms()
    expect(terms.speciesCode.value).toBe('cattle')
  })

  it('returns default offspring values', () => {
    const terms = useSpeciesTerms()
    expect(terms.typicalMultipleBirths.value).toBe(1)
    expect(terms.maxOffspring.value).toBe(2)
  })

  it('returns cattle life phases config by default', () => {
    const terms = useSpeciesTerms()
    expect(terms.lifePhasesConfig.value.female).toHaveLength(3)
    expect(terms.lifePhasesConfig.value.female[0].code).toBe('calf')
  })
})
