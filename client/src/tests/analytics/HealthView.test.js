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
  CategoryScale: 'CS', LinearScale: 'LS', PointElement: 'PE',
  LineElement: 'LE', BarElement: 'BE', ArcElement: 'AE',
  Title: 'T', Tooltip: 'TT', Legend: 'L', Filler: 'F',
}))

import HealthView from '../../views/analytics/HealthView.vue'
import api from '../../services/api.js'
import { createPinia, setActivePinia } from 'pinia'

// ── Helpers ──────────────────────────────────────────────────────────────────

const stubs = {
  AppHeader: { template: '<div class="app-header"><slot /></div>' },
}

const KPIS_RESPONSE = {
  data: {
    litres_today: 200, litres_7day_avg: 190,
    cows_milked_today: 40, cows_expected: 45,
    active_health_issues: 7,
    breeding_actions_due: 2,
  },
}

const RESOLUTION_STATS_RESPONSE = {
  data: {
    total_issues: 20,
    resolved_count: 15,
    cure_rate: 75,
    avg_days_to_resolve: 8.2,
    recurrence_rate: 18,
    top_incidence: [
      { code: 'mastitis', name: 'Mastitis', emoji: '🦠', rate: 9.6 },
      { code: 'lameness', name: 'Lameness', emoji: '🦿', rate: 5.1 },
      { code: 'respiratory', name: 'Respiratory', emoji: '🫁', rate: 2.8 },
    ],
  },
}

const FREQUENCY_RESPONSE = {
  data: {
    by_type: [
      { code: 'mastitis', name: 'Mastitis', emoji: '🦠', count: 10 },
      { code: 'lameness', name: 'Lameness', emoji: '🦶', count: 5 },
    ],
    by_month: [
      { month: '2026-01', counts: { mastitis: 3, lameness: 2 } },
      { month: '2026-02', counts: { mastitis: 4, lameness: 1 } },
    ],
  },
}

const RESOLUTION_BY_TYPE_RESPONSE = {
  data: {
    by_type: [
      { code: 'lameness', name: 'Lameness', emoji: '🦿', avg_days: 12.3, count: 8 },
      { code: 'mastitis', name: 'Mastitis', emoji: '🦠', avg_days: 6.1, count: 15 },
    ],
  },
}

const CURE_RATE_TREND_RESPONSE = {
  data: {
    months: [
      { month: '2026-01', total: 12, resolved: 9, rate: 75.0 },
      { month: '2026-02', total: 8, resolved: 7, rate: 87.5 },
    ],
  },
}

const RECURRENCE_RESPONSE = {
  data: {
    by_type: [
      { code: 'mastitis', name: 'Mastitis', emoji: '🦠', rate: 22, resolved_count: 50, recurred_count: 11 },
      { code: 'lameness', name: 'Lameness', emoji: '🦿', rate: 8, resolved_count: 25, recurred_count: 2 },
    ],
  },
}

const COSTS_RESPONSE = {
  data: {
    months: [{ month: '2026-01', total_cost: 1500, treatment_count: 10 }],
    grand_total: 1500,
  },
}

const HERD_SUMMARY_RESPONSE = {
  data: { total: 50, by_status: [{ status: 'active', count: 50 }] },
}

const UNHEALTHIEST_RESPONSE = {
  data: [
    { id: 'c1', tag_number: 'MH-001', name: 'Bessie', sex: 'female', issue_count: 5 },
    { id: 'c2', tag_number: 'MH-002', name: 'Daisy', sex: 'female', issue_count: 3 },
  ],
}

const SLOWEST_RESPONSE = {
  data: [
    { id: 'c1', tag_number: 'MH-001', name: 'Bessie', avg_days: 18.5, issue_count: 4 },
    { id: 'c3', tag_number: 'MH-003', name: 'Rosie', avg_days: 11.2, issue_count: 3 },
  ],
}

const PREDICTION_RESPONSE = {
  data: {
    predictions: [
      {
        month: '2026-04', month_name: 'April',
        issues: [{ type: 'Mastitis', code: 'mastitis', emoji: '🦠', historical_avg: 2.5 }],
      },
    ],
    years_of_data: 2,
  },
}

function mockAllApis() {
  api.get.mockImplementation((url) => {
    if (url.includes('daily-kpis')) return Promise.resolve(KPIS_RESPONSE)
    if (url.includes('health-resolution-stats')) return Promise.resolve(RESOLUTION_STATS_RESPONSE)
    if (url.includes('health-resolution-by-type')) return Promise.resolve(RESOLUTION_BY_TYPE_RESPONSE)
    if (url.includes('health-cure-rate-trend')) return Promise.resolve(CURE_RATE_TREND_RESPONSE)
    if (url.includes('health-recurrence')) return Promise.resolve(RECURRENCE_RESPONSE)
    if (url.includes('issue-frequency')) return Promise.resolve(FREQUENCY_RESPONSE)
    if (url.includes('treatment-costs')) return Promise.resolve(COSTS_RESPONSE)
    if (url.includes('herd-summary')) return Promise.resolve(HERD_SUMMARY_RESPONSE)
    if (url.includes('unhealthiest')) return Promise.resolve(UNHEALTHIEST_RESPONSE)
    if (url.includes('slowest-to-resolve')) return Promise.resolve(SLOWEST_RESPONSE)
    if (url.includes('seasonal-prediction')) return Promise.resolve(PREDICTION_RESPONSE)
    if (url.includes('feature-flags'))
      return Promise.resolve({
        data: { breeding: true, milkRecording: true, healthIssues: true, treatments: true, analytics: true },
      })
    return Promise.resolve({ data: {} })
  })
}

function createWrapper() {
  return mount(HealthView, { global: { stubs } })
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  mockAllApis()
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('HealthView', () => {
  it('renders 4 general stat chips with correct values', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const chips = wrapper.findAll('.stat-chip')
    expect(chips.length).toBeGreaterThanOrEqual(4)

    const text = wrapper.text()
    expect(text).toContain('7')     // active issues
    expect(text).toContain('75%')   // cure rate
    expect(text).toContain('8.2d')  // avg days to resolve
    expect(text).toContain('18%')   // recurrence rate
  })

  it('renders top 3 incidence sub-panel', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.incidence-panel').exists()).toBe(true)
    const text = wrapper.text()
    expect(text).toContain('9.6')   // mastitis rate
    expect(text).toContain('5.1')   // lameness rate
    expect(text).toContain('2.8')   // respiratory rate
  })

  it('applies warn class when avg_days > 7', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    // 8.2d should have .warn class
    const warnValues = wrapper.findAll('.stat-value.warn')
    expect(warnValues.length).toBeGreaterThanOrEqual(1)
  })

  it('applies danger class when recurrence_rate > 15', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    // 18% recurrence should have .danger class
    const dangerValues = wrapper.findAll('.stat-value.danger')
    expect(dangerValues.length).toBeGreaterThanOrEqual(1)
  })

  it('renders resolution-by-type chart section', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('analytics.health.resolutionByType')
  })

  it('renders cure rate trend chart section', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('analytics.health.cureRateTrend')
  })

  it('renders recurrence-by-type chart section', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('analytics.health.recurrenceByType')
  })

  it('renders incidence trend chart section', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('analytics.health.incidenceTrend')
  })

  it('renders treatment cost per cow chart', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('analytics.health.treatmentCostPerCow')
  })

  it('renders slowest-to-resolve cow list', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('analytics.health.slowestToResolve')
    expect(text).toContain('MH-001')
    expect(text).toContain('18.5')
  })

  it('renders unhealthiest cows list', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.cow-item').exists()).toBe(true)
    expect(wrapper.text()).toContain('MH-001')
    expect(wrapper.text()).toContain('5')  // issue count
  })

  it('renders seasonal prediction cards', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.prediction-card').exists()).toBe(true)
    expect(wrapper.text()).toContain('April')
  })

  it('hides health sections when healthIssues flag is off', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const { useFeatureFlagsStore } = await import('../../stores/featureFlags.js')
    const flagsStore = useFeatureFlagsStore()
    flagsStore.flags.healthIssues = false

    mockAllApis()
    const wrapper = mount(HealthView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.stat-chip').exists()).toBe(false)
    expect(wrapper.find('.cow-item').exists()).toBe(false)
    expect(wrapper.find('.prediction-card').exists()).toBe(false)
  })

  it('hides treatment cost section when treatments flag is off', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const { useFeatureFlagsStore } = await import('../../stores/featureFlags.js')
    const flagsStore = useFeatureFlagsStore()
    flagsStore.flags.treatments = false

    mockAllApis()
    const wrapper = mount(HealthView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.text()).not.toContain('analytics.health.treatmentCostPerCow')
  })

  it('makes API calls for all required endpoints', async () => {
    createWrapper()
    await flushPromises()

    const calls = api.get.mock.calls.map((c) => c[0])
    // Snapshot endpoints (no params)
    expect(calls).toContainEqual('/analytics/daily-kpis')
    expect(calls).toContainEqual('/analytics/seasonal-prediction')
    expect(calls).toContainEqual('/analytics/herd-summary')
    // Time-sensitive endpoints (with from/to params)
    expect(calls.some((c) => c.startsWith('/analytics/issue-frequency?from='))).toBe(true)
    expect(calls.some((c) => c.startsWith('/analytics/health-resolution-stats?from='))).toBe(true)
    expect(calls.some((c) => c.startsWith('/analytics/health-resolution-by-type?from='))).toBe(true)
    expect(calls.some((c) => c.startsWith('/analytics/health-cure-rate-trend?from='))).toBe(true)
    expect(calls.some((c) => c.startsWith('/analytics/health-recurrence?from='))).toBe(true)
    expect(calls.some((c) => c.startsWith('/analytics/unhealthiest?from='))).toBe(true)
    expect(calls.some((c) => c.startsWith('/analytics/slowest-to-resolve?from='))).toBe(true)
    expect(calls.some((c) => c.startsWith('/analytics/treatment-costs?from='))).toBe(true)
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

  it('re-fetches time-sensitive data when time range chip is clicked', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    api.get.mockClear()
    mockAllApis()

    // Click the first chip (3M)
    const chips = wrapper.findAll('.filter-chips .chip')
    await chips[0].trigger('click')
    await flushPromises()

    const calls = api.get.mock.calls.map((c) => c[0])
    // Time-sensitive endpoints should be re-fetched with params
    const timeSensitive = calls.filter((c) => c.includes('from=') && c.includes('to='))
    expect(timeSensitive.length).toBeGreaterThanOrEqual(8)  // 7 health + 1 treatment-costs
    // Snapshot endpoints should NOT be re-fetched
    expect(calls).not.toContainEqual('/analytics/daily-kpis')
    expect(calls).not.toContainEqual('/analytics/seasonal-prediction')
    expect(calls).not.toContainEqual('/analytics/herd-summary')
  })
})
