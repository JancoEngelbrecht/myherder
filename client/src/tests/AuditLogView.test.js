import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AuditLogView from '../views/admin/AuditLogView.vue'

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

const MOCK_ENTRIES = [
  {
    id: 'a1',
    user_id: 'u1',
    action: 'create',
    entity_type: 'cow',
    entity_id: 'c1',
    old_values: null,
    new_values: { name: 'Bessie' },
    created_at: '2026-02-28T10:00:00.000Z',
    user_username: 'admin',
    user_full_name: 'Farm Admin',
  },
  {
    id: 'a2',
    user_id: 'u1',
    action: 'update',
    entity_type: 'user',
    entity_id: 'u2',
    old_values: { role: 'worker' },
    new_values: { role: 'admin' },
    created_at: '2026-02-28T09:00:00.000Z',
    user_username: 'admin',
    user_full_name: 'Farm Admin',
  },
]

const MOCK_USERS = [
  { id: 'u1', username: 'admin', full_name: 'Farm Admin' },
  { id: 'u2', username: 'sipho', full_name: 'Sipho Nkosi' },
]

const stubs = { SyncIndicator: true, SyncPanel: true, RouterLink: true }

function mountComponent() {
  return mount(AuditLogView, {
    global: {
      stubs,
      mocks: { $route: { path: '/admin/audit-log' } },
    },
  })
}

function setupDefaultMocks() {
  mockGet.mockImplementation((url) => {
    if (url === '/users') return Promise.resolve({ data: MOCK_USERS })
    return Promise.resolve({ data: { data: MOCK_ENTRIES, total: 2 } })
  })
}

describe('AuditLogView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDefaultMocks()
  })

  it('fetches audit log and users on mount', async () => {
    mountComponent()
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/audit-log', { params: { page: 1, limit: 25 } })
    expect(mockGet).toHaveBeenCalledWith('/users')
  })

  it('displays audit entries', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    const cards = wrapper.findAll('.audit-card')
    expect(cards).toHaveLength(2)
  })

  it('shows action badges', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    expect(wrapper.find('.badge-create').exists()).toBe(true)
    expect(wrapper.find('.badge-update').exists()).toBe(true)
  })

  it('shows user name in entry', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    expect(wrapper.find('.audit-user').text()).toContain('Farm Admin')
  })

  it('filters by entity type when chip clicked', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const chips = wrapper.findAll('.chip')
    const userChip = chips.find((c) => c.text().includes('audit.entityTypes.user'))
    await userChip.trigger('click')
    await flushPromises()

    expect(mockGet).toHaveBeenLastCalledWith('/audit-log', {
      params: { page: 1, limit: 25, entity_type: 'user' },
    })
  })

  it('toggles detail expansion on click', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const toggleBtns = wrapper.findAll('.btn-link')
    expect(toggleBtns.length).toBeGreaterThan(0)

    await toggleBtns[0].trigger('click')
    expect(wrapper.find('.audit-diff').exists()).toBe(true)

    await toggleBtns[0].trigger('click')
    expect(wrapper.find('.audit-diff').exists()).toBe(false)
  })

  it('shows empty state when no entries', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/users') return Promise.resolve({ data: MOCK_USERS })
      return Promise.resolve({ data: { data: [], total: 0 } })
    })
    const wrapper = mountComponent()
    await flushPromises()
    expect(wrapper.find('.empty-state').exists()).toBe(true)
  })

  it('shows loading spinner while fetching', async () => {
    let resolveGet
    mockGet.mockImplementation((url) => {
      if (url === '/users') return Promise.resolve({ data: MOCK_USERS })
      return new Promise((r) => {
        resolveGet = r
      })
    })

    const wrapper = mountComponent()
    await flushPromises()

    expect(wrapper.find('.spinner').exists()).toBe(true)

    resolveGet({ data: { data: [], total: 0 } })
    await flushPromises()

    expect(wrapper.find('.spinner').exists()).toBe(false)
  })

  it('shows advanced filters panel when toggle clicked', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    expect(wrapper.find('.advanced-filters').exists()).toBe(false)
    await wrapper.find('.advanced-toggle').trigger('click')
    expect(wrapper.find('.advanced-filters').exists()).toBe(true)
  })

  it('sends action filter param when action selected', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    mockGet.mockClear()
    setupDefaultMocks()

    await wrapper.find('.advanced-toggle').trigger('click')
    const actionSelect = wrapper.findAll('.filter-select')[0]
    await actionSelect.setValue('create')
    await flushPromises()

    expect(mockGet).toHaveBeenCalledWith('/audit-log', {
      params: expect.objectContaining({ action: 'create', page: 1 }),
    })
  })

  it('sends user_id filter param when user selected', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    mockGet.mockClear()
    setupDefaultMocks()

    await wrapper.find('.advanced-toggle').trigger('click')
    const userSelect = wrapper.findAll('.filter-select')[1]
    await userSelect.setValue('u1')
    await flushPromises()

    expect(mockGet).toHaveBeenCalledWith('/audit-log', {
      params: expect.objectContaining({ user_id: 'u1', page: 1 }),
    })
  })

  it('sends date range params when dates set', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    mockGet.mockClear()
    setupDefaultMocks()

    await wrapper.find('.advanced-toggle').trigger('click')
    const dateInputs = wrapper.findAll('.filter-date-input')
    await dateInputs[0].setValue('2026-02-01')
    await flushPromises()

    expect(mockGet).toHaveBeenCalledWith('/audit-log', {
      params: expect.objectContaining({ from: '2026-02-01', page: 1 }),
    })
  })

  it('clears all advanced filters on clear button click', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    await wrapper.find('.advanced-toggle').trigger('click')
    const actionSelect = wrapper.findAll('.filter-select')[0]
    await actionSelect.setValue('create')
    await flushPromises()

    // Filter badge should show 1
    expect(wrapper.find('.filter-badge').text()).toBe('1')

    mockGet.mockClear()
    setupDefaultMocks()

    await wrapper.find('.clear-btn').trigger('click')
    await flushPromises()

    expect(mockGet).toHaveBeenCalledWith('/audit-log', {
      params: { page: 1, limit: 25 },
    })
    expect(wrapper.find('.filter-badge').exists()).toBe(false)
  })
})
