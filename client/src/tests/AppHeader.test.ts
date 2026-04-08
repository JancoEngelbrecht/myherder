import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import AppHeader from '../components/organisms/AppHeader.vue'
import { useAuthStore } from '../stores/auth'

const mockRouter = { push: vi.fn(), back: vi.fn() }

vi.mock('vue-router', () => ({
  useRouter: () => mockRouter,
  RouterLink: {
    template: '<a :href="to" class="router-link"><slot /></a>',
    props: ['to'],
  },
}))

// Mock cows store deps so SyncIndicator doesn't blow up
vi.mock('../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

vi.mock('../services/syncManager', () => {
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

vi.mock('../db/indexedDB', () => ({
  default: {
    auth: { get: vi.fn().mockResolvedValue(null), put: vi.fn(), delete: vi.fn() },
    syncQueue: {
      where: vi.fn().mockReturnValue({
        aboveOrEqual: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }),
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
      { full_name: 'John Doe', username: 'johnd' }
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

// ─── Farm switcher ────────────────────────────────────────────────────────────

describe('AppHeader — farm switcher', () => {
  function mountWithFarms(farms = [], currentUser = null) {
    const authStore = useAuthStore()
    authStore.myFarms = farms
    if (currentUser) authStore.user = currentUser
    return mount(AppHeader, { global: { stubs } })
  }

  it('hides farm switcher when user has only one farm', () => {
    const wrapper = mountWithFarms(
      [{ id: 'farm-1', name: 'Botha Cattle', code: 'BC', species: { code: 'cattle' } }],
      { id: 'u1', farm_id: 'farm-1', username: 'admin', role: 'admin' }
    )
    expect(wrapper.find('.farm-switcher').exists()).toBe(false)
  })

  it('shows farm switcher pill when user has 2+ farms', () => {
    const wrapper = mountWithFarms(
      [
        { id: 'farm-1', name: 'Botha Cattle', code: 'BC', species: { code: 'cattle' } },
        { id: 'farm-2', name: 'Botha Sheep', code: 'BS', species: { code: 'sheep' } },
      ],
      { id: 'u1', farm_id: 'farm-1', username: 'admin', role: 'admin' }
    )
    expect(wrapper.find('.farm-switcher').exists()).toBe(true)
  })

  it('hides farm switcher for super-admin', () => {
    const authStore = useAuthStore()
    authStore.myFarms = [
      { id: 'farm-1', name: 'Farm A', code: 'FA', species: null },
      { id: 'farm-2', name: 'Farm B', code: 'FB', species: null },
    ]
    authStore.user = { id: 'sa', role: 'super_admin', username: 'super' }
    const wrapper = mount(AppHeader, { global: { stubs } })
    expect(wrapper.find('.farm-switcher').exists()).toBe(false)
  })

  it('farm pill label shows farm name for cattle farm', () => {
    const wrapper = mountWithFarms(
      [
        { id: 'farm-1', name: 'Botha Cattle', code: 'BC', species: { code: 'cattle' } },
        { id: 'farm-2', name: 'Botha Sheep', code: 'BS', species: { code: 'sheep' } },
      ],
      { id: 'u1', farm_id: 'farm-1', username: 'admin', role: 'admin' }
    )
    const pill = wrapper.find('.farm-pill')
    expect(pill.text()).toContain('Botha Cattle')
  })

  it('farm pill label shows farm name for sheep farm', () => {
    const wrapper = mountWithFarms(
      [
        { id: 'farm-1', name: 'Botha Cattle', code: 'BC', species: { code: 'cattle' } },
        { id: 'farm-2', name: 'Botha Sheep', code: 'BS', species: { code: 'sheep' } },
      ],
      { id: 'u1', farm_id: 'farm-2', username: 'admin', role: 'admin', species_code: 'sheep' }
    )
    const pill = wrapper.find('.farm-pill')
    expect(pill.text()).toContain('Botha Sheep')
  })

  it('opens dropdown when farm switcher is clicked', async () => {
    const wrapper = mountWithFarms(
      [
        { id: 'farm-1', name: 'Cattle Farm', code: 'CF', species: { code: 'cattle' } },
        { id: 'farm-2', name: 'Sheep Farm', code: 'SF', species: { code: 'sheep' } },
      ],
      { id: 'u1', farm_id: 'farm-1', username: 'admin', role: 'admin' }
    )
    // Dropdown hidden initially
    expect(wrapper.find('.farm-dropdown').exists()).toBe(false)
    await wrapper.find('.farm-switcher').trigger('click')
    expect(wrapper.find('.farm-dropdown').exists()).toBe(true)
  })

  it('dropdown lists all farms as options', async () => {
    const wrapper = mountWithFarms(
      [
        { id: 'farm-1', name: 'Cattle Farm', code: 'CF', species: { code: 'cattle' } },
        { id: 'farm-2', name: 'Sheep Farm', code: 'SF', species: { code: 'sheep' } },
      ],
      { id: 'u1', farm_id: 'farm-1', username: 'admin', role: 'admin' }
    )
    await wrapper.find('.farm-switcher').trigger('click')
    const options = wrapper.findAll('.farm-option')
    expect(options).toHaveLength(2)
    expect(options[0].text()).toContain('Cattle Farm')
    expect(options[1].text()).toContain('Sheep Farm')
  })
})
