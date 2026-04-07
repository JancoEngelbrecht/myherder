import { ref } from 'vue'
import { defineStore } from 'pinia'
import api from '../services/api'
import db from '../db/indexedDB'

interface FeatureFlags {
  breeding: boolean
  milkRecording: boolean
  healthIssues: boolean
  treatments: boolean
  analytics: boolean
  [key: string]: boolean
}

const DEFAULTS: FeatureFlags = {
  breeding: true,
  milkRecording: true,
  healthIssues: true,
  treatments: true,
  analytics: true,
}

export const useFeatureFlagsStore = defineStore('featureFlags', () => {
  const flags = ref<FeatureFlags>({ ...DEFAULTS })
  const loading = ref(false)

  // ── Helpers ──────────────────────────────────────────────────

  async function persistToIndexedDB(flagsObj: FeatureFlags) {
    const entries = Object.entries(flagsObj).map(([key, enabled]) => ({ key, enabled }))
    await db.featureFlags.bulkPut(entries)
  }

  async function loadFromIndexedDB(): Promise<FeatureFlags | null> {
    const rows = await db.featureFlags.toArray()
    if (rows.length === 0) return null
    const result: FeatureFlags = { ...DEFAULTS }
    for (const row of rows) {
      if (row.key in result) result[row.key] = !!row.enabled
    }
    return result
  }

  // ── Actions ──────────────────────────────────────────────────

  async function fetchFlags() {
    loading.value = true
    try {
      const { data } = await api.get('/feature-flags')
      flags.value = { ...DEFAULTS, ...data }
      await persistToIndexedDB(flags.value)
    } catch {
      // API failed — try IndexedDB
      const cached = await loadFromIndexedDB()
      if (cached) {
        flags.value = cached
      }
      // else keep defaults
    } finally {
      loading.value = false
    }
  }

  async function updateFlag(key: string, enabled: boolean) {
    const prev = flags.value[key]
    flags.value = { ...flags.value, [key]: enabled }
    try {
      const { data } = await api.patch('/feature-flags', { [key]: enabled })
      flags.value = { ...DEFAULTS, ...data }
      await persistToIndexedDB(flags.value)
    } catch {
      // Revert on failure
      flags.value = { ...flags.value, [key]: prev }
      throw new Error('Failed to update flag')
    }
  }

  return {
    flags,
    loading,
    fetchFlags,
    updateFlag,
  }
})
