import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  RouterLink: { template: '<a><slot /></a>', props: ['to'] },
}))

vi.mock('../services/api', () => ({
  default: { get: vi.fn() },
}))

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

vi.mock('../db/indexedDB', () => ({
  default: {
    featureFlags: {
      toArray: vi.fn().mockResolvedValue([]),
      put: vi.fn(),
    },
    milkRecords: {
      toArray: vi.fn().mockResolvedValue([]),
    },
  },
}))

import MilkHistoryView from '../views/MilkHistoryView.vue'
import api from '../services/api'
import { createPinia, setActivePinia } from 'pinia'

// ── Helpers ──────────────────────────────────────────────────────────────────

const stubs = {
  AppHeader: { template: '<div class="app-header"><slot /></div>' },
  AnimalSearchDropdown: {
    template: '<div class="cow-search-dropdown" />',
    props: ['modelValue', 'placeholder', 'sexFilter'],
  },
}

function makeRecord(id, overrides = {}) {
  return {
    id,
    cow_id: `cow-${id}`,
    tag_number: `C-${id}`,
    cow_name: `Cow ${id}`,
    recorded_by: 'user-1',
    recorded_by_name: 'Admin',
    session: 'morning',
    litres: 10.5,
    recording_date: '2026-02-15',
    session_time: '06:30',
    milk_discarded: false,
    discard_reason: null,
    ...overrides,
  }
}

function mockApiResponse(records, total) {
  api.get.mockImplementation((url) => {
    if (url === '/milk-records/recorders') {
      return Promise.resolve({ data: [{ id: 'user-1', full_name: 'Admin' }] })
    }
    return Promise.resolve({ data: { data: records, total } })
  })
}

function createWrapper() {
  return mount(MilkHistoryView, { global: { stubs } })
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MilkHistoryView', () => {
  it('renders record list from API', async () => {
    const records = [makeRecord('1'), makeRecord('2'), makeRecord('3')]
    mockApiResponse(records, 3)

    const wrapper = createWrapper()
    await flushPromises()

    const cards = wrapper.findAll('.milk-record-card')
    expect(cards.length).toBe(3)
  })

  it('shows empty state when no records', async () => {
    mockApiResponse([], 0)

    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.empty-state').exists()).toBe(true)
    expect(wrapper.text()).toContain('milkHistory.noRecords')
  })

  it('shows summary bar when records exist', async () => {
    const records = [makeRecord('1', { litres: 10.5 }), makeRecord('2', { litres: 8.0 })]
    mockApiResponse(records, 2)

    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.summary-bar').exists()).toBe(true)
  })

  it('shows pagination when records exist', async () => {
    const records = [makeRecord('1')]
    mockApiResponse(records, 30) // total > page size

    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.pagination-bar').exists()).toBe(true)
  })

  it('hides pagination when no records', async () => {
    mockApiResponse([], 0)

    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.pagination-bar').exists()).toBe(false)
  })

  it('passes sort, order, from, to params to API', async () => {
    mockApiResponse([], 0)

    createWrapper()
    await flushPromises()

    const milkCall = api.get.mock.calls.find((c) => c[0] === '/milk-records')
    expect(milkCall).toBeTruthy()
    expect(milkCall[1].params).toMatchObject({
      sort: 'recording_date',
      order: 'desc',
      page: 1,
      limit: 20,
    })
    expect(milkCall[1].params).toHaveProperty('from')
    expect(milkCall[1].params).toHaveProperty('to')
  })

  it('renders date range inputs', async () => {
    mockApiResponse([], 0)

    const wrapper = createWrapper()
    await flushPromises()

    const dateInputs = wrapper.findAll('input[type="date"]')
    expect(dateInputs.length).toBe(2)
  })

  it('renders search input', async () => {
    mockApiResponse([], 0)

    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.search-input-wrap').exists()).toBe(true)
  })

  it('renders advanced filters toggle', async () => {
    mockApiResponse([], 0)

    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.advanced-toggle').exists()).toBe(true)
  })

  it('shows advanced filters panel when toggled', async () => {
    mockApiResponse([], 0)

    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.advanced-filters').exists()).toBe(false)

    await wrapper.find('.advanced-toggle').trigger('click')
    expect(wrapper.find('.advanced-filters').exists()).toBe(true)
  })

  it('shows session chips inside advanced filters', async () => {
    mockApiResponse([], 0)

    const wrapper = createWrapper()
    await flushPromises()

    await wrapper.find('.advanced-toggle').trigger('click')

    // 4 session chips: All + morning + afternoon + evening
    const chips = wrapper.findAll('.advanced-filters .chip')
    expect(chips.length).toBeGreaterThanOrEqual(4)
  })

  it('shows discarded records with indicator', async () => {
    const records = [makeRecord('1', { milk_discarded: true, discard_reason: 'test' })]
    mockApiResponse(records, 1)

    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.card-discarded').exists()).toBe(true)
    expect(wrapper.find('.discarded-badge').exists()).toBe(true)
  })

  it('shows loading state initially', async () => {
    // Hang the promise so loading stays true
    api.get.mockReturnValue(new Promise(() => {}))

    const wrapper = createWrapper()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.spinner').exists()).toBe(true)
  })

  it('fetches recorders on mount', async () => {
    mockApiResponse([], 0)

    createWrapper()
    await flushPromises()

    const recorderCall = api.get.mock.calls.find((c) => c[0] === '/milk-records/recorders')
    expect(recorderCall).toBeTruthy()
  })
})
