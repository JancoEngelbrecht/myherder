import { describe, it, expect, vi } from 'vitest'

vi.mock('../services/syncManager', () => {
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

vi.mock('../db/indexedDB', () => ({
  default: {
    featureFlags: {
      put: vi.fn().mockResolvedValue(undefined),
      toArray: vi.fn().mockResolvedValue([]),
    },
  },
}))

import {
  chartColors,
  formatMonth,
  useTimeRange,
  horizontalAnnotation,
  verticalAnnotation,
  TIME_RANGE_OPTIONS,
} from '../composables/useAnalytics'

describe('useAnalytics', () => {
  it('formatMonth() formats "2024-01" to "Jan 24"', () => {
    expect(formatMonth('2024-01')).toBe('Jan 24')
    expect(formatMonth('2024-12')).toBe('Dec 24')
  })

  it('chartColors exports expected color keys', () => {
    expect(chartColors.primary).toBe('#047857')
    expect(chartColors.danger).toBe('#DC2626')
    expect(chartColors.warning).toBe('#D97706')
  })

  it('useTimeRange() returns default 12-month range', () => {
    const { selectedRange, dateRange } = useTimeRange()
    expect(selectedRange.value).toBe(12)
    expect(dateRange.value.from).toBeDefined()
    expect(dateRange.value.to).toBeDefined()
  })

  it('useTimeRange() date range changes when selectedRange changes', () => {
    const { selectedRange, dateRange } = useTimeRange()
    const initial = dateRange.value.from
    selectedRange.value = 3
    expect(dateRange.value.from).not.toBe(initial)
  })

  it('TIME_RANGE_OPTIONS has 4 options', () => {
    expect(TIME_RANGE_OPTIONS).toHaveLength(4)
    expect(TIME_RANGE_OPTIONS[0].value).toBe(3)
  })

  it('horizontalAnnotation() returns valid Chart.js annotation', () => {
    const ann = horizontalAnnotation(10, 'Target')
    expect(ann.type).toBe('line')
    expect(ann.yMin).toBe(10)
    expect(ann.yMax).toBe(10)
    expect(ann.label.content).toBe('Target')
    expect(ann.borderDash).toEqual([6, 3])
  })

  it('verticalAnnotation() returns valid Chart.js annotation', () => {
    const ann = verticalAnnotation(5, 'Marker', '#FF0000')
    expect(ann.type).toBe('line')
    expect(ann.xMin).toBe(5)
    expect(ann.xMax).toBe(5)
    expect(ann.borderColor).toBe('#FF0000')
  })
})
