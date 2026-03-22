import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import SyncIndicator from '../components/atoms/SyncIndicator.vue'

// Mock syncManager so sync store can initialize
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
  }
})

vi.mock('../db/indexedDB.js', () => ({
  default: {
    syncQueue: {
      where: vi.fn().mockReturnValue({
        aboveOrEqual: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }),
      bulkDelete: vi.fn(),
    },
  },
}))

import { isOnline, pendingCount, isSyncing } from '../services/syncManager.js'

describe('SyncIndicator', () => {
  it('applies the synced class when online with no pending', () => {
    isOnline.value = true
    pendingCount.value = 0
    isSyncing.value = false
    const wrapper = mount(SyncIndicator)
    expect(wrapper.find('.sync-indicator').classes()).toContain('synced')
  })

  it('applies the syncing class when syncing', () => {
    isSyncing.value = true
    const wrapper = mount(SyncIndicator)
    expect(wrapper.find('.sync-indicator').classes()).toContain('syncing')
    isSyncing.value = false
  })

  it('applies the offline class when offline', () => {
    isOnline.value = false
    pendingCount.value = 0
    const wrapper = mount(SyncIndicator)
    expect(wrapper.find('.sync-indicator').classes()).toContain('offline')
  })

  it('applies the pending class when online with pending items', () => {
    isOnline.value = true
    pendingCount.value = 3
    isSyncing.value = false
    const wrapper = mount(SyncIndicator)
    expect(wrapper.find('.sync-indicator').classes()).toContain('pending')
  })

  it('shows pending count badge when items are pending', () => {
    isOnline.value = true
    pendingCount.value = 5
    isSyncing.value = false
    const wrapper = mount(SyncIndicator)
    expect(wrapper.find('.badge').text()).toBe('5')
  })

  it('always renders the dot element', () => {
    isOnline.value = true
    pendingCount.value = 0
    isSyncing.value = false
    const wrapper = mount(SyncIndicator)
    expect(wrapper.find('.dot').exists()).toBe(true)
  })
})
