import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import BottomNav from '../components/organisms/BottomNav.vue'
import { useFeatureFlagsStore } from '../stores/featureFlags.js'

// vi.hoisted ensures the variable is initialized before the hoisted vi.mock factory runs
const { mockUseRoute } = vi.hoisted(() => ({
  mockUseRoute: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: mockUseRoute,
}))

vi.mock('../services/api.js', () => ({
  default: { get: vi.fn(), patch: vi.fn() },
}))

vi.mock('../db/indexedDB.js', () => ({
  default: {
    featureFlags: {
      put: vi.fn().mockResolvedValue(undefined),
      toArray: vi.fn().mockResolvedValue([]),
    },
  },
}))

// RouterLink must be provided as a global stub so Vue resolves it during template compilation
const RouterLinkStub = { template: '<a v-bind="$attrs"><slot /></a>' }

function mountNav(path) {
  mockUseRoute.mockReturnValue({ path })
  return mount(BottomNav, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

describe('BottomNav', () => {
  it('renders all 5 navigation tabs when all flags enabled', () => {
    const wrapper = mountNav('/')
    expect(wrapper.findAll('a')).toHaveLength(5)
  })

  it('marks the Home tab active on the root path', () => {
    const wrapper = mountNav('/')
    const tabs = wrapper.findAll('a')
    expect(tabs[0].classes()).toContain('active') // Home
    expect(tabs[1].classes()).not.toContain('active') // Cows
  })

  it('marks the Cows tab active for /cows path', () => {
    const wrapper = mountNav('/cows')
    const tabs = wrapper.findAll('a')
    expect(tabs[1].classes()).toContain('active') // Cows
    expect(tabs[0].classes()).not.toContain('active') // Home
  })

  it('marks the Cows tab active for a nested /cows/:id path', () => {
    const wrapper = mountNav('/cows/abc-123')
    const tabs = wrapper.findAll('a')
    expect(tabs[1].classes()).toContain('active')
  })

  it('marks the Log tab active on /log path', () => {
    const wrapper = mountNav('/log')
    const tabs = wrapper.findAll('a')
    expect(tabs[2].classes()).toContain('active') // Log
    expect(tabs[0].classes()).not.toContain('active') // Home not active
  })

  // ── Feature flag filtering ──────────────────────────────────────────────

  it('hides milk tab when milkRecording flag is disabled', () => {
    const store = useFeatureFlagsStore()
    store.flags = { breeding: true, milkRecording: false, healthIssues: true, treatments: true, analytics: true }

    const wrapper = mountNav('/')
    const tabs = wrapper.findAll('a')
    expect(tabs).toHaveLength(4)
    const labels = tabs.map(t => t.text())
    expect(labels).not.toContain('nav.milk')
  })

  it('hides breed tab when breeding flag is disabled', () => {
    const store = useFeatureFlagsStore()
    store.flags = { breeding: false, milkRecording: true, healthIssues: true, treatments: true, analytics: true }

    const wrapper = mountNav('/')
    const tabs = wrapper.findAll('a')
    expect(tabs).toHaveLength(4)
    const labels = tabs.map(t => t.text())
    expect(labels).not.toContain('nav.breed')
  })

  it('shows only 3 tabs when both milk and breed flags are disabled', () => {
    const store = useFeatureFlagsStore()
    store.flags = { breeding: false, milkRecording: false, healthIssues: true, treatments: true, analytics: true }

    const wrapper = mountNav('/')
    const tabs = wrapper.findAll('a')
    expect(tabs).toHaveLength(3)
  })
})
