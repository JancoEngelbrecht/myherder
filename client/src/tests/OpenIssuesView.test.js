import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import OpenIssuesView from '../views/OpenIssuesView.vue'
import { useHealthIssuesStore } from '../stores/healthIssues'
import { useIssueTypesStore } from '../stores/issueTypes'

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
    issueTypes: { bulkPut: vi.fn(), put: vi.fn(), toArray: vi.fn().mockResolvedValue([]) },
    syncQueue: {
      where: vi.fn().mockReturnValue({
        aboveOrEqual: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }),
      bulkDelete: vi.fn(),
    },
  },
}))

const MOCK_ISSUES = [
  {
    id: 'i1',
    cow_id: 'c1',
    tag_number: '001',
    cow_name: 'Bessie',
    issue_types: ['mastitis'],
    severity: 'high',
    status: 'open',
    observed_at: '2024-01-15T08:00:00Z',
  },
  {
    id: 'i2',
    cow_id: 'c2',
    tag_number: '002',
    cow_name: 'Daisy',
    issue_types: ['lameness'],
    severity: 'medium',
    status: 'open',
    observed_at: '2024-01-16T09:00:00Z',
  },
]

const stubs = {
  SyncIndicator: true,
  SyncPanel: true,
  RouterLink: { template: '<a v-bind="$attrs"><slot /></a>' },
  SearchInput: { template: '<input class="search-input" />', emits: ['update:model-value'] },
  PaginationBar: { template: '<div class="pagination" />', props: ['total', 'page', 'limit'] },
}

describe('OpenIssuesView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders open issues list', async () => {
    const store = useHealthIssuesStore()
    vi.spyOn(store, 'fetchAll').mockResolvedValue()
    store.allIssues = MOCK_ISSUES
    store.allIssuesTotal = 2

    const issueTypesStore = useIssueTypesStore()
    vi.spyOn(issueTypesStore, 'fetchAll').mockResolvedValue()

    const wrapper = mount(OpenIssuesView, { global: { stubs } })
    await flushPromises()

    const items = wrapper.findAll('.issue-item')
    expect(items).toHaveLength(2)
  })

  it('shows filter tabs (open, treating, all)', async () => {
    const store = useHealthIssuesStore()
    vi.spyOn(store, 'fetchAll').mockResolvedValue()
    store.allIssues = MOCK_ISSUES

    const issueTypesStore = useIssueTypesStore()
    vi.spyOn(issueTypesStore, 'fetchAll').mockResolvedValue()

    const wrapper = mount(OpenIssuesView, { global: { stubs } })
    await flushPromises()

    const tabs = wrapper.findAll('.filter-tab')
    expect(tabs).toHaveLength(3)
  })

  it('shows empty state when no issues', async () => {
    const store = useHealthIssuesStore()
    vi.spyOn(store, 'fetchAll').mockResolvedValue()
    store.allIssues = []
    store.allIssuesTotal = 0
    store.loadingAll = false

    const issueTypesStore = useIssueTypesStore()
    vi.spyOn(issueTypesStore, 'fetchAll').mockResolvedValue()

    const wrapper = mount(OpenIssuesView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.empty-state').exists()).toBe(true)
  })

  it('shows loading spinner while loading', async () => {
    const store = useHealthIssuesStore()
    vi.spyOn(store, 'fetchAll').mockResolvedValue()
    store.loadingAll = true

    const issueTypesStore = useIssueTypesStore()
    vi.spyOn(issueTypesStore, 'fetchAll').mockResolvedValue()

    const wrapper = mount(OpenIssuesView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.spinner').exists()).toBe(true)
  })

  it('has FAB link to log issue', async () => {
    const store = useHealthIssuesStore()
    vi.spyOn(store, 'fetchAll').mockResolvedValue()
    store.allIssues = []

    const issueTypesStore = useIssueTypesStore()
    vi.spyOn(issueTypesStore, 'fetchAll').mockResolvedValue()

    const wrapper = mount(OpenIssuesView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.fab').exists()).toBe(true)
  })
})
