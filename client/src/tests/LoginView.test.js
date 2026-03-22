import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
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
      orderBy: vi.fn().mockReturnValue({
        reverse: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }),
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

const stubs = {
  SyncIndicator: true,
  SyncPanel: true,
  Transition: false,
  RouterLink: RouterLinkStub,
}

function mountLogin() {
  return mount(LoginView, { global: { stubs } })
}

describe('LoginView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.removeItem('farm_code')
    mockGet.mockResolvedValue({ data: { farm_name: 'Test Farm' } })
  })

  it('renders admin login form by default', async () => {
    const wrapper = mountLogin()
    await flushPromises()

    expect(wrapper.find('form').exists()).toBe(true)
    expect(wrapper.find('input[type="password"]').exists()).toBe(true)
    expect(wrapper.find('.farm-code-input').exists()).toBe(true)
  })

  it('shows super admin link in hero area', async () => {
    const wrapper = mountLogin()
    await flushPromises()

    const saLink = wrapper.findComponent(RouterLinkStub)
    expect(saLink.exists()).toBe(true)
    expect(saLink.props('to')).toBe('/login/super')
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

  it('hides worker tab when no farm code is entered', async () => {
    const wrapper = mountLogin()
    await flushPromises()

    const tabs = wrapper.findAll('.login-tab')
    expect(tabs).toHaveLength(1)
    expect(tabs[0].text()).toContain('login.tabAdmin')
  })

  it('shows worker tab when farm code is entered', async () => {
    const wrapper = mountLogin()
    await flushPromises()

    await wrapper.find('.farm-code-input').setValue('MYFARM')
    await flushPromises()

    const tabs = wrapper.findAll('.login-tab')
    expect(tabs).toHaveLength(2)
  })

  it('toggles to PIN login when worker tab clicked', async () => {
    const wrapper = mountLogin()
    await flushPromises()

    // Set farm code first to show worker tab
    await wrapper.find('.farm-code-input').setValue('MYFARM')
    await flushPromises()

    const tabs = wrapper.findAll('.login-tab')
    await tabs[1].trigger('click')

    expect(wrapper.find('.pin-keypad').exists()).toBe(true)
    expect(wrapper.find('input[type="password"]').exists()).toBe(false)
  })

  it('submits admin login and redirects on success', async () => {
    const auth = useAuthStore()
    vi.spyOn(auth, 'login').mockResolvedValue({})

    const wrapper = mountLogin()
    await flushPromises()

    // Set farm code
    await wrapper.find('.farm-code-input').setValue('MYFARM')
    // Set username (second text input after farm code) and password
    const textInputs = wrapper.findAll('input[type="text"]')
    await textInputs[1].setValue('admin')
    await wrapper.find('input[type="password"]').setValue('admin123')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(auth.login).toHaveBeenCalledWith('admin', 'admin123', 'MYFARM')
    expect(mockRouter.push).toHaveBeenCalledWith('/')
  })

  it('shows error on invalid credentials (401)', async () => {
    const auth = useAuthStore()
    vi.spyOn(auth, 'login').mockRejectedValue({ response: { status: 401 } })

    const wrapper = mountLogin()
    await flushPromises()

    await wrapper.find('.farm-code-input').setValue('MYFARM')
    const textInputs = wrapper.findAll('input[type="text"]')
    await textInputs[1].setValue('admin')
    await wrapper.find('input[type="password"]').setValue('wrong')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('.error-box').exists()).toBe(true)
    expect(wrapper.find('.error-box').text()).toContain('login.errorInvalid')
  })
})
