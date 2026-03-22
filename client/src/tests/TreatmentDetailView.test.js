import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TreatmentDetailView from '../views/TreatmentDetailView.vue'

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

const MOCK_TREATMENT = {
  id: 'tx-1',
  cow_id: 'cow-1',
  tag_number: '001',
  cow_name: 'Bessie',
  medication_name: 'Pen-Strep',
  dosage: '10ml',
  cost: 150.5,
  treatment_date: '2024-01-15T10:00:00Z',
  administered_by_name: 'Admin',
  is_vet_visit: true,
  vet_name: 'Dr Smith',
  withdrawal_end_milk: '2024-01-20T10:00:00Z',
  withdrawal_end_meat: '2024-01-25T10:00:00Z',
  notes: 'Follow-up in 3 days',
}

describe('TreatmentDetailView', () => {
  let treatmentsStore, authStore

  beforeEach(async () => {
    vi.clearAllMocks()
    mockRouteParams = { id: 'tx-1' }
    setActivePinia(createPinia())

    const { useTreatmentsStore } = await import('../stores/treatments.js')
    const { useAuthStore } = await import('../stores/auth.js')

    treatmentsStore = useTreatmentsStore()
    authStore = useAuthStore()

    authStore.user = { id: 'user-1', role: 'admin', permissions: [] }

    vi.spyOn(treatmentsStore, 'fetchOne').mockResolvedValue(MOCK_TREATMENT)
  })

  it('renders treatment info (medication, dosage, cost)', async () => {
    treatmentsStore.fetchOne = vi.fn().mockResolvedValue(MOCK_TREATMENT)
    const wrapper = mount(TreatmentDetailView, { global: { stubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('Pen-Strep')
    expect(wrapper.text()).toContain('10ml')
    expect(wrapper.text()).toContain('Bessie')
  })

  it('shows withdrawal dates when present', async () => {
    treatmentsStore.fetchOne = vi.fn().mockResolvedValue(MOCK_TREATMENT)
    const wrapper = mount(TreatmentDetailView, { global: { stubs } })
    await flushPromises()
    const html = wrapper.html()
    // Withdrawal section should be present since both dates are set
    expect(html.toLowerCase()).toMatch(/withdrawal|milk|meat/i)
  })

  it('shows vet info when is_vet_visit is true', async () => {
    treatmentsStore.fetchOne = vi.fn().mockResolvedValue(MOCK_TREATMENT)
    const wrapper = mount(TreatmentDetailView, { global: { stubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('Dr Smith')
  })

  it('delete button visible for admin only', async () => {
    // Admin sees delete (user already set to admin in beforeEach)
    treatmentsStore.fetchOne = vi.fn().mockResolvedValue(MOCK_TREATMENT)
    const adminWrapper = mount(TreatmentDetailView, { global: { stubs } })
    await flushPromises()
    const adminHtml = adminWrapper.html()
    const adminHasDelete =
      adminHtml.toLowerCase().includes('delete') ||
      adminWrapper.findAll('button').some((b) => b.text().toLowerCase().includes('delete'))
    expect(adminHasDelete).toBe(true)

    // Worker does not see delete
    vi.clearAllMocks()
    setActivePinia(createPinia())
    const { useTreatmentsStore: useTx2 } = await import('../stores/treatments.js')
    const { useAuthStore: useAuth2 } = await import('../stores/auth.js')
    const tx2 = useTx2()
    const auth2 = useAuth2()
    auth2.user = { id: 'user-2', role: 'worker', permissions: [] }
    vi.spyOn(tx2, 'fetchOne').mockResolvedValue(MOCK_TREATMENT)
    const workerWrapper = mount(TreatmentDetailView, { global: { stubs } })
    await flushPromises()
    const workerDeleteButtons = workerWrapper
      .findAll('button')
      .filter((b) => b.text().toLowerCase().includes('delete'))
    expect(workerDeleteButtons.length).toBe(0)
  })
})
