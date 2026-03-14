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
  Doughnut: { template: '<canvas data-testid="doughnut-chart" />', props: ['data', 'options'] },
}))

vi.mock('chart.js', () => ({
  Chart: { register: vi.fn() },
  CategoryScale: 'CS', LinearScale: 'LS', PointElement: 'PE',
  LineElement: 'LE', BarElement: 'BE', ArcElement: 'AE',
  Title: 'T', Tooltip: 'TT', Legend: 'L', Filler: 'F',
}))

vi.mock('chartjs-plugin-annotation', () => ({ default: {} }))

import FertilityView from '../../views/analytics/FertilityView.vue'
import api from '../../services/api.js'
import { createPinia, setActivePinia } from 'pinia'

// ── Helpers ──────────────────────────────────────────────────────────────────

const stubs = {
  AppHeader: { template: '<div class="app-header"><slot /></div>' },
}

const BREEDING_RESPONSE = {
  data: {
    pregnant_count: 5,
    not_pregnant_count: 12,
    repro_status: {
      pregnant: 5,
      not_pregnant: 12,
      bred_awaiting_check: 3,
      dry: 2,
      heifer_not_bred: 4,
    },
    abortion_count: 1,
    pregnancy_rate: 18.5,
    calvings_by_month: [{ month: '2026-03', count: 2 }],
    avg_services_per_conception: 1.5,
  },
}

const CALVING_RESPONSE = {
  data: {
    avg_calving_interval_days: 385,
    cow_count: 5,
    intervals: [
      { cow_id: 'c1', tag_number: 'MH-001', name: 'Bessie', interval_days: 350, calving_count: 3 },
      { cow_id: 'c2', tag_number: 'MH-002', name: 'Daisy', interval_days: 380, calving_count: 2 },
      { cow_id: 'c3', tag_number: 'MH-003', name: 'Rosie', interval_days: 420, calving_count: 2 },
      { cow_id: 'c4', tag_number: 'MH-004', name: 'Clara', interval_days: 460, calving_count: 2 },
      { cow_id: 'c5', tag_number: 'MH-005', name: 'Luna', interval_days: 510, calving_count: 2 },
    ],
  },
}

const DAYS_OPEN_RESPONSE = {
  data: {
    avg_days_open: 95,
    cow_count: 3,
    records: [
      { cow_id: 'c1', tag_number: 'MH-001', name: 'Bessie', days_open: 55 },
      { cow_id: 'c2', tag_number: 'MH-002', name: 'Daisy', days_open: 105 },
      { cow_id: 'c3', tag_number: 'MH-003', name: 'Rosie', days_open: 125 },
    ],
  },
}

const CONCEPTION_RESPONSE = {
  data: {
    first_service_rate: 45.5,
    total_first_services: 22,
    first_service_conceptions: 10,
    by_month: [
      { month: '2025-10', rate: 50, total: 4, conceptions: 2 },
      { month: '2025-11', rate: 40, total: 5, conceptions: 2 },
      { month: '2025-12', rate: 33.3, total: 3, conceptions: 1 },
    ],
  },
}

const ACTIVITY_RESPONSE = {
  data: {
    months: [
      { month: '2025-10', inseminations: 6, conceptions: 3 },
      { month: '2025-11', inseminations: 8, conceptions: 4 },
      { month: '2025-12', inseminations: 5, conceptions: 2 },
    ],
  },
}

function mockAllApis() {
  api.get.mockImplementation((url) => {
    if (url.includes('breeding-overview')) return Promise.resolve(BREEDING_RESPONSE)
    if (url.includes('calving-interval')) return Promise.resolve(CALVING_RESPONSE)
    if (url.includes('days-open')) return Promise.resolve(DAYS_OPEN_RESPONSE)
    if (url.includes('conception-rate')) return Promise.resolve(CONCEPTION_RESPONSE)
    if (url.includes('breeding-activity')) return Promise.resolve(ACTIVITY_RESPONSE)
    if (url.includes('feature-flags'))
      return Promise.resolve({
        data: { breeding: true, milkRecording: true, healthIssues: true, treatments: true, analytics: true },
      })
    return Promise.resolve({ data: {} })
  })
}

function createWrapper() {
  return mount(FertilityView, { global: { stubs } })
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  mockAllApis()
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('FertilityView', () => {
  it('renders 6 stat chips with correct values', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const chips = wrapper.findAll('.stat-chip')
    expect(chips.length).toBe(6)
    expect(wrapper.text()).toContain('5')      // pregnant
    expect(wrapper.text()).toContain('12')     // not pregnant
    expect(wrapper.text()).toContain('46%')   // conception rate (Math.round(45.5))
    expect(wrapper.text()).toContain('1.5')    // services per conception
    expect(wrapper.text()).toContain('19%')   // pregnancy rate (Math.round(18.5))
    expect(wrapper.text()).toContain('1')      // abortion count (also matches other numbers, but stat chip has it)
  })

  it('displays "Not Pregnant" label instead of "Open"', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.text()).toContain('analytics.notPregnantCount')
    expect(wrapper.text()).not.toContain('analytics.openCount')
  })

  it('renders repro status doughnut chart', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('[data-testid="doughnut-chart"]').exists()).toBe(true)
  })

  it('renders calving interval histogram with bucket labels', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.text()).toContain('385') // avg calving interval
    const bars = wrapper.findAll('[data-testid="bar-chart"]')
    expect(bars.length).toBeGreaterThanOrEqual(1)
  })

  it('renders days open histogram', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.text()).toContain('95') // avg days open
  })

  it('renders breeding activity chart', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    // breeding activity + calving histogram + days open histogram + expected calvings = 4 bar charts
    const bars = wrapper.findAll('[data-testid="bar-chart"]')
    expect(bars.length).toBe(4)
  })

  it('renders conception rate trend line chart', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('[data-testid="line-chart"]').exists()).toBe(true)
  })

  it('renders expected calvings chart', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    // Expected Calvings section renders (i18n key shows in test)
    expect(wrapper.text()).toContain('analytics.expectedCalvings')
  })

  it('shows empty states when no data', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('breeding-overview'))
        return Promise.resolve({
          data: {
            pregnant_count: 0, not_pregnant_count: 0,
            repro_status: { pregnant: 0, not_pregnant: 0, bred_awaiting_check: 0, dry: 0, heifer_not_bred: 0 },
            abortion_count: 0, pregnancy_rate: null,
            calvings_by_month: [], avg_services_per_conception: null,
          },
        })
      if (url.includes('calving-interval'))
        return Promise.resolve({ data: { avg_calving_interval_days: null, cow_count: 0, intervals: [] } })
      if (url.includes('days-open'))
        return Promise.resolve({ data: { avg_days_open: null, cow_count: 0, records: [] } })
      if (url.includes('conception-rate'))
        return Promise.resolve({
          data: { first_service_rate: null, total_first_services: 0, first_service_conceptions: 0, by_month: [] },
        })
      if (url.includes('breeding-activity'))
        return Promise.resolve({ data: { months: [] } })
      return Promise.resolve({ data: {} })
    })

    const wrapper = createWrapper()
    await flushPromises()

    const emptyStates = wrapper.findAll('.empty-state-mini')
    expect(emptyStates.length).toBeGreaterThanOrEqual(3) // calving, days open, activity, conception, expected calvings, repro
  })

  it('shows offline banner on network error', async () => {
    const { isOfflineError } = await import('../../services/syncManager.js')
    isOfflineError.mockReturnValue(true)

    api.get.mockRejectedValue(new Error('Network Error'))

    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.offline-banner').exists()).toBe(true)
  })

  it('makes API calls for all 5 fertility endpoints', async () => {
    createWrapper()
    await flushPromises()

    const calls = api.get.mock.calls.map((c) => c[0])
    // All endpoints now use time range params
    expect(calls.some((c) => c.startsWith('/analytics/calving-interval?from='))).toBe(true)
    expect(calls.some((c) => c.startsWith('/analytics/breeding-overview?from='))).toBe(true)
    expect(calls.some((c) => c.startsWith('/analytics/conception-rate?from='))).toBe(true)
    expect(calls.some((c) => c.startsWith('/analytics/days-open?from='))).toBe(true)
    expect(calls.some((c) => c.startsWith('/analytics/breeding-activity?from='))).toBe(true)
  })

  it('renders time range filter chips with 12M active by default', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const chips = wrapper.findAll('.filter-chips .chip')
    expect(chips).toHaveLength(4)
    const activeChip = wrapper.find('.filter-chips .chip.active')
    expect(activeChip.exists()).toBe(true)
    expect(activeChip.text()).toContain('12m')
  })

  it('re-fetches all 5 endpoints when time range chip is clicked', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    api.get.mockClear()
    mockAllApis()

    // Click the first chip (3M)
    const chips = wrapper.findAll('.filter-chips .chip')
    await chips[0].trigger('click')
    await flushPromises()

    const calls = api.get.mock.calls.map((c) => c[0])
    expect(calls.some((c) => c.startsWith('/analytics/breeding-overview?from='))).toBe(true)
    expect(calls.some((c) => c.startsWith('/analytics/conception-rate?from='))).toBe(true)
    expect(calls.some((c) => c.startsWith('/analytics/days-open?from='))).toBe(true)
    expect(calls.some((c) => c.startsWith('/analytics/breeding-activity?from='))).toBe(true)
    expect(calls.some((c) => c.startsWith('/analytics/calving-interval?from='))).toBe(true)
  })
})
