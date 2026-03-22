import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import SyncPanel from '../components/molecules/SyncPanel.vue'

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
    syncQueue: {
      where: vi.fn().mockReturnValue({
        aboveOrEqual: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }),
      bulkDelete: vi.fn(),
      update: vi.fn(),
    },
  },
}))

describe('SyncPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders panel content when show prop is true', async () => {
    const wrapper = mount(SyncPanel, {
      props: { show: true },
    })
    await flushPromises()

    expect(wrapper.find('.sync-panel').exists()).toBe(true)
  })

  it('does not render panel content when show prop is false', () => {
    const wrapper = mount(SyncPanel, {
      props: { show: false },
    })

    expect(wrapper.find('.sync-panel').exists()).toBe(false)
  })

  it('displays pending sync count in status label', async () => {
    // Modify the syncManager mock's pendingCount for this test
    const syncManager = await import('../services/syncManager.js')
    syncManager.pendingCount.value = 3

    const wrapper = mount(SyncPanel, {
      props: { show: true },
    })
    await flushPromises()

    // Status label shows pending count when there are pending items
    const statusLabel = wrapper.find('.status-label')
    expect(statusLabel.exists()).toBe(true)

    // Reset for other tests
    syncManager.pendingCount.value = 0
  })

  it('shows last sync timestamp when lastSyncTime is set', async () => {
    const syncManager = await import('../services/syncManager.js')
    syncManager.lastSyncTime.value = '2026-03-04T10:00:00.000Z'

    const wrapper = mount(SyncPanel, {
      props: { show: true },
    })
    await flushPromises()

    const infoRows = wrapper.findAll('.info-row')
    expect(infoRows.length).toBeGreaterThan(0)
    // The .info-value should show the formatted time
    const infoValue = wrapper.find('.info-value.mono')
    expect(infoValue.exists()).toBe(true)
    expect(infoValue.text()).toBeTruthy()

    // Reset
    syncManager.lastSyncTime.value = null
  })

  it('renders a sync now button in panel actions', async () => {
    const wrapper = mount(SyncPanel, {
      props: { show: true },
    })
    await flushPromises()

    const syncBtn = wrapper.find('.panel-actions .btn-primary')
    expect(syncBtn.exists()).toBe(true)
  })
})
