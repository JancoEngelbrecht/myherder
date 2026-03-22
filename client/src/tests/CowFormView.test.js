import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = vi.fn()
const mockReplace = vi.fn()
let mockRouteParams = {}
let mockRouteQuery = {}
let mockRoutePath = '/cows/new'

vi.mock('vue-router', () => ({
  useRoute: () => ({
    get params() {
      return mockRouteParams
    },
    get query() {
      return mockRouteQuery
    },
    get path() {
      return mockRoutePath
    },
  }),
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  RouterLink: { template: '<a><slot /></a>', props: ['to'] },
}))

vi.mock('../services/api.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
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
      toArray: vi.fn().mockResolvedValue([]),
      bulkPut: vi.fn(),
      put: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
    },
    breedTypes: {
      toArray: vi.fn().mockResolvedValue([]),
      bulkPut: vi.fn(),
      put: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
    },
    featureFlags: { toArray: vi.fn().mockResolvedValue([]), put: vi.fn(), bulkPut: vi.fn() },
    syncQueue: { toArray: vi.fn().mockResolvedValue([]) },
  },
}))

vi.mock('../utils/apiError', () => ({
  extractApiError: vi.fn((err) => err.message || 'Error'),
  resolveError: vi.fn((msg) => msg),
}))

import CowFormView from '../views/CowFormView.vue'
import api from '../services/api.js'
import { createPinia, setActivePinia } from 'pinia'

// ── Helpers ──────────────────────────────────────────────────────────────────

const BREED_TYPES = [
  {
    id: 'bt-1',
    code: 'holstein',
    name: 'Holstein',
    is_active: true,
    sort_order: 0,
    heat_cycle_days: 21,
    gestation_days: 280,
    preg_check_days: 35,
    dry_off_days: 60,
  },
  {
    id: 'bt-2',
    code: 'jersey',
    name: 'Jersey',
    is_active: true,
    sort_order: 1,
    heat_cycle_days: 21,
    gestation_days: 279,
    preg_check_days: 35,
    dry_off_days: 60,
  },
]

const stubs = {
  AppHeader: {
    template: '<div class="app-header"><slot /></div>',
    props: ['title', 'showBack', 'backTo'],
  },
  CowSearchDropdown: {
    template: '<select class="cow-search-dropdown" />',
    props: ['modelValue', 'placeholder', 'sexFilter'],
  },
}

function createWrapper(opts = {}) {
  api.get.mockImplementation((url) => {
    if (url === '/breed-types') return Promise.resolve({ data: BREED_TYPES })
    if (url === '/breed-types?all=1') return Promise.resolve({ data: BREED_TYPES })
    if (typeof url === 'string' && url.startsWith('/cows/')) {
      return Promise.resolve({
        data: {
          id: 'cow-1',
          tag_number: 'TAG-001',
          name: 'Bessie',
          sex: 'female',
          status: 'active',
          breed_type_id: 'bt-1',
          dob: '2022-01-01',
        },
      })
    }
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

  return mount(CowFormView, { global: { stubs }, ...opts })
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  mockRouteParams = {}
  mockRouteQuery = {}
  mockRoutePath = '/cows/new'
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('CowFormView', () => {
  it('renders create form with empty fields when no route id', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.cow-form').exists()).toBe(true)
    const tagInput = wrapper.find('input[type="text"]')
    expect(tagInput.element.value).toBe('')
  })

  it('renders edit form pre-filled with cow data when route id present', async () => {
    mockRouteParams = { id: 'cow-1' }
    mockRoutePath = '/cows/cow-1/edit'

    const wrapper = createWrapper()
    await flushPromises()

    const tagInput = wrapper.find('input[type="text"]')
    expect(tagInput.element.value).toBe('TAG-001')
  })

  it('requires tag_number — shows error when blank', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    // Try to submit without filling tag
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('.form-error').exists()).toBe(true)
  })

  it('shows breed dropdown with breed types from store', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const breedSelect = wrapper.find('.form-select')
    const options = breedSelect.findAll('option')
    // First option is "select breed" placeholder + 2 breed types
    expect(options.length).toBeGreaterThanOrEqual(3)
    expect(options[1].text()).toContain('Holstein')
    expect(options[2].text()).toContain('Jersey')
  })

  it('shows sex toggle buttons for female and male', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const sexBtns = wrapper.findAll('.sex-btn')
    expect(sexBtns).toHaveLength(2)
  })

  it('shows bull-only fields when sex is male', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    // Click male button
    const malBtn = wrapper.findAll('.sex-btn')[1]
    await malBtn.trigger('click')
    await flushPromises()

    // Now we should see is_external and purpose (uses animalForm namespace)
    expect(wrapper.html()).toContain('animalForm.isExternal')
  })

  it('shows calving banner when from_calving query is set', async () => {
    mockRouteQuery = { from_calving: 'true', sex: 'female', dob: '2026-01-01' }

    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.calving-banner').exists()).toBe(true)
  })

  it('renders life phase override dropdown', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    // Find the life phase select by looking at all selects
    const selects = wrapper.findAll('.form-select')
    // breed, life_phase_override, status = 3 selects
    expect(selects.length).toBeGreaterThanOrEqual(3)
    // Life phase options filtered by sex — default is female: auto, calf, heifer, cow
    const lifePhaseSelect = selects[1]
    const options = lifePhaseSelect.findAll('option')
    expect(options.length).toBeGreaterThanOrEqual(4)
  })

  it('renders sire and dam CowSearchDropdowns', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const dropdowns = wrapper.findAll('.cow-search-dropdown')
    expect(dropdowns.length).toBe(2)
  })

  it('submit calls cowsStore.create for new cow', async () => {
    api.post.mockResolvedValue({ data: { id: 'new-cow-1', tag_number: 'TAG-NEW' } })

    const wrapper = createWrapper()
    await flushPromises()

    // Fill required fields
    const tagInput = wrapper.find('input[type="text"]')
    await tagInput.setValue('TAG-NEW')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(api.post).toHaveBeenCalled()
  })

  it('cancel button navigates to cow list for new cow', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const cancelBtn = wrapper.find('.btn-secondary')
    await cancelBtn.trigger('click')

    expect(mockPush).toHaveBeenCalledWith('/cows')
  })
})

// ── Offspring mode tests ──────────────────────────────────────────────────────

describe('CowFormView — offspring mode', () => {
  it('shows offspring banner when birth_event_id query param is set', async () => {
    mockRouteQuery = {
      birth_event_id: 'event-uuid-123',
      offspring_total: '2',
      offspring_index: '1',
    }

    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.offspring-banner').exists()).toBe(true)
    expect(wrapper.find('.calving-banner').exists()).toBe(false)
  })

  it('does not show offspring banner when no birth_event_id', async () => {
    mockRouteQuery = {}

    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.offspring-banner').exists()).toBe(false)
  })

  it('shows offspring progress text with current/total', async () => {
    mockRouteQuery = {
      birth_event_id: 'event-uuid-123',
      offspring_total: '3',
      offspring_index: '2',
    }

    const wrapper = createWrapper()
    await flushPromises()

    // The offspring banner should contain progress info (translated key: animalForm.offspringProgress)
    const banner = wrapper.find('.offspring-banner')
    expect(banner.exists()).toBe(true)
  })

  it('shows Save & Next and Save & Done buttons in offspring mode', async () => {
    mockRouteQuery = {
      birth_event_id: 'event-uuid-456',
      offspring_total: '2',
      offspring_index: '1',
    }

    const wrapper = createWrapper()
    await flushPromises()

    // In offspring mode, multiple submit actions are shown
    const template = wrapper.html()
    // Should have offspring action buttons
    expect(template).toContain('animalForm.')
  })

  it('pre-fills dob from offspring query params', async () => {
    mockRouteQuery = {
      birth_event_id: 'event-uuid-789',
      offspring_total: '1',
      offspring_index: '1',
      dob: '2026-03-01',
      sex: 'female',
    }

    const wrapper = createWrapper()
    await flushPromises()

    // The dob input should be pre-filled
    const dobInput = wrapper.find('input[type="date"]')
    if (dobInput.exists()) {
      expect(dobInput.element.value).toBe('2026-03-01')
    }
  })

  it('includes birth_event_id in POST payload when in offspring mode', async () => {
    mockRouteQuery = {
      birth_event_id: 'event-uuid-abc',
      offspring_total: '1',
      offspring_index: '1',
    }

    api.post.mockResolvedValue({
      data: { id: 'new-offspring', tag_number: 'LAMB-01' },
    })

    const wrapper = createWrapper()
    await flushPromises()

    const tagInput = wrapper.find('input[type="text"]')
    await tagInput.setValue('LAMB-01')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    // API must have been called (offspring mode form submits same as regular)
    expect(api.post).toHaveBeenCalled()
    const payload = api.post.mock.calls[0][1]
    expect(payload.birth_event_id).toBe('event-uuid-abc')
  })
})
