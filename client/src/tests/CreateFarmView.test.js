import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import CreateFarmView from '../views/super/CreateFarmView.vue'
import { useAuthStore } from '../stores/auth.js'

const mockPost = vi.fn()

vi.mock('../services/api.js', () => ({
  default: {
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

const mockPush = vi.fn()
const mockRoute = { params: {}, query: {} }
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => mockRoute,
}))

function setSuperAdmin() {
  const auth = useAuthStore()
  auth.user = { full_name: 'Super Admin', username: 'super', role: 'super_admin', permissions: [], farm_id: null }
  auth.token = 'test-token'
}

describe('CreateFarmView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all form fields', () => {
    setSuperAdmin()
    const wrapper = mount(CreateFarmView)

    expect(wrapper.find('#cf-name').exists()).toBe(true)
    expect(wrapper.find('#cf-code').exists()).toBe(true)
    expect(wrapper.find('#cf-username').exists()).toBe(true)
    expect(wrapper.find('#cf-fullname').exists()).toBe(true)
    expect(wrapper.find('#cf-password').exists()).toBe(true)
  })

  it('auto-generates code from name', async () => {
    setSuperAdmin()
    const wrapper = mount(CreateFarmView)

    const nameInput = wrapper.find('#cf-name')
    await nameInput.setValue('Sunny Dale Farm')
    await nameInput.trigger('input')

    expect(wrapper.find('#cf-code').element.value).toBe('SUNNYDALEF')
  })

  it('calls API on form submit with correct payload and 30s timeout', async () => {
    setSuperAdmin()
    mockPost.mockResolvedValue({ data: { farm: { id: 'new-id' }, admin_user: { id: 'admin-id' } } })

    const wrapper = mount(CreateFarmView)
    await wrapper.find('#cf-name').setValue('Test Farm')
    await wrapper.find('#cf-code').setValue('TESTFARM')
    await wrapper.find('#cf-username').setValue('admin')
    await wrapper.find('#cf-fullname').setValue('Admin User')
    await wrapper.find('#cf-password').setValue('password123')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(mockPost).toHaveBeenCalledWith('/farms', expect.objectContaining({
      name: 'Test Farm',
      code: 'TESTFARM',
      admin_username: 'admin',
      admin_full_name: 'Admin User',
    }), { timeout: 30000 })
  })

  it('shows error on API failure with JSON error field', async () => {
    setSuperAdmin()
    mockPost.mockRejectedValue({ response: { data: { error: 'Farm code already exists' } } })

    const wrapper = mount(CreateFarmView)
    await wrapper.find('#cf-name').setValue('Test')
    await wrapper.find('#cf-code').setValue('TEST')
    await wrapper.find('#cf-username').setValue('admin')
    await wrapper.find('#cf-fullname').setValue('Admin')
    await wrapper.find('#cf-password').setValue('pass123')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('.error-text').text()).toBe('Farm code already exists')
  })

  it('shows timeout message on ECONNABORTED error', async () => {
    setSuperAdmin()
    mockPost.mockRejectedValue({ code: 'ECONNABORTED', message: 'timeout of 30000ms exceeded' })

    const wrapper = mount(CreateFarmView)
    await wrapper.find('#cf-name').setValue('Test')
    await wrapper.find('#cf-code').setValue('TEST')
    await wrapper.find('#cf-username').setValue('admin')
    await wrapper.find('#cf-fullname').setValue('Admin')
    await wrapper.find('#cf-password').setValue('pass123')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    // i18n stub returns the key string when locale messages are not loaded
    expect(wrapper.find('.error-text').text()).toBe('superAdmin.errorTimeout')
  })

  it('shows network message when no response object', async () => {
    setSuperAdmin()
    mockPost.mockRejectedValue({ message: 'Network Error' })

    const wrapper = mount(CreateFarmView)
    await wrapper.find('#cf-name').setValue('Test')
    await wrapper.find('#cf-code').setValue('TEST')
    await wrapper.find('#cf-username').setValue('admin')
    await wrapper.find('#cf-fullname').setValue('Admin')
    await wrapper.find('#cf-password').setValue('pass123')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    // i18n stub returns the key string when locale messages are not loaded
    expect(wrapper.find('.error-text').text()).toBe('superAdmin.errorNetwork')
  })

  it('shows server error message when response is non-JSON (HTML)', async () => {
    setSuperAdmin()
    mockPost.mockRejectedValue({ response: { data: '<html>Internal Server Error</html>' } })

    const wrapper = mount(CreateFarmView)
    await wrapper.find('#cf-name').setValue('Test')
    await wrapper.find('#cf-code').setValue('TEST')
    await wrapper.find('#cf-username').setValue('admin')
    await wrapper.find('#cf-fullname').setValue('Admin')
    await wrapper.find('#cf-password').setValue('pass123')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    // i18n stub returns the key string when locale messages are not loaded
    expect(wrapper.find('.error-text').text()).toBe('superAdmin.errorServer')
  })
})
