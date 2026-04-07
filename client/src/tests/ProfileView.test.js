import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ProfileView from '../views/ProfileView.vue'
import { useAuthStore } from '../stores/auth'

const mockRouter = { push: vi.fn(), back: vi.fn() }

vi.mock('vue-router', () => ({
  useRouter: () => mockRouter,
  RouterLink: {
    template: '<a :href="to" class="router-link"><slot /></a>',
    props: ['to'],
  },
}))

vi.mock('../services/api.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
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
    auth: { get: vi.fn().mockResolvedValue(null), put: vi.fn(), delete: vi.fn() },
    syncQueue: {
      where: vi.fn().mockReturnValue({
        aboveOrEqual: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }),
      bulkDelete: vi.fn(),
    },
  },
  initDb: vi.fn().mockResolvedValue(undefined),
  closeDb: vi.fn(),
}))

const stubs = { AppHeader: true, SyncIndicator: true, SyncPanel: true, RouterLink: true }

function mountComponent(userOverrides = {}) {
  const authStore = useAuthStore()
  authStore.token = 'fake-token'
  authStore.user = {
    id: 1,
    username: 'admin',
    full_name: 'John Doe',
    role: 'admin',
    farm_id: 'test-farm-id',
    permissions: [],
    ...userOverrides,
  }

  return mount(ProfileView, {
    global: {
      stubs: {
        ...stubs,
        RouterLink: {
          template: '<a :href="to" class="router-link"><slot /></a>',
          props: ['to'],
        },
        ConfirmDialog: {
          name: 'ConfirmDialog',
          template: '<div class="confirm-dialog" :data-show="show"><slot /></div>',
          props: ['show', 'message', 'confirmLabel', 'cancelLabel', 'loading'],
          emits: ['confirm', 'cancel'],
        },
      },
    },
  })
}

describe('ProfileView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders user full name and username', () => {
    const wrapper = mountComponent()
    expect(wrapper.find('.profile-name').text()).toBe('John Doe')
    expect(wrapper.find('.profile-username').text()).toBe('@admin')
  })

  it('shows "Admin" role badge for admin users', () => {
    const wrapper = mountComponent({ role: 'admin' })
    const badge = wrapper.find('.role-badge')
    expect(badge.classes()).toContain('role-admin')
  })

  it('shows "Worker" role badge for worker users', () => {
    const wrapper = mountComponent({ role: 'worker' })
    const badge = wrapper.find('.role-badge')
    expect(badge.classes()).toContain('role-worker')
  })

  it('shows settings link for admin users', () => {
    const wrapper = mountComponent({ role: 'admin' })
    const settingsLink = wrapper
      .findAll('.router-link')
      .find((el) => el.attributes('href') === '/settings')
    expect(settingsLink).toBeTruthy()
  })

  it('hides settings link for worker users', () => {
    const wrapper = mountComponent({ role: 'worker' })
    const settingsLink = wrapper
      .findAll('.router-link')
      .find((el) => el.attributes('href') === '/settings')
    expect(settingsLink).toBeUndefined()
  })

  it('opens confirm dialog when logout tapped', async () => {
    const wrapper = mountComponent()
    expect(wrapper.find('.confirm-dialog').attributes('data-show')).toBe('false')

    await wrapper.find('.logout-item').trigger('click')
    expect(wrapper.find('.confirm-dialog').attributes('data-show')).toBe('true')
  })

  it('calls authStore.logout() and navigates to /login on confirm', async () => {
    const wrapper = mountComponent()
    await wrapper.find('.logout-item').trigger('click')

    await wrapper.findComponent({ name: 'ConfirmDialog' }).vm.$emit('confirm')
    await flushPromises()

    expect(mockRouter.push).toHaveBeenCalledWith('/login')
  })

  it('cancels logout when dialog dismissed', async () => {
    const wrapper = mountComponent()
    await wrapper.find('.logout-item').trigger('click')
    expect(wrapper.find('.confirm-dialog').attributes('data-show')).toBe('true')

    await wrapper.findComponent({ name: 'ConfirmDialog' }).vm.$emit('cancel')
    expect(wrapper.find('.confirm-dialog').attributes('data-show')).toBe('false')
    expect(mockRouter.push).not.toHaveBeenCalled()
  })
})
