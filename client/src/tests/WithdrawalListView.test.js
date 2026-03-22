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
      bulkPut: vi.fn(),
      put: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      toArray: vi.fn().mockResolvedValue([]),
      where: vi
        .fn()
        .mockReturnValue({
          equals: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
        }),
    },
    syncQueue: {
      where: vi.fn().mockReturnValue({
        aboveOrEqual: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }),
      bulkDelete: vi.fn(),
    },
  },
}))

const futureDate = new Date(Date.now() + 86400000 * 3).toISOString()

const MOCK_MILK_COW = {
  id: 'w1',
  cow_id: 'c1',
  tag_number: '001',
  cow_name: 'Bessie',
  sex: 'female',
  medication_name: 'Pen-Strep',
  withdrawal_end_milk: futureDate,
  withdrawal_end_meat: futureDate,
  treatment_date: '2024-01-15T10:00:00Z',
}

const MOCK_MEAT_ONLY_COW = {
  id: 'w2',
  cow_id: 'c2',
  tag_number: '002',
  cow_name: 'Bruno',
  sex: 'male',
  medication_name: 'Ivermectin',
  withdrawal_end_milk: null,
  withdrawal_end_meat: futureDate,
  treatment_date: '2024-01-15T10:00:00Z',
}

const stubs = {
  SyncIndicator: true,
  SyncPanel: true,
  RouterLink: { template: '<a v-bind="$attrs"><slot /></a>' },
}

describe('WithdrawalListView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows global all-clear when no animals on withdrawal', async () => {
    const store = useTreatmentsStore()
    vi.spyOn(store, 'fetchWithdrawal').mockResolvedValue()
    store.withdrawalCows = []
    store.loadingWithdrawal = false

    const wrapper = mount(WithdrawalListView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.clear-state').exists()).toBe(true)
    expect(wrapper.find('.filter-chips').exists()).toBe(false)
  })

  it('shows spinner while loading', async () => {
    const store = useTreatmentsStore()
    vi.spyOn(store, 'fetchWithdrawal').mockResolvedValue()
    store.loadingWithdrawal = true

    const wrapper = mount(WithdrawalListView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.spinner').exists()).toBe(true)
  })

  it('shows tab chips with counts when data exists', async () => {
    const store = useTreatmentsStore()
    vi.spyOn(store, 'fetchWithdrawal').mockResolvedValue()
    store.withdrawalCows = [MOCK_MILK_COW, MOCK_MEAT_ONLY_COW]
    store.loadingWithdrawal = false

    const wrapper = mount(WithdrawalListView, { global: { stubs } })
    await flushPromises()

    const chips = wrapper.findAll('.chip')
    expect(chips).toHaveLength(2)
    // Milk tab has count 1 (only the female), meat tab has count 2 (both animals)
    const milkCount = chips[0].find('.chip-count')
    const meatCount = chips[1].find('.chip-count')
    expect(milkCount.text()).toBe('1')
    expect(meatCount.text()).toBe('2')
  })

  it('defaults to milk tab and renders milk cards', async () => {
    const store = useTreatmentsStore()
    vi.spyOn(store, 'fetchWithdrawal').mockResolvedValue()
    store.withdrawalCows = [MOCK_MILK_COW]
    store.loadingWithdrawal = false

    const wrapper = mount(WithdrawalListView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.milk-banner').exists()).toBe(true)
    expect(wrapper.findAll('.withdrawal-card:not(.meat-card)')).toHaveLength(1)
    expect(wrapper.find('.tag-number').text()).toBe('001')
  })

  it('switches to meat tab on click and shows meat cards', async () => {
    const store = useTreatmentsStore()
    vi.spyOn(store, 'fetchWithdrawal').mockResolvedValue()
    store.withdrawalCows = [MOCK_MEAT_ONLY_COW]
    store.loadingWithdrawal = false

    const wrapper = mount(WithdrawalListView, { global: { stubs } })
    await flushPromises()

    // Milk tab is default — shows clear state since no female milk cows
    expect(wrapper.find('.section-clear').exists()).toBe(true)

    // Click meat tab
    const meatChip = wrapper.findAll('.chip')[1]
    await meatChip.trigger('click')

    expect(wrapper.find('.meat-banner').exists()).toBe(true)
    expect(wrapper.findAll('.meat-card')).toHaveLength(1)
    expect(wrapper.find('.meat-card .tag-number').text()).toBe('002')
  })

  it('does not show male in milk tab', async () => {
    const store = useTreatmentsStore()
    vi.spyOn(store, 'fetchWithdrawal').mockResolvedValue()
    store.withdrawalCows = [MOCK_MEAT_ONLY_COW]
    store.loadingWithdrawal = false

    const wrapper = mount(WithdrawalListView, { global: { stubs } })
    await flushPromises()

    // Milk tab active by default — male should not appear
    expect(wrapper.findAll('.withdrawal-card')).toHaveLength(0)
    expect(wrapper.find('.section-clear').exists()).toBe(true)
  })

  it('excludes heifer from milk tab but shows in meat tab', async () => {
    const heiferCow = {
      id: 'w-heifer',
      cow_id: 'c-heifer',
      tag_number: '099',
      cow_name: 'Young Daisy',
      sex: 'female',
      life_phase: 'heifer',
      medication_name: 'Pen-Strep',
      withdrawal_end_milk: futureDate,
      withdrawal_end_meat: futureDate,
      treatment_date: '2024-01-15T10:00:00Z',
    }
    const store = useTreatmentsStore()
    vi.spyOn(store, 'fetchWithdrawal').mockResolvedValue()
    store.withdrawalCows = [heiferCow]
    store.loadingWithdrawal = false

    const wrapper = mount(WithdrawalListView, { global: { stubs } })
    await flushPromises()

    // Milk tab (default) — heifer should NOT appear
    expect(wrapper.findAll('.withdrawal-card:not(.meat-card)')).toHaveLength(0)
    expect(wrapper.find('.section-clear').exists()).toBe(true)

    // Switch to meat tab — heifer SHOULD appear
    await wrapper.findAll('.chip')[1].trigger('click')
    expect(wrapper.findAll('.meat-card')).toHaveLength(1)
    expect(wrapper.find('.meat-card .tag-number').text()).toBe('099')
  })

  it('excludes calf from milk tab', async () => {
    const calfCow = {
      id: 'w-calf',
      cow_id: 'c-calf',
      tag_number: '088',
      cow_name: 'Baby',
      sex: 'female',
      life_phase: 'calf',
      medication_name: 'Antibiotic',
      withdrawal_end_milk: futureDate,
      withdrawal_end_meat: futureDate,
      treatment_date: '2024-01-15T10:00:00Z',
    }
    const store = useTreatmentsStore()
    vi.spyOn(store, 'fetchWithdrawal').mockResolvedValue()
    store.withdrawalCows = [calfCow]
    store.loadingWithdrawal = false

    const wrapper = mount(WithdrawalListView, { global: { stubs } })
    await flushPromises()

    // Milk tab — calf should NOT appear
    expect(wrapper.findAll('.withdrawal-card:not(.meat-card)')).toHaveLength(0)
  })

  it('includes adult cow in milk tab', async () => {
    const adultCow = {
      ...MOCK_MILK_COW,
      life_phase: 'cow',
    }
    const store = useTreatmentsStore()
    vi.spyOn(store, 'fetchWithdrawal').mockResolvedValue()
    store.withdrawalCows = [adultCow]
    store.loadingWithdrawal = false

    const wrapper = mount(WithdrawalListView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.findAll('.withdrawal-card:not(.meat-card)')).toHaveLength(1)
  })

  it('applies meat-theme class when meat tab is active', async () => {
    const store = useTreatmentsStore()
    vi.spyOn(store, 'fetchWithdrawal').mockResolvedValue()
    store.withdrawalCows = [MOCK_MILK_COW]
    store.loadingWithdrawal = false

    const wrapper = mount(WithdrawalListView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.withdrawal-page').classes()).not.toContain('meat-theme')

    await wrapper.findAll('.chip')[1].trigger('click')
    expect(wrapper.find('.withdrawal-page').classes()).toContain('meat-theme')
  })
})
