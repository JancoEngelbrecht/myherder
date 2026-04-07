import { ref } from 'vue'
import { defineStore } from 'pinia'
import { v4 as uuidv4 } from 'uuid'
import api from '../services/api'
import db from '../db/indexedDB'
import { enqueue, dequeueByEntityId, isOfflineError } from '../services/syncManager'
import { extractApiError } from '../utils/apiError'

export const useMedicationsStore = defineStore('medications', () => {
  const medications = ref<any[]>([])
  const total = ref(0)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchAll(includeInactive = false, pagination: Record<string, any> = {}) {
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
      error.value = extractApiError(err)
    } finally {
      loading.value = false
    }
  }

  async function create(data: any) {
    const now = new Date().toISOString()
    const localMed = { id: uuidv4(), ...data, updated_at: now, created_at: now }

    await db.medications.put(localMed)
    await enqueue('medications', 'create', localMed.id, localMed)

    try {
      const { data: created } = await api.post('/medications', data)
      await db.medications.put(created)
      await dequeueByEntityId('medications', localMed.id)
      medications.value.push(created)
      return created
    } catch (err) {
      if (isOfflineError(err)) {
        medications.value.push(localMed)
        return localMed
      }
      await dequeueByEntityId('medications', localMed.id)
      await db.medications.delete(localMed.id)
      throw err
    }
  }

  async function update(id: string, data: any) {
    const now = new Date().toISOString()
    const existing = await db.medications.get(id)
    const localMed = { ...existing, ...data, id, updated_at: now }

    await db.medications.put(localMed)
    await enqueue('medications', 'update', id, localMed)

    try {
      const { data: updated } = await api.put(`/medications/${id}`, data)
      await db.medications.put(updated)
      await dequeueByEntityId('medications', id)
      const idx = medications.value.findIndex((m) => m.id === id)
      if (idx !== -1) medications.value[idx] = updated
      return updated
    } catch (err) {
      if (isOfflineError(err)) {
        const idx = medications.value.findIndex((m) => m.id === id)
        if (idx !== -1) medications.value[idx] = localMed
        return localMed
      }
      await dequeueByEntityId('medications', id)
      throw err
    }
  }

  async function deactivate(id: string) {
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
    return update(id, payload)
  }

  async function remove(id: string) {
    const backup = medications.value.find((m) => m.id === id)
    medications.value = medications.value.filter((m) => m.id !== id)
    await enqueue('medications', 'delete', id, { id })

    try {
      await api.delete(`/medications/${id}`)
      await db.medications.delete(id)
      await dequeueByEntityId('medications', id)
    } catch (err) {
      if (isOfflineError(err)) return
      if (backup) medications.value.push(backup)
      await dequeueByEntityId('medications', id)
      throw err
    }
  }

  return { medications, total, loading, error, fetchAll, create, update, deactivate, remove }
})
