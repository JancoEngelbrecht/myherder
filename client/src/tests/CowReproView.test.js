import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import CowReproView from '../views/CowReproView.vue'
import { useBreedingEventsStore } from '../stores/breedingEvents.js'
import { useCowsStore } from '../stores/cows.js'
import { useBreedTypesStore } from '../stores/breedTypes.js'

const mockRouter = { push: vi.fn(), back: vi.fn() }
let mockRouteParams = {}

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: mockRouteParams }),
  useRouter: () => mockRouter,
}))

vi.mock('../services/api.js', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
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
    isOfflineError: vi.fn().mockReturnValue(false),
    enqueue: vi.fn(),
    dequeueByEntityId: vi.fn(),
  }
})

vi.mock('../db/indexedDB.js', () => ({
  default: {
    cows: {
      bulkPut: vi.fn(), put: vi.fn(), get: vi.fn(),
      toArray: vi.fn().mockResolvedValue([]),
      orderBy: vi.fn().mockReturnValue({ reverse: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }) }),
    },
    breedingEvents: {
      bulkPut: vi.fn(), put: vi.fn(), get: vi.fn(), delete: vi.fn(),
      toArray: vi.fn().mockResolvedValue([]),
      where: vi.fn().mockReturnValue({ equals: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }) }),
      orderBy: vi.fn().mockReturnValue({ reverse: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }) }),
    },
    breedTypes: { bulkPut: vi.fn(), put: vi.fn(), toArray: vi.fn().mockResolvedValue([]) },
    auth: { get: vi.fn().mockResolvedValue(null), put: vi.fn(), delete: vi.fn() },
    syncQueue: {
      where: vi.fn().mockReturnValue({
        aboveOrEqual: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }),
      bulkDelete: vi.fn(),
    },
  },
}))

const MOCK_EVENTS = [
  { id: 'e1', cow_id: 'cow-1', event_type: 'ai_insemination', event_date: '2024-01-10T10:00:00Z', expected_calving: '2024-10-20', expected_next_heat: '2024-01-31' },
  { id: 'e2', cow_id: 'cow-1', event_type: 'calving', event_date: '2023-06-15T10:00:00Z' },
]

const MOCK_COW = { id: 'cow-1', tag_number: '001', name: 'Bessie', status: 'pregnant', sex: 'female', breed_type_id: 'bt-1' }

const stubs = {
  SyncIndicator: true,
  SyncPanel: true,
  RouterLink: { template: '<a v-bind="$attrs"><slot /></a>' },
  BreedingEventCard: { template: '<div class="breeding-event-card"><slot /></div>', props: ['event', 'showCow', 'showDelete'] },
  ConfirmDialog: true,
}

describe('CowReproView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRouteParams = { id: 'cow-1' }
  })

  it('shows loading state initially', async () => {
    const breedingStore = useBreedingEventsStore()
    vi.spyOn(breedingStore, 'fetchForCow').mockReturnValue(new Promise(() => {})) // never resolves
    const cowsStore = useCowsStore()
    vi.spyOn(cowsStore, 'fetchAll').mockResolvedValue()
    cowsStore.cows = [MOCK_COW]

    const breedTypesStore = useBreedTypesStore()
    vi.spyOn(breedTypesStore, 'fetchActive').mockResolvedValue()
    breedTypesStore.activeTypes = [{ id: 'bt-1', gestation_days: 283 }]

    const wrapper = mount(CowReproView, { global: { stubs } })

    expect(wrapper.find('.spinner').exists()).toBe(true)
  })

  it('renders breeding events for cow after load', async () => {
    const breedingStore = useBreedingEventsStore()
    vi.spyOn(breedingStore, 'fetchForCow').mockResolvedValue(MOCK_EVENTS)
    const cowsStore = useCowsStore()
    vi.spyOn(cowsStore, 'fetchAll').mockResolvedValue()
    cowsStore.cows = [MOCK_COW]

    const breedTypesStore = useBreedTypesStore()
    vi.spyOn(breedTypesStore, 'fetchActive').mockResolvedValue()
    breedTypesStore.activeTypes = [{ id: 'bt-1', gestation_days: 283 }]

    const wrapper = mount(CowReproView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.findAll('.breeding-event-card')).toHaveLength(2)
  })

  it('shows status banner', async () => {
    const breedingStore = useBreedingEventsStore()
    vi.spyOn(breedingStore, 'fetchForCow').mockResolvedValue(MOCK_EVENTS)
    const cowsStore = useCowsStore()
    vi.spyOn(cowsStore, 'fetchAll').mockResolvedValue()
    cowsStore.cows = [MOCK_COW]

    const breedTypesStore = useBreedTypesStore()
    vi.spyOn(breedTypesStore, 'fetchActive').mockResolvedValue()
    breedTypesStore.activeTypes = [{ id: 'bt-1', gestation_days: 283 }]

    const wrapper = mount(CowReproView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.status-banner').exists()).toBe(true)
  })

  it('shows empty state when no events', async () => {
    const breedingStore = useBreedingEventsStore()
    vi.spyOn(breedingStore, 'fetchForCow').mockResolvedValue([])
    const cowsStore = useCowsStore()
    vi.spyOn(cowsStore, 'fetchAll').mockResolvedValue()
    cowsStore.cows = [MOCK_COW]

    const breedTypesStore = useBreedTypesStore()
    vi.spyOn(breedTypesStore, 'fetchActive').mockResolvedValue()
    breedTypesStore.activeTypes = [{ id: 'bt-1', gestation_days: 283 }]

    const wrapper = mount(CowReproView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.empty-state').exists()).toBe(true)
  })
})
