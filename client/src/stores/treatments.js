import { ref } from 'vue'
import { defineStore } from 'pinia'
import api from '../services/api'
import db from '../db/indexedDB'

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
      treatments.value = [
        ...treatments.value.filter((t) => t.cow_id !== cowId),
        ...data,
      ]
      await db.treatments.bulkPut(data)
      return data
    } catch (err) {
      const local = await db.treatments.where('cow_id').equals(cowId).toArray()
      treatments.value = [...treatments.value.filter((t) => t.cow_id !== cowId), ...local]
      error.value = err.message
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
      // Offline fallback: replicate server grouping (one entry per cow, latest withdrawal_end_milk)
      const now = new Date().toISOString()
      const active = await db.treatments
        .where('withdrawal_end_milk')
        .above(now)
        .toArray()

      const byCow = {}
      for (const t of active) {
        if (!byCow[t.cow_id] || t.withdrawal_end_milk > byCow[t.cow_id].withdrawal_end_milk) {
          byCow[t.cow_id] = t
        }
      }
      withdrawalCows.value = Object.values(byCow)
      error.value = err.message
      return withdrawalCows.value
    } finally {
      loadingWithdrawal.value = false
    }
  }

  async function create(data) {
    const { data: created } = await api.post('/treatments', data)
    treatments.value.unshift(created)
    await db.treatments.put(created)
    return created
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
      error.value = err.message
      throw err
    } finally {
      loadingOne.value = false
    }
  }

  async function remove(id) {
    await api.delete(`/treatments/${id}`)
    treatments.value = treatments.value.filter((t) => t.id !== id)
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
