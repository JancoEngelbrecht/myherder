import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = vi.fn()
const mockReplace = vi.fn()
let mockRouteQuery = {}

vi.mock('vue-router', () => ({
  useRoute: () => ({
    params: {},
    get query() {
      return mockRouteQuery
    },
  }),
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  RouterLink: { template: '<a><slot /></a>', props: ['to'] },
}))

vi.mock('../services/api.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
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
    cows: { toArray: vi.fn().mockResolvedValue([]), bulkPut: vi.fn(), put: vi.fn() },
    issueTypes: {
      toArray: vi.fn().mockResolvedValue([]),
      bulkPut: vi.fn(),
      put: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
    },
    healthIssues: {
      toArray: vi.fn().mockResolvedValue([]),
      bulkPut: vi.fn(),
      put: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      where: vi.fn().mockReturnValue({
        equals: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }),
    },
    featureFlags: { toArray: vi.fn().mockResolvedValue([]), put: vi.fn(), bulkPut: vi.fn() },
    syncQueue: { toArray: vi.fn().mockResolvedValue([]) },
  },
}))

vi.mock('../utils/apiError', () => ({
  extractApiError: vi.fn((err) => err.message || 'Error'),
  resolveError: vi.fn((msg) => msg),
}))

import LogIssueView from '../views/LogIssueView.vue'
import api from '../services/api.js'
import { createPinia, setActivePinia } from 'pinia'

// ── Helpers ──────────────────────────────────────────────────────────────────

const ISSUE_TYPES = [
  {
    id: 'it-1',
    code: 'mastitis',
    name: 'Mastitis',
    emoji: '🩺',
    is_active: 1,
    requires_teat_selection: true,
    sort_order: 0,
  },
  {
    id: 'it-2',
    code: 'lameness',
    name: 'Lameness',
    emoji: '🦶',
    is_active: 1,
    requires_teat_selection: false,
    sort_order: 1,
  },
  {
    id: 'it-3',
    code: 'bloat',
    name: 'Bloat',
    emoji: '🫧',
    is_active: 1,
    requires_teat_selection: false,
    sort_order: 2,
  },
]

const stubs = {
  AppHeader: {
    template: '<div class="app-header"><slot /></div>',
    props: ['title', 'showBack', 'backTo'],
  },
  CowSearchDropdown: {
    template: '<select class="cow-search-dropdown" />',
    props: ['modelValue', 'placeholder', 'error'],
  },
  TeatSelector: {
    template: '<div class="teat-selector" />',
    props: ['modelValue'],
  },
}

function createWrapper() {
  api.get.mockImplementation((url) => {
    if (url === '/issue-types')
      return Promise.resolve({ data: ISSUE_TYPES, headers: { 'x-total-count': '3' } })
    if (url === '/cows') return Promise.resolve({ data: [] })
    if (url.includes('feature-flags'))
      return Promise.resolve({
        data: {
          breeding: true,
          milkRecording: true,
          healthIssues: true,
          treatments: true,
          analytics: true,
        },
      })
    return Promise.resolve({ data: [] })
  })

  return mount(LogIssueView, { global: { stubs } })
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  mockRouteQuery = {}
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('LogIssueView', () => {
  it('renders form with CowSearchDropdown', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('form').exists()).toBe(true)
    expect(wrapper.find('.cow-search-dropdown').exists()).toBe(true)
  })

  it('populates issue type buttons from issueTypesStore', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const buttons = wrapper.findAll('.issue-btn')
    expect(buttons).toHaveLength(3)
    expect(buttons[0].text()).toContain('Mastitis')
    expect(buttons[1].text()).toContain('Lameness')
    expect(buttons[2].text()).toContain('Bloat')
  })

  it('shows TeatSelector when mastitis-type issue selected', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    // Initially no TeatSelector
    expect(wrapper.find('.teat-selector').exists()).toBe(false)

    // Click mastitis button (requires_teat_selection: true)
    await wrapper.findAll('.issue-btn')[0].trigger('click')
    await flushPromises()

    expect(wrapper.find('.teat-selector').exists()).toBe(true)
  })

  it('hides TeatSelector for non-mastitis issues', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    // Click lameness (no teat selection required)
    await wrapper.findAll('.issue-btn')[1].trigger('click')
    await flushPromises()

    expect(wrapper.find('.teat-selector').exists()).toBe(false)
  })

  it('renders severity buttons (low, medium, high)', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const severityBtns = wrapper.findAll('.severity-btn')
    expect(severityBtns).toHaveLength(3)
  })

  it('validates required cow field — blocks submit without cow', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    // Select an issue type so only cow is missing
    await wrapper.findAll('.issue-btn')[1].trigger('click')
    await flushPromises()

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    // Should not call API
    expect(api.post).not.toHaveBeenCalled()
  })

  it('validates required issue type — blocks submit without issue type', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const errors = wrapper.findAll('.field-error')
    expect(errors.length).toBeGreaterThanOrEqual(1)
  })

  it('renders notes textarea', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('textarea').exists()).toBe(true)
  })

  it('renders observed date input', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const dateInput = wrapper.find('input[type="datetime-local"]')
    expect(dateInput.exists()).toBe(true)
  })

  it('shows back button via AppHeader', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.app-header').exists()).toBe(true)
  })
})
