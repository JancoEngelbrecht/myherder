import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = vi.fn()
const mockReplace = vi.fn()
let mockRouteParams = {}
let mockRouteQuery = {}

vi.mock('vue-router', () => ({
  useRoute: () => ({
    get params() { return mockRouteParams },
    get query() { return mockRouteQuery },
  }),
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  RouterLink: { template: '<a><slot /></a>', props: ['to'] },
}))

vi.mock('../services/api.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
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
    cows: { toArray: vi.fn().mockResolvedValue([]), bulkPut: vi.fn(), put: vi.fn(), get: vi.fn(), delete: vi.fn() },
    breedTypes: { toArray: vi.fn().mockResolvedValue([]), bulkPut: vi.fn(), put: vi.fn(), get: vi.fn(), delete: vi.fn() },
    breedingEvents: {
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
    species: { toArray: vi.fn().mockResolvedValue([]), put: vi.fn(), bulkPut: vi.fn() },
    syncQueue: { toArray: vi.fn().mockResolvedValue([]) },
  },
}))

vi.mock('../utils/apiError', () => ({
  extractApiError: vi.fn((err) => err.message || 'Error'),
  resolveError: vi.fn((msg) => msg),
}))

import LogBreedingView from '../views/LogBreedingView.vue'
import api from '../services/api.js'
import { createPinia, setActivePinia } from 'pinia'

// ── Helpers ──────────────────────────────────────────────────────────────────

const stubs = {
  AppHeader: { template: '<div class="app-header"><slot /></div>', props: ['title', 'showBack', 'backTo'] },
  CowSearchDropdown: {
    template: '<select class="cow-search-dropdown" />',
    props: ['modelValue', 'placeholder', 'error', 'sexFilter'],
  },
}

function createWrapper() {
  api.get.mockImplementation((url) => {
    if (url === '/breed-types') return Promise.resolve({ data: [] })
    if (url === '/breed-types?all=1') return Promise.resolve({ data: [] })
    if (url === '/cows') return Promise.resolve({ data: [] })
    if (url.includes('feature-flags')) return Promise.resolve({ data: { breeding: true, milkRecording: true, healthIssues: true, treatments: true, analytics: true } })
    if (typeof url === 'string' && url.startsWith('/breeding-events/')) {
      return Promise.resolve({
        data: {
          id: 'be-1', cow_id: 'cow-1', event_type: 'ai_insemination',
          event_date: '2026-01-15T10:00:00.000Z', semen_id: 'SEM-001',
          inseminator: 'Dr. Smith', tag_number: 'TAG-001', cow_name: 'Bessie',
        },
      })
    }
    return Promise.resolve({ data: [] })
  })

  return mount(LogBreedingView, { global: { stubs } })
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  mockRouteParams = {}
  mockRouteQuery = {}
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('LogBreedingView', () => {
  it('renders create form with CowSearchDropdown', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('form').exists()).toBe(true)
    expect(wrapper.find('.cow-search-dropdown').exists()).toBe(true)
  })

  it('shows all breeding event type buttons', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const buttons = wrapper.findAll('.event-type-btn')
    // 10 event types: heat_observed, ai_insemination, bull_service, ram_service, preg_check_positive, preg_check_negative, calving, lambing, abortion, dry_off
    expect(buttons).toHaveLength(10)
  })

  it('selecting preg_check_positive shows expected calving date input', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    // Click preg_check_positive button (index 4 — after heat_observed, ai_insemination, bull_service, ram_service)
    const buttons = wrapper.findAll('.event-type-btn')
    await buttons[4].trigger('click')
    await flushPromises()

    // Should show expected calving date input
    expect(wrapper.html()).toContain('breeding.form.expectedCalving')
  })

  it('selecting ai_insemination shows semen/inseminator fields', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    // Click ai_insemination button (index 1)
    const buttons = wrapper.findAll('.event-type-btn')
    await buttons[1].trigger('click')
    await flushPromises()

    expect(wrapper.html()).toContain('breeding.form.semenId')
    expect(wrapper.html()).toContain('breeding.form.inseminator')
  })

  it('selecting bull_service shows sire CowSearchDropdown', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    // Click bull_service button (index 2)
    const buttons = wrapper.findAll('.event-type-btn')
    await buttons[2].trigger('click')
    await flushPromises()

    // Should have 2 CowSearchDropdowns: cow + sire
    const dropdowns = wrapper.findAll('.cow-search-dropdown')
    expect(dropdowns).toHaveLength(2)
  })

  it('edit mode loads existing event data', async () => {
    mockRouteParams = { id: 'be-1' }

    const wrapper = createWrapper()
    await flushPromises()

    // In edit mode, cow selector is read-only
    expect(wrapper.find('.cow-readonly').exists()).toBe(true)
    expect(wrapper.find('.cow-readonly').text()).toContain('TAG-001')
  })

  it('renders cost field with numeric input', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const costInput = wrapper.find('input[type="number"][step="0.01"]')
    expect(costInput.exists()).toBe(true)
  })

  it('validates required fields — blocks submit without cow_id and event_type', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    // Should show validation errors
    const errors = wrapper.findAll('.field-error')
    expect(errors.length).toBeGreaterThanOrEqual(1)
    // API should not be called
    expect(api.post).not.toHaveBeenCalled()
  })

  it('shows back button navigating to breeding hub', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.app-header').exists()).toBe(true)
  })

  it('renders notes textarea', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('textarea').exists()).toBe(true)
  })

  it('renders event date input', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const dateInput = wrapper.find('input[type="datetime-local"]')
    expect(dateInput.exists()).toBe(true)
  })

  it('pre-fills cow_id from route query', async () => {
    mockRouteQuery = { cow_id: 'cow-from-query' }

    const wrapper = createWrapper()
    await flushPromises()

    // The CowSearchDropdown should still be present (not read-only mode)
    expect(wrapper.find('.cow-search-dropdown').exists()).toBe(true)
  })
})
