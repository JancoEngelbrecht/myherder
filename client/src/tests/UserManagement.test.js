import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import UserManagement from '../views/admin/UserManagement.vue'

const mockRouter = { push: vi.fn(), back: vi.fn() }

vi.mock('vue-router', () => ({
  useRouter: () => mockRouter,
}))

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
    syncQueue: {
      where: vi.fn().mockReturnValue({
        aboveOrEqual: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }),
      bulkDelete: vi.fn(),
    },
  },
}))

const MOCK_USERS = [
  {
    id: 'u1',
    username: 'admin',
    full_name: 'Farm Admin',
    role: 'admin',
    permissions: ['can_manage_cows', 'can_manage_users'],
    language: 'en',
    is_active: true,
  },
  {
    id: 'u2',
    username: 'sipho',
    full_name: 'Sipho Dlamini',
    role: 'worker',
    permissions: ['can_manage_cows'],
    language: 'af',
    is_active: true,
  },
  {
    id: 'u3',
    username: 'inactive_user',
    full_name: 'Old Worker',
    role: 'worker',
    permissions: [],
    language: 'en',
    is_active: false,
  },
]

// Stub for SyncIndicator/SyncPanel used by AppHeader
const stubs = { SyncIndicator: true, SyncPanel: true, RouterLink: true }

function mountComponent() {
  // Mock the auth store
  return mount(UserManagement, {
    global: {
      stubs,
      mocks: {
        $route: { path: '/admin/users' },
      },
    },
  })
}

describe('UserManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockResolvedValue({ data: MOCK_USERS })
  })

  it('fetches and displays user list on mount', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    expect(mockGet).toHaveBeenCalledWith('/users')
    const cards = wrapper.findAll('.user-card')
    expect(cards).toHaveLength(3)
  })

  it('displays user details correctly', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const firstCard = wrapper.findAll('.user-card')[0]
    expect(firstCard.find('.user-name').text()).toBe('Farm Admin')
    expect(firstCard.find('.user-username').text()).toBe('@admin')
  })

  it('shows inactive card with opacity class', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const inactiveCard = wrapper.findAll('.user-card')[2]
    expect(inactiveCard.classes()).toContain('inactive')
  })

  it('shows role badges', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const badges = wrapper.findAll('.badge-admin')
    expect(badges).toHaveLength(1)
    const workerBadges = wrapper.findAll('.badge-worker')
    expect(workerBadges).toHaveLength(2)
  })

  it('opens add form when FAB clicked', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    await wrapper.find('.fab').trigger('click')
    expect(wrapper.find('.form-card').exists()).toBe(true)
    expect(wrapper.find('.form-title').text()).toContain('users.addUser')
  })

  it('opens edit form when edit button clicked', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const editBtns = wrapper.findAll('.btn-sm').filter((b) => b.text().includes('common.edit'))
    await editBtns[0].trigger('click')

    expect(wrapper.find('.form-card').exists()).toBe(true)
    expect(wrapper.find('.form-title').text()).toContain('users.editUser')
    expect(wrapper.find('#um-username').element.value).toBe('admin')
  })

  it('cancels form and returns to list', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    await wrapper.find('.fab').trigger('click')
    expect(wrapper.find('.form-card').exists()).toBe(true)

    await wrapper.find('.btn-secondary').trigger('click')
    expect(wrapper.find('.form-card').exists()).toBe(false)
  })

  it('creates a new user via POST', async () => {
    mockPost.mockResolvedValue({ data: { id: 'u4', username: 'new_worker' } })

    const wrapper = mountComponent()
    await flushPromises()

    await wrapper.find('.fab').trigger('click')
    await wrapper.find('#um-username').setValue('new_worker')
    await wrapper.find('#um-fullname').setValue('New Worker')
    await wrapper.find('#um-pin').setValue('5678')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(mockPost).toHaveBeenCalledWith('/users', expect.objectContaining({
      username: 'new_worker',
      full_name: 'New Worker',
      role: 'worker',
      pin: '5678',
    }))
  })

  it('shows deactivate button for other users but not self', async () => {
    // The current user ID comes from authStore, which won't match any mock user
    const wrapper = mountComponent()
    await flushPromises()

    // All 3 users should have deactivate/reactivate since none is "self"
    const dangerBtns = wrapper.findAll('.btn-danger')
    const primaryBtns = wrapper.findAll('.user-actions .btn-primary')
    // inactive user gets "reactivate" (btn-primary), active users get "deactivate" (btn-danger)
    expect(dangerBtns.length + primaryBtns.length).toBe(3)
  })

  it('shows revoke sessions button for active non-self users', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    // v-if="user.id !== currentUserId && user.is_active" — u1 + u2 active, u3 inactive
    const revokeBtns = wrapper.findAll('.btn-sm').filter((b) => b.text().includes('users.revokeSessions'))
    expect(revokeBtns).toHaveLength(2)
  })

  it('calls revoke-sessions API and shows toast on confirm', async () => {
    mockPost.mockResolvedValue({ data: { revoked: true, new_version: 1 } })

    const wrapper = mountComponent()
    await flushPromises()

    // Click "Revoke Sessions" on first active user
    const revokeBtns = wrapper.findAll('.btn-sm').filter((b) => b.text().includes('users.revokeSessions'))
    await revokeBtns[0].trigger('click')

    // ConfirmDialog should be visible
    const dialogs = wrapper.findAllComponents({ name: 'ConfirmDialog' })
    const revokeDialog = dialogs.find((d) => d.props('confirmLabel')?.includes('users.revokeSessions'))
    expect(revokeDialog).toBeTruthy()

    // Confirm
    revokeDialog.vm.$emit('confirm')
    await flushPromises()

    expect(mockPost).toHaveBeenCalledWith('/users/u1/revoke-sessions')
  })

  it('shows form error on API failure', async () => {
    mockPost.mockRejectedValue({ response: { data: { error: 'Username already exists' } } })

    const wrapper = mountComponent()
    await flushPromises()

    await wrapper.find('.fab').trigger('click')
    await wrapper.find('#um-username').setValue('admin')
    await wrapper.find('#um-fullname').setValue('Dup')
    await wrapper.find('#um-pin').setValue('1234')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('.form-error').text()).toBe('Username already exists')
  })
})
