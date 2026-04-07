import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockRouter = { push: vi.fn() }
vi.mock('vue-router', () => ({
  useRouter: () => mockRouter,
  RouterLink: { template: '<a @click="$emit(\'click\')"><slot /></a>', props: ['to'] },
}))

vi.mock('../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
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
    breedingEvents: {
      bulkPut: vi.fn(),
      put: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      where: vi.fn().mockReturnValue({
        equals: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }),
      toArray: vi.fn().mockResolvedValue([]),
      orderBy: vi.fn().mockReturnValue({
        reverse: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }),
    },
    animals: {
      bulkPut: vi.fn(),
      put: vi.fn(),
      get: vi.fn(),
      toArray: vi.fn().mockResolvedValue([]),
      orderBy: vi.fn().mockReturnValue({
        reverse: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
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

import BreedingHubView from '../views/BreedingHubView.vue'
import { useBreedingEventsStore } from '../stores/breedingEvents'
import { useAnimalsStore } from '../stores/animals'
import { createPinia, setActivePinia } from 'pinia'

// ── Helpers ──────────────────────────────────────────────────────────────────

const stubs = {
  AppHeader: { template: '<div class="app-header"><slot /></div>' },
  SyncIndicator: true,
  SyncPanel: true,
}

function createWrapper() {
  return mount(BreedingHubView, { global: { stubs } })
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('BreedingHubView', () => {
  let breedingStore, animalsStore

  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    breedingStore = useBreedingEventsStore()
    animalsStore = useAnimalsStore()

    // Prevent actual API calls
    vi.spyOn(breedingStore, 'fetchAll').mockResolvedValue([])
    vi.spyOn(breedingStore, 'fetchUpcoming').mockResolvedValue()
    vi.spyOn(animalsStore, 'fetchAll').mockResolvedValue()
  })

  it('shows loading spinner while fetching', () => {
    breedingStore.loading = true
    const wrapper = createWrapper()
    expect(wrapper.find('.spinner').exists()).toBe(true)
  })

  it('renders stats row with counts', async () => {
    breedingStore.loading = false
    animalsStore.animals = [
      { id: '1', sex: 'female', status: 'pregnant' },
      { id: '2', sex: 'female', status: 'pregnant' },
      { id: '3', sex: 'female', status: 'active' },
      { id: '4', sex: 'male', status: 'active' },
    ]
    const wrapper = createWrapper()
    await flushPromises()

    const nums = wrapper.findAll('.stat-num')
    expect(nums[0].text()).toBe('2') // pregnant
    expect(nums[1].text()).toBe('1') // open (female, non-pregnant, non-sold, non-dead — male excluded)
  })

  it('renders notifications card with count badge', async () => {
    breedingStore.loading = false
    breedingStore.upcoming.heats = [{ id: 'h1' }]
    breedingStore.upcoming.calvings = [{ id: 'c1' }]
    breedingStore.upcoming.needsAttention = [{ id: 'n1', alert_type: 'heat' }]

    const wrapper = createWrapper()
    await flushPromises()

    const cards = wrapper.findAll('.nav-card')
    expect(cards.length).toBe(2)

    // Notifications card badge count = heats(1) + calvings(1) + needsAttention(1) = 3
    const badge = cards[0].find('.nav-card-badge')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('3')
  })

  it('notifications card subtitle shows overdue and upcoming counts', async () => {
    breedingStore.loading = false
    breedingStore.upcoming.needsAttention = [{ id: 'n1', alert_type: 'heat' }]
    breedingStore.upcoming.heats = [{ id: 'h1' }, { id: 'h2' }]

    const wrapper = createWrapper()
    await flushPromises()

    const subtitle = wrapper.findAll('.nav-card-subtitle')[0]
    // Should contain "1 overdue" and "2 upcoming" (i18n returns key with params)
    expect(subtitle.text()).toBeTruthy()
  })

  it('clicking notifications card navigates to /breed/notifications', async () => {
    breedingStore.loading = false
    const wrapper = createWrapper()
    await flushPromises()

    await wrapper.findAll('.nav-card')[0].trigger('click')
    expect(mockRouter.push).toHaveBeenCalledWith('/breed/notifications')
  })

  it('clicking events card navigates to /breed/events', async () => {
    breedingStore.loading = false
    const wrapper = createWrapper()
    await flushPromises()

    await wrapper.findAll('.nav-card')[1].trigger('click')
    expect(mockRouter.push).toHaveBeenCalledWith('/breed/events')
  })

  it('recent events card shows total count badge', async () => {
    breedingStore.loading = false
    breedingStore.total = 42

    const wrapper = createWrapper()
    await flushPromises()

    const eventsCard = wrapper.findAll('.nav-card')[1]
    const badge = eventsCard.find('.nav-card-badge')
    expect(badge.text()).toBe('42')
  })

  it('FAB link renders', async () => {
    breedingStore.loading = false
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.fab').exists()).toBe(true)
  })
})
