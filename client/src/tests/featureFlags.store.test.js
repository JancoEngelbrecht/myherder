import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useFeatureFlagsStore } from '../stores/featureFlags.js'
import api from '../services/api.js'

vi.mock('../services/api.js', () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}))

const { mockFeatureFlagsTable } = vi.hoisted(() => ({
  mockFeatureFlagsTable: {
    put: vi.fn().mockResolvedValue(undefined),
    toArray: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('../db/indexedDB.js', () => ({
  default: {
    featureFlags: mockFeatureFlagsTable,
  },
}))

const DEFAULTS = {
  breeding: true,
  milkRecording: true,
  healthIssues: true,
  treatments: true,
  analytics: true,
}

// setup.js creates a fresh Pinia before each test

describe('useFeatureFlagsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFeatureFlagsTable.toArray.mockResolvedValue([])
  })

  // ── fetchFlags ──────────────────────────────────────────────────────────

  describe('fetchFlags', () => {
    it('fetches flags from API and updates state', async () => {
      const apiFlags = { ...DEFAULTS, analytics: false }
      api.get.mockResolvedValue({ data: apiFlags })

      const store = useFeatureFlagsStore()
      await store.fetchFlags()

      expect(api.get).toHaveBeenCalledWith('/feature-flags')
      expect(store.flags.analytics).toBe(false)
      expect(store.flags.breeding).toBe(true)
    })

    it('persists fetched flags to IndexedDB', async () => {
      api.get.mockResolvedValue({ data: DEFAULTS })

      const store = useFeatureFlagsStore()
      await store.fetchFlags()

      expect(mockFeatureFlagsTable.put).toHaveBeenCalledTimes(5)
      expect(mockFeatureFlagsTable.put).toHaveBeenCalledWith({ key: 'breeding', enabled: true })
    })

    it('falls back to IndexedDB when API fails', async () => {
      api.get.mockRejectedValue(new Error('Network error'))
      mockFeatureFlagsTable.toArray.mockResolvedValue([
        { key: 'breeding', enabled: false },
        { key: 'milkRecording', enabled: true },
        { key: 'healthIssues', enabled: true },
        { key: 'treatments', enabled: false },
        { key: 'analytics', enabled: true },
      ])

      const store = useFeatureFlagsStore()
      await store.fetchFlags()

      expect(store.flags.breeding).toBe(false)
      expect(store.flags.treatments).toBe(false)
      expect(store.flags.milkRecording).toBe(true)
    })

    it('falls back to defaults when both API and IndexedDB fail', async () => {
      api.get.mockRejectedValue(new Error('Network error'))
      mockFeatureFlagsTable.toArray.mockResolvedValue([])

      const store = useFeatureFlagsStore()
      await store.fetchFlags()

      expect(store.flags).toEqual(DEFAULTS)
    })

    it('sets loading true during fetch, false after', async () => {
      let resolveRequest
      api.get.mockReturnValue(new Promise((resolve) => { resolveRequest = () => resolve({ data: DEFAULTS }) }))

      const store = useFeatureFlagsStore()
      const p = store.fetchFlags()
      expect(store.loading).toBe(true)

      resolveRequest()
      await p
      expect(store.loading).toBe(false)
    })
  })

  // ── updateFlag ──────────────────────────────────────────────────────────

  describe('updateFlag', () => {
    it('calls PATCH and updates state', async () => {
      const updated = { ...DEFAULTS, breeding: false }
      api.patch.mockResolvedValue({ data: updated })

      const store = useFeatureFlagsStore()
      await store.updateFlag('breeding', false)

      expect(api.patch).toHaveBeenCalledWith('/feature-flags', { breeding: false })
      expect(store.flags.breeding).toBe(false)
    })

    it('persists updated flags to IndexedDB', async () => {
      const updated = { ...DEFAULTS, analytics: false }
      api.patch.mockResolvedValue({ data: updated })

      const store = useFeatureFlagsStore()
      await store.updateFlag('analytics', false)

      expect(mockFeatureFlagsTable.put).toHaveBeenCalled()
    })

    it('reverts state on API failure', async () => {
      api.patch.mockRejectedValue(new Error('Server error'))

      const store = useFeatureFlagsStore()
      expect(store.flags.breeding).toBe(true)

      await expect(store.updateFlag('breeding', false)).rejects.toThrow()
      expect(store.flags.breeding).toBe(true)
    })
  })

  // ── hydrateFromCache ────────────────────────────────────────────────────

  describe('hydrateFromCache', () => {
    it('loads flags from IndexedDB', async () => {
      mockFeatureFlagsTable.toArray.mockResolvedValue([
        { key: 'breeding', enabled: true },
        { key: 'milkRecording', enabled: false },
        { key: 'healthIssues', enabled: true },
        { key: 'treatments', enabled: true },
        { key: 'analytics', enabled: false },
      ])

      const store = useFeatureFlagsStore()
      await store.hydrateFromCache()

      expect(store.flags.milkRecording).toBe(false)
      expect(store.flags.analytics).toBe(false)
      expect(store.flags.breeding).toBe(true)
    })

    it('keeps defaults when IndexedDB is empty', async () => {
      mockFeatureFlagsTable.toArray.mockResolvedValue([])

      const store = useFeatureFlagsStore()
      await store.hydrateFromCache()

      expect(store.flags).toEqual(DEFAULTS)
    })
  })

  // ── computed getters ────────────────────────────────────────────────────

  describe('computed getters', () => {
    it('reflects flag state in computed getters', async () => {
      const apiFlags = { ...DEFAULTS, breeding: false, analytics: false }
      api.get.mockResolvedValue({ data: apiFlags })

      const store = useFeatureFlagsStore()
      await store.fetchFlags()

      expect(store.isBreedingEnabled).toBe(false)
      expect(store.isAnalyticsEnabled).toBe(false)
      expect(store.isMilkRecordingEnabled).toBe(true)
      expect(store.isHealthIssuesEnabled).toBe(true)
      expect(store.isTreatmentsEnabled).toBe(true)
    })
  })
})
