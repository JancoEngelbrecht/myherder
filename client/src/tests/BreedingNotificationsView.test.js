import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockRouter = { push: vi.fn() }
vi.mock('vue-router', () => ({ useRouter: () => mockRouter }))

vi.mock('../services/api.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

vi.mock('../services/syncManager.js', () => {
  const { ref: r } = require('vue')
  return {
    isOnline: r(true),
    pendingCount: r(0),
    isSyncing: r(false),
    lastSyncTime: r(null),
    failedItems: r([]),
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
    cows: {
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

import BreedingNotificationsView from '../views/BreedingNotificationsView.vue'
import { useBreedingEventsStore } from '../stores/breedingEvents'
import { createPinia, setActivePinia } from 'pinia'

// ── Helpers ──────────────────────────────────────────────────────────────────

const ConfirmDialogStub = {
  name: 'ConfirmDialog',
  template: '<div class="confirm-dialog" :data-show="show" />',
  props: ['show', 'message', 'confirmLabel', 'cancelLabel', 'loading'],
}

const stubs = {
  AppHeader: { template: '<div class="app-header"><slot /></div>' },
  ConfirmDialog: ConfirmDialogStub,
  SyncIndicator: true,
  SyncPanel: true,
}

function createWrapper() {
  return mount(BreedingNotificationsView, {
    global: { stubs },
  })
}

function seedUpcoming(store, data = {}) {
  store.upcoming.needsAttention = data.needsAttention || []
  store.upcoming.heats = data.heats || []
  store.upcoming.calvings = data.calvings || []
  store.upcoming.pregChecks = data.pregChecks || []
  store.upcoming.dryOffs = data.dryOffs || []
  store.loading = false
}

const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
const in3Days = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)

// ── Tests ────────────────────────────────────────────────────────────────────

describe('BreedingNotificationsView', () => {
  let store

  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    store = useBreedingEventsStore()
    // Prevent actual API call on mount
    vi.spyOn(store, 'fetchUpcoming').mockResolvedValue()
  })

  it('renders filter chips with correct counts', async () => {
    seedUpcoming(store, {
      heats: [{ id: 'h1', cow_id: 'c1', tag_number: 'C001', expected_next_heat: tomorrow }],
      calvings: [{ id: 'ca1', cow_id: 'c2', tag_number: 'C002', expected_calving: in3Days }],
      needsAttention: [{ id: 'n1', cow_id: 'c3', tag_number: 'C003', alert_type: 'heat' }],
    })
    const wrapper = createWrapper()
    await flushPromises()

    const chips = wrapper.findAll('.chip')
    expect(chips.length).toBe(10) // 5 category + 5 time filter chips

    // All chip count = needsAttention(1) + heats(1) + calvings(1)
    expect(chips[0].text()).toContain('3')
    // Heats chip = 1 upcoming + 1 overdue heat
    expect(chips[1].text()).toContain('2')
    // Calvings chip = 1
    expect(chips[2].text()).toContain('1')
  })

  it('shows grouped layout in "All" filter', async () => {
    seedUpcoming(store, {
      needsAttention: [{ id: 'n1', cow_id: 'c1', tag_number: 'C001', alert_type: 'heat' }],
      heats: [{ id: 'h1', cow_id: 'c2', tag_number: 'C002', expected_next_heat: tomorrow }],
    })
    const wrapper = createWrapper()
    await flushPromises()

    // Should show attention section and heats group
    expect(wrapper.find('.attention-section').exists()).toBe(true)
    expect(wrapper.find('.alert-group').exists()).toBe(true)
  })

  it('shows flat list in category filter', async () => {
    seedUpcoming(store, {
      needsAttention: [{ id: 'n1', cow_id: 'c1', tag_number: 'C001', alert_type: 'heat' }],
      heats: [{ id: 'h1', cow_id: 'c2', tag_number: 'C002', expected_next_heat: tomorrow }],
    })
    const wrapper = createWrapper()
    await flushPromises()

    // Click heats chip
    const chips = wrapper.findAll('.chip')
    await chips[1].trigger('click')

    // Flat list: no attention section, no group headers
    expect(wrapper.find('.attention-section').exists()).toBe(false)
    expect(wrapper.find('.alert-group').exists()).toBe(false)
    // Should have items
    expect(
      wrapper.findAll('.alert-row-inner').length + wrapper.findAll('.attention-row').length
    ).toBeGreaterThan(0)
  })

  it('shows overdue items first in category filter', async () => {
    seedUpcoming(store, {
      needsAttention: [{ id: 'n1', cow_id: 'c1', tag_number: 'C-OVERDUE', alert_type: 'heat' }],
      heats: [{ id: 'h1', cow_id: 'c2', tag_number: 'C-UPCOMING', expected_next_heat: tomorrow }],
    })
    const wrapper = createWrapper()
    await flushPromises()

    // Click heats chip
    await wrapper.findAll('.chip')[1].trigger('click')

    const badges = wrapper.findAll('.alert-badge')
    expect(badges[0].classes()).toContain('overdue')
  })

  it('shows empty state when no notifications', async () => {
    seedUpcoming(store, {})
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.empty-state').exists()).toBe(true)
  })

  it('clicking alert row navigates to cow repro', async () => {
    seedUpcoming(store, {
      heats: [{ id: 'h1', cow_id: 'cow-abc', tag_number: 'C001', expected_next_heat: tomorrow }],
    })
    const wrapper = createWrapper()
    await flushPromises()

    await wrapper.find('.alert-row').trigger('click')
    expect(mockRouter.push).toHaveBeenCalledWith('/cows/cow-abc/repro')
  })

  it('dismiss button opens confirm dialog', async () => {
    seedUpcoming(store, {
      needsAttention: [{ id: 'n1', cow_id: 'c1', tag_number: 'C001', alert_type: 'heat' }],
    })
    const wrapper = createWrapper()
    await flushPromises()

    // Dialog initially hidden
    expect(wrapper.find('.confirm-dialog').attributes('data-show')).toBe('false')

    // Click the per-row dismiss button (second .btn-sm-dismiss; first is "Dismiss All")
    await wrapper.findAll('.btn-sm-dismiss')[1].trigger('click')

    // After clicking dismiss, the show prop should be truthy
    expect(wrapper.find('.confirm-dialog').attributes('data-show')).toBe('true')
  })

  it('dry-off cards show accept/reject actions', async () => {
    seedUpcoming(store, {
      dryOffs: [{ id: 'd1', cow_id: 'c1', tag_number: 'C001', expected_dry_off: tomorrow }],
    })
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.dryoff-actions').exists()).toBe(true)
    expect(wrapper.findAll('.btn-sm-action').length).toBe(2)
  })

  it('show more toggle works for heats', async () => {
    const manyHeats = Array.from({ length: 8 }, (_, i) => ({
      id: `h${i}`,
      cow_id: `c${i}`,
      tag_number: `C${i}`,
      expected_next_heat: tomorrow,
    }))
    seedUpcoming(store, { heats: manyHeats })
    const wrapper = createWrapper()
    await flushPromises()

    // Initially 5 visible
    expect(wrapper.findAll('.alert-row').length).toBe(5)

    // Click show more
    await wrapper.find('.show-more-btn').trigger('click')
    expect(wrapper.findAll('.alert-row').length).toBe(8)
  })
})
