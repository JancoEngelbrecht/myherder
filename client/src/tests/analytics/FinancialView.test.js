import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  RouterLink: { template: '<a><slot /></a>', props: ['to'] },
}))

vi.mock('../../services/api.js', () => ({
  default: { get: vi.fn() },
}))

vi.mock('../../services/syncManager.js', () => {
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

vi.mock('../../db/indexedDB.js', () => ({
  default: {
    featureFlags: {
      toArray: vi.fn().mockResolvedValue([]),
      put: vi.fn(),
    },
  },
}))

vi.mock('vue-chartjs', () => ({
  Line: { template: '<canvas data-testid="line-chart" />', props: ['data', 'options'] },
  Bar: { template: '<canvas data-testid="bar-chart" />', props: ['data', 'options'] },
}))

vi.mock('chart.js', () => ({
  Chart: { register: vi.fn() },
  CategoryScale: 'CS',
  LinearScale: 'LS',
  PointElement: 'PE',
  LineElement: 'LE',
  BarElement: 'BE',
  ArcElement: 'AE',
  Title: 'T',
  Tooltip: 'TT',
  Legend: 'L',
  Filler: 'F',
}))

import FinancialView from '../../views/analytics/FinancialView.vue'
import api from '../../services/api.js'
import { createPinia, setActivePinia } from 'pinia'

// ── Helpers ──────────────────────────────────────────────────────────────────

const stubs = {
  AppHeader: { template: '<div class="app-header"><slot /></div>' },
}

const SETTINGS_RESPONSE = { data: { milk_price_per_litre: '8.50' } }
const HERD_RESPONSE = { data: { total: 50, by_status: [{ status: 'active', count: 40 }] } }
const LITRES_RESPONSE = {
  data: { months: [{ month: '2026-01', avg_litres_per_cow_per_day: 18.5, cow_count: 42 }] },
}
const MILK_TRENDS_RESPONSE = {
  data: { months: [{ month: '2026-01', total_litres: 500, record_count: 30, avg_per_cow: 16.67 }] },
}
const TOP_RESPONSE = {
  data: [
    {
      id: 'c1',
      tag_number: 'MH-001',
      name: 'Bessie',
      total_litres: 300,
      days_recorded: 20,
      avg_daily_litres: 15,
    },
  ],
}
const BOTTOM_RESPONSE = {
  data: [
    {
      id: 'c2',
      tag_number: 'MH-010',
      name: 'Lazy',
      total_litres: 40,
      days_recorded: 20,
      avg_daily_litres: 2,
    },
  ],
}
const WASTED_RESPONSE = {
  data: {
    months: [{ month: '2026-01', discarded_litres: 50, discard_count: 5 }],
    total_discarded: 50,
  },
}
const COSTS_RESPONSE = {
  data: {
    months: [{ month: '2026-01', total_cost: 1500, treatment_count: 10 }],
    grand_total: 1500,
  },
}

function mockAllApis() {
  api.get.mockImplementation((url) => {
    if (url.includes('/settings')) return Promise.resolve(SETTINGS_RESPONSE)
    if (url.includes('herd-summary')) return Promise.resolve(HERD_RESPONSE)
    if (url.includes('litres-per-cow')) return Promise.resolve(LITRES_RESPONSE)
    if (url.includes('milk-trends')) return Promise.resolve(MILK_TRENDS_RESPONSE)
    if (url.includes('top-producers')) return Promise.resolve(TOP_RESPONSE)
    if (url.includes('bottom-producers')) return Promise.resolve(BOTTOM_RESPONSE)
    if (url.includes('wasted-milk')) return Promise.resolve(WASTED_RESPONSE)
    if (url.includes('treatment-costs')) return Promise.resolve(COSTS_RESPONSE)
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
    return Promise.resolve({ data: {} })
  })
}

function createWrapper() {
  return mount(FinancialView, { global: { stubs } })
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  mockAllApis()
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('FinancialView', () => {
  it('renders litres per cow chart', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('[data-testid="line-chart"]').exists()).toBe(true)
  })

  it('renders top producers list', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.producer-item').exists()).toBe(true)
    expect(wrapper.text()).toContain('MH-001')
    expect(wrapper.text()).toContain('15 L/d')
  })

  it('renders bottom producers list', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.text()).toContain('MH-010')
    expect(wrapper.text()).toContain('2 L/d')
  })

  it('renders wasted milk section with total', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.text()).toContain('50')
  })

  it('renders treatment costs with grand total', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.text()).toContain('R1500')
  })

  it('hides milk sections when milkRecording flag is off', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const { useFeatureFlagsStore } = await import('../../stores/featureFlags.js')
    const flagsStore = useFeatureFlagsStore()
    flagsStore.flags.milkRecording = false

    mockAllApis()
    const wrapper = mount(FinancialView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('[data-testid="line-chart"]').exists()).toBe(false)
    expect(wrapper.find('.producer-item').exists()).toBe(false)
  })

  it('hides treatment section when treatments flag is off', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const { useFeatureFlagsStore } = await import('../../stores/featureFlags.js')
    const flagsStore = useFeatureFlagsStore()
    flagsStore.flags.treatments = false

    mockAllApis()
    const wrapper = mount(FinancialView, { global: { stubs } })
    await flushPromises()

    // Treatment cost section should be hidden
    expect(wrapper.text()).not.toContain('R1500')
  })

  it('shows offline banner on network error', async () => {
    const { isOfflineError } = await import('../../services/syncManager.js')
    isOfflineError.mockReturnValue(true)

    api.get.mockRejectedValue(new Error('Network Error'))

    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.offline-banner').exists()).toBe(true)
  })

  it('fetches milk price from settings', async () => {
    createWrapper()
    await flushPromises()

    const calls = api.get.mock.calls.map((c) => c[0])
    expect(calls).toContainEqual('/settings')
  })

  it('renders time range filter chips with 12M active by default', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const chips = wrapper.findAll('.filter-chips .chip')
    expect(chips).toHaveLength(4)
    const activeChip = wrapper.find('.filter-chips .chip.active')
    expect(activeChip.exists()).toBe(true)
    // i18n not loaded in tests — chip text is the raw key
    expect(activeChip.text()).toContain('12m')
  })

  it('re-fetches data when time range chip is clicked', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    // Clear call history after initial load
    api.get.mockClear()
    mockAllApis()

    // Click the first chip (3M)
    const chips = wrapper.findAll('.filter-chips .chip')
    await chips[0].trigger('click')
    await flushPromises()

    const calls = api.get.mock.calls.map((c) => c[0])
    // Time-sensitive endpoints should include from/to params
    const timeSensitive = calls.filter((c) => c.includes('from=') && c.includes('to='))
    expect(timeSensitive.length).toBeGreaterThanOrEqual(4)
    // Snapshot endpoints should NOT be re-fetched
    expect(calls).not.toContainEqual('/settings')
    expect(calls.find((c) => c.includes('herd-summary'))).toBeUndefined()
  })
})
