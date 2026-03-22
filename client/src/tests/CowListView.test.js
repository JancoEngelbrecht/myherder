import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import CowListView from '../views/CowListView.vue'
import { useCowsStore } from '../stores/cows.js'
import { useAuthStore } from '../stores/auth.js'

const mockRouter = { push: vi.fn() }

vi.mock('vue-router', () => ({
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
      bulkPut: vi.fn(),
      put: vi.fn(),
      get: vi.fn(),
      toArray: vi.fn().mockResolvedValue([]),
      orderBy: vi.fn().mockReturnValue({
        reverse: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }),
    },
    breedTypes: {
      bulkPut: vi.fn(),
      put: vi.fn(),
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

const MOCK_COWS = [
  { id: 'c1', tag_number: '001', name: 'Bessie', status: 'active', sex: 'female' },
  { id: 'c2', tag_number: '002', name: 'Daisy', status: 'dry', sex: 'female' },
  { id: 'c3', tag_number: '003', name: 'Bull', status: 'active', sex: 'male' },
]

const stubs = {
  SyncIndicator: true,
  SyncPanel: true,
  CowCard: { template: '<div class="cow-card"><slot /></div>', props: ['cow'] },
  SearchInput: { template: '<input class="search-input" />', emits: ['update:model-value'] },
  PaginationBar: { template: '<div class="pagination" />', props: ['total', 'page', 'limit'] },
}

function setAdmin() {
  const auth = useAuthStore()
  auth.user = { role: 'admin', permissions: [] }
  auth.canManageCows = true
}

function setWorker() {
  const auth = useAuthStore()
  auth.user = { role: 'worker', permissions: [] }
  auth.canManageCows = false
}

describe('CowListView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls fetchAll on mount', async () => {
    setAdmin()
    const cowsStore = useCowsStore()
    vi.spyOn(cowsStore, 'fetchAll').mockResolvedValue()
    cowsStore.cows = MOCK_COWS
    cowsStore.total = 3

    mount(CowListView, { global: { stubs } })
    await flushPromises()

    expect(cowsStore.fetchAll).toHaveBeenCalled()
  })

  it('renders cow cards for each cow', async () => {
    setAdmin()
    const cowsStore = useCowsStore()
    vi.spyOn(cowsStore, 'fetchAll').mockResolvedValue()
    cowsStore.cows = MOCK_COWS
    cowsStore.total = 3

    const wrapper = mount(CowListView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.findAll('.cow-card')).toHaveLength(3)
  })

  it('shows loading spinner when store is loading', async () => {
    setAdmin()
    const cowsStore = useCowsStore()
    vi.spyOn(cowsStore, 'fetchAll').mockResolvedValue()
    cowsStore.loading = true

    const wrapper = mount(CowListView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.spinner').exists()).toBe(true)
  })

  it('shows error state with retry button on error', async () => {
    setAdmin()
    const cowsStore = useCowsStore()
    vi.spyOn(cowsStore, 'fetchAll').mockResolvedValue()
    cowsStore.error = 'Network error'
    cowsStore.loading = false

    const wrapper = mount(CowListView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.error-state').exists()).toBe(true)
    expect(wrapper.find('.error-state').text()).toContain('Network error')
  })

  it('shows empty state when no cows', async () => {
    setAdmin()
    const cowsStore = useCowsStore()
    vi.spyOn(cowsStore, 'fetchAll').mockResolvedValue()
    cowsStore.cows = []
    cowsStore.total = 0
    cowsStore.loading = false

    const wrapper = mount(CowListView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.empty-state').exists()).toBe(true)
  })

  it('shows FAB button for admin', async () => {
    setAdmin()
    const cowsStore = useCowsStore()
    vi.spyOn(cowsStore, 'fetchAll').mockResolvedValue()
    cowsStore.cows = MOCK_COWS

    const wrapper = mount(CowListView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.fab').exists()).toBe(true)
  })

  it('hides FAB button for worker without canManageCows', async () => {
    setWorker()
    const cowsStore = useCowsStore()
    vi.spyOn(cowsStore, 'fetchAll').mockResolvedValue()
    cowsStore.cows = MOCK_COWS

    const wrapper = mount(CowListView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.fab').exists()).toBe(false)
  })

  it('status filter chips rendered with correct count', async () => {
    setAdmin()
    const cowsStore = useCowsStore()
    vi.spyOn(cowsStore, 'fetchAll').mockResolvedValue()
    cowsStore.cows = MOCK_COWS

    const wrapper = mount(CowListView, { global: { stubs } })
    await flushPromises()

    // 7 status filter chips: all, active, dry, pregnant, sick, sold, dead
    const chipSections = wrapper.findAll('.filter-chips-wrap')
    const statusChips = chipSections[0].findAll('.chip')
    expect(statusChips).toHaveLength(7)
  })
})
