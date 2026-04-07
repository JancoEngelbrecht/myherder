import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import api from '../services/api'
import db from '../db/indexedDB'
import { enqueue, dequeueByEntityId, isOfflineError } from '../services/syncManager'

export const useIssueTypesStore = defineStore('issueTypes', () => {
  const issueTypes = ref<any[]>([])
  const total = ref(0)
  const loading = ref(false)

  const activeTypes = computed(() => issueTypes.value.filter((t) => t.is_active))
  const hasData = computed(() => issueTypes.value.length > 0)

  function getByCode(code: string): any {
    return issueTypes.value.find((t) => t.code === code) || null
  }

  async function fetchAll(includeInactive = false, pagination: Record<string, any> = {}) {
    loading.value = true
    try {
      const params = { ...(includeInactive ? { all: '1' } : {}), ...pagination }
      const res = await api.get('/issue-types', { params })
      issueTypes.value = res.data
      total.value = parseInt(res.headers['x-total-count'], 10) || 0
      await db.issueTypes.bulkPut(res.data)
    } catch {
      const local = await db.issueTypes.toArray()
      issueTypes.value = includeInactive ? local : local.filter((t) => t.is_active)
    } finally {
      loading.value = false
    }
  }

  async function create(data: any) {
    const now = new Date().toISOString()
    const localType = { id: uuidv4(), ...data, updated_at: now, created_at: now }

    await db.issueTypes.put(localType)
    await enqueue('issueTypes', 'create', localType.id, localType)

    try {
      const res = await api.post('/issue-types', data)
      await db.issueTypes.put(res.data)
      await dequeueByEntityId('issueTypes', localType.id)
      issueTypes.value.push(res.data)
      return res.data
    } catch (err) {
      if (isOfflineError(err)) {
        issueTypes.value.push(localType)
        return localType
      }
      await dequeueByEntityId('issueTypes', localType.id)
      await db.issueTypes.delete(localType.id)
      throw err
    }
  }

  async function update(id: string, data: any) {
    const now = new Date().toISOString()
    const existing = await db.issueTypes.get(id)
    const localType = { ...existing, ...data, id, updated_at: now }

    await db.issueTypes.put(localType)
    await enqueue('issueTypes', 'update', id, localType)

    try {
      const res = await api.put(`/issue-types/${id}`, data)
      await db.issueTypes.put(res.data)
      await dequeueByEntityId('issueTypes', id)
      const idx = issueTypes.value.findIndex((t) => t.id === id)
      if (idx !== -1) issueTypes.value[idx] = res.data
      return res.data
    } catch (err) {
      if (isOfflineError(err)) {
        const idx = issueTypes.value.findIndex((t) => t.id === id)
        if (idx !== -1) issueTypes.value[idx] = localType
        return localType
      }
      await dequeueByEntityId('issueTypes', id)
      throw err
    }
  }

  async function remove(id: string) {
    const backup = issueTypes.value.find((t) => t.id === id)
    issueTypes.value = issueTypes.value.filter((t) => t.id !== id)
    await enqueue('issueTypes', 'delete', id, { id })

    try {
      await api.delete(`/issue-types/${id}`)
      await db.issueTypes.delete(id)
      await dequeueByEntityId('issueTypes', id)
    } catch (err) {
      if (isOfflineError(err)) return
      if (backup) issueTypes.value.push(backup)
      await dequeueByEntityId('issueTypes', id)
      throw err
    }
  }

  return {
    issueTypes,
    total,
    loading,
    activeTypes,
    hasData,
    getByCode,
    fetchAll,
    create,
    update,
    remove,
  }
})
