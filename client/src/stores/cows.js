import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../services/api.js'
import * as sync from '../services/syncManager.js'

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
