import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../services/api'

export const useIssueTypesStore = defineStore('issueTypes', () => {
  const issueTypes = ref([])
  const total = ref(0)
  const loading = ref(false)

  const activeTypes = computed(() => issueTypes.value.filter((t) => t.is_active))

  function getByCode(code) {
    return issueTypes.value.find((t) => t.code === code) || null
  }

  async function fetchAll(includeInactive = false, pagination = {}) {
    loading.value = true
    try {
      const params = { ...(includeInactive ? { all: '1' } : {}), ...pagination }
      const res = await api.get('/issue-types', { params })
      issueTypes.value = res.data
      total.value = parseInt(res.headers['x-total-count'], 10) || 0
    } finally {
      loading.value = false
    }
  }

  async function create(data) {
    const res = await api.post('/issue-types', data)
    issueTypes.value.push(res.data)
    return res.data
  }

  async function update(id, data) {
    const res = await api.put(`/issue-types/${id}`, data)
    const idx = issueTypes.value.findIndex((t) => t.id === id)
    if (idx !== -1) issueTypes.value[idx] = res.data
    return res.data
  }

  async function remove(id) {
    await api.delete(`/issue-types/${id}`)
    issueTypes.value = issueTypes.value.filter((t) => t.id !== id)
  }

  return { issueTypes, total, loading, activeTypes, getByCode, fetchAll, create, update, remove }
})
