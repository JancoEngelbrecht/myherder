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

import AnalyticsView from '../views/AnalyticsView.vue'
import api from '../services/api.js'
import { createPinia, setActivePinia } from 'pinia'

// ── Helpers ──────────────────────────────────────────────────────────────────

const stubs = {
  AppHeader: { template: '<div class="app-header"><slot /></div>' },
}

const DAILY_KPIS_RESPONSE = {
  data: {
    litres_today: 245.5,
    litres_7day_avg: 230.2,
    cows_milked_today: 42,
    cows_expected: 48,
    active_health_issues: 3,
    breeding_actions_due: 2,
  },
}

const HERD_RESPONSE = {
  data: {
    total: 50,
    by_status: [
      { status: 'active', count: 40 },
      { status: 'pregnant', count: 8 },
      { status: 'sick', count: 2 },
    ],
  },
}

function mockAllApis() {
  api.get.mockImplementation((url) => {
    if (url.includes('daily-kpis')) return Promise.resolve(DAILY_KPIS_RESPONSE)
    if (url.includes('herd-summary')) return Promise.resolve(HERD_RESPONSE)
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
  return mount(AnalyticsView, { global: { stubs } })
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  mockAllApis()
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AnalyticsView (Landing Page)', () => {
  it('renders daily KPI cards with values', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    // 5 cards: total herd + litres + cows milked + health + breeding
    expect(wrapper.findAll('.kpi-card').length).toBe(5)
    expect(wrapper.text()).toContain('50') // total herd
    expect(wrapper.text()).toContain('245.5')
    expect(wrapper.text()).toContain('42')
    expect(wrapper.text()).toContain('3')
    expect(wrapper.text()).toContain('2')
  })

  it('shows trend comparison for litres', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    // ((245.5 - 230.2) / 230.2) * 100 ≈ 7%
    expect(wrapper.text()).toContain('7%')
    expect(wrapper.find('.trend-up').exists()).toBe(true)
  })

  it('shows cows milked vs expected comparison', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    // 42 of 48 expected — trend-down because milked < expected
    expect(wrapper.text()).toContain('42')
    expect(wrapper.text()).toContain('ofExpected')
    expect(wrapper.find('.trend-down').exists()).toBe(true)
  })

  it('renders herd status bars', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.findAll('.status-row').length).toBe(6)
  })

  it('renders 4 category navigation buttons', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const cards = wrapper.findAll('.category-card')
    expect(cards.length).toBe(4)
  })

  it('hides milk KPI cards when milkRecording flag is off', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const { useFeatureFlagsStore } = await import('../stores/featureFlags.js')
    const flagsStore = useFeatureFlagsStore()
    flagsStore.flags.milkRecording = false

    mockAllApis()
    const wrapper = mount(AnalyticsView, { global: { stubs } })
    await flushPromises()

    // 3 KPI cards: total herd + health + breeding
    expect(wrapper.findAll('.kpi-card').length).toBe(3)
  })

  it('hides breeding KPI card when breeding flag is off', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const { useFeatureFlagsStore } = await import('../stores/featureFlags.js')
    const flagsStore = useFeatureFlagsStore()
    flagsStore.flags.breeding = false

    mockAllApis()
    const wrapper = mount(AnalyticsView, { global: { stubs } })
    await flushPromises()

    // 4 KPI cards: total herd + litres + cows milked + health issues
    expect(wrapper.findAll('.kpi-card').length).toBe(4)
    // Fertility category card should be hidden (3 remain: financial, health, structure)
    const cards = wrapper.findAll('.category-card')
    expect(cards.length).toBe(3)
  })

  it('hides health KPI card when healthIssues flag is off', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const { useFeatureFlagsStore } = await import('../stores/featureFlags.js')
    const flagsStore = useFeatureFlagsStore()
    flagsStore.flags.healthIssues = false

    mockAllApis()
    const wrapper = mount(AnalyticsView, { global: { stubs } })
    await flushPromises()

    // 4 KPI cards: total herd + litres + cows milked + breeding
    expect(wrapper.findAll('.kpi-card').length).toBe(4)
  })

  it('shows offline banner when API fails with network error', async () => {
    const { isOfflineError } = await import('../services/syncManager.js')
    isOfflineError.mockReturnValue(true)

    api.get.mockRejectedValue(new Error('Network Error'))

    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.offline-banner').exists()).toBe(true)
  })

  it('makes API calls for daily-kpis and herd-summary on mount', async () => {
    createWrapper()
    await flushPromises()

    const calls = api.get.mock.calls.map((c) => c[0])
    expect(calls).toContainEqual('/analytics/daily-kpis')
    expect(calls).toContainEqual('/analytics/herd-summary')
  })

  it('structure category card is always visible', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const { useFeatureFlagsStore } = await import('../stores/featureFlags.js')
    const flagsStore = useFeatureFlagsStore()
    flagsStore.flags.milkRecording = false
    flagsStore.flags.breeding = false
    flagsStore.flags.healthIssues = false
    flagsStore.flags.treatments = false

    mockAllApis()
    const wrapper = mount(AnalyticsView, { global: { stubs } })
    await flushPromises()

    // Structure card should always be present regardless of flags
    const cards = wrapper.findAll('.category-card')
    expect(cards.length).toBeGreaterThanOrEqual(1)
  })
})
