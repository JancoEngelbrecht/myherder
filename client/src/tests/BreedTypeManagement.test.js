import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import BreedTypeManagement from '../views/admin/BreedTypeManagement.vue'

const mockRouter = { push: vi.fn(), back: vi.fn() }
vi.mock('vue-router', () => ({
  useRouter: () => mockRouter,
}))

vi.mock('../services/api.js', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
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
    breedTypes: {
      toArray: vi.fn().mockResolvedValue([]),
      bulkPut: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(undefined),
    },
    syncQueue: {
      where: vi.fn().mockReturnValue({
        aboveOrEqual: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }),
      bulkDelete: vi.fn(),
    },
  },
}))

const MOCK_BREED_TYPES = [
  {
    id: 'bt1',
    code: 'holstein',
    name: 'Holstein',
    gestation_days: 280,
    heat_cycle_days: 21,
    preg_check_days: 35,
    dry_off_days: 60,
    voluntary_waiting_days: 50,
    calf_max_months: 6,
    heifer_min_months: 15,
    young_bull_min_months: 15,
    is_active: true,
    sort_order: 0,
  },
  {
    id: 'bt2',
    code: 'jersey',
    name: 'Jersey',
    gestation_days: 279,
    heat_cycle_days: 21,
    preg_check_days: 35,
    dry_off_days: 60,
    voluntary_waiting_days: 45,
    calf_max_months: 6,
    heifer_min_months: 14,
    young_bull_min_months: 15,
    is_active: false,
    sort_order: 1,
  },
]

const stubs = { SyncIndicator: true, SyncPanel: true, RouterLink: true, ConfirmDialog: true }

describe('BreedTypeManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches and displays breed types from store on mount', async () => {
    // Mock the store's fetchAll to populate types
    const api = (await import('../services/api.js')).default
    api.get.mockResolvedValue({ data: MOCK_BREED_TYPES })

    const wrapper = mount(BreedTypeManagement, {
      global: { stubs, mocks: { $route: { path: '/admin/breed-types' } } },
    })
    await flushPromises()

    const cards = wrapper.findAll('.bt-card')
    expect(cards).toHaveLength(2)
    expect(cards[0].find('.bt-name').text()).toBe('Holstein')
    expect(cards[1].find('.bt-name').text()).toBe('Jersey')
  })

  it('opens add form when FAB clicked', async () => {
    const api = (await import('../services/api.js')).default
    api.get.mockResolvedValue({ data: MOCK_BREED_TYPES })

    const wrapper = mount(BreedTypeManagement, {
      global: { stubs, mocks: { $route: { path: '/admin/breed-types' } } },
    })
    await flushPromises()

    await wrapper.find('.fab').trigger('click')
    expect(wrapper.find('.form-card').exists()).toBe(true)
    const titleText = wrapper.find('.form-title').text()
    expect(titleText).toContain('breedTypes.addTitle')
  })

  it('opens edit form with breed type data when edit clicked', async () => {
    const api = (await import('../services/api.js')).default
    api.get.mockResolvedValue({ data: MOCK_BREED_TYPES })

    const wrapper = mount(BreedTypeManagement, {
      global: { stubs, mocks: { $route: { path: '/admin/breed-types' } } },
    })
    await flushPromises()

    const editBtns = wrapper.findAll('.btn-secondary.btn-sm')
    await editBtns[0].trigger('click')

    expect(wrapper.find('.form-card').exists()).toBe(true)
    const titleText = wrapper.find('.form-title').text()
    expect(titleText).toContain('breedTypes.editTitle')

    const nameInput = wrapper.find('#bt-name')
    expect(nameInput.element.value).toBe('Holstein')
  })

  it('submits create via store.create when form saved in add mode', async () => {
    const api = (await import('../services/api.js')).default
    api.get.mockResolvedValue({ data: MOCK_BREED_TYPES })
    api.post.mockResolvedValue({
      data: {
        id: 'bt3',
        code: 'nguni',
        name: 'Nguni',
        gestation_days: 285,
        heat_cycle_days: 21,
        preg_check_days: 35,
        dry_off_days: 60,
        is_active: true,
        sort_order: 2,
      },
    })

    const wrapper = mount(BreedTypeManagement, {
      global: { stubs, mocks: { $route: { path: '/admin/breed-types' } } },
    })
    await flushPromises()

    await wrapper.find('.fab').trigger('click')
    await wrapper.find('#bt-name').setValue('Nguni')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(api.post).toHaveBeenCalledWith(
      '/breed-types',
      expect.objectContaining({ name: 'Nguni' })
    )
  })

  it('displays gestation days timing fields matching the rendered bt-cards', async () => {
    const api = (await import('../services/api.js')).default
    api.get.mockResolvedValue({ data: MOCK_BREED_TYPES })

    const wrapper = mount(BreedTypeManagement, {
      global: { stubs, mocks: { $route: { path: '/admin/breed-types' } } },
    })
    await flushPromises()

    const cards = wrapper.findAll('.bt-card')
    const timingSummaries = wrapper.findAll('.timing-summary')
    // Each card should have exactly one timing summary
    expect(timingSummaries).toHaveLength(cards.length)
    // First card (Holstein) should show correct timing values
    expect(timingSummaries[0].text()).toContain('280d gest')
    expect(timingSummaries[0].text()).toContain('21d heat')
  })
})
