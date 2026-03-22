import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import SuperAdminLoginView from '../views/SuperAdminLoginView.vue'
import { useAuthStore } from '../stores/auth.js'

const mockRouter = { push: vi.fn() }

vi.mock('vue-router', () => ({
  useRouter: () => mockRouter,
}))

vi.mock('../services/api.js', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: {} }),
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

function mountView() {
  return mount(SuperAdminLoginView, { global: { stubs } })
}

describe('SuperAdminLoginView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders username and password fields only (no farm code)', () => {
    const wrapper = mountView()

    expect(wrapper.find('input[type="text"]').exists()).toBe(true)
    expect(wrapper.find('input[type="password"]').exists()).toBe(true)
    expect(wrapper.find('.farm-code-input').exists()).toBe(false)
    expect(wrapper.find('.pin-keypad').exists()).toBe(false)
  })

  it('shows back to farm login link', () => {
    const wrapper = mountView()

    const backLink = wrapper.findComponent(RouterLinkStub)
    expect(backLink.exists()).toBe(true)
    expect(backLink.props('to')).toBe('/login')
  })

  it('shows super admin heading', () => {
    const wrapper = mountView()

    expect(wrapper.find('.sa-heading').text()).toContain('login.superAdminTitle')
  })

  it('submits login without farm code and redirects on success', async () => {
    const auth = useAuthStore()
    vi.spyOn(auth, 'login').mockResolvedValue({})

    const wrapper = mountView()

    await wrapper.find('input[type="text"]').setValue('superadmin')
    await wrapper.find('input[type="password"]').setValue('secret123')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(auth.login).toHaveBeenCalledWith('superadmin', 'secret123')
    expect(mockRouter.push).toHaveBeenCalledWith('/')
  })

  it('redirects to 2FA setup when required', async () => {
    const auth = useAuthStore()
    vi.spyOn(auth, 'login').mockResolvedValue({ requires_totp_setup: true })

    const wrapper = mountView()

    await wrapper.find('input[type="text"]').setValue('superadmin')
    await wrapper.find('input[type="password"]').setValue('secret123')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(mockRouter.push).toHaveBeenCalledWith('/auth/setup-2fa')
  })

  it('shows error on invalid credentials', async () => {
    const auth = useAuthStore()
    vi.spyOn(auth, 'login').mockRejectedValue({ response: { status: 401 } })

    const wrapper = mountView()

    await wrapper.find('input[type="text"]').setValue('superadmin')
    await wrapper.find('input[type="password"]').setValue('wrong')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('.error-box').exists()).toBe(true)
    expect(wrapper.find('.error-box').text()).toContain('login.errorInvalid')
  })

  it('shows language toggle buttons', () => {
    const wrapper = mountView()

    const langBtns = wrapper.findAll('.lang-btn')
    expect(langBtns).toHaveLength(2)
    expect(langBtns[0].text()).toBe('EN')
    expect(langBtns[1].text()).toBe('AF')
  })
})
