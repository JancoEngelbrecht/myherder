import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ReportsView from '../views/admin/ReportsView.vue'

const mockGet = vi.fn()

vi.mock('../services/api.js', () => ({
  default: {
    get: (...args) => mockGet(...args),
  },
}))

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

const stubs = { SyncIndicator: true, SyncPanel: true, RouterLink: true }

function mountComponent() {
  return mount(ReportsView, {
    global: {
      stubs,
      mocks: { $route: { path: '/admin/reports' } },
    },
  })
}

// Stub browser download APIs at module level for all tests that trigger generate
function stubDownloadApis() {
  const origCreate = document.createElement.bind(document)
  const mockClick = vi.fn()
  const spy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    if (tag === 'a') {
      return { href: '', download: '', click: mockClick, setAttribute: vi.fn() }
    }
    return origCreate(tag)
  })
  global.URL.createObjectURL = vi.fn(() => 'blob:test-url')
  global.URL.revokeObjectURL = vi.fn()
  return { spy, mockClick }
}

async function selectReportAndDates(wrapper) {
  await wrapper.findAll('.report-card')[0].trigger('click')
  const inputs = wrapper.findAll('input[type="date"]')
  await inputs[0].setValue('2025-01-01')
  await inputs[1].setValue('2025-12-31')
}

describe('ReportsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all 7 report type cards', () => {
    const wrapper = mountComponent()
    const cards = wrapper.findAll('.report-card')
    expect(cards).toHaveLength(7)
  })

  it('selects report type on click', async () => {
    const wrapper = mountComponent()
    const cards = wrapper.findAll('.report-card')
    await cards[0].trigger('click')
    expect(cards[0].classes()).toContain('active')
  })

  it('disables generate button when no report/dates selected', () => {
    const wrapper = mountComponent()
    const btn = wrapper.find('.generate-btn')
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('enables button when all fields filled', async () => {
    const wrapper = mountComponent()
    await selectReportAndDates(wrapper)
    const btn = wrapper.find('.generate-btn')
    expect(btn.attributes('disabled')).toBeUndefined()
  })

  it('calls api.get with correct params and responseType blob', async () => {
    mockGet.mockResolvedValue({ data: new Blob(['test']) })
    const { spy } = stubDownloadApis()

    const wrapper = mountComponent()
    await selectReportAndDates(wrapper)
    await wrapper.find('.generate-btn').trigger('click')
    await flushPromises()

    expect(mockGet).toHaveBeenCalledWith('/reports/withdrawal-compliance', {
      params: { from: '2025-01-01', to: '2025-12-31', format: 'pdf' },
      responseType: 'blob',
    })

    spy.mockRestore()
  })

  it('shows spinner while generating', async () => {
    let resolveGet
    mockGet.mockReturnValue(new Promise((r) => { resolveGet = r }))

    const wrapper = mountComponent()
    await selectReportAndDates(wrapper)
    await wrapper.find('.generate-btn').trigger('click')
    await flushPromises()

    expect(wrapper.find('.spinner').exists()).toBe(true)

    const { spy } = stubDownloadApis()
    resolveGet({ data: new Blob(['test']) })
    await flushPromises()

    expect(wrapper.find('.spinner').exists()).toBe(false)
    spy.mockRestore()
  })

  it('triggers file download on success', async () => {
    mockGet.mockResolvedValue({ data: new Blob(['pdf-data']) })
    const { spy, mockClick } = stubDownloadApis()

    const wrapper = mountComponent()
    await selectReportAndDates(wrapper)
    await wrapper.find('.generate-btn').trigger('click')
    await flushPromises()

    expect(mockClick).toHaveBeenCalled()
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url')
    spy.mockRestore()
  })

  it('defaults to PDF format', () => {
    const wrapper = mountComponent()
    const chips = wrapper.findAll('.chip')
    expect(chips[0].classes()).toContain('active')
    expect(chips[1].classes()).not.toContain('active')
  })

  it('sets active class on selected format chip', async () => {
    const wrapper = mountComponent()
    const chips = wrapper.findAll('.chip')
    await chips[1].trigger('click')
    expect(chips[1].classes()).toContain('active')
    expect(chips[0].classes()).not.toContain('active')
  })

  it('sends xlsx format when Excel selected', async () => {
    mockGet.mockResolvedValue({ data: new Blob(['xlsx-data']) })
    const { spy } = stubDownloadApis()

    const wrapper = mountComponent()
    await selectReportAndDates(wrapper)

    // Switch to Excel
    const chips = wrapper.findAll('.chip')
    await chips[1].trigger('click')

    await wrapper.find('.generate-btn').trigger('click')
    await flushPromises()

    expect(mockGet).toHaveBeenCalledWith('/reports/withdrawal-compliance', {
      params: { from: '2025-01-01', to: '2025-12-31', format: 'xlsx' },
      responseType: 'blob',
    })
    spy.mockRestore()
  })

  it('shows back button to settings', () => {
    const wrapper = mountComponent()
    const header = wrapper.findComponent({ name: 'AppHeader' })
    expect(header.exists()).toBe(true)
    expect(header.props('showBack')).toBe(true)
    expect(header.props('backTo')).toBe('/settings')
  })
})
