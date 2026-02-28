import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import api from '../services/api'
import db from '../db/indexedDB'

const DEFAULTS = {
  breeding: true,
  milkRecording: true,
  healthIssues: true,
  treatments: true,
  analytics: true,
}

export const useFeatureFlagsStore = defineStore('featureFlags', () => {
  const flags = ref({ ...DEFAULTS })
  const loading = ref(false)

  // ── Computed getters ─────────────────────────────────────────

  const isBreedingEnabled = computed(() => flags.value.breeding)
  const isMilkRecordingEnabled = computed(() => flags.value.milkRecording)
  const isHealthIssuesEnabled = computed(() => flags.value.healthIssues)
  const isTreatmentsEnabled = computed(() => flags.value.treatments)
  const isAnalyticsEnabled = computed(() => flags.value.analytics)

  // ── Helpers ──────────────────────────────────────────────────

  async function persistToIndexedDB(flagsObj) {
    const entries = Object.entries(flagsObj).map(([key, enabled]) => ({ key, enabled }))
    for (const entry of entries) {
      await db.featureFlags.put({ ...entry })
    }
  }

  async function loadFromIndexedDB() {
    const rows = await db.featureFlags.toArray()
    if (rows.length === 0) return null
    const result = { ...DEFAULTS }
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

  async function updateFlag(key, enabled) {
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

  async function hydrateFromCache() {
    const cached = await loadFromIndexedDB()
    if (cached) {
      flags.value = cached
    }
  }

  return {
    flags,
    loading,
    isBreedingEnabled,
    isMilkRecordingEnabled,
    isHealthIssuesEnabled,
    isTreatmentsEnabled,
    isAnalyticsEnabled,
    fetchFlags,
    updateFlag,
    hydrateFromCache,
  }
})
