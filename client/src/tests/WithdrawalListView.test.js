import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import WithdrawalListView from '../views/WithdrawalListView.vue'
import { useTreatmentsStore } from '../stores/treatments.js'

vi.mock('../services/api.js', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn(),
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
    treatments: {
      bulkPut: vi.fn(), put: vi.fn(), get: vi.fn(), delete: vi.fn(),
      toArray: vi.fn().mockResolvedValue([]),
      where: vi.fn().mockReturnValue({ equals: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }) }),
    },
    syncQueue: {
      where: vi.fn().mockReturnValue({
        aboveOrEqual: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }),
      bulkDelete: vi.fn(),
    },
  },
}))

// Future dates for active withdrawal
const futureDate = new Date(Date.now() + 86400000 * 3).toISOString()

const MOCK_WITHDRAWAL = [
  {
    id: 'w1', cow_id: 'c1', tag_number: '001', cow_name: 'Bessie',
    medication_name: 'Pen-Strep',
    withdrawal_end_milk: futureDate, withdrawal_end_meat: futureDate,
    treatment_date: '2024-01-15T10:00:00Z',
  },
]

const stubs = {
  SyncIndicator: true,
  SyncPanel: true,
  RouterLink: { template: '<a v-bind="$attrs"><slot /></a>' },
}

describe('WithdrawalListView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders withdrawal cards when cows on withdrawal', async () => {
    const store = useTreatmentsStore()
    vi.spyOn(store, 'fetchWithdrawal').mockResolvedValue()
    store.withdrawalCows = MOCK_WITHDRAWAL
    store.loadingWithdrawal = false

    const wrapper = mount(WithdrawalListView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.findAll('.withdrawal-card')).toHaveLength(1)
    expect(wrapper.find('.tag-number').text()).toBe('001')
  })

  it('shows alert banner with count', async () => {
    const store = useTreatmentsStore()
    vi.spyOn(store, 'fetchWithdrawal').mockResolvedValue()
    store.withdrawalCows = MOCK_WITHDRAWAL
    store.loadingWithdrawal = false

    const wrapper = mount(WithdrawalListView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.alert-banner').exists()).toBe(true)
  })

  it('shows all-clear state when no cows on withdrawal', async () => {
    const store = useTreatmentsStore()
    vi.spyOn(store, 'fetchWithdrawal').mockResolvedValue()
    store.withdrawalCows = []
    store.loadingWithdrawal = false

    const wrapper = mount(WithdrawalListView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.clear-state').exists()).toBe(true)
  })

  it('shows spinner while loading', async () => {
    const store = useTreatmentsStore()
    vi.spyOn(store, 'fetchWithdrawal').mockResolvedValue()
    store.loadingWithdrawal = true

    const wrapper = mount(WithdrawalListView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.spinner').exists()).toBe(true)
  })
})
