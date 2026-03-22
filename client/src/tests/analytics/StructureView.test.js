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

import StructureView from '../../views/analytics/StructureView.vue'
import api from '../../services/api.js'
import { createPinia, setActivePinia } from 'pinia'

// ── Helpers ──────────────────────────────────────────────────────────────────

const stubs = {
  AppHeader: { template: '<div class="app-header"><slot /></div>' },
}

const HERD_SUMMARY_RESPONSE = {
  data: {
    total: 52,
    by_status: [
      { status: 'active', count: 30 },
      { status: 'pregnant', count: 12 },
      { status: 'dry', count: 5 },
      { status: 'sold', count: 3 },
      { status: 'dead', count: 2 },
    ],
    milking_count: 30,
    dry_count: 5,
    heifer_count: 8,
    males: 4,
    females: 48,
    replacement_rate: 26.67,
  },
}

const AGE_RESPONSE = {
  data: {
    brackets: [
      { label: '0-1yr', count: 5, males: 2, females: 3 },
      { label: '1-2yr', count: 8, males: 1, females: 7 },
      { label: '2-5yr', count: 20, males: 0, females: 20 },
      { label: '5-8yr', count: 12, males: 0, females: 12 },
      { label: '8+yr', count: 3, males: 0, females: 3 },
      { label: 'Unknown', count: 4, males: 1, females: 3 },
    ],
    total: 52,
    males: 4,
    females: 48,
  },
}

const BREED_RESPONSE = {
  data: {
    breeds: [
      { name: 'Holstein', code: 'holstein', count: 30 },
      { name: 'Jersey', code: 'jersey', count: 17 },
      { name: 'Unassigned', code: null, count: 5 },
    ],
    total: 52,
  },
}

const TURNOVER_RESPONSE = {
  data: {
    months: [
      { month: '2026-01', additions: 3, removals: 1, net: 2 },
      { month: '2026-02', additions: 2, removals: 0, net: 2 },
    ],
    total_additions: 5,
    total_removals: 1,
  },
}

const MORTALITY_RESPONSE = {
  data: {
    months: [{ month: '2026-01', sold: 1, dead: 1, rate_pct: 3.85 }],
    total_lost: 2,
    avg_rate_pct: 3.85,
  },
}

const TREND_RESPONSE = {
  data: {
    months: [
      { month: '2026-01', total: 50 },
      { month: '2026-02', total: 52 },
    ],
  },
}

function mockAllApis() {
  api.get.mockImplementation((url) => {
    if (url.includes('herd-summary')) return Promise.resolve(HERD_SUMMARY_RESPONSE)
    if (url.includes('age-distribution')) return Promise.resolve(AGE_RESPONSE)
    if (url.includes('breed-composition')) return Promise.resolve(BREED_RESPONSE)
    if (url.includes('herd-turnover')) return Promise.resolve(TURNOVER_RESPONSE)
    if (url.includes('mortality-rate')) return Promise.resolve(MORTALITY_RESPONSE)
    if (url.includes('herd-size-trend')) return Promise.resolve(TREND_RESPONSE)
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
  return mount(StructureView, { global: { stubs } })
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  mockAllApis()
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('StructureView', () => {
  it('renders all 7 stat chips with correct values', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const chips = wrapper.findAll('.stat-chip')
    expect(chips.length).toBe(7)

    const text = wrapper.text()
    expect(text).toContain('52') // total herd
    expect(text).toContain('30') // milking cows
    expect(text).toContain('5') // dry cows
    expect(text).toContain('8') // heifers
    expect(text).toContain('26.67%') // replacement rate
  })

  it('shows replacement rate with warn class when < 25%', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('herd-summary'))
        return Promise.resolve({
          data: { ...HERD_SUMMARY_RESPONSE.data, replacement_rate: 20 },
        })
      return (mockAllApis(), api.get(url))
    })
    // Re-mock properly
    const warnSummary = { ...HERD_SUMMARY_RESPONSE.data, replacement_rate: 20 }
    api.get.mockImplementation((url) => {
      if (url.includes('herd-summary')) return Promise.resolve({ data: warnSummary })
      if (url.includes('age-distribution')) return Promise.resolve(AGE_RESPONSE)
      if (url.includes('breed-composition')) return Promise.resolve(BREED_RESPONSE)
      if (url.includes('herd-turnover')) return Promise.resolve(TURNOVER_RESPONSE)
      if (url.includes('mortality-rate')) return Promise.resolve(MORTALITY_RESPONSE)
      if (url.includes('herd-size-trend')) return Promise.resolve(TREND_RESPONSE)
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

    const wrapper = createWrapper()
    await flushPromises()

    const warnChips = wrapper.findAll('.stat-value.warn')
    expect(warnChips.length).toBeGreaterThanOrEqual(1)
    expect(warnChips.some((c) => c.text().includes('20%'))).toBe(true)
  })

  it('shows replacement rate with danger class when < 15%', async () => {
    const dangerSummary = { ...HERD_SUMMARY_RESPONSE.data, replacement_rate: 10 }
    api.get.mockImplementation((url) => {
      if (url.includes('herd-summary')) return Promise.resolve({ data: dangerSummary })
      if (url.includes('age-distribution')) return Promise.resolve(AGE_RESPONSE)
      if (url.includes('breed-composition')) return Promise.resolve(BREED_RESPONSE)
      if (url.includes('herd-turnover')) return Promise.resolve(TURNOVER_RESPONSE)
      if (url.includes('mortality-rate')) return Promise.resolve(MORTALITY_RESPONSE)
      if (url.includes('herd-size-trend')) return Promise.resolve(TREND_RESPONSE)
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

    const wrapper = createWrapper()
    await flushPromises()

    const dangerChips = wrapper.findAll('.stat-value.danger')
    expect(dangerChips.length).toBeGreaterThanOrEqual(1)
    expect(dangerChips.some((c) => c.text().includes('10%'))).toBe(true)
  })

  it('shows turnover rate with warn class when > 5%', async () => {
    // total_removals=4, total=52 → 7.69% → warn
    const warnTurnover = { ...TURNOVER_RESPONSE.data, total_removals: 4 }
    api.get.mockImplementation((url) => {
      if (url.includes('herd-summary')) return Promise.resolve(HERD_SUMMARY_RESPONSE)
      if (url.includes('age-distribution')) return Promise.resolve(AGE_RESPONSE)
      if (url.includes('breed-composition')) return Promise.resolve(BREED_RESPONSE)
      if (url.includes('herd-turnover')) return Promise.resolve({ data: warnTurnover })
      if (url.includes('mortality-rate')) return Promise.resolve(MORTALITY_RESPONSE)
      if (url.includes('herd-size-trend')) return Promise.resolve(TREND_RESPONSE)
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

    const wrapper = createWrapper()
    await flushPromises()

    const warnChips = wrapper.findAll('.stat-value.warn')
    expect(warnChips.length).toBeGreaterThanOrEqual(1)
  })

  it('renders status breakdown doughnut with by_status data', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const doughnuts = wrapper.findAll('[data-testid="doughnut-chart"]')
    expect(doughnuts.length).toBeGreaterThanOrEqual(1)
  })

  it('renders age distribution stacked bar with sex split', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const bars = wrapper.findAll('[data-testid="bar-chart"]')
    expect(bars.length).toBeGreaterThanOrEqual(1)
  })

  it('renders breed composition doughnut chart', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    // 2 doughnut charts: status breakdown + breed composition
    const doughnuts = wrapper.findAll('[data-testid="doughnut-chart"]')
    expect(doughnuts.length).toBe(2)
  })

  it('renders herd turnover grouped bar with additions/removals', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('5') // total_additions
    expect(text).toContain('1') // total_removals

    // Should have bar charts (age, turnover, mortality = 3)
    const bars = wrapper.findAll('[data-testid="bar-chart"]')
    expect(bars.length).toBeGreaterThanOrEqual(2)
  })

  it('renders mortality stacked bar (sold + dead datasets)', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('2') // total_lost

    // Should have 3 bar charts: age, turnover, mortality
    const bars = wrapper.findAll('[data-testid="bar-chart"]')
    expect(bars.length).toBe(3)
  })

  it('renders herd size trend line chart', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const lines = wrapper.findAll('[data-testid="line-chart"]')
    expect(lines.length).toBe(1)
  })

  it('shows empty state when no data', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('herd-summary'))
        return Promise.resolve({
          data: {
            total: 0,
            by_status: [],
            milking_count: 0,
            dry_count: 0,
            heifer_count: 0,
            males: 0,
            females: 0,
            replacement_rate: 0,
          },
        })
      if (url.includes('age-distribution'))
        return Promise.resolve({ data: { brackets: [], total: 0, males: 0, females: 0 } })
      if (url.includes('breed-composition'))
        return Promise.resolve({ data: { breeds: [], total: 0 } })
      if (url.includes('herd-turnover'))
        return Promise.resolve({ data: { months: [], total_additions: 0, total_removals: 0 } })
      if (url.includes('mortality-rate'))
        return Promise.resolve({ data: { months: [], total_lost: 0, avg_rate_pct: 0 } })
      if (url.includes('herd-size-trend')) return Promise.resolve({ data: { months: [] } })
      return Promise.resolve({ data: {} })
    })

    const wrapper = createWrapper()
    await flushPromises()

    const emptyStates = wrapper.findAll('.empty-state-mini')
    expect(emptyStates.length).toBeGreaterThanOrEqual(3)
  })

  it('shows offline banner on network error', async () => {
    const { isOfflineError } = await import('../../services/syncManager.js')
    isOfflineError.mockReturnValue(true)

    api.get.mockRejectedValue(new Error('Network Error'))

    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.offline-banner').exists()).toBe(true)
  })

  it('makes API calls for all 6 structure endpoints', async () => {
    createWrapper()
    await flushPromises()

    const calls = api.get.mock.calls.map((c) => c[0])
    // Snapshot endpoints (no params)
    expect(calls).toContainEqual('/analytics/herd-summary')
    expect(calls).toContainEqual('/analytics/age-distribution')
    expect(calls).toContainEqual('/analytics/breed-composition')
    // Time-sensitive endpoints (with from/to params)
    expect(calls.some((c) => c.startsWith('/analytics/herd-turnover?from='))).toBe(true)
    expect(calls.some((c) => c.startsWith('/analytics/mortality-rate?from='))).toBe(true)
    expect(calls.some((c) => c.startsWith('/analytics/herd-size-trend?from='))).toBe(true)
  })

  it('re-fetches time-sensitive endpoints when time range chip is clicked', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    api.get.mockClear()
    mockAllApis()

    // Click the first chip (3M)
    const chips = wrapper.findAll('.filter-chips .chip')
    await chips[0].trigger('click')
    await flushPromises()

    const calls = api.get.mock.calls.map((c) => c[0])
    // Time-sensitive endpoints should be re-fetched
    expect(calls.some((c) => c.startsWith('/analytics/herd-turnover?from='))).toBe(true)
    expect(calls.some((c) => c.startsWith('/analytics/mortality-rate?from='))).toBe(true)
    expect(calls.some((c) => c.startsWith('/analytics/herd-size-trend?from='))).toBe(true)
    // Snapshot endpoints should NOT be re-fetched
    expect(calls).not.toContainEqual('/analytics/herd-summary')
    expect(calls).not.toContainEqual('/analytics/age-distribution')
    expect(calls).not.toContainEqual('/analytics/breed-composition')
  })
})
