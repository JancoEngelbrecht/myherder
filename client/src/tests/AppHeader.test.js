import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import AppHeader from '../components/organisms/AppHeader.vue'
import { useAuthStore } from '../stores/auth.js'

const mockRouter = { push: vi.fn(), back: vi.fn() }

vi.mock('vue-router', () => ({
  useRouter: () => mockRouter,
  RouterLink: {
    template: '<a :href="to" class="router-link"><slot /></a>',
    props: ['to'],
  },
}))

// Mock cows store deps so SyncIndicator doesn't blow up
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
      where: vi.fn().mockReturnValue({ aboveOrEqual: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }) }),
      bulkDelete: vi.fn(),
    },
  },
}))

const stubs = { SyncIndicator: true, SyncPanel: true }

function mountWithAuth(props = {}, user = null) {
  if (user) {
    const authStore = useAuthStore()
    authStore.user = user
  }
  return mount(AppHeader, {
    props,
    global: { stubs },
  })
}

describe('AppHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset history state between tests so window.history.state?.back is falsy by default
    window.history.pushState({}, '')
  })

  it('renders the title prop', () => {
    const wrapper = mount(AppHeader, { props: { title: 'Herd Dashboard' }, global: { stubs } })
    expect(wrapper.text()).toContain('Herd Dashboard')
  })

  it('uses the default title when no prop is provided', () => {
    const wrapper = mount(AppHeader, { global: { stubs } })
    expect(wrapper.text()).toContain('MyHerder')
  })

  it('hides the back button when showBack is false', () => {
    const wrapper = mount(AppHeader, { props: { showBack: false }, global: { stubs } })
    expect(wrapper.find('button.btn-icon').exists()).toBe(false)
  })

  it('shows the back button when showBack is true', () => {
    const wrapper = mount(AppHeader, { props: { showBack: true }, global: { stubs } })
    expect(wrapper.find('button.btn-icon').exists()).toBe(true)
  })

  it('calls router.back() when back button is clicked and no backTo is provided', async () => {
    // Give jsdom a history entry so window.history.state.back is truthy
    window.history.pushState({ back: '/cows' }, '')
    const wrapper = mount(AppHeader, { props: { showBack: true }, global: { stubs } })
    await wrapper.find('button.btn-icon').trigger('click')
    expect(mockRouter.back).toHaveBeenCalledOnce()
    expect(mockRouter.push).not.toHaveBeenCalled()
  })

  it('calls router.push(backTo) when backTo prop is provided', async () => {
    const wrapper = mount(AppHeader, {
      props: { showBack: true, backTo: '/cows' },
      global: { stubs },
    })
    await wrapper.find('button.btn-icon').trigger('click')
    expect(mockRouter.push).toHaveBeenCalledWith('/cows')
    expect(mockRouter.back).not.toHaveBeenCalled()
  })

  it('shows the language toggle button', () => {
    const wrapper = mount(AppHeader, { global: { stubs } })
    expect(wrapper.find('.lang-toggle').exists()).toBe(true)
  })

  it('renders avatar initials when showAvatar is true', () => {
    const wrapper = mountWithAuth(
      { showAvatar: true },
      { full_name: 'John Doe', username: 'johnd' },
    )
    const avatar = wrapper.find('.avatar-circle')
    expect(avatar.exists()).toBe(true)
    expect(avatar.text()).toBe('JD')
  })

  it('hides avatar when showAvatar is false (default)', () => {
    const wrapper = mount(AppHeader, { global: { stubs } })
    expect(wrapper.find('.avatar-circle').exists()).toBe(false)
  })
})
