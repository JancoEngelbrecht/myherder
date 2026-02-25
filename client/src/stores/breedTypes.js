import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import api from '../services/api'

// Last-resort fallback for offline first-load before any DB fetch succeeds.
const FALLBACK = [
  { id: '_fb_holstein', code: 'holstein', name: 'Holstein', heat_cycle_days: 21, gestation_days: 280, preg_check_days: 35, voluntary_waiting_days: 50, dry_off_days: 60, calf_max_months: 6, heifer_min_months: 15, young_bull_min_months: 15, is_active: true, sort_order: 0 },
  { id: '_fb_jersey', code: 'jersey', name: 'Jersey', heat_cycle_days: 21, gestation_days: 279, preg_check_days: 35, voluntary_waiting_days: 45, dry_off_days: 60, calf_max_months: 6, heifer_min_months: 14, young_bull_min_months: 15, is_active: true, sort_order: 1 },
  { id: '_fb_ayrshire', code: 'ayrshire', name: 'Ayrshire', heat_cycle_days: 21, gestation_days: 279, preg_check_days: 35, voluntary_waiting_days: 45, dry_off_days: 60, calf_max_months: 6, heifer_min_months: 15, young_bull_min_months: 15, is_active: true, sort_order: 2 },
  { id: '_fb_nguni', code: 'nguni', name: 'Nguni', heat_cycle_days: 21, gestation_days: 285, preg_check_days: 35, voluntary_waiting_days: 60, dry_off_days: 60, calf_max_months: 8, heifer_min_months: 18, young_bull_min_months: 15, is_active: true, sort_order: 3 },
  { id: '_fb_brahman', code: 'brahman', name: 'Brahman', heat_cycle_days: 21, gestation_days: 292, preg_check_days: 35, voluntary_waiting_days: 60, dry_off_days: 60, calf_max_months: 8, heifer_min_months: 24, young_bull_min_months: 15, is_active: true, sort_order: 4 },
]

export const useBreedTypesStore = defineStore('breedTypes', () => {
  const types = ref([])
  const loading = ref(false)

  async function fetchAll() {
    loading.value = true
    try {
      const { data } = await api.get('/breed-types?all=1')
      types.value = data
    } catch {
      if (types.value.length === 0) types.value = [...FALLBACK]
    } finally {
      loading.value = false
    }
  }

  async function fetchActive() {
    loading.value = true
    try {
      const { data } = await api.get('/breed-types')
      types.value = data
    } catch {
      if (types.value.length === 0) types.value = [...FALLBACK]
    } finally {
      loading.value = false
    }
  }

  async function create(payload) {
    const { data } = await api.post('/breed-types', payload)
    types.value.push(data)
    return data
  }

  async function update(id, payload) {
    const { data } = await api.put(`/breed-types/${id}`, payload)
    const idx = types.value.findIndex((t) => t.id === id)
    if (idx !== -1) types.value[idx] = data
    return data
  }

  async function remove(id) {
    await api.delete(`/breed-types/${id}`)
    types.value = types.value.filter((t) => t.id !== id)
  }

  const activeTypes = computed(() =>
    (types.value.length ? types.value : FALLBACK)
      .filter((t) => t.is_active)
      .sort((a, b) => a.sort_order - b.sort_order),
  )

  function getById(id) {
    const all = types.value.length ? types.value : FALLBACK
    return all.find((t) => t.id === id) ?? null
  }

  return { types, loading, fetchAll, fetchActive, create, update, remove, activeTypes, getById }
})
