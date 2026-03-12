import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, nextTick } from 'vue'

// Mock driver.js
vi.mock('driver.js', () => ({
  driver: vi.fn(() => ({
    drive: vi.fn(),
    destroy: vi.fn(),
  })),
}))
vi.mock('driver.js/dist/driver.css', () => ({}))

// Mock auth store
vi.mock('../stores/auth.js', () => ({
  useAuthStore: () => ({
    user: { id: 'user-1', role: 'admin' },
  }),
}))

import { useTour } from '../composables/useTour.js'
import { driver } from 'driver.js'

function createTestComponent(tourId, steps, options = {}) {
  return defineComponent({
    setup() {
      const tour = useTour(tourId, steps, options)
      return tour
    },
    render() {
      return null
    },
  })
}

describe('useTour', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.useFakeTimers()
    vi.clearAllMocks()
    localStorage.setItem('farm_id', 'farm-1')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('auto-starts tour on first visit when autoStart is true', async () => {
    const steps = [
      { popover: { title: 'Welcome', description: 'Hello' } },
    ]
    const wrapper = mount(createTestComponent('test-tour', steps))
    await nextTick()
    vi.advanceTimersByTime(400)
    // startTour is now async (dynamic import) — flush promises
    await vi.runAllTimersAsync()
    await nextTick()

    expect(driver).toHaveBeenCalled()
    expect(driver.mock.results[0].value.drive).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not auto-start if already completed', async () => {
    localStorage.setItem('tour_completed_test-tour_user-1_farm-1', '1')
    const steps = [
      { popover: { title: 'Welcome', description: 'Hello' } },
    ]
    const wrapper = mount(createTestComponent('test-tour', steps))
    await nextTick()
    vi.advanceTimersByTime(400)

    expect(driver).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not auto-start when autoStart is false', async () => {
    const steps = [
      { popover: { title: 'Welcome', description: 'Hello' } },
    ]
    const wrapper = mount(createTestComponent('test-tour', steps, { autoStart: false }))
    await nextTick()
    vi.advanceTimersByTime(400)

    expect(driver).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('resetTour clears localStorage', async () => {
    localStorage.setItem('tour_completed_test-tour_user-1_farm-1', '1')
    const steps = [
      { popover: { title: 'Welcome', description: 'Hello' } },
    ]
    const wrapper = mount(createTestComponent('test-tour', steps, { autoStart: false }))
    await nextTick()

    expect(wrapper.vm.hasCompleted).toBe(true)
    wrapper.vm.resetTour()
    expect(wrapper.vm.hasCompleted).toBe(false)
    expect(localStorage.getItem('tour_completed_test-tour_user-1_farm-1')).toBeNull()
    wrapper.unmount()
  })

  it('hasCompleted is reactive', async () => {
    const steps = [
      { popover: { title: 'Welcome', description: 'Hello' } },
    ]
    const wrapper = mount(createTestComponent('test-tour', steps, { autoStart: false }))
    await nextTick()

    expect(wrapper.vm.hasCompleted).toBe(false)
    wrapper.unmount()
  })

  it('uses farm_id and user id in storage key', async () => {
    localStorage.setItem('farm_id', 'farm-99')
    const steps = [
      { popover: { title: 'Welcome', description: 'Hello' } },
    ]
    const wrapper = mount(createTestComponent('my-tour', steps, { autoStart: false }))
    await nextTick()

    wrapper.vm.resetTour() // ensure we're reading the right key
    // Verify the key format
    localStorage.setItem('tour_completed_my-tour_user-1_farm-99', '1')
    // Force re-check by re-mounting
    wrapper.unmount()

    const wrapper2 = mount(createTestComponent('my-tour', steps, { autoStart: false }))
    await nextTick()
    expect(wrapper2.vm.hasCompleted).toBe(true)
    wrapper2.unmount()
  })
})
