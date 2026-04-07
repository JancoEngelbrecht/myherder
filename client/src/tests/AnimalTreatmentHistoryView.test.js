import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AnimalTreatmentHistoryView from '../views/AnimalTreatmentHistoryView.vue'

// Router mock — AnimalTreatmentHistoryView only uses useRoute, not useRouter
let mockRouteParams = {}
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: mockRouteParams }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}))

// API mock
const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPatch = vi.fn()
const mockDelete = vi.fn()
vi.mock('../services/api.js', () => ({
  default: {
    get: (...args) => mockGet(...args),
    post: (...args) => mockPost(...args),
    patch: (...args) => mockPatch(...args),
    delete: (...args) => mockDelete(...args),
  },
}))

// SyncManager mock
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
    isOfflineError: vi.fn().mockReturnValue(false),
    enqueue: vi.fn(),
    dequeueByEntityId: vi.fn(),
  }
})

// IndexedDB mock
vi.mock('../db/indexedDB.js', () => ({
  default: {
    animals: {
      bulkPut: vi.fn(),
      put: vi.fn(),
      get: vi.fn(),
      toArray: vi.fn().mockResolvedValue([]),
      orderBy: vi.fn().mockReturnValue({
        reverse: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }),
    },
    treatments: {
      bulkPut: vi.fn(),
      put: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      toArray: vi.fn().mockResolvedValue([]),
      where: vi.fn().mockReturnValue({
        equals: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }),
    },
    healthIssues: {
      bulkPut: vi.fn(),
      put: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      toArray: vi.fn().mockResolvedValue([]),
      where: vi.fn().mockReturnValue({
        equals: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }),
    },
    breedingEvents: {
      bulkPut: vi.fn(),
      put: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      toArray: vi.fn().mockResolvedValue([]),
      where: vi.fn().mockReturnValue({
        equals: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }),
      orderBy: vi.fn().mockReturnValue({
        reverse: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }),
    },
    issueTypes: {
      bulkPut: vi.fn(),
      put: vi.fn(),
      toArray: vi.fn().mockResolvedValue([]),
    },
    breedTypes: {
      bulkPut: vi.fn(),
      put: vi.fn(),
      toArray: vi.fn().mockResolvedValue([]),
    },
    medications: {
      bulkPut: vi.fn(),
      put: vi.fn(),
      toArray: vi.fn().mockResolvedValue([]),
    },
    featureFlags: {
      put: vi.fn().mockResolvedValue(undefined),
      toArray: vi.fn().mockResolvedValue([]),
    },
    auth: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    syncQueue: {
      where: vi.fn().mockReturnValue({
        aboveOrEqual: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }),
      bulkDelete: vi.fn(),
    },
  },
}))

const stubs = {
  SyncIndicator: true,
  SyncPanel: true,
  RouterLink: { template: '<a v-bind="$attrs"><slot /></a>' },
  ConfirmDialog: true,
  TeatSelector: true,
  AppHeader: { template: '<div class="app-header"><slot /></div>' },
}

const MOCK_ANIMAL = {
  id: 'animal-1',
  tag_number: '001',
  name: 'Bessie',
  status: 'active',
  sex: 'female',
}

const MOCK_TREATMENTS = [
  {
    id: 'tx-1',
    animal_id: 'animal-1',
    medication_name: 'Pen-Strep',
    dosage: '10ml',
    cost: 150.5,
    treatment_date: '2024-01-15T10:00:00Z',
    administered_by_name: 'Admin',
    is_vet_visit: false,
    withdrawal_end_milk: null,
    withdrawal_end_meat: null,
  },
  {
    id: 'tx-2',
    animal_id: 'animal-1',
    medication_name: 'Oxytocin',
    dosage: '5ml',
    cost: 80.0,
    treatment_date: '2024-01-10T10:00:00Z',
    administered_by_name: 'Admin',
    is_vet_visit: true,
    withdrawal_end_milk: '2024-01-17T10:00:00Z',
    withdrawal_end_meat: null,
  },
]

describe('AnimalTreatmentHistoryView', () => {
  let animalsStore, treatmentsStore

  beforeEach(async () => {
    vi.clearAllMocks()
    mockRouteParams = { id: 'animal-1' }
    setActivePinia(createPinia())

    const { useAnimalsStore } = await import('../stores/animals')
    const { useTreatmentsStore } = await import('../stores/treatments')

    animalsStore = useAnimalsStore()
    treatmentsStore = useTreatmentsStore()

    vi.spyOn(animalsStore, 'fetchOne').mockResolvedValue(MOCK_ANIMAL)
    vi.spyOn(treatmentsStore, 'fetchByCow').mockResolvedValue(MOCK_TREATMENTS)
    vi.spyOn(treatmentsStore, 'getCowTreatments').mockReturnValue(MOCK_TREATMENTS)
  })

  it('renders list of treatments for a specific animal', async () => {
    const wrapper = mount(AnimalTreatmentHistoryView, { global: { stubs } })
    await flushPromises()
    const html = wrapper.html()
    expect(html).toBeTruthy()
    // fetchByCow should have been called with the animal ID from route params
    expect(treatmentsStore.fetchByCow).toHaveBeenCalledWith('animal-1')
  })

  it('treatment items link to treatment detail', async () => {
    const wrapper = mount(AnimalTreatmentHistoryView, { global: { stubs } })
    await flushPromises()
    const links = wrapper.findAll('a')
    const treatmentLinks = links.filter(
      (a) =>
        a.attributes('href')?.includes('/treatments/') ||
        a.attributes('to')?.includes('/treatments/')
    )
    expect(treatmentLinks.length).toBeGreaterThan(0)
  })

  it('shows empty state when no treatments exist', async () => {
    treatmentsStore.fetchByCow = vi.fn().mockResolvedValue([])
    treatmentsStore.getCowTreatments = vi.fn().mockReturnValue([])
    const wrapper = mount(AnimalTreatmentHistoryView, { global: { stubs } })
    await flushPromises()
    const html = wrapper.html()
    const hasEmpty =
      wrapper.find('.empty-state').exists() ||
      html.toLowerCase().includes('no treatment') ||
      html.toLowerCase().includes('geen behandeling')
    expect(hasEmpty).toBe(true)
  })
})
