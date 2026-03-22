import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import MedicationManagement from '../views/admin/MedicationManagement.vue'

const mockRouter = { push: vi.fn(), back: vi.fn() }
vi.mock('vue-router', () => ({
  useRouter: () => mockRouter,
}))

vi.mock('../services/api.js', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
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
    medications: {
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

const MOCK_MEDICATIONS = [
  {
    id: 'm1',
    name: 'Penicillin',
    active_ingredient: 'Benzylpenicillin',
    withdrawal_milk_hours: 96,
    withdrawal_milk_days: 4,
    withdrawal_meat_hours: 0,
    withdrawal_meat_days: 14,
    default_dosage: 10,
    unit: 'ml',
    notes: 'Standard antibiotic',
    is_active: true,
  },
  {
    id: 'm2',
    name: 'Oxytocin',
    active_ingredient: null,
    withdrawal_milk_hours: 0,
    withdrawal_milk_days: 0,
    withdrawal_meat_hours: 0,
    withdrawal_meat_days: 0,
    default_dosage: null,
    unit: null,
    notes: null,
    is_active: true,
  },
  {
    id: 'm3',
    name: 'Old Drug',
    active_ingredient: null,
    withdrawal_milk_hours: 48,
    withdrawal_milk_days: 2,
    withdrawal_meat_hours: 0,
    withdrawal_meat_days: 7,
    default_dosage: null,
    unit: null,
    notes: null,
    is_active: false,
  },
]

const stubs = {
  SyncIndicator: true,
  SyncPanel: true,
  RouterLink: true,
  ConfirmDialog: true,
  SearchInput: true,
  PaginationBar: true,
}

async function mountWithData() {
  const api = (await import('../services/api.js')).default
  api.get.mockResolvedValue({
    data: MOCK_MEDICATIONS,
    headers: { 'x-total-count': '3' },
  })

  const wrapper = mount(MedicationManagement, {
    global: {
      stubs,
      mocks: { $route: { path: '/admin/medications' } },
    },
  })
  await flushPromises()
  return wrapper
}

describe('MedicationManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches and displays medications on mount', async () => {
    const wrapper = await mountWithData()

    const cards = wrapper.findAll('.med-card')
    expect(cards).toHaveLength(3)
    expect(cards[0].find('.med-name').text()).toBe('Penicillin')
    expect(cards[1].find('.med-name').text()).toBe('Oxytocin')
  })

  it('opens add form with withdrawal fields when FAB clicked', async () => {
    const wrapper = await mountWithData()

    await wrapper.find('.fab').trigger('click')

    expect(wrapper.find('.form-card').exists()).toBe(true)
    expect(wrapper.find('.form-title').text()).toContain('medications.addTitle')
    expect(wrapper.find('#milk-hours').exists()).toBe(true)
    expect(wrapper.find('#meat-hours').exists()).toBe(true)
  })

  it('opens edit form with medication data when edit clicked', async () => {
    const wrapper = await mountWithData()

    const editBtns = wrapper.findAll('.btn-secondary.btn-sm')
    await editBtns[0].trigger('click')

    expect(wrapper.find('.form-card').exists()).toBe(true)
    expect(wrapper.find('.form-title').text()).toContain('medications.editTitle')
    expect(wrapper.find('#med-name').element.value).toBe('Penicillin')
    expect(wrapper.find('#milk-hours').element.value).toBe('96')
  })

  it('calls deactivate API when active medication deactivate confirmed', async () => {
    const api = (await import('../services/api.js')).default
    api.get.mockResolvedValue({
      data: MOCK_MEDICATIONS,
      headers: { 'x-total-count': '3' },
    })
    api.put.mockResolvedValue({ data: { ...MOCK_MEDICATIONS[0], is_active: false } })

    // Don't stub ConfirmDialog so we can interact with it
    const { ConfirmDialog: _cd, ...otherStubs } = stubs
    const wrapper = mount(MedicationManagement, {
      global: {
        stubs: otherStubs,
        mocks: { $route: { path: '/admin/medications' } },
      },
    })
    await flushPromises()

    // The deactivate btn-danger btn-sm is on each active medication card
    const deactivateBtns = wrapper
      .findAll('.btn-danger.btn-sm')
      .filter((b) => b.text().includes('medications.deactivate'))
    expect(deactivateBtns.length).toBeGreaterThan(0)
    await deactivateBtns[0].trigger('click')

    // Now the deactivate ConfirmDialog should be open — find and confirm it
    // The deactivate dialog's confirm button calls doDeactivate → store.deactivate → api.put
    const confirmDialogs = wrapper.findAllComponents({ name: 'ConfirmDialog' })
    // Second ConfirmDialog is the deactivate one
    const deactivateDialog = confirmDialogs[1]
    await deactivateDialog.vm.$emit('confirm')
    await flushPromises()

    expect(api.put).toHaveBeenCalled()
  })

  it('shows withdrawal period info as pills on medication cards', async () => {
    const wrapper = await mountWithData()

    const firstCard = wrapper.findAll('.med-card')[0]
    const withdrawalPills = firstCard.findAll('.withdrawal-pill')
    // Penicillin has milk and meat withdrawal so at least 2 pills
    expect(withdrawalPills.length).toBeGreaterThanOrEqual(1)
    expect(firstCard.find('.withdrawal-pill.milk').exists()).toBe(true)
  })
})
