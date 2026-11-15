import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import SystemHealthView from '../views/super/SystemHealthView.vue'
import { useToast } from '../composables/useToast'

const mockGet = vi.fn()

vi.mock('../services/api', () => ({
  default: {
    get: (...args) => mockGet(...args),
  },
}))

const stubs = {
  AppHeader: { template: '<header />' },
  RouterLink: { template: '<a v-bind="$attrs"><slot /></a>' },
}

function makeHealth(overrides = {}) {
  return {
    node_version: 'v24.0.0',
    uptime_seconds: 3600,
    memory: { rss_mb: 120, heap_used_mb: 40, heap_total_mb: 80 },
    disk: null,
    database: null,
    requests: {
      started_at: '2026-11-15T00:00:00.000Z',
      total: 10,
      errors_4xx: 0,
      errors_5xx: 0,
      error_rate_5xx_pct: 0,
      avg_response_ms: 12,
      p95_response_ms: 30,
      window_size: 10,
    },
    recent_errors: [],
    last_5xx_error: null,
    thresholds: {
      memory_status: 'green',
      disk_status: 'unknown',
      response_status: 'green',
      error_status: 'green',
    },
    ...overrides,
  }
}

const PERSISTED = {
  at: '2026-11-14T08:00:00.000Z',
  method: 'POST',
  path: '/api/milk-records',
  status: 500,
  message: 'Persisted boom',
}

describe('SystemHealthView — last persisted 5xx error', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the persisted last error when there are no recent errors', async () => {
    mockGet.mockResolvedValue({ data: makeHealth({ last_5xx_error: PERSISTED }) })
    const wrapper = mount(SystemHealthView, { global: { stubs } })
    await flushPromises()

    expect(mockGet).toHaveBeenCalledWith('/system/health')
    const item = wrapper.find('.last-error-item')
    expect(item.exists()).toBe(true)
    expect(item.text()).toContain('POST')
    expect(item.text()).toContain('/api/milk-records')
    expect(item.text()).toContain('500')
    expect(item.text()).toContain('Persisted boom')
    expect(wrapper.find('.last-error-label').exists()).toBe(true)
  })

  it('hides the persisted block when last_5xx_error is null', async () => {
    mockGet.mockResolvedValue({ data: makeHealth() })
    const wrapper = mount(SystemHealthView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.last-error-item').exists()).toBe(false)
    expect(wrapper.find('.last-error-label').exists()).toBe(false)
  })

  it('shows recent errors and not the persisted block when the buffer has errors', async () => {
    mockGet.mockResolvedValue({
      data: makeHealth({
        recent_errors: [
          {
            timestamp: '2026-11-15T10:00:00.000Z',
            method: 'GET',
            path: '/api/animals',
            status: 500,
            message: 'Live boom',
          },
        ],
        last_5xx_error: PERSISTED,
      }),
    })
    const wrapper = mount(SystemHealthView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.findAll('.error-item')).toHaveLength(1)
    expect(wrapper.text()).toContain('Live boom')
    expect(wrapper.find('.last-error-item').exists()).toBe(false)
  })
})

describe('SystemHealthView — load failure', () => {
  beforeEach(() => {
    useToast().toasts.value = []
  })

  it('shows a toast and no metrics when the request fails', async () => {
    mockGet.mockRejectedValue({ response: { status: 500, data: { error: 'boom' } } })
    const wrapper = mount(SystemHealthView, { global: { stubs } })
    await flushPromises()

    expect(useToast().toasts.value.some((x) => x.type === 'error')).toBe(true)
    expect(wrapper.find('.error-item').exists()).toBe(false)
  })
})
