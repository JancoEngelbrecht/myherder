import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  RouterLink: { template: '<a><slot /></a>', props: ['to'] },
}))

vi.mock('../services/api.js', () => ({
  default: { get: vi.fn() },
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
    featureFlags: {
      toArray: vi.fn().mockResolvedValue([]),
      put: vi.fn(),
    },
  },
}))

import MilkHistoryView from '../views/MilkHistoryView.vue'
import api from '../services/api.js'
import { createPinia, setActivePinia } from 'pinia'

// ── Helpers ──────────────────────────────────────────────────────────────────

const stubs = {
  AppHeader: { template: '<div class="app-header"><slot /></div>' },
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
  api.get.mockResolvedValue({
    data: { data: records, total },
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
    const records = [
      makeRecord('1', { litres: 10.5 }),
      makeRecord('2', { litres: 8.0 }),
    ]
    mockApiResponse(records, 2)

    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.summary-bar').exists()).toBe(true)
  })

  it('shows load more button when more records exist', async () => {
    const records = [makeRecord('1')]
    mockApiResponse(records, 10) // total > displayed

    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.load-more-btn').exists()).toBe(true)
  })

  it('hides load more button when all records loaded', async () => {
    const records = [makeRecord('1'), makeRecord('2')]
    mockApiResponse(records, 2) // total === displayed

    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.load-more-btn').exists()).toBe(false)
  })

  it('loads more records on button click', async () => {
    const page1 = [makeRecord('1')]
    const page2 = [makeRecord('2')]
    api.get
      .mockResolvedValueOnce({ data: { data: page1, total: 2 } })
      .mockResolvedValueOnce({ data: { data: page2, total: 2 } })

    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.findAll('.milk-record-card').length).toBe(1)

    await wrapper.find('.load-more-btn').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.milk-record-card').length).toBe(2)
  })

  it('passes sort and order params to API', async () => {
    mockApiResponse([], 0)

    createWrapper()
    await flushPromises()

    expect(api.get).toHaveBeenCalledWith('/milk-records', expect.objectContaining({
      params: expect.objectContaining({
        sort: 'recording_date',
        order: 'desc',
        page: 1,
        limit: 25,
      }),
    }))
  })

  it('passes from/to date range to API', async () => {
    mockApiResponse([], 0)

    createWrapper()
    await flushPromises()

    const params = api.get.mock.calls[0][1].params
    expect(params).toHaveProperty('from')
    expect(params).toHaveProperty('to')
  })

  it('renders filter chips', async () => {
    mockApiResponse([], 0)

    const wrapper = createWrapper()
    await flushPromises()

    const chips = wrapper.findAll('.chip')
    // 4 time range + 1 all + 3 session = 8 chips
    expect(chips.length).toBe(8)
  })

  it('re-fetches when session filter chip is clicked', async () => {
    mockApiResponse([], 0)

    const wrapper = createWrapper()
    await flushPromises()

    const initialCallCount = api.get.mock.calls.length

    // Click the "Morning" session chip (5th chip: after 4 time range + 1 all)
    const morningChip = wrapper.findAll('.chip')[5]
    await morningChip.trigger('click')
    await flushPromises()

    expect(api.get.mock.calls.length).toBeGreaterThan(initialCallCount)
    // Last call should include session param
    const lastCall = api.get.mock.calls[api.get.mock.calls.length - 1]
    expect(lastCall[1].params.session).toBe('morning')
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
    // Wait for onMounted to fire and set loading = true
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.spinner').exists()).toBe(true)
  })
})
