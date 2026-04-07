import { ref } from 'vue'
import { defineStore } from 'pinia'
import { v4 as uuidv4 } from 'uuid'
import api from '../services/api'
import db from '../db/indexedDB'
import { enqueue, dequeueByEntityId, isOfflineError } from '../services/syncManager'
import { extractApiError } from '../utils/apiError'
import { computeLifePhase } from './animals'

export const useTreatmentsStore = defineStore('treatments', () => {
  const treatments = ref<any[]>([])
  const withdrawalCows = ref<any[]>([])
  // Separate loading flags so fetchByCow and fetchWithdrawal don't conflict
  const loadingByCow = ref(false)
  const loadingWithdrawal = ref(false)
  const loadingOne = ref(false)
  const error = ref<string | null>(null)

  async function fetchByCow(cowId: string) {
    loadingByCow.value = true
    error.value = null
    try {
      const { data } = await api.get('/treatments', { params: { animal_id: cowId } })
      treatments.value = [...treatments.value.filter((t) => t.animal_id !== cowId), ...data]
      await db.treatments.bulkPut(data)
      return data
    } catch (err) {
      const local = await db.treatments.where('animal_id').equals(cowId).toArray()
      treatments.value = [...treatments.value.filter((t) => t.animal_id !== cowId), ...local]
      error.value = extractApiError(err)
      return local
    } finally {
      loadingByCow.value = false
    }
  }

  async function fetchWithdrawal() {
    loadingWithdrawal.value = true
    error.value = null
    try {
      const { data } = await api.get('/treatments/withdrawal')
      withdrawalCows.value = data
      return data
    } catch (err) {
      // Offline fallback: replicate server grouping (one entry per cow, latest milk or meat withdrawal)
      const now = new Date().toISOString()
      const all = await db.treatments.toArray()
      const active = all.filter(
        (t: any) =>
          (t.withdrawal_end_milk && t.withdrawal_end_milk > now) ||
          (t.withdrawal_end_meat && t.withdrawal_end_meat > now)
      )

      const byCow: Record<string, any> = {}
      for (const t of active) {
        const existing = byCow[t.animal_id]
        if (!existing) {
          byCow[t.animal_id] = { ...t }
          continue
        }
        if (
          t.withdrawal_end_milk &&
          (!existing.withdrawal_end_milk || t.withdrawal_end_milk > existing.withdrawal_end_milk)
        ) {
          existing.withdrawal_end_milk = t.withdrawal_end_milk
          existing.medication_name = t.medication_name
          existing.treatment_date = t.treatment_date
        }
        if (
          t.withdrawal_end_meat &&
          (!existing.withdrawal_end_meat || t.withdrawal_end_meat > existing.withdrawal_end_meat)
        ) {
          existing.withdrawal_end_meat = t.withdrawal_end_meat
        }
      }
      // Resolve sex + life phase from cached animals so the frontend can split milk vs meat
      const animalIds = Object.keys(byCow)
      if (animalIds.length > 0) {
        const animalList = await db.animals.bulkGet(animalIds)
        // Try to fetch breed types for accurate life phase thresholds
        const breedTypeIds = [
          ...new Set(animalList.filter((a: any) => a?.breed_type_id).map((a: any) => a.breed_type_id)),
        ]
        const breedTypeMap: Record<string, any> = {}
        try {
          if (breedTypeIds.length) {
            const bts = await db.breedTypes.bulkGet(breedTypeIds as string[])
            for (const bt of bts) {
              if (bt) breedTypeMap[bt.id] = bt
            }
          }
        } catch {
          // breed_types table may not exist offline — use defaults
        }
        for (const animal of animalList) {
          if (animal && byCow[animal.id]) {
            byCow[animal.id].sex = animal.sex
            byCow[animal.id].tag_number = byCow[animal.id].tag_number || animal.tag_number
            byCow[animal.id].animal_name = byCow[animal.id].animal_name || animal.name
            byCow[animal.id].life_phase = computeLifePhase(
              animal,
              breedTypeMap[animal.breed_type_id] ?? null
            )
          }
        }
      }
      // Mirror server logic: null out milk withdrawal for non-milking life phases
      // Must match NON_MILKING_PHASES in server/helpers/lifePhase.js
      const NON_MILKING_PHASES = new Set(['heifer', 'calf', 'lamb'])
      const nowMs = Date.now()
      for (const id of Object.keys(byCow)) {
        const entry = byCow[id]
        if (entry.sex === 'male' || NON_MILKING_PHASES.has(entry.life_phase)) {
          entry.withdrawal_end_milk = null
        }
        // Drop entries with no remaining active withdrawal
        const hasMilk =
          entry.withdrawal_end_milk && new Date(entry.withdrawal_end_milk).getTime() > nowMs
        const hasMeat =
          entry.withdrawal_end_meat && new Date(entry.withdrawal_end_meat).getTime() > nowMs
        if (!hasMilk && !hasMeat) delete byCow[id]
      }
      withdrawalCows.value = Object.values(byCow)
      error.value = extractApiError(err)
      return withdrawalCows.value
    } finally {
      loadingWithdrawal.value = false
    }
  }

  async function create(data: any) {
    const now = new Date().toISOString()
    const localTreatment = { id: uuidv4(), ...data, updated_at: now, created_at: now }

    await db.treatments.put(localTreatment)
    await enqueue('treatments', 'create', localTreatment.id, localTreatment)

    try {
      const { data: created } = await api.post('/treatments', data)
      await db.treatments.put(created)
      await dequeueByEntityId('treatments', localTreatment.id)
      treatments.value.unshift(created)
      return created
    } catch (err) {
      if (isOfflineError(err)) {
        treatments.value.unshift(localTreatment)
        return localTreatment
      }
      await dequeueByEntityId('treatments', localTreatment.id)
      await db.treatments.delete(localTreatment.id)
      throw err
    }
  }

  async function fetchOne(id: string) {
    loadingOne.value = true
    error.value = null
    try {
      const { data } = await api.get(`/treatments/${id}`)
      const idx = treatments.value.findIndex((t) => t.id === id)
      if (idx >= 0) treatments.value[idx] = data
      else treatments.value.push(data)
      return data
    } catch (err) {
      // Fall back to cached data if available
      const cached = treatments.value.find((t) => t.id === id)
      if (cached) return cached
      error.value = extractApiError(err)
      throw err
    } finally {
      loadingOne.value = false
    }
  }

  async function remove(id: string) {
    const backup = treatments.value.find((t) => t.id === id)
    treatments.value = treatments.value.filter((t) => t.id !== id)
    await enqueue('treatments', 'delete', id, { id })

    try {
      await api.delete(`/treatments/${id}`)
      await db.treatments.delete(id)
      await dequeueByEntityId('treatments', id)
    } catch (err) {
      if (isOfflineError(err)) return
      if (backup) treatments.value.unshift(backup)
      await dequeueByEntityId('treatments', id)
      throw err
    }
  }

  function getCowTreatments(cowId: string): any[] {
    return treatments.value.filter((t) => t.animal_id === cowId)
  }

  function getById(id: string): any {
    return treatments.value.find((t) => t.id === id) ?? null
  }

  return {
    treatments,
    withdrawalCows,
    loadingByCow,
    loadingWithdrawal,
    loadingOne,
    error,
    fetchByCow,
    fetchWithdrawal,
    fetchOne,
    remove,
    create,
    getCowTreatments,
    getById,
  }
})
