import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import BottomNav from '../components/organisms/BottomNav.vue'
import { useFeatureFlagsStore } from '../stores/featureFlags'
import { useAuthStore } from '../stores/auth'

// vi.hoisted ensures the variable is initialized before the hoisted vi.mock factory runs
const { mockUseRoute } = vi.hoisted(() => ({
  mockUseRoute: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: mockUseRoute,
}))

vi.mock('../services/api', () => ({
  default: { get: vi.fn(), patch: vi.fn() },
}))

vi.mock('../db/indexedDB', () => ({
  default: {
    featureFlags: {
      put: vi.fn().mockResolvedValue(undefined),
      toArray: vi.fn().mockResolvedValue([]),
    },
    auth: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
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

/** Set up admin user (has all permissions via role bypass) */
function setAdmin() {
  const auth = useAuthStore()
  auth.user = { role: 'admin', permissions: [] }
}

/** Set up worker with specific permissions */
function setWorker(permissions = []) {
  const auth = useAuthStore()
  auth.user = { role: 'worker', permissions }
}

describe('BottomNav', () => {
  it('renders all 4 navigation tabs when all flags enabled', () => {
    setAdmin()
    const wrapper = mountNav('/')
    expect(wrapper.findAll('a')).toHaveLength(4)
  })

  it('marks the Home tab active on the root path', () => {
    setAdmin()
    const wrapper = mountNav('/')
    const tabs = wrapper.findAll('a')
    expect(tabs[0].classes()).toContain('active') // Home
    expect(tabs[1].classes()).not.toContain('active') // Cows
  })

  it('marks the Cows tab active for /cows path', () => {
    setAdmin()
    const wrapper = mountNav('/cows')
    const tabs = wrapper.findAll('a')
    expect(tabs[1].classes()).toContain('active') // Cows
    expect(tabs[0].classes()).not.toContain('active') // Home
  })

  it('marks the Cows tab active for a nested /cows/:id path', () => {
    setAdmin()
    const wrapper = mountNav('/cows/abc-123')
    const tabs = wrapper.findAll('a')
    expect(tabs[1].classes()).toContain('active')
  })

  // ── Feature flag filtering ──────────────────────────────────────────────

  it('hides milk tab when milkRecording flag is disabled', () => {
    setAdmin()
    const store = useFeatureFlagsStore()
    store.flags = {
      breeding: true,
      milkRecording: false,
      healthIssues: true,
      treatments: true,
      analytics: true,
    }

    const wrapper = mountNav('/')
    const tabs = wrapper.findAll('a')
    expect(tabs).toHaveLength(3)
    const labels = tabs.map((t) => t.text())
    expect(labels).not.toContain('nav.milk')
  })

  it('hides breed tab when breeding flag is disabled', () => {
    setAdmin()
    const store = useFeatureFlagsStore()
    store.flags = {
      breeding: false,
      milkRecording: true,
      healthIssues: true,
      treatments: true,
      analytics: true,
    }

    const wrapper = mountNav('/')
    const tabs = wrapper.findAll('a')
    expect(tabs).toHaveLength(3)
    const labels = tabs.map((t) => t.text())
    expect(labels).not.toContain('nav.breed')
  })

  it('shows only 2 tabs when both milk and breed flags are disabled', () => {
    setAdmin()
    const store = useFeatureFlagsStore()
    store.flags = {
      breeding: false,
      milkRecording: false,
      healthIssues: true,
      treatments: true,
      analytics: true,
    }

    const wrapper = mountNav('/')
    const tabs = wrapper.findAll('a')
    expect(tabs).toHaveLength(2)
  })

  // ── Permission filtering ──────────────────────────────────────────────

  it('hides milk tab when worker lacks can_record_milk permission', () => {
    setWorker(['can_log_breeding'])
    const store = useFeatureFlagsStore()
    store.flags = {
      breeding: true,
      milkRecording: true,
      healthIssues: true,
      treatments: true,
      analytics: true,
    }

    const wrapper = mountNav('/')
    const tabs = wrapper.findAll('a')
    expect(tabs).toHaveLength(3) // home, cows, breed
    const labels = tabs.map((t) => t.text())
    expect(labels).not.toContain('nav.milk')
  })

  it('shows milk tab when worker has can_record_milk permission', () => {
    setWorker(['can_record_milk', 'can_log_breeding'])
    const store = useFeatureFlagsStore()
    store.flags = {
      breeding: true,
      milkRecording: true,
      healthIssues: true,
      treatments: true,
      analytics: true,
    }

    const wrapper = mountNav('/')
    const tabs = wrapper.findAll('a')
    expect(tabs).toHaveLength(4)
  })

  it('admin sees all tabs regardless of permissions array', () => {
    setAdmin()
    const store = useFeatureFlagsStore()
    store.flags = {
      breeding: true,
      milkRecording: true,
      healthIssues: true,
      treatments: true,
      analytics: true,
    }

    const wrapper = mountNav('/')
    expect(wrapper.findAll('a')).toHaveLength(4)
  })
})
