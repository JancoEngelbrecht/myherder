import { defineStore } from 'pinia'
import { ref } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import api from '../services/api'
import db from '../db/indexedDB'
import { enqueue, dequeueByEntityId, isOfflineError } from '../services/syncManager'
import { extractApiError } from '../utils/apiError'

/**
 * Compute life phase from age + sex, with optional breed-specific thresholds.
 *
 * For cattle returns: 'calf' | 'heifer' | 'cow' | 'young_bull' | 'bull'
 * For sheep returns:  'lamb' | 'ewe' | 'ram'
 *
 * @param animal - animal record with sex, dob, life_phase_override
 * @param breedType - breed type with calf_max_months, heifer_min_months, young_bull_min_months
 * @param speciesLifePhases - species.config.life_phases { female: [...], male: [...] }
 */
export function computeLifePhase(animal: any, breedType: any = null, speciesLifePhases: any = null): string {
  if (animal.life_phase_override) return animal.life_phase_override

  // Compute age once — used by both species-aware and legacy paths
  let ageMonths: number | null = null
  if (animal.dob) {
    const ageMs = Date.now() - new Date(animal.dob).getTime()
    ageMonths = ageMs / (1000 * 60 * 60 * 24 * 30.44)
  }

  // If species life phases provided, use species-aware logic
  if (speciesLifePhases) {
    const phases = animal.sex === 'male' ? speciesLifePhases.male : speciesLifePhases.female
    if (!phases?.length) return animal.sex === 'male' ? 'bull' : 'cow'
    if (ageMonths === null) return phases[phases.length - 1].code // no dob = adult

    // Override phase thresholds with breed-specific values when available
    const resolvedPhases = phases.map((phase: any) => {
      const resolved = { ...phase }
      if (breedType) {
        if (phase.code === 'calf' || phase.code === 'lamb') {
          resolved.maxMonths = breedType.calf_max_months ?? phase.maxMonths
        }
        if (phase.code === 'heifer' || phase.code === 'ewe') {
          resolved.minMonths = breedType.heifer_min_months ?? phase.minMonths
        }
        if (phase.code === 'young_bull' || phase.code === 'ram') {
          resolved.minMonths = breedType.young_bull_min_months ?? phase.minMonths
        }
      }
      return resolved
    })

    // Walk through phases — return the first one whose age criteria match
    for (let i = 0; i < resolvedPhases.length; i++) {
      const phase = resolvedPhases[i]
      if (phase.maxMonths != null && ageMonths < phase.maxMonths) return phase.code
      if (phase.minMonths != null && phase.maxMonths == null) {
        const next = resolvedPhases[i + 1]
        if (!next) return phase.code // last phase
        if (next.minMonths != null && ageMonths < next.minMonths) return phase.code
      }
    }
    return resolvedPhases[resolvedPhases.length - 1].code
  }

  // Legacy cattle-only fallback (no species config)
  if (ageMonths === null) return animal.sex === 'male' ? 'bull' : 'cow'

  const calfMax = breedType?.calf_max_months ?? 6
  const heiferMin = breedType?.heifer_min_months ?? 15
  const youngBullMin = breedType?.young_bull_min_months ?? 15

  if (animal.sex === 'male') {
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
 * Compute whether an animal is ready to breed.
 * Male → false. Pregnant → false. Based on age (heifer) or days since last calving (cow).
 */
export function computeIsReadyToBreed(animal: any, breedType: any = null, lastCalvingDate: string | null = null): boolean {
  if (animal.sex === 'male') return false
  if (animal.status === 'pregnant') return false
  if (!animal.dob) return false

  const heiferMin = breedType?.heifer_min_months ?? 15
  const vwd = breedType?.voluntary_waiting_days ?? 45

  const ageMs = Date.now() - new Date(animal.dob).getTime()
  const ageMonths = ageMs / (1000 * 60 * 60 * 24 * 30.44)

  if (!lastCalvingDate) {
    // Heifer: ready if old enough
    return ageMonths >= heiferMin
  }
  // Animal with calving history: ready if past voluntary waiting period
  const daysSinceCalving =
    (Date.now() - new Date(lastCalvingDate).getTime()) / (1000 * 60 * 60 * 24)
  return daysSinceCalving >= vwd
}

export const useAnimalsStore = defineStore('animals', () => {
  const animals = ref<any[]>([])
  const total = ref(0)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchAll(params: Record<string, any> = {}) {
    loading.value = true
    error.value = null
    try {
      if (Object.keys(params).length > 0) {
        // Filtered/paginated fetch — don't mirror to IndexedDB
        const response = await api.get('/animals', { params })
        animals.value = response.data
        total.value = parseInt(response.headers['x-total-count'], 10) || 0
      } else {
        // Full fetch — mirror to IndexedDB
        const { data } = await api.get('/animals')
        await db.animals.bulkPut(data)
        animals.value = data
      }
    } catch (err) {
      if (isOfflineError(err)) {
        const local = await db.animals.toArray()
        animals.value = local
      } else {
        error.value = extractApiError(err)
      }
    } finally {
      loading.value = false
    }
  }

  async function fetchOne(id: string) {
    try {
      const { data: animal } = await api.get(`/animals/${id}`)
      await db.animals.put(animal)
      return animal
    } catch (err) {
      const local = await db.animals.get(id)
      if (local) return local
      throw err
    }
  }

  async function create(data: any) {
    const now = new Date().toISOString()
    const localAnimal = { id: uuidv4(), ...data, updated_at: now, created_at: now }

    await db.animals.put(localAnimal)
    await enqueue('animals', 'create', localAnimal.id, localAnimal)

    try {
      const { data: serverAnimal } = await api.post('/animals', data)
      await db.animals.delete(localAnimal.id)
      await db.animals.put(serverAnimal)
      await dequeueByEntityId('animals', localAnimal.id)
      animals.value.unshift(serverAnimal)
      return serverAnimal
    } catch (err) {
      if (isOfflineError(err)) {
        animals.value.unshift(localAnimal)
        return localAnimal
      }
      await dequeueByEntityId('animals', localAnimal.id)
      await db.animals.delete(localAnimal.id)
      throw err
    }
  }

  async function update(id: string, data: any) {
    const now = new Date().toISOString()
    const existing = await db.animals.get(id)
    const localAnimal = { ...existing, ...data, id, updated_at: now }

    await db.animals.put(localAnimal)
    await enqueue('animals', 'update', id, localAnimal)

    try {
      const { data: serverAnimal } = await api.put(`/animals/${id}`, data)
      await db.animals.put(serverAnimal)
      await dequeueByEntityId('animals', id)
      const idx = animals.value.findIndex((a) => a.id === String(id))
      if (idx !== -1) animals.value[idx] = serverAnimal
      return serverAnimal
    } catch (err) {
      if (isOfflineError(err)) {
        const idx = animals.value.findIndex((a) => a.id === String(id))
        if (idx !== -1) animals.value[idx] = localAnimal
        return localAnimal
      }
      await dequeueByEntityId('animals', id)
      throw err
    }
  }

  async function remove(id: string) {
    const backup = animals.value.find((a) => a.id === id)
    animals.value = animals.value.filter((a) => a.id !== id)
    await enqueue('animals', 'delete', id, { id })

    try {
      await api.delete(`/animals/${id}`)
      await db.animals.delete(id)
      await dequeueByEntityId('animals', id)
    } catch (err) {
      if (isOfflineError(err)) return
      if (backup) animals.value.unshift(backup)
      await dequeueByEntityId('animals', id)
      throw err
    }
  }

  return { animals, total, loading, error, fetchAll, fetchOne, create, update, remove }
})
