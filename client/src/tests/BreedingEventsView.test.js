import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import BreedingEventsView from '../views/BreedingEventsView.vue'
import { useBreedingEventsStore } from '../stores/breedingEvents'
import { useAuthStore } from '../stores/auth'

const mockRouter = { push: vi.fn(), back: vi.fn() }

vi.mock('vue-router', () => ({
  useRouter: () => mockRouter,
}))

vi.mock('../services/api.js', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { data: [], total: 0 } }),
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
    cows: {
      bulkPut: vi.fn(),
      put: vi.fn(),
      get: vi.fn(),
      toArray: vi.fn().mockResolvedValue([]),
      orderBy: vi.fn().mockReturnValue({
        reverse: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }),
    },
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
  {
    id: 'e1',
    cow_id: 'c1',
    event_type: 'ai_insemination',
    event_date: '2024-01-10',
    tag_number: '001',
    cow_name: 'Bessie',
  },
  {
    id: 'e2',
    cow_id: 'c2',
    event_type: 'calving',
    event_date: '2024-01-12',
    tag_number: '002',
    cow_name: 'Daisy',
  },
]

const stubs = {
  SyncIndicator: true,
  SyncPanel: true,
  RouterLink: { template: '<a v-bind="$attrs"><slot /></a>' },
  BreedingEventCard: {
    template: '<div class="breeding-event-card"><slot /></div>',
    props: ['event', 'showCow', 'showDelete', 'compact'],
  },
  ConfirmDialog: true,
  AnimalSearchDropdown: {
    template: '<div class="cow-search" />',
    props: ['modelValue', 'placeholder'],
  },
  PaginationBar: {
    template: '<div class="pagination" />',
    props: ['total', 'page', 'limit', 'pageSizeOptions'],
  },
}

describe('BreedingEventsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders event type filter chips', async () => {
    const store = useBreedingEventsStore()
    vi.spyOn(store, 'fetchAll').mockResolvedValue()
    store.events = MOCK_EVENTS
    store.total = 2

    const auth = useAuthStore()
    auth.user = { role: 'admin', permissions: [] }

    const wrapper = mount(BreedingEventsView, { global: { stubs } })
    await flushPromises()

    // 6 event type chips: all, heat, insemination, preg check, calving, dry-off
    const chips = wrapper.findAll('.chip')
    expect(chips).toHaveLength(6)
  })

  it('renders breeding event cards', async () => {
    const store = useBreedingEventsStore()
    vi.spyOn(store, 'fetchAll').mockResolvedValue()
    store.events = MOCK_EVENTS
    store.total = 2
    store.loading = false

    const auth = useAuthStore()
    auth.user = { role: 'admin', permissions: [] }

    const wrapper = mount(BreedingEventsView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.findAll('.breeding-event-card')).toHaveLength(2)
  })

  it('shows empty state when no events', async () => {
    const store = useBreedingEventsStore()
    vi.spyOn(store, 'fetchAll').mockResolvedValue()
    store.events = []
    store.total = 0
    store.loading = false

    const auth = useAuthStore()
    auth.user = { role: 'admin', permissions: [] }

    const wrapper = mount(BreedingEventsView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.empty-state').exists()).toBe(true)
  })

  it('shows loading state', async () => {
    const store = useBreedingEventsStore()
    vi.spyOn(store, 'fetchAll').mockResolvedValue()
    store.loading = true

    const auth = useAuthStore()
    auth.user = { role: 'admin', permissions: [] }

    const wrapper = mount(BreedingEventsView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.spinner').exists()).toBe(true)
  })
})
