import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import FarmListView from '../views/super/FarmListView.vue'
import { useAuthStore } from '../stores/auth.js'

const mockGet = vi.fn()
const mockPost = vi.fn()

vi.mock('../services/api.js', () => ({
  default: {
    get: (...args) => mockGet(...args),
    post: (...args) => mockPost(...args),
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
    auth: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    featureFlags: {
      put: vi.fn().mockResolvedValue(undefined),
      toArray: vi.fn().mockResolvedValue([]),
    },
  },
  initDb: vi.fn(),
  closeDb: vi.fn(),
}))

const stubs = {
  RouterLink: { template: '<a v-bind="$attrs"><slot /></a>' },
}

const MOCK_FARMS = [
  { id: 'f1', name: 'Farm Alpha', code: 'ALPHA', is_active: true, user_count: 3, cow_count: 50, created_at: '2025-01-01T00:00:00Z' },
  { id: 'f2', name: 'Farm Beta', code: 'BETA', is_active: false, user_count: 1, cow_count: 10, created_at: '2025-06-01T00:00:00Z' },
]

function setSuperAdmin() {
  const auth = useAuthStore()
  auth.user = { full_name: 'Super Admin', username: 'super', role: 'super_admin', permissions: [], farm_id: null }
  auth.token = 'test-token'
}

describe('FarmListView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockResolvedValue({ data: MOCK_FARMS })
  })

  it('renders farm list on mount', async () => {
    setSuperAdmin()
    const wrapper = mount(FarmListView, { global: { stubs } })
    await flushPromises()

    expect(mockGet).toHaveBeenCalledWith('/farms')
    const cards = wrapper.findAll('.farm-card')
    expect(cards).toHaveLength(2)
  })

  it('shows farm name and code', async () => {
    setSuperAdmin()
    const wrapper = mount(FarmListView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.text()).toContain('Farm Alpha')
    expect(wrapper.text()).toContain('ALPHA')
    expect(wrapper.text()).toContain('Farm Beta')
  })

  it('shows active/inactive badges', async () => {
    setSuperAdmin()
    const wrapper = mount(FarmListView, { global: { stubs } })
    await flushPromises()

    const badges = wrapper.findAll('.badge')
    expect(badges[0].classes()).toContain('badge-active')
    expect(badges[1].classes()).toContain('badge-inactive')
  })

  it('shows user and cow counts', async () => {
    setSuperAdmin()
    const wrapper = mount(FarmListView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.text()).toContain('3')
    expect(wrapper.text()).toContain('50')
  })

  it('shows empty state when no farms', async () => {
    setSuperAdmin()
    mockGet.mockResolvedValue({ data: [] })
    const wrapper = mount(FarmListView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.empty-state').exists()).toBe(true)
  })

  it('shows spinner while loading', () => {
    setSuperAdmin()
    mockGet.mockReturnValue(new Promise(() => {})) // never resolves
    const wrapper = mount(FarmListView, { global: { stubs } })

    expect(wrapper.find('.spinner').exists()).toBe(true)
  })

  it('has a create farm link', async () => {
    setSuperAdmin()
    const wrapper = mount(FarmListView, { global: { stubs } })
    await flushPromises()

    const createLink = wrapper.findAll('a').find((a) => a.attributes('to') === '/super/farms/new')
    expect(createLink).toBeDefined()
  })
})
