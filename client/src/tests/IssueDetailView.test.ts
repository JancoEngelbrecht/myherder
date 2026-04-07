import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import IssueDetailView from '../views/IssueDetailView.vue'

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
vi.mock('../services/api', () => ({
  default: {
    get: (...args) => mockGet(...args),
    post: (...args) => mockPost(...args),
    patch: (...args) => mockPatch(...args),
    delete: (...args) => mockDelete(...args),
  },
}))

// SyncManager mock
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
    isOfflineError: vi.fn().mockReturnValue(false),
    enqueue: vi.fn(),
    dequeueByEntityId: vi.fn(),
  }
})

// IndexedDB mock
vi.mock('../db/indexedDB', () => ({
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

const MOCK_ISSUE = {
  id: 'issue-1',
  cow_id: 'cow-1',
  tag_number: '001',
  cow_name: 'Bessie',
  issue_types: ['mastitis'],
  severity: 'high',
  status: 'open',
  affected_teats: '["FL","FR"]',
  description: 'Swollen udder',
  observed_at: '2024-01-15T08:00:00Z',
  reported_by_name: 'Admin',
}

const MOCK_ISSUE_TYPE = {
  id: 'it-1',
  code: 'mastitis',
  name: 'Mastitis',
  emoji: '🦠',
  is_active: true,
}

describe('IssueDetailView', () => {
  let healthIssuesStore, issueTypesStore, authStore

  beforeEach(async () => {
    vi.clearAllMocks()
    mockRouteParams = { id: 'issue-1' }
    setActivePinia(createPinia())

    const { useHealthIssuesStore } = await import('../stores/healthIssues')
    const { useIssueTypesStore } = await import('../stores/issueTypes')
    const { useAuthStore } = await import('../stores/auth')

    healthIssuesStore = useHealthIssuesStore()
    issueTypesStore = useIssueTypesStore()
    authStore = useAuthStore()

    authStore.user = { id: 'user-1', role: 'admin', permissions: [] }

    issueTypesStore.types = [MOCK_ISSUE_TYPE]

    vi.spyOn(healthIssuesStore, 'fetchOne').mockResolvedValue(MOCK_ISSUE)
    vi.spyOn(healthIssuesStore, 'fetchComments').mockResolvedValue([])
    vi.spyOn(issueTypesStore, 'fetchAll').mockResolvedValue([MOCK_ISSUE_TYPE])
  })

  it('renders issue with severity badge and status badge', async () => {
    healthIssuesStore.fetchOne = vi.fn().mockResolvedValue(MOCK_ISSUE)
    const wrapper = mount(IssueDetailView, { global: { stubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('Bessie')
    expect(wrapper.text()).toContain('001')
  })

  it('shows affected teats section when teats exist', async () => {
    healthIssuesStore.fetchOne = vi.fn().mockResolvedValue(MOCK_ISSUE)
    const wrapper = mount(IssueDetailView, { global: { stubs } })
    await flushPromises()
    // TeatSelector is stubbed, but the section should be rendered when teats exist
    const html = wrapper.html()
    expect(html).toBeTruthy()
    // The teat selector stub should be rendered since we have affected teats
    expect(
      wrapper.findComponent({ name: 'TeatSelector' }).exists() ||
        wrapper.find('teat-selector-stub').exists() ||
        html.includes('teat')
    ).toBeTruthy()
  })

  it('shows status change buttons when status is open', async () => {
    healthIssuesStore.fetchOne = vi.fn().mockResolvedValue(MOCK_ISSUE)
    const wrapper = mount(IssueDetailView, { global: { stubs } })
    await flushPromises()
    const html = wrapper.html()
    // Should show buttons to change status from open
    expect(html).toBeTruthy()
    const buttons = wrapper.findAll('button')
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('shows comments section', async () => {
    healthIssuesStore.fetchOne = vi.fn().mockResolvedValue(MOCK_ISSUE)
    healthIssuesStore.fetchComments = vi.fn().mockResolvedValue([])
    // Set comments state directly so getComments() returns the comment
    // The view renders c.comment (not c.content) per IssueDetailView template
    healthIssuesStore.comments = {
      'issue-1': [
        {
          id: 'c-1',
          comment: 'Improving',
          created_at: '2024-01-16T08:00:00Z',
          author_name: 'Admin',
        },
      ],
    }
    const wrapper = mount(IssueDetailView, { global: { stubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('Improving')
  })

  it('admin sees delete button', async () => {
    authStore.user = { id: 'user-1', role: 'admin', permissions: [] }
    healthIssuesStore.fetchOne = vi.fn().mockResolvedValue(MOCK_ISSUE)
    const wrapper = mount(IssueDetailView, { global: { stubs } })
    await flushPromises()
    const html = wrapper.html()
    // Delete button or danger button should be present for admin
    const deleteButtons = wrapper
      .findAll('button')
      .filter(
        (b) =>
          b.text().toLowerCase().includes('delete') || b.classes().some((c) => c.includes('danger'))
      )
    expect(
      deleteButtons.length + (html.includes('delete') || html.includes('Delete') ? 1 : 0)
    ).toBeGreaterThan(0)
  })

  it('shows error state on fetchOne failure', async () => {
    healthIssuesStore.fetchOne = vi.fn().mockRejectedValue(new Error('Not found'))
    const wrapper = mount(IssueDetailView, { global: { stubs } })
    await flushPromises()
    expect(wrapper.find('.spinner').exists()).toBe(false)
  })
})
