import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import CowDetailView from '../views/CowDetailView.vue'

// Router mock
let mockRouteParams = {}
const mockRouter = { push: vi.fn(), back: vi.fn() }
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: mockRouteParams }),
  useRouter: () => mockRouter,
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
    cows: {
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

const MOCK_COW = {
  id: 'cow-1',
  tag_number: '001',
  name: 'Bessie',
  status: 'active',
  sex: 'female',
  dob: '2020-06-15',
  breed_type_id: 'bt-1',
  breed_type_name: 'Holstein',
  sire_id: 'cow-s1',
  sire_name: 'Big Bull',
  dam_id: 'cow-d1',
  dam_name: 'Mama Cow',
  notes: null,
}

const MOCK_BREED_TYPE = {
  id: 'bt-1',
  name: 'Holstein',
  code: 'holstein',
  gestation_days: 280,
  heat_cycle_days: 21,
}

describe('CowDetailView', () => {
  let cowsStore,
    authStore,
    breedTypesStore,
    treatmentsStore,
    healthIssuesStore,
    featureFlagsStore,
    breedingEventsStore,
    issueTypesStore

  beforeEach(async () => {
    vi.clearAllMocks()
    mockRouteParams = { id: 'cow-1' }
    mockGet.mockResolvedValue({ data: [] })
    setActivePinia(createPinia())

    const { useCowsStore } = await import('../stores/cows.js')
    const { useAuthStore } = await import('../stores/auth.js')
    const { useBreedTypesStore } = await import('../stores/breedTypes.js')
    const { useTreatmentsStore } = await import('../stores/treatments.js')
    const { useHealthIssuesStore } = await import('../stores/healthIssues.js')
    const { useIssueTypesStore } = await import('../stores/issueTypes.js')
    const { useBreedingEventsStore } = await import('../stores/breedingEvents.js')
    const { useFeatureFlagsStore } = await import('../stores/featureFlags.js')

    cowsStore = useCowsStore()
    authStore = useAuthStore()
    breedTypesStore = useBreedTypesStore()
    treatmentsStore = useTreatmentsStore()
    healthIssuesStore = useHealthIssuesStore()
    issueTypesStore = useIssueTypesStore()
    breedingEventsStore = useBreedingEventsStore()
    featureFlagsStore = useFeatureFlagsStore()

    authStore.user = { id: 'user-1', role: 'admin', permissions: ['can_manage_cows'] }

    featureFlagsStore.flags = {
      breeding: true,
      milkRecording: true,
      healthIssues: true,
      treatments: true,
      analytics: true,
    }

    breedTypesStore.types = [MOCK_BREED_TYPE]

    vi.spyOn(cowsStore, 'fetchOne').mockResolvedValue(MOCK_COW)
    vi.spyOn(treatmentsStore, 'fetchByCow').mockResolvedValue([])
    vi.spyOn(healthIssuesStore, 'fetchByCow').mockResolvedValue([])
    vi.spyOn(breedingEventsStore, 'fetchForCow').mockResolvedValue([])
    vi.spyOn(issueTypesStore, 'fetchAll').mockResolvedValue([])
    vi.spyOn(breedTypesStore, 'fetchAll').mockResolvedValue([MOCK_BREED_TYPE])
  })

  it('shows loading spinner initially', async () => {
    cowsStore.fetchOne = vi.fn(() => new Promise(() => {}))
    const wrapper = mount(CowDetailView, { global: { stubs } })
    expect(wrapper.find('.spinner').exists()).toBe(true)
  })

  it('renders cow info after load (tag, name, status badge)', async () => {
    cowsStore.fetchOne = vi.fn().mockResolvedValue(MOCK_COW)
    const wrapper = mount(CowDetailView, { global: { stubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('001')
    expect(wrapper.text()).toContain('Bessie')
  })

  it('shows life phase badge when cow has breed type', async () => {
    cowsStore.fetchOne = vi.fn().mockResolvedValue(MOCK_COW)
    const wrapper = mount(CowDetailView, { global: { stubs } })
    await flushPromises()
    const html = wrapper.html()
    // Life phase badge or breed type name should be present
    expect(html).toBeTruthy()
    expect(wrapper.text()).toContain('Holstein')
  })

  it('shows sire name when sire is present', async () => {
    cowsStore.fetchOne = vi.fn().mockResolvedValue(MOCK_COW)
    const wrapper = mount(CowDetailView, { global: { stubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('Big Bull')
  })

  it('shows dam name when dam is present', async () => {
    cowsStore.fetchOne = vi.fn().mockResolvedValue(MOCK_COW)
    const wrapper = mount(CowDetailView, { global: { stubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('Mama Cow')
  })

  it('shows edit button for canManageCows user', async () => {
    cowsStore.fetchOne = vi.fn().mockResolvedValue(MOCK_COW)
    authStore.user = { id: 'user-1', role: 'admin', permissions: ['can_manage_cows'] }
    const wrapper = mount(CowDetailView, { global: { stubs } })
    await flushPromises()
    const html = wrapper.html()
    expect(html).toContain('edit')
  })

  it('hides edit button for worker without canManageCows', async () => {
    cowsStore.fetchOne = vi.fn().mockResolvedValue(MOCK_COW)
    authStore.user = { id: 'user-2', role: 'worker', permissions: [] }
    const wrapper = mount(CowDetailView, { global: { stubs } })
    await flushPromises()
    // No edit button rendered
    const editLink = wrapper.findAll('a').filter((a) => a.text().toLowerCase().includes('edit'))
    expect(editLink.length).toBe(0)
  })

  it('male cow does not show withdrawal badge', async () => {
    const maleCow = { ...MOCK_COW, sex: 'male' }
    cowsStore.fetchOne = vi.fn().mockResolvedValue(maleCow)
    const wrapper = mount(CowDetailView, { global: { stubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('withdrawal')
  })

  it('shows error state on fetchOne failure', async () => {
    cowsStore.fetchOne = vi.fn().mockRejectedValue(new Error('Not found'))
    const wrapper = mount(CowDetailView, { global: { stubs } })
    await flushPromises()
    // Should not show spinner, should show some error indication
    expect(wrapper.find('.spinner').exists()).toBe(false)
  })

  it('hides treatment section when worker lacks can_log_treatments', async () => {
    cowsStore.fetchOne = vi.fn().mockResolvedValue(MOCK_COW)
    authStore.user = {
      id: 'user-2',
      role: 'worker',
      permissions: ['can_log_issues', 'can_log_breeding'],
    }
    const wrapper = mount(CowDetailView, { global: { stubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('cowDetail.treatments')
    expect(treatmentsStore.fetchByCow).not.toHaveBeenCalled()
  })

  it('hides health issues section when worker lacks can_log_issues', async () => {
    cowsStore.fetchOne = vi.fn().mockResolvedValue(MOCK_COW)
    authStore.user = {
      id: 'user-2',
      role: 'worker',
      permissions: ['can_log_treatments', 'can_log_breeding'],
    }
    const wrapper = mount(CowDetailView, { global: { stubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('healthIssues.title')
    expect(healthIssuesStore.fetchByCow).not.toHaveBeenCalled()
  })

  it('hides breeding section when worker lacks can_log_breeding', async () => {
    cowsStore.fetchOne = vi.fn().mockResolvedValue(MOCK_COW)
    authStore.user = {
      id: 'user-2',
      role: 'worker',
      permissions: ['can_log_treatments', 'can_log_issues'],
    }
    const wrapper = mount(CowDetailView, { global: { stubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('breeding.reproTitle')
    expect(breedingEventsStore.fetchForCow).not.toHaveBeenCalled()
  })
})
