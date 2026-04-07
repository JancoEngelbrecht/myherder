import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import DashboardView from '../views/DashboardView.vue'
import { useAuthStore } from '../stores/auth'
import { useFeatureFlagsStore } from '../stores/featureFlags'

const mockGet = vi.fn()

vi.mock('../services/api', () => ({
  default: {
    get: (...args) => mockGet(...args),
  },
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
      put: vi.fn().mockResolvedValue(undefined),
      toArray: vi.fn().mockResolvedValue([]),
    },
    auth: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  },
}))

const stubs = {
  SyncIndicator: true,
  SyncPanel: true,
  RouterLink: { template: '<a v-bind="$attrs"><slot /></a>' },
}

function setAdmin() {
  const auth = useAuthStore()
  auth.user = {
    full_name: 'Farm Admin',
    username: 'admin',
    role: 'admin',
    permissions: [],
    farm_id: 'farm-1',
  }
}

function setWorker(permissions = []) {
  const auth = useAuthStore()
  auth.user = {
    full_name: 'Sipho',
    username: 'sipho',
    role: 'worker',
    permissions,
    farm_id: 'farm-1',
  }
}

function setAllFlags() {
  const store = useFeatureFlagsStore()
  store.flags = {
    breeding: true,
    milkRecording: true,
    healthIssues: true,
    treatments: true,
    analytics: true,
  }
}

/** Default mock for herd-summary + issues + withdrawal */
function setDefaultMocks() {
  mockGet.mockImplementation((url) => {
    if (url.includes('herd-summary')) {
      return Promise.resolve({
        data: {
          total: 79,
          by_status: [
            { status: 'active', count: 50 },
            { status: 'pregnant', count: 15 },
            { status: 'dry', count: 10 },
            { status: 'sick', count: 4 },
          ],
        },
      })
    }
    if (url.includes('health-issues')) {
      return Promise.resolve({
        data: [],
        headers: { 'x-total-count': '7' },
      })
    }
    if (url.includes('treatments/withdrawal')) {
      return Promise.resolve({
        data: [{ id: '1' }, { id: '2' }, { id: '3' }],
      })
    }
    return Promise.resolve({ data: {} })
  })
}

describe('DashboardView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setDefaultMocks()
  })

  it('renders greeting with user full name', async () => {
    setAdmin()
    setAllFlags()
    const wrapper = mount(DashboardView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.greeting-text').text()).toContain('Farm Admin')
  })

  it('renders greeting with username when full_name missing', async () => {
    const auth = useAuthStore()
    auth.user = { username: 'sipho', role: 'admin', permissions: [], farm_id: 'farm-1' }
    setAllFlags()
    const wrapper = mount(DashboardView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.greeting-text').text()).toContain('sipho')
  })

  it('greeting has no wave emoji', async () => {
    setAdmin()
    setAllFlags()
    const wrapper = mount(DashboardView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.greeting-text').text()).not.toContain('👋')
  })

  it('shows herd card with total and pregnant count', async () => {
    setAdmin()
    setAllFlags()
    const wrapper = mount(DashboardView, { global: { stubs } })
    await flushPromises()

    const herdCard = wrapper.find('.herd-card')
    expect(herdCard.exists()).toBe(true)
    expect(herdCard.attributes('data-herd-total')).toBe('79')
    expect(herdCard.attributes('data-herd-pregnant')).toBe('15')
  })

  it('shows null herd total when herd-summary API fails', async () => {
    setAdmin()
    setAllFlags()
    mockGet.mockImplementation((url) => {
      if (url.includes('herd-summary')) return Promise.reject(new Error('offline'))
      if (url.includes('health-issues'))
        return Promise.resolve({ data: [], headers: { 'x-total-count': '0' } })
      if (url.includes('treatments/withdrawal')) return Promise.resolve({ data: [] })
      return Promise.resolve({ data: {} })
    })
    const wrapper = mount(DashboardView, { global: { stubs } })
    await flushPromises()

    // herd-card data attribute is absent when API fails (null value removes attribute)
    const herdCard = wrapper.find('.herd-card')
    expect(herdCard.attributes('data-herd-total')).toBeUndefined()
  })

  it('shows open issue count in alert card', async () => {
    setAdmin()
    setAllFlags()
    const wrapper = mount(DashboardView, { global: { stubs } })
    await flushPromises()

    const issuesCard = wrapper.find('[data-issue-count]')
    expect(issuesCard.exists()).toBe(true)
    expect(issuesCard.attributes('data-issue-count')).toBe('7')
  })

  it('shows withdrawal count in alert card', async () => {
    setAdmin()
    setAllFlags()
    const wrapper = mount(DashboardView, { global: { stubs } })
    await flushPromises()

    const withdrawalCard = wrapper.find('[data-withdrawal-count]')
    expect(withdrawalCard.exists()).toBe(true)
    expect(withdrawalCard.attributes('data-withdrawal-count')).toBe('3')
  })

  it('shows 0 for issue count when API fails', async () => {
    setAdmin()
    setAllFlags()
    mockGet.mockImplementation((url) => {
      if (url.includes('herd-summary'))
        return Promise.resolve({ data: { total: 10, by_status: [] } })
      if (url.includes('health-issues')) return Promise.reject(new Error('offline'))
      if (url.includes('treatments/withdrawal')) return Promise.resolve({ data: [] })
      return Promise.resolve({ data: {} })
    })
    const wrapper = mount(DashboardView, { global: { stubs } })
    await flushPromises()

    const issuesCard = wrapper.find('[data-issue-count]')
    expect(issuesCard.attributes('data-issue-count')).toBe('0')
  })

  it('shows 0 for withdrawal count when API fails', async () => {
    setAdmin()
    setAllFlags()
    mockGet.mockImplementation((url) => {
      if (url.includes('herd-summary'))
        return Promise.resolve({ data: { total: 10, by_status: [] } })
      if (url.includes('health-issues'))
        return Promise.resolve({ data: [], headers: { 'x-total-count': '0' } })
      if (url.includes('treatments/withdrawal')) return Promise.reject(new Error('offline'))
      return Promise.resolve({ data: {} })
    })
    const wrapper = mount(DashboardView, { global: { stubs } })
    await flushPromises()

    const withdrawalCard = wrapper.find('[data-withdrawal-count]')
    expect(withdrawalCard.attributes('data-withdrawal-count')).toBe('0')
  })

  it('skips issue count fetch when worker lacks can_log_issues', async () => {
    setWorker(['can_record_milk'])
    setAllFlags()
    const wrapper = mount(DashboardView, { global: { stubs } })
    await flushPromises()

    const calls = mockGet.mock.calls.map((c) => c[0])
    expect(calls.some((u) => u.includes('health-issues'))).toBe(false)
    // Issues alert card should not be visible
    expect(wrapper.find('.alert-card').exists()).toBe(false)
  })

  it('skips withdrawal fetch when worker lacks can_log_treatments', async () => {
    setWorker(['can_record_milk'])
    setAllFlags()
    mount(DashboardView, { global: { stubs } })
    await flushPromises()

    const calls = mockGet.mock.calls.map((c) => c[0])
    expect(calls.some((u) => u.includes('treatments/withdrawal'))).toBe(false)
  })

  it('admin with all flags sees herd card + milk + breeding + treatment + health action cards', async () => {
    setAdmin()
    setAllFlags()
    const wrapper = mount(DashboardView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.herd-card').exists()).toBe(true)
    expect(wrapper.findAll('.action-card')).toHaveLength(4) // breeding, health, treatment, milk
  })

  it('shows more options section with open issues, withdrawal, and analytics buttons', async () => {
    setAdmin()
    setAllFlags()
    const wrapper = mount(DashboardView, { global: { stubs } })
    await flushPromises()

    const moreOptions = wrapper.find('.more-options')
    expect(moreOptions.exists()).toBe(true)
    expect(wrapper.findAll('.option-btn')).toHaveLength(3) // open issues, withdrawal, analytics
  })

  it('worker with only can_record_milk sees only herd card and milk card', async () => {
    setWorker(['can_record_milk'])
    setAllFlags()
    const wrapper = mount(DashboardView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.herd-card').exists()).toBe(true)
    // milk card only
    const actionCards = wrapper.findAll('.action-card')
    expect(actionCards).toHaveLength(1)
    // no more-options buttons (no analytics/issues/withdrawal permission)
    expect(wrapper.findAll('.option-btn')).toHaveLength(0)
  })

  it('hides action cards when feature flags are disabled', async () => {
    setAdmin()
    const store = useFeatureFlagsStore()
    store.flags = {
      breeding: false,
      milkRecording: false,
      healthIssues: false,
      treatments: false,
      analytics: false,
    }

    const wrapper = mount(DashboardView, { global: { stubs } })
    await flushPromises()

    // Only herd card remains
    expect(wrapper.find('.herd-card').exists()).toBe(true)
    expect(wrapper.findAll('.action-card')).toHaveLength(0)
    expect(wrapper.findAll('.option-btn')).toHaveLength(0)
  })

  it('skips herd summary fetch when worker lacks can_view_analytics', async () => {
    setWorker(['can_record_milk'])
    setAllFlags()
    mount(DashboardView, { global: { stubs } })
    await flushPromises()

    const calls = mockGet.mock.calls.map((c) => c[0])
    expect(calls.some((u) => u.includes('herd-summary'))).toBe(false)
  })
})
