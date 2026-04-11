import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  RouterLink: { template: '<a><slot /></a>', props: ['to'] },
}))

vi.mock('../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
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
    animals: { toArray: vi.fn().mockResolvedValue([]), bulkPut: vi.fn(), put: vi.fn() },
    milkRecords: {
      toArray: vi.fn().mockResolvedValue([]),
      bulkPut: vi.fn(),
      put: vi.fn(),
      where: vi.fn().mockReturnValue({
        equals: vi.fn().mockReturnValue({
          and: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    },
    treatments: { toArray: vi.fn().mockResolvedValue([]) },
    featureFlags: { toArray: vi.fn().mockResolvedValue([]), put: vi.fn() },
    syncQueue: { toArray: vi.fn().mockResolvedValue([]) },
  },
}))

import MilkRecordingView from '../views/MilkRecordingView.vue'
import api from '../services/api'
import { createPinia, setActivePinia } from 'pinia'

// ── Helpers ──────────────────────────────────────────────────────────────────

const stubs = {
  AppHeader: { template: '<div class="app-header"><slot /></div>' },
  SearchInput: { template: '<input class="search-input" />' },
  MilkEntryCard: {
    template: '<div class="milk-entry-card" />',
    props: ['cow', 'record', 'syncStatus', 'onWithdrawal', 'withdrawalUntil'],
  },
}

function createWrapper() {
  api.get.mockImplementation((url) => {
    if (url === '/milk-records') return Promise.resolve({ data: [] })
    if (url === '/treatments/withdrawal') return Promise.resolve({ data: [] })
    if (url === '/animals') return Promise.resolve({ data: [] })
    if (url.includes('feature-flags'))
      return Promise.resolve({
        data: {
          breeding: true,
          milkRecording: true,
          healthIssues: true,
          treatments: true,
          analytics: true,
        },
      })
    return Promise.resolve({ data: [] })
  })

  return mount(MilkRecordingView, { global: { stubs } })
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MilkRecordingView', () => {
  it('always shows the time picker (even for today)', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.time-row').exists()).toBe(true)
    expect(wrapper.find('.time-input').exists()).toBe(true)
  })

  it('pre-fills time with current time rounded to nearest 15 min', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const timeInput = wrapper.find('.time-input')
    const value = timeInput.element.value
    // Time should match HH:MM pattern
    expect(value).toMatch(/^\d{2}:\d{2}$/)
    // Minutes should be 0, 15, 30, or 45
    const mins = parseInt(value.split(':')[1])
    expect([0, 15, 30, 45]).toContain(mins)
  })

  it('does not render the removed session tab selector', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.findAll('.session-tab').length).toBe(0)
    expect(wrapper.find('.session-tabs').exists()).toBe(false)
  })

  it('renders a derived session badge next to the time input', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const badge = wrapper.find('.derived-session-badge')
    expect(badge.exists()).toBe(true)
    // Badge text starts with an arrow and resolves to one of the session labels.
    // i18n keys fall back to the key path under vue-i18n in test mode, so we
    // just verify the badge is populated with something non-empty.
    expect(badge.text().length).toBeGreaterThan(0)
  })

  it('updates the derived session badge when the time crosses a boundary', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const timeInput = wrapper.find('.time-input')
    await timeInput.setValue('07:00')
    await flushPromises()
    const morningText = wrapper.find('.derived-session-badge').text()

    await timeInput.setValue('14:00')
    await flushPromises()
    const afternoonText = wrapper.find('.derived-session-badge').text()

    await timeInput.setValue('19:30')
    await flushPromises()
    const eveningText = wrapper.find('.derived-session-badge').text()

    // The three time buckets must produce three distinct badge values.
    expect(new Set([morningText, afternoonText, eveningText]).size).toBe(3)
  })

  it('renders view history link', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.history-link').exists()).toBe(true)
  })

  it('shows search input', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.search-input').exists()).toBe(true)
  })

  it('does not flag cow as on-withdrawal when only meat withdrawal is active', async () => {
    const futureMeat = new Date(Date.now() + 86400000 * 5).toISOString()
    api.get.mockImplementation((url) => {
      if (url === '/animals')
        return Promise.resolve({
          data: [
            { id: 'cow-1', tag_number: '001', name: 'Letty', sex: 'female', status: 'active' },
          ],
        })
      if (url === '/treatments/withdrawal')
        return Promise.resolve({
          data: [
            {
              animal_id: 'cow-1',
              withdrawal_end_milk: null,
              withdrawal_end_meat: futureMeat,
              tag_number: '001',
              animal_name: 'Letty',
              sex: 'female',
              life_phase: 'heifer',
            },
          ],
        })
      if (url === '/milk-records') return Promise.resolve({ data: [] })
      if (url.includes('feature-flags'))
        return Promise.resolve({
          data: {
            breeding: true,
            milkRecording: true,
            healthIssues: true,
            treatments: true,
            analytics: true,
          },
        })
      return Promise.resolve({ data: [] })
    })

    const wrapper = mount(MilkRecordingView, { global: { stubs } })
    await flushPromises()

    const card = wrapper.findComponent(stubs.MilkEntryCard)
    expect(card.exists()).toBe(true)
    expect(card.props('onWithdrawal')).toBe(false)
  })

  it('flags cow as on-withdrawal when milk withdrawal is active', async () => {
    const futureMilk = new Date(Date.now() + 86400000 * 5).toISOString()
    api.get.mockImplementation((url) => {
      if (url === '/animals')
        return Promise.resolve({
          data: [
            { id: 'cow-2', tag_number: '002', name: 'Daisy', sex: 'female', status: 'active' },
          ],
        })
      if (url === '/treatments/withdrawal')
        return Promise.resolve({
          data: [
            {
              animal_id: 'cow-2',
              withdrawal_end_milk: futureMilk,
              withdrawal_end_meat: null,
              tag_number: '002',
              animal_name: 'Daisy',
              sex: 'female',
              life_phase: 'cow',
            },
          ],
        })
      if (url === '/milk-records') return Promise.resolve({ data: [] })
      if (url.includes('feature-flags'))
        return Promise.resolve({
          data: {
            breeding: true,
            milkRecording: true,
            healthIssues: true,
            treatments: true,
            analytics: true,
          },
        })
      return Promise.resolve({ data: [] })
    })

    const wrapper = mount(MilkRecordingView, { global: { stubs } })
    await flushPromises()

    const card = wrapper.findComponent(stubs.MilkEntryCard)
    expect(card.exists()).toBe(true)
    expect(card.props('onWithdrawal')).toBe(true)
  })

  it('does not flag cow when milk withdrawal is expired', async () => {
    const pastMilk = new Date(Date.now() - 86400000).toISOString()
    api.get.mockImplementation((url) => {
      if (url === '/animals')
        return Promise.resolve({
          data: [
            { id: 'cow-3', tag_number: '003', name: 'Bella', sex: 'female', status: 'active' },
          ],
        })
      if (url === '/treatments/withdrawal')
        return Promise.resolve({
          data: [
            {
              animal_id: 'cow-3',
              withdrawal_end_milk: pastMilk,
              withdrawal_end_meat: null,
              tag_number: '003',
              animal_name: 'Bella',
              sex: 'female',
              life_phase: 'cow',
            },
          ],
        })
      if (url === '/milk-records') return Promise.resolve({ data: [] })
      if (url.includes('feature-flags'))
        return Promise.resolve({
          data: {
            breeding: true,
            milkRecording: true,
            healthIssues: true,
            treatments: true,
            analytics: true,
          },
        })
      return Promise.resolve({ data: [] })
    })

    const wrapper = mount(MilkRecordingView, { global: { stubs } })
    await flushPromises()

    const card = wrapper.findComponent(stubs.MilkEntryCard)
    expect(card.exists()).toBe(true)
    expect(card.props('onWithdrawal')).toBe(false)
  })

  it('updates time to session default when switching to a past date', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    // Change to a past date
    const dateInput = wrapper.find('.date-input')
    await dateInput.setValue('2026-01-15')
    await dateInput.trigger('change')
    await flushPromises()

    // For a past date, it should default to the session default time
    const timeValue = wrapper.find('.time-input').element.value
    expect(timeValue).toBe('06:00') // morning default
  })
})
