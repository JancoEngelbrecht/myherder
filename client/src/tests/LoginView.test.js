import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import LoginView from '../views/LoginView.vue'
import { useAuthStore } from '../stores/auth.js'

const mockRouter = { push: vi.fn() }

vi.mock('vue-router', () => ({
  useRouter: () => mockRouter,
}))

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
    cows: {
      bulkPut: vi.fn(),
      put: vi.fn(),
      toArray: vi.fn().mockResolvedValue([]),
      orderBy: vi.fn().mockReturnValue({ reverse: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }) }),
    },
    auth: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    syncQueue: {
      where: vi.fn().mockReturnValue({
        aboveOrEqual: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }),
      bulkDelete: vi.fn(),
    },
  },
}))

const stubs = { SyncIndicator: true, SyncPanel: true, Transition: false }

function mountLogin() {
  return mount(LoginView, { global: { stubs } })
}

describe('LoginView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockResolvedValue({ data: { farm_name: 'Test Farm' } })
  })

  it('renders admin login form by default', async () => {
    const wrapper = mountLogin()
    await flushPromises()

    expect(wrapper.find('form').exists()).toBe(true)
    expect(wrapper.find('input[type="password"]').exists()).toBe(true)
  })

  it('shows farm name from settings', async () => {
    const wrapper = mountLogin()
    await flushPromises()

    expect(wrapper.find('.login-farm-name').text()).toBe('Test Farm')
  })

  it('hides farm name when settings fails', async () => {
    mockGet.mockRejectedValue(new Error('offline'))
    const wrapper = mountLogin()
    await flushPromises()

    expect(wrapper.find('.login-farm-name').exists()).toBe(false)
  })

  it('toggles to PIN login when worker tab clicked', async () => {
    const wrapper = mountLogin()
    await flushPromises()

    const tabs = wrapper.findAll('.login-tab')
    await tabs[1].trigger('click')

    expect(wrapper.find('.pin-keypad').exists()).toBe(true)
    expect(wrapper.find('input[type="password"]').exists()).toBe(false)
  })

  it('PIN keypad adds digits and limits to 4', async () => {
    const wrapper = mountLogin()
    await flushPromises()
    await wrapper.findAll('.login-tab')[1].trigger('click')

    const keys = wrapper.findAll('.pin-key')
    // Press 1, 2, 3, 4, 5 (5th should be ignored)
    await keys[0].trigger('click') // 1
    await keys[1].trigger('click') // 2
    await keys[2].trigger('click') // 3
    await keys[3].trigger('click') // 4
    await keys[4].trigger('click') // 5 — ignored

    const filledDots = wrapper.findAll('.pin-dot.filled')
    expect(filledDots).toHaveLength(4)
  })

  it('PIN delete key removes last digit', async () => {
    const wrapper = mountLogin()
    await flushPromises()
    await wrapper.findAll('.login-tab')[1].trigger('click')

    const keys = wrapper.findAll('.pin-key')
    await keys[0].trigger('click') // 1
    await keys[1].trigger('click') // 2
    // del is the 10th key (index 9)
    await keys[9].trigger('click') // del

    const filledDots = wrapper.findAll('.pin-dot.filled')
    expect(filledDots).toHaveLength(1)
  })

  it('submits admin login and redirects on success', async () => {
    const auth = useAuthStore()
    vi.spyOn(auth, 'login').mockResolvedValue()

    const wrapper = mountLogin()
    await flushPromises()

    await wrapper.find('input[type="text"]').setValue('admin')
    await wrapper.find('input[type="password"]').setValue('admin123')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(auth.login).toHaveBeenCalledWith('admin', 'admin123')
    expect(mockRouter.push).toHaveBeenCalledWith('/')
  })

  it('shows error on invalid credentials (401)', async () => {
    const auth = useAuthStore()
    vi.spyOn(auth, 'login').mockRejectedValue({ response: { status: 401 } })

    const wrapper = mountLogin()
    await flushPromises()

    await wrapper.find('input[type="text"]').setValue('admin')
    await wrapper.find('input[type="password"]').setValue('wrong')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('.error-box').exists()).toBe(true)
    expect(wrapper.find('.error-box').text()).toContain('login.errorInvalid')
  })
})
