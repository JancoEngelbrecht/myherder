import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import CowIssueHistoryView from '../views/CowIssueHistoryView.vue'

// Router mock — CowIssueHistoryView only uses useRoute, not useRouter
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
}

const MOCK_ISSUES = [
  {
    id: 'issue-1',
    cow_id: 'cow-1',
    issue_types: ['mastitis'],
    severity: 'high',
    status: 'open',
    observed_at: '2024-01-15T08:00:00Z',
    description: 'Swollen udder',
  },
  {
    id: 'issue-2',
    cow_id: 'cow-1',
    issue_types: ['lameness'],
    severity: 'medium',
    status: 'resolved',
    observed_at: '2024-01-10T08:00:00Z',
    description: 'Limping on front left',
  },
]

describe('CowIssueHistoryView', () => {
  let cowsStore, healthIssuesStore, issueTypesStore

  beforeEach(async () => {
    vi.clearAllMocks()
    mockRouteParams = { id: 'cow-1' }
    setActivePinia(createPinia())

    const { useCowsStore } = await import('../stores/cows.js')
    const { useHealthIssuesStore } = await import('../stores/healthIssues.js')
    const { useIssueTypesStore } = await import('../stores/issueTypes.js')

    cowsStore = useCowsStore()
    healthIssuesStore = useHealthIssuesStore()
    issueTypesStore = useIssueTypesStore()

    vi.spyOn(cowsStore, 'fetchOne').mockResolvedValue(MOCK_COW)
    vi.spyOn(healthIssuesStore, 'fetchByCow').mockResolvedValue(MOCK_ISSUES)
    vi.spyOn(issueTypesStore, 'fetchAll').mockResolvedValue([])

    // getCowIssues returns issues for the given cow
    vi.spyOn(healthIssuesStore, 'getCowIssues').mockReturnValue(MOCK_ISSUES)
  })

  it('renders list of issues for a specific cow', async () => {
    const wrapper = mount(CowIssueHistoryView, { global: { stubs } })
    await flushPromises()
    // Should show both issues
    const html = wrapper.html()
    expect(html).toBeTruthy()
    // fetchByCow should have been called with the cow ID from route params
    expect(healthIssuesStore.fetchByCow).toHaveBeenCalledWith('cow-1')
  })

  it('issue items link to issue detail', async () => {
    const wrapper = mount(CowIssueHistoryView, { global: { stubs } })
    await flushPromises()
    // RouterLink stubs render as <a> elements; check href attributes or text
    const links = wrapper.findAll('a')
    const issueLinks = links.filter(
      (a) => a.attributes('href')?.includes('/issues/') || a.attributes('to')?.includes('/issues/')
    )
    expect(issueLinks.length).toBeGreaterThan(0)
  })

  it('shows empty state when no issues exist', async () => {
    healthIssuesStore.fetchByCow = vi.fn().mockResolvedValue([])
    healthIssuesStore.getCowIssues = vi.fn().mockReturnValue([])
    const wrapper = mount(CowIssueHistoryView, { global: { stubs } })
    await flushPromises()
    const html = wrapper.html()
    // Empty state element or text should be present
    const hasEmpty =
      wrapper.find('.empty-state').exists() ||
      html.toLowerCase().includes('no issue') ||
      html.toLowerCase().includes('geen')
    expect(hasEmpty).toBe(true)
  })
})
