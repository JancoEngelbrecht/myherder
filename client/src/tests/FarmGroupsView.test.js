import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import FarmGroupsView from '../views/super/FarmGroupsView.vue'
import { useAuthStore } from '../stores/auth.js'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPatch = vi.fn()
const mockDelete = vi.fn()

vi.mock('../services/api.js', () => ({
  default: {
    get: (...args) => mockGet(...args),
    post: (...args) => mockPost(...args),
    patch: (...args) => mockPatch(...args),
    delete: (...args) => mockDelete(...args),
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
  ConfirmDialog: {
    props: ['show', 'message', 'confirmLabel', 'loading'],
    emits: ['confirm', 'cancel'],
    template: `
      <div v-if="show" class="confirm-dialog-stub">
        <p>{{ message }}</p>
        <button class="confirm-btn" @click="$emit('confirm')">{{ confirmLabel }}</button>
        <button class="cancel-btn" @click="$emit('cancel')">Cancel</button>
      </div>
    `,
  },
}

const MOCK_FARMS = [
  { id: 'f1', name: 'Farm Alpha', code: 'ALPHA', is_active: true },
  { id: 'f2', name: 'Farm Beta', code: 'BETA', is_active: true },
  { id: 'f3', name: 'Farm Gamma', code: 'GAMMA', is_active: true },
]

const MOCK_GROUPS = [
  {
    id: 'g1',
    name: 'Eastern Group',
    farms: [
      { id: 'f1', name: 'Farm Alpha', code: 'ALPHA', is_active: true },
      { id: 'f2', name: 'Farm Beta', code: 'BETA', is_active: true },
    ],
  },
]

function setSuperAdmin() {
  const auth = useAuthStore()
  auth.user = {
    full_name: 'Super Admin',
    username: 'super',
    role: 'super_admin',
    permissions: [],
    farm_id: null,
  }
  auth.token = 'test-token'
}

describe('FarmGroupsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: no groups, all farms available
    mockGet.mockImplementation((url) => {
      if (url === '/farm-groups') return Promise.resolve({ data: [] })
      if (url === '/farms') return Promise.resolve({ data: MOCK_FARMS })
      return Promise.resolve({ data: [] })
    })
  })

  it('renders empty state when no groups exist', async () => {
    setSuperAdmin()
    const wrapper = mount(FarmGroupsView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.empty-state').exists()).toBe(true)
  })

  it('renders group cards with farm chips when groups exist', async () => {
    setSuperAdmin()
    mockGet.mockImplementation((url) => {
      if (url === '/farm-groups') return Promise.resolve({ data: MOCK_GROUPS })
      if (url === '/farms') return Promise.resolve({ data: MOCK_FARMS })
      return Promise.resolve({ data: [] })
    })

    const wrapper = mount(FarmGroupsView, { global: { stubs } })
    await flushPromises()

    // Group card should render
    expect(wrapper.find('.group-card').exists()).toBe(true)
    expect(wrapper.text()).toContain('Eastern Group')

    // Farm chips show member farms
    const chips = wrapper.findAll('.farm-chip')
    expect(chips).toHaveLength(2)
    expect(wrapper.text()).toContain('Farm Alpha')
    expect(wrapper.text()).toContain('Farm Beta')
  })

  it('shows create group form when Create Group button is clicked', async () => {
    setSuperAdmin()
    const wrapper = mount(FarmGroupsView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.form-card').exists()).toBe(false)

    await wrapper.find('.btn-primary').trigger('click')
    expect(wrapper.find('.form-card').exists()).toBe(true)
  })

  it('calls POST /farm-groups on create form submit', async () => {
    setSuperAdmin()
    mockPost.mockResolvedValue({ data: MOCK_GROUPS[0] })
    // After create, reload returns the group
    let callCount = 0
    mockGet.mockImplementation((url) => {
      if (url === '/farm-groups') {
        callCount++
        return Promise.resolve({ data: callCount > 1 ? MOCK_GROUPS : [] })
      }
      if (url === '/farms') return Promise.resolve({ data: MOCK_FARMS })
      return Promise.resolve({ data: [] })
    })

    const wrapper = mount(FarmGroupsView, { global: { stubs } })
    await flushPromises()

    // Open create form
    await wrapper.find('.btn-primary').trigger('click')

    // Fill in group name
    const nameInput = wrapper.find('#group-name')
    await nameInput.setValue('New Group')

    // Check at least 2 farm checkboxes
    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    await checkboxes[0].setValue(true)
    await checkboxes[1].setValue(true)

    // Submit
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(mockPost).toHaveBeenCalledWith('/farm-groups', {
      name: 'New Group',
      farm_ids: expect.arrayContaining(['f1', 'f2']),
    })
  })

  it('shows validation error when fewer than 2 farms are selected', async () => {
    setSuperAdmin()
    const wrapper = mount(FarmGroupsView, { global: { stubs } })
    await flushPromises()

    // Open create form
    await wrapper.find('.btn-primary').trigger('click')

    const nameInput = wrapper.find('#group-name')
    await nameInput.setValue('Solo Group')

    // Select only 1 farm
    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    await checkboxes[0].setValue(true)

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    // Error message should appear
    expect(wrapper.find('.form-error').exists()).toBe(true)
    // POST should NOT have been called
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('opens ConfirmDialog and calls DELETE /farm-groups/:id on confirm', async () => {
    setSuperAdmin()
    mockGet.mockImplementation((url) => {
      if (url === '/farm-groups') return Promise.resolve({ data: MOCK_GROUPS })
      if (url === '/farms') return Promise.resolve({ data: MOCK_FARMS })
      return Promise.resolve({ data: [] })
    })
    mockDelete.mockResolvedValue({ data: { message: 'Farm group deleted' } })

    const wrapper = mount(FarmGroupsView, { global: { stubs } })
    await flushPromises()

    // Click the Delete Group button
    const deleteBtn = wrapper.find('.btn-danger')
    await deleteBtn.trigger('click')

    // ConfirmDialog should appear
    const dialog = wrapper.find('.confirm-dialog-stub')
    expect(dialog.exists()).toBe(true)

    // Click confirm
    await wrapper.find('.confirm-btn').trigger('click')
    await flushPromises()

    expect(mockDelete).toHaveBeenCalledWith('/farm-groups/g1')
  })

  it('calls POST /farm-groups/:id/farms when Add Farm is submitted', async () => {
    setSuperAdmin()
    // Group with only f1 — f2 + f3 are unassigned
    const groupWithOneFarm = [
      {
        id: 'g1',
        name: 'Small Group',
        farms: [{ id: 'f1', name: 'Farm Alpha', code: 'ALPHA', is_active: true }],
      },
    ]
    mockGet.mockImplementation((url) => {
      if (url === '/farm-groups') return Promise.resolve({ data: groupWithOneFarm })
      if (url === '/farms') return Promise.resolve({ data: MOCK_FARMS })
      return Promise.resolve({ data: [] })
    })
    mockPost.mockResolvedValue({
      data: { ...groupWithOneFarm[0], farms: [MOCK_FARMS[0], MOCK_FARMS[1]] },
    })

    const wrapper = mount(FarmGroupsView, { global: { stubs } })
    await flushPromises()

    // Select a farm from the add-farm dropdown
    const select = wrapper.find('.add-farm-select')
    await select.setValue('f2')

    // Click the Add Farm button
    const addBtn = wrapper.find('.add-farm-row .btn-primary')
    await addBtn.trigger('click')
    await flushPromises()

    expect(mockPost).toHaveBeenCalledWith('/farm-groups/g1/farms', { farm_ids: ['f2'] })
  })

  it('opens ConfirmDialog and calls DELETE /farm-groups/:id/farms/:farmId on confirm', async () => {
    setSuperAdmin()
    mockGet.mockImplementation((url) => {
      if (url === '/farm-groups') return Promise.resolve({ data: MOCK_GROUPS })
      if (url === '/farms') return Promise.resolve({ data: MOCK_FARMS })
      return Promise.resolve({ data: [] })
    })
    mockDelete.mockResolvedValue({ data: { farms: [MOCK_GROUPS[0].farms[0]] } })

    const wrapper = mount(FarmGroupsView, { global: { stubs } })
    await flushPromises()

    // Click the × remove button on the first farm chip
    const removeBtn = wrapper.find('.chip-remove')
    await removeBtn.trigger('click')

    // ConfirmDialog for removing farm should appear
    const dialogs = wrapper.findAll('.confirm-dialog-stub')
    expect(dialogs.length).toBeGreaterThan(0)

    // Confirm the removal
    const confirmBtn = wrapper.find('.confirm-btn')
    await confirmBtn.trigger('click')
    await flushPromises()

    expect(mockDelete).toHaveBeenCalledWith('/farm-groups/g1/farms/f1')
  })
})
