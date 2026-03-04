import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import SettingsView from '../views/admin/SettingsView.vue'

const mockRouter = { push: vi.fn(), back: vi.fn() }
vi.mock('vue-router', () => ({
  useRouter: () => mockRouter,
  RouterLink: { template: '<a><slot /></a>' },
}))

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPatch = vi.fn()
const mockDelete = vi.fn()

vi.mock('../services/api.js', () => ({
  default: {
    get: (...args) => mockGet(...args),
    post: (...args) => mockPost(...args),
    patch: (...args) => mockPatch(...args),
    delete: (...args) => mockDelete(...args),
  },
}))

vi.mock('../services/syncManager.js', () => {
  const { ref } = require('vue')
  return {
    isOnline: ref(true), pendingCount: ref(0), isSyncing: ref(false),
    lastSyncTime: ref(null), failedItems: ref([]), sync: vi.fn(),
    initialSync: vi.fn(), getPending: vi.fn().mockResolvedValue([]),
    init: vi.fn(), destroyListeners: vi.fn(),
    isOfflineError: vi.fn().mockReturnValue(false), enqueue: vi.fn(), dequeueByEntityId: vi.fn(),
  }
})

vi.mock('../db/indexedDB.js', () => ({
  default: {
    featureFlags: {
      toArray: vi.fn().mockResolvedValue([]),
      bulkPut: vi.fn().mockResolvedValue(undefined),
    },
    syncQueue: {
      where: vi.fn().mockReturnValue({
        aboveOrEqual: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }),
      bulkDelete: vi.fn(),
    },
  },
}))

const stubs = {
  SyncIndicator: true,
  SyncPanel: true,
  AppHeader: true,
}

function mountComponent() {
  return mount(SettingsView, {
    global: {
      stubs,
      mocks: { $route: { path: '/settings' } },
    },
  })
}

describe('SettingsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockImplementation((url) => {
      if (url === '/settings') {
        return Promise.resolve({ data: { farm_name: 'Test Farm', default_language: 'en', milk_price_per_litre: '4.50' } })
      }
      if (url === '/feature-flags') {
        return Promise.resolve({ data: { breeding: true, milkRecording: true, healthIssues: true, treatments: true, analytics: true } })
      }
      return Promise.resolve({ data: {} })
    })
  })

  it('displays farm name from settings in editable input', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const farmNameInput = wrapper.find('#farm-name')
    expect(farmNameInput.exists()).toBe(true)
    expect(farmNameInput.element.value).toBe('Test Farm')
  })

  it('shows links to admin sub-pages', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const html = wrapper.html()
    // RouterLink components render as <a> elements via stub
    expect(html).toContain('/admin/users')
    expect(html).toContain('/admin/audit-log')
    expect(html).toContain('/admin/reports')
  })

  it('shows language selector with correct options', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const langSelect = wrapper.find('#default-lang')
    expect(langSelect.exists()).toBe(true)
    const options = langSelect.findAll('option')
    const values = options.map((o) => o.element.value)
    expect(values).toContain('en')
    expect(values).toContain('af')
  })

  it('force sync button exists and calls initialSync on click', async () => {
    const syncManager = await import('../services/syncManager.js')

    const wrapper = mountComponent()
    await flushPromises()

    // The force sync button is a settings-item button in the data sync section
    const buttons = wrapper.findAll('button.settings-item')
    const syncBtn = buttons.find((b) => b.text().includes('settings.forceSync'))
    expect(syncBtn).toBeDefined()

    await syncBtn.trigger('click')
    await flushPromises()

    expect(syncManager.initialSync).toHaveBeenCalled()
  })

  it('export button exists and calls GET /export on click', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/settings') return Promise.resolve({ data: { farm_name: 'Test Farm', default_language: 'en' } })
      if (url === '/feature-flags') return Promise.resolve({ data: { breeding: true, milkRecording: true, healthIssues: true, treatments: true, analytics: true } })
      if (url === '/export') return Promise.resolve({ data: { cows: [], users: [] } })
      return Promise.resolve({ data: {} })
    })

    // Mock URL.createObjectURL and document.createElement to prevent jsdom errors
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock')
    global.URL.revokeObjectURL = vi.fn()

    const wrapper = mountComponent()
    await flushPromises()

    const exportBtn = wrapper.findAll('button.settings-item').find((b) =>
      b.text().includes('settings.exportData'),
    )
    expect(exportBtn).toBeDefined()

    await exportBtn.trigger('click')
    await flushPromises()

    expect(mockGet).toHaveBeenCalledWith('/export')
  })
})
