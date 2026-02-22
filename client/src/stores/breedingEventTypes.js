import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import api from '../services/api'

// Last-resort fallback for offline first-load before any DB fetch succeeds.
// Names mirror the DB seed (016_create_breeding_event_types.js) — the admin
// can rename them in BreedingEventTypeManagement; those names come from the DB.
const FALLBACK = [
  { code: 'heat_observed', name: 'Heat Observed', emoji: '🔥', is_active: true, sort_order: 0 },
  { code: 'ai_insemination', name: 'AI Insemination', emoji: '🧬', is_active: true, sort_order: 1 },
  { code: 'bull_service', name: 'Bull Service', emoji: '🐂', is_active: true, sort_order: 2 },
  { code: 'preg_check_positive', name: 'Preg Check ✓', emoji: '✅', is_active: true, sort_order: 3 },
  { code: 'preg_check_negative', name: 'Preg Check ✗', emoji: '❌', is_active: true, sort_order: 4 },
  { code: 'calving', name: 'Calving', emoji: '🐮', is_active: true, sort_order: 5 },
  { code: 'abortion', name: 'Abortion', emoji: '⚠️', is_active: true, sort_order: 6 },
]

export const useBreedingEventTypesStore = defineStore('breedingEventTypes', () => {
  const types = ref([])
  const loading = ref(false)

  async function fetchAll() {
    loading.value = true
    try {
      const { data } = await api.get('/breeding-event-types')
      types.value = data
    } catch {
      if (types.value.length === 0) types.value = [...FALLBACK]
    } finally {
      loading.value = false
    }
  }

  async function update(code, payload) {
    const { data } = await api.patch(`/breeding-event-types/${code}`, payload)
    const idx = types.value.findIndex((t) => t.code === code)
    if (idx !== -1) types.value[idx] = data
    return data
  }

  const activeTypes = computed(() =>
    (types.value.length ? types.value : FALLBACK)
      .filter((t) => t.is_active)
      .sort((a, b) => a.sort_order - b.sort_order),
  )

  function getByCode(code) {
    const all = types.value.length ? types.value : FALLBACK
    return all.find((t) => t.code === code) ?? null
  }

  return { types, loading, fetchAll, update, activeTypes, getByCode }
})
