import { defineStore } from 'pinia'
import { ref } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import api from '../services/api.js'
import db from '../db/indexedDB.js'
import { enqueue, dequeueByEntityId, isOfflineError } from '../services/syncManager.js'

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

  async function fetchAll(params = {}) {
    loading.value = true
    error.value = null
    try {
      if (Object.keys(params).length > 0) {
        // Filtered/paginated fetch — don't mirror to IndexedDB
        const response = await api.get('/cows', { params })
        cows.value = response.data
        total.value = parseInt(response.headers['x-total-count'], 10) || 0
      } else {
        // Full fetch — mirror to IndexedDB
        const { data } = await api.get('/cows')
        await db.cows.bulkPut(data)
        cows.value = data
      }
    } catch (err) {
      if (isOfflineError(err)) {
        const local = await db.cows.toArray()
        cows.value = local
      } else {
        error.value = err.response?.data?.error || 'Failed to load cows'
      }
    } finally {
      loading.value = false
    }
  }

  async function fetchOne(id) {
    try {
      const { data: cow } = await api.get(`/cows/${id}`)
      await db.cows.put(cow)
      return cow
    } catch (err) {
      const local = await db.cows.get(id)
      if (local) return local
      throw err
    }
  }

  async function create(data) {
    const now = new Date().toISOString()
    const localCow = { id: uuidv4(), ...data, updated_at: now, created_at: now }

    await db.cows.put(localCow)
    await enqueue('cows', 'create', localCow.id, localCow)

    try {
      const { data: serverCow } = await api.post('/cows', data)
      await db.cows.put(serverCow)
      await dequeueByEntityId('cows', localCow.id)
      cows.value.unshift(serverCow)
      return serverCow
    } catch (err) {
      if (isOfflineError(err)) {
        cows.value.unshift(localCow)
        return localCow
      }
      await dequeueByEntityId('cows', localCow.id)
      await db.cows.delete(localCow.id)
      throw err
    }
  }

  async function update(id, data) {
    const now = new Date().toISOString()
    const existing = await db.cows.get(id)
    const localCow = { ...existing, ...data, id, updated_at: now }

    await db.cows.put(localCow)
    await enqueue('cows', 'update', id, localCow)

    try {
      const { data: serverCow } = await api.put(`/cows/${id}`, data)
      await db.cows.put(serverCow)
      await dequeueByEntityId('cows', id)
      const idx = cows.value.findIndex((c) => c.id === String(id))
      if (idx !== -1) cows.value[idx] = serverCow
      return serverCow
    } catch (err) {
      if (isOfflineError(err)) {
        const idx = cows.value.findIndex((c) => c.id === String(id))
        if (idx !== -1) cows.value[idx] = localCow
        return localCow
      }
      await dequeueByEntityId('cows', id)
      throw err
    }
  }

  async function remove(id) {
    const backup = cows.value.find((c) => c.id === id)
    cows.value = cows.value.filter((c) => c.id !== id)
    await enqueue('cows', 'delete', id, { id })

    try {
      await api.delete(`/cows/${id}`)
      await db.cows.delete(id)
      await dequeueByEntityId('cows', id)
    } catch (err) {
      if (isOfflineError(err)) return
      if (backup) cows.value.unshift(backup)
      await dequeueByEntityId('cows', id)
      throw err
    }
  }

  return { cows, total, loading, error, fetchAll, fetchOne, create, update, remove }
})
