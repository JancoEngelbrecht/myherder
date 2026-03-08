import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { v4 as uuidv4 } from 'uuid'
import api from '../services/api'
import db from '../db/indexedDB'
import { enqueue, dequeueByEntityId, isOfflineError } from '../services/syncManager'

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
      await db.breedTypes.bulkPut(data)
    } catch {
      const local = await db.breedTypes.toArray()
      types.value = local.length ? local : [...FALLBACK]
    } finally {
      loading.value = false
    }
  }

  async function fetchActive() {
    loading.value = true
    try {
      const { data } = await api.get('/breed-types')
      types.value = data
      await db.breedTypes.bulkPut(data)
    } catch {
      const local = await db.breedTypes.toArray()
      types.value = local.length ? local.filter((t) => t.is_active) : [...FALLBACK]
    } finally {
      loading.value = false
    }
  }

  async function create(payload) {
    const now = new Date().toISOString()
    const localType = { id: uuidv4(), ...payload, updated_at: now, created_at: now }

    await db.breedTypes.put(localType)
    await enqueue('breedTypes', 'create', localType.id, localType)

    try {
      const { data } = await api.post('/breed-types', payload)
      await db.breedTypes.put(data)
      await dequeueByEntityId('breedTypes', localType.id)
      types.value.push(data)
      return data
    } catch (err) {
      if (isOfflineError(err)) {
        types.value.push(localType)
        return localType
      }
      await dequeueByEntityId('breedTypes', localType.id)
      await db.breedTypes.delete(localType.id)
      throw err
    }
  }

  async function update(id, payload) {
    const now = new Date().toISOString()
    const existing = await db.breedTypes.get(id)
    const localType = { ...existing, ...payload, id, updated_at: now }

    await db.breedTypes.put(localType)
    await enqueue('breedTypes', 'update', id, localType)

    try {
      const { data } = await api.put(`/breed-types/${id}`, payload)
      await db.breedTypes.put(data)
      await dequeueByEntityId('breedTypes', id)
      const idx = types.value.findIndex((t) => t.id === id)
      if (idx !== -1) types.value[idx] = data
      return data
    } catch (err) {
      if (isOfflineError(err)) {
        const idx = types.value.findIndex((t) => t.id === id)
        if (idx !== -1) types.value[idx] = localType
        return localType
      }
      await dequeueByEntityId('breedTypes', id)
      throw err
    }
  }

  async function remove(id) {
    const backup = types.value.find((t) => t.id === id)
    types.value = types.value.filter((t) => t.id !== id)
    await enqueue('breedTypes', 'delete', id, { id })

    try {
      await api.delete(`/breed-types/${id}`)
      await db.breedTypes.delete(id)
      await dequeueByEntityId('breedTypes', id)
    } catch (err) {
      if (isOfflineError(err)) return
      if (backup) types.value.push(backup)
      await dequeueByEntityId('breedTypes', id)
      throw err
    }
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

  /** True when real data has been loaded (not just fallbacks) */
  const hasData = computed(() => types.value.length > 0)

  return { types, loading, fetchAll, fetchActive, create, update, remove, activeTypes, getById, hasData }
})
