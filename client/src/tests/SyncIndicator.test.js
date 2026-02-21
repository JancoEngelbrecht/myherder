import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { useCowsStore } from '../stores/cows.js'
import SyncIndicator from '../components/atoms/SyncIndicator.vue'

// Mock store dependencies so the cows store can be instantiated without a real API
vi.mock('../services/api.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

vi.mock('../services/syncManager.js', () => ({
  pullCows: vi.fn().mockResolvedValue([]),
  pullOneCow: vi.fn().mockResolvedValue(null),
  getLocalCows: vi.fn().mockResolvedValue([]),
  getLocalCow: vi.fn().mockResolvedValue(null),
  saveCowLocally: vi.fn().mockResolvedValue(undefined),
  removeCowLocally: vi.fn().mockResolvedValue(undefined),
  isOfflineError: vi.fn().mockReturnValue(false),
}))

describe('SyncIndicator', () => {
  it('applies the synced class when syncStatus is synced', () => {
    const store = useCowsStore()
    store.syncStatus = 'synced'
    const wrapper = mount(SyncIndicator)
    expect(wrapper.find('.sync-indicator').classes()).toContain('synced')
  })

  it('applies the syncing class when syncStatus is syncing', () => {
    const store = useCowsStore()
    store.syncStatus = 'syncing'
    const wrapper = mount(SyncIndicator)
    expect(wrapper.find('.sync-indicator').classes()).toContain('syncing')
  })

  it('applies the offline class when syncStatus is offline', () => {
    const store = useCowsStore()
    store.syncStatus = 'offline'
    const wrapper = mount(SyncIndicator)
    expect(wrapper.find('.sync-indicator').classes()).toContain('offline')
  })

  it('always renders the dot element', () => {
    const store = useCowsStore()
    store.syncStatus = 'synced'
    const wrapper = mount(SyncIndicator)
    expect(wrapper.find('.dot').exists()).toBe(true)
  })
})
