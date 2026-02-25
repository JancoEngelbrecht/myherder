import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../services/api.js'
import * as sync from '../services/syncManager.js'

/**
 * Compute life phase from age + sex, with optional breed-specific thresholds.
 * Returns: 'calf' | 'heifer' | 'cow' | 'young_bull' | 'bull'
 */
export function computeLifePhase(cow, breedType = null) {
  if (cow.life_phase_override) return cow.life_phase_override
  if (!cow.dob) return cow.sex === 'male' ? 'bull' : 'cow'

  const ageMs = Date.now() - new Date(cow.dob).getTime()
  const ageMonths = ageMs / (1000 * 60 * 60 * 24 * 30.44)

  const calfMax = breedType?.calf_max_months ?? 6
  const heiferMin = breedType?.heifer_min_months ?? 15
  const youngBullMin = breedType?.young_bull_min_months ?? 15

  if (cow.sex === 'male') {
    if (ageMonths < calfMax) return 'calf'
    if (ageMonths < youngBullMin) return 'young_bull'
    return 'bull'
  }
  // female
  if (ageMonths < calfMax) return 'calf'
  if (ageMonths < heiferMin) return 'heifer'
  return 'cow'
}

/**
 * Compute whether a cow is ready to breed.
 * Male → false. Pregnant → false. Based on age (heifer) or days since last calving (cow).
 */
export function computeIsReadyToBreed(cow, breedType = null, lastCalvingDate = null) {
  if (cow.sex === 'male') return false
  if (cow.status === 'pregnant') return false
  if (!cow.dob) return false

  const heiferMin = breedType?.heifer_min_months ?? 15
  const vwd = breedType?.voluntary_waiting_days ?? 45

  const ageMs = Date.now() - new Date(cow.dob).getTime()
  const ageMonths = ageMs / (1000 * 60 * 60 * 24 * 30.44)

  if (!lastCalvingDate) {
    // Heifer: ready if old enough
    return ageMonths >= heiferMin
  }
  // Cow with calving history: ready if past voluntary waiting period
  const daysSinceCalving = (Date.now() - new Date(lastCalvingDate).getTime()) / (1000 * 60 * 60 * 24)
  return daysSinceCalving >= vwd
}

export const useCowsStore = defineStore('cows', () => {
  const cows = ref([])
  const total = ref(0)
  const loading = ref(false)
  const error = ref(null)
  const syncStatus = ref('synced') // 'synced' | 'syncing' | 'offline'

  async function fetchAll(params = {}) {
    loading.value = true
    syncStatus.value = 'syncing'
    error.value = null
    try {
      if (Object.keys(params).length > 0) {
        // Filtered/paginated fetch — don't mirror to IndexedDB
        const response = await api.get('/cows', { params })
        cows.value = response.data
        total.value = parseInt(response.headers['x-total-count'], 10) || 0
      } else {
        // Full fetch — mirror to IndexedDB
        cows.value = await sync.pullCows()
      }
      syncStatus.value = 'synced'
    } catch (err) {
      if (sync.isOfflineError(err)) {
        const local = await sync.getLocalCows()
        cows.value = local
        syncStatus.value = 'offline'
      } else {
        error.value = err.response?.data?.error || 'Failed to load cows'
        syncStatus.value = 'offline'
      }
    } finally {
      loading.value = false
    }
  }

  async function fetchOne(id) {
    try {
      return await sync.pullOneCow(id)
    } catch (err) {
      const local = await sync.getLocalCow(id)
      if (local) return local
      throw err
    }
  }

  async function create(data) {
    const response = await api.post('/cows', data)
    const cow = response.data
    cows.value.unshift(cow)
    await sync.saveCowLocally(cow)
    return cow
  }

  async function update(id, data) {
    const response = await api.put(`/cows/${id}`, data)
    const cow = response.data
    const idx = cows.value.findIndex(c => c.id === String(id))
    if (idx !== -1) cows.value[idx] = cow
    await sync.saveCowLocally(cow)
    return cow
  }

  async function remove(id) {
    await api.delete(`/cows/${id}`)
    cows.value = cows.value.filter(c => c.id !== id)
    await sync.removeCowLocally(id)
  }

  return { cows, total, loading, error, syncStatus, fetchAll, fetchOne, create, update, remove }
})
