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
    animals: { toArray: vi.fn().mockResolvedValue([]), bulkPut: vi.fn(), put: vi.fn() },
    medications: {
      toArray: vi.fn().mockResolvedValue([]),
      bulkPut: vi.fn(),
      put: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
    },
    treatments: {
      toArray: vi.fn().mockResolvedValue([]),
      bulkPut: vi.fn(),
      put: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      where: vi.fn().mockReturnValue({
        equals: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
        above: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }),
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
    issueTypes: {
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

vi.mock('../utils/format', () => ({
  formatDate: vi.fn((d) => d),
  formatDateTime: vi.fn((d) => d?.toISOString?.() || d),
}))

import LogTreatmentView from '../views/LogTreatmentView.vue'
import api from '../services/api.js'
import { createPinia, setActivePinia } from 'pinia'

// ── Helpers ──────────────────────────────────────────────────────────────────

const MEDICATIONS = [
  {
    id: 'med-1',
    name: 'Penicillin',
    active_ingredient: 'Penicillin G',
    withdrawal_milk_hours: 72,
    withdrawal_meat_days: 14,
    default_dosage: '10',
    unit: 'ml',
    is_active: true,
  },
  {
    id: 'med-2',
    name: 'Ibuprofen',
    active_ingredient: null,
    withdrawal_milk_hours: 0,
    withdrawal_meat_days: 0,
    default_dosage: null,
    unit: null,
    is_active: true,
  },
]

const stubs = {
  AppHeader: {
    template: '<div class="app-header"><slot /></div>',
    props: ['title', 'showBack', 'backTo'],
  },
  AnimalSearchDropdown: {
    template: '<select class="cow-search-dropdown" />',
    props: ['modelValue', 'placeholder', 'error'],
  },
}

function createWrapper() {
  api.get.mockImplementation((url) => {
    if (url === '/medications')
      return Promise.resolve({ data: MEDICATIONS, headers: { 'x-total-count': '2' } })
    if (url === '/issue-types')
      return Promise.resolve({ data: [], headers: { 'x-total-count': '0' } })
    if (url === '/animals') return Promise.resolve({ data: [] })
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
    if (url === '/health-issues') return Promise.resolve({ data: [] })
    return Promise.resolve({ data: [] })
  })

  return mount(LogTreatmentView, { global: { stubs } })
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  mockRouteQuery = {}
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('LogTreatmentView', () => {
  it('renders form with AnimalSearchDropdown', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('form').exists()).toBe(true)
    expect(wrapper.find('.cow-search-dropdown').exists()).toBe(true)
  })

  it('populates medication dropdown from medicationsStore', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const medSelect = wrapper.find('.med-select')
    expect(medSelect.exists()).toBe(true)
    const options = medSelect.findAll('option')
    // First option is placeholder + 2 medications
    expect(options).toHaveLength(3)
    expect(options[1].text()).toContain('Penicillin')
    expect(options[2].text()).toContain('Ibuprofen')
  })

  it('renders cost field accepting decimal numbers', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const costInput = wrapper.find('#cost')
    expect(costInput.exists()).toBe(true)
    expect(costInput.attributes('type')).toBe('number')
    expect(costInput.attributes('step')).toBe('0.01')
  })

  it('renders vet visit checkbox toggle', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const checkbox = wrapper.find('.checkbox-label input[type="checkbox"]')
    expect(checkbox.exists()).toBe(true)
  })

  it('shows vet name field when vet visit is checked', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    // Initially no vet name field
    expect(wrapper.find('#vet-name').exists()).toBe(false)

    // Check the vet visit checkbox
    const checkbox = wrapper.find('.checkbox-label input[type="checkbox"]')
    await checkbox.setValue(true)
    await flushPromises()

    expect(wrapper.find('#vet-name').exists()).toBe(true)
  })

  it('validates required cow field — blocks submit', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(api.post).not.toHaveBeenCalled()
  })

  it('validates required medication — blocks submit without medication', async () => {
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

  it('renders treatment date input', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const dateInput = wrapper.find('#treatment-date')
    expect(dateInput.exists()).toBe(true)
    expect(dateInput.attributes('type')).toBe('datetime-local')
  })

  it('shows add medication button for additional meds', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const addBtn = wrapper.find('.btn-add-med')
    expect(addBtn.exists()).toBe(true)

    // Click it to add another medication row
    await addBtn.trigger('click')
    await flushPromises()

    const medSelects = wrapper.findAll('.med-select')
    expect(medSelects).toHaveLength(2)
  })

  it('shows back button via AppHeader', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.app-header').exists()).toBe(true)
  })
})
