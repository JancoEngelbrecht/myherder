import { ref } from 'vue'
import { defineStore } from 'pinia'
import { v4 as uuidv4 } from 'uuid'
import api from '../services/api'
import db from '../db/indexedDB'
import { enqueue, dequeueByEntityId, isOfflineError } from '../services/syncManager'
import { extractApiError } from '../utils/apiError'
import { computeLifePhase } from './cows'

export const useTreatmentsStore = defineStore('treatments', () => {
  const treatments = ref([])
  const withdrawalCows = ref([])
  // Separate loading flags so fetchByCow and fetchWithdrawal don't conflict
  const loadingByCow = ref(false)
  const loadingWithdrawal = ref(false)
  const loadingOne = ref(false)
  const error = ref(null)

  async function fetchByCow(cowId) {
    loadingByCow.value = true
    error.value = null
    try {
      const { data } = await api.get('/treatments', { params: { cow_id: cowId } })
      treatments.value = [...treatments.value.filter((t) => t.cow_id !== cowId), ...data]
      await db.treatments.bulkPut(data)
      return data
    } catch (err) {
      const local = await db.treatments.where('cow_id').equals(cowId).toArray()
      treatments.value = [...treatments.value.filter((t) => t.cow_id !== cowId), ...local]
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
        (t) =>
          (t.withdrawal_end_milk && t.withdrawal_end_milk > now) ||
          (t.withdrawal_end_meat && t.withdrawal_end_meat > now)
      )

      const byCow = {}
      for (const t of active) {
        const existing = byCow[t.cow_id]
        if (!existing) {
          byCow[t.cow_id] = { ...t }
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
      // Resolve sex + life phase from cached cows so the frontend can split milk vs meat
      const cowIds = Object.keys(byCow)
      if (cowIds.length > 0) {
        const cows = await db.cows.bulkGet(cowIds)
        // Try to fetch breed types for accurate life phase thresholds
        const breedTypeIds = [
          ...new Set(cows.filter((c) => c?.breed_type_id).map((c) => c.breed_type_id)),
        ]
        const breedTypeMap = {}
        try {
          if (breedTypeIds.length) {
            const bts = await db.breedTypes.bulkGet(breedTypeIds)
            for (const bt of bts) {
              if (bt) breedTypeMap[bt.id] = bt
            }
          }
        } catch {
          // breed_types table may not exist offline — use defaults
        }
        for (const cow of cows) {
          if (cow && byCow[cow.id]) {
            byCow[cow.id].sex = cow.sex
            byCow[cow.id].tag_number = byCow[cow.id].tag_number || cow.tag_number
            byCow[cow.id].cow_name = byCow[cow.id].cow_name || cow.name
            byCow[cow.id].life_phase = computeLifePhase(
              cow,
              breedTypeMap[cow.breed_type_id] ?? null
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

  async function create(data) {
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

  async function fetchOne(id) {
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

  async function remove(id) {
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

  function getCowTreatments(cowId) {
    return treatments.value.filter((t) => t.cow_id === cowId)
  }

  function getById(id) {
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
