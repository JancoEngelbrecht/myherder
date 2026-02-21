import { ref } from 'vue'
import { defineStore } from 'pinia'
import api from '../services/api'
import db from '../db/indexedDB'

export const useMedicationsStore = defineStore('medications', () => {
  const medications = ref([])
  const total = ref(0)
  const loading = ref(false)
  const error = ref(null)

  async function fetchAll(includeInactive = false, pagination = {}) {
    loading.value = true
    error.value = null
    try {
      const params = { ...(includeInactive ? { all: 1 } : {}), ...pagination }
      const response = await api.get('/medications', { params })
      medications.value = response.data
      total.value = parseInt(response.headers['x-total-count'], 10) || 0
      await db.medications.bulkPut(response.data)
    } catch (err) {
      const local = await db.medications.toArray()
      medications.value = includeInactive ? local : local.filter((m) => m.is_active)
      error.value = err.message
    } finally {
      loading.value = false
    }
  }

  async function create(data) {
    const { data: created } = await api.post('/medications', data)
    medications.value.push(created)
    await db.medications.put(created)
    return created
  }

  async function update(id, data) {
    const { data: updated } = await api.put(`/medications/${id}`, data)
    const idx = medications.value.findIndex((m) => m.id === id)
    if (idx !== -1) medications.value[idx] = updated
    await db.medications.put(updated)
    return updated
  }

  async function deactivate(id) {
    const med = medications.value.find((m) => m.id === id)
    if (!med) return
    const payload = {
      name: med.name,
      active_ingredient: med.active_ingredient ?? null,
      withdrawal_milk_hours: med.withdrawal_milk_hours,
      withdrawal_meat_days: med.withdrawal_meat_days,
      default_dosage: med.default_dosage ?? null,
      unit: med.unit ?? null,
      notes: med.notes ?? null,
      is_active: false,
    }
    const { data: updated } = await api.put(`/medications/${id}`, payload)
    const idx = medications.value.findIndex((m) => m.id === id)
    if (idx !== -1) {
      medications.value[idx] = updated
      await db.medications.put({ ...updated })
    }
  }

  async function remove(id) {
    await api.delete(`/medications/${id}`)
    const idx = medications.value.findIndex((m) => m.id === id)
    if (idx !== -1) medications.value.splice(idx, 1)
    await db.medications.delete(id)
  }

  return { medications, total, loading, error, fetchAll, create, update, deactivate, remove }
})
