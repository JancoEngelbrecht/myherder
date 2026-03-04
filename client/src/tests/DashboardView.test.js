import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import DashboardView from '../views/DashboardView.vue'
import { useAuthStore } from '../stores/auth.js'
import { useFeatureFlagsStore } from '../stores/featureFlags.js'

const mockGet = vi.fn()

vi.mock('../services/api.js', () => ({
  default: {
    get: (...args) => mockGet(...args),
  },
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

const stubs = { SyncIndicator: true, SyncPanel: true, RouterLink: { template: '<a v-bind="$attrs"><slot /></a>' } }

function setAdmin() {
  const auth = useAuthStore()
  auth.user = { full_name: 'Farm Admin', username: 'admin', role: 'admin', permissions: [] }
}

function setWorker(permissions = []) {
  const auth = useAuthStore()
  auth.user = { full_name: 'Sipho', username: 'sipho', role: 'worker', permissions }
}

function setAllFlags() {
  const store = useFeatureFlagsStore()
  store.flags = { breeding: true, milkRecording: true, healthIssues: true, treatments: true, analytics: true }
}

describe('DashboardView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockResolvedValue({
      data: {
        by_status: [
          { status: 'active', count: 10 },
          { status: 'dry', count: 3 },
          { status: 'pregnant', count: 5 },
          { status: 'sick', count: 2 },
        ],
      },
    })
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
    auth.user = { username: 'sipho', role: 'admin', permissions: [] }
    setAllFlags()
    const wrapper = mount(DashboardView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.greeting-text').text()).toContain('sipho')
  })

  it('shows herd summary stats after loading', async () => {
    setAdmin()
    setAllFlags()
    const wrapper = mount(DashboardView, { global: { stubs } })
    await flushPromises()

    const counts = wrapper.findAll('.stat-count')
    expect(counts).toHaveLength(4)
    expect(counts[0].text()).toBe('10') // active
    expect(counts[1].text()).toBe('3')  // dry
    expect(counts[2].text()).toBe('5')  // pregnant
    expect(counts[3].text()).toBe('2')  // sick
  })

  it('shows dash placeholders when summary API fails', async () => {
    setAdmin()
    setAllFlags()
    mockGet.mockRejectedValue(new Error('offline'))
    const wrapper = mount(DashboardView, { global: { stubs } })
    await flushPromises()

    const counts = wrapper.findAll('.stat-count')
    expect(counts[0].text()).toBe('—')
  })

  it('admin sees all 8 action cards with all flags enabled', async () => {
    setAdmin()
    setAllFlags()
    const wrapper = mount(DashboardView, { global: { stubs } })
    await flushPromises()

    const cards = wrapper.findAll('.action-card')
    expect(cards).toHaveLength(8)
  })

  it('worker with limited permissions sees only permitted cards', async () => {
    setWorker(['can_record_milk'])
    setAllFlags()
    const wrapper = mount(DashboardView, { global: { stubs } })
    await flushPromises()

    const cards = wrapper.findAll('.action-card')
    // View Cows (always) + Record Milk = 2
    expect(cards).toHaveLength(2)
  })

  it('skips herd summary fetch when worker lacks can_view_analytics', async () => {
    setWorker(['can_record_milk'])
    setAllFlags()
    mount(DashboardView, { global: { stubs } })
    await flushPromises()

    expect(mockGet).not.toHaveBeenCalled()
  })

  it('hides action cards when feature flags are disabled', async () => {
    setAdmin()
    const store = useFeatureFlagsStore()
    store.flags = { breeding: false, milkRecording: false, healthIssues: false, treatments: false, analytics: false }

    const wrapper = mount(DashboardView, { global: { stubs } })
    await flushPromises()

    // Only "View Cows" card remains (no flag gating)
    const cards = wrapper.findAll('.action-card')
    expect(cards).toHaveLength(1)
  })
})
