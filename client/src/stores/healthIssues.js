import { ref } from 'vue'
import { defineStore } from 'pinia'
import { v4 as uuidv4 } from 'uuid'
import api from '../services/api'
import db from '../db/indexedDB'
import { enqueue, dequeueByEntityId, isOfflineError } from '../services/syncManager'
import { extractApiError } from '../utils/apiError'

export const useHealthIssuesStore = defineStore('healthIssues', () => {
  const issues = ref([])
  const allIssues = ref([])
  const allIssuesTotal = ref(0)
  const comments = ref({}) // { [issueId]: Comment[] }
  const loadingByCow = ref(false)
  const loadingOne = ref(false)
  const loadingAll = ref(false)
  const error = ref(null)

  async function fetchByCow(cowId) {
    loadingByCow.value = true
    error.value = null
    try {
      const { data } = await api.get('/health-issues', { params: { cow_id: cowId } })
      issues.value = [
        ...issues.value.filter((i) => i.cow_id !== cowId),
        ...data,
      ]
      await db.healthIssues.bulkPut(data)
      return data
    } catch (err) {
      const local = await db.healthIssues.where('cow_id').equals(cowId).toArray()
      issues.value = [...issues.value.filter((i) => i.cow_id !== cowId), ...local]
      error.value = extractApiError(err)
      return local
    } finally {
      loadingByCow.value = false
    }
  }

  async function fetchOne(id) {
    loadingOne.value = true
    error.value = null
    try {
      const { data } = await api.get(`/health-issues/${id}`)
      const idx = issues.value.findIndex((i) => i.id === id)
      if (idx >= 0) issues.value[idx] = data
      else issues.value.push(data)
      return data
    } catch (err) {
      const cached = issues.value.find((i) => i.id === id)
      if (cached) return cached
      error.value = extractApiError(err)
      throw err
    } finally {
      loadingOne.value = false
    }
  }

  async function create(data) {
    const now = new Date().toISOString()
    const plain = structuredClone(data)
    const localIssue = { id: uuidv4(), ...plain, status: plain.status || 'open', updated_at: now, created_at: now }

    await db.healthIssues.put(localIssue)
    await enqueue('healthIssues', 'create', localIssue.id, localIssue)

    try {
      const { data: created } = await api.post('/health-issues', data)
      await db.healthIssues.put(created)
      await dequeueByEntityId('healthIssues', localIssue.id)
      issues.value.unshift(created)
      return created
    } catch (err) {
      if (isOfflineError(err)) {
        issues.value.unshift(localIssue)
        return localIssue
      }
      await dequeueByEntityId('healthIssues', localIssue.id)
      await db.healthIssues.delete(localIssue.id)
      throw err
    }
  }

  async function updateStatus(id, status) {
    const now = new Date().toISOString()
    const existing = await db.healthIssues.get(id)
    const localIssue = { ...existing, id, status, updated_at: now }

    await db.healthIssues.put(localIssue)
    await enqueue('healthIssues', 'update', id, localIssue)

    try {
      const { data: updated } = await api.patch(`/health-issues/${id}/status`, { status })
      await db.healthIssues.put(updated)
      await dequeueByEntityId('healthIssues', id)
      const idx = issues.value.findIndex((i) => i.id === id)
      if (idx >= 0) issues.value[idx] = updated
      return updated
    } catch (err) {
      if (isOfflineError(err)) {
        const idx = issues.value.findIndex((i) => i.id === id)
        if (idx >= 0) issues.value[idx] = localIssue
        return localIssue
      }
      await dequeueByEntityId('healthIssues', id)
      throw err
    }
  }

  async function remove(id) {
    const backup = issues.value.find((i) => i.id === id)
    issues.value = issues.value.filter((i) => i.id !== id)
    await enqueue('healthIssues', 'delete', id, { id })

    try {
      await api.delete(`/health-issues/${id}`)
      await db.healthIssues.delete(id)
      await dequeueByEntityId('healthIssues', id)
    } catch (err) {
      if (isOfflineError(err)) return
      if (backup) issues.value.unshift(backup)
      await dequeueByEntityId('healthIssues', id)
      throw err
    }
  }

  function getCowIssues(cowId) {
    return issues.value.filter((i) => i.cow_id === cowId)
  }

  async function fetchAll(params = {}) {
    loadingAll.value = true
    error.value = null
    try {
      const response = await api.get('/health-issues', { params })
      allIssues.value = response.data
      allIssuesTotal.value = parseInt(response.headers['x-total-count'], 10) || 0
      return response.data
    } catch (err) {
      error.value = extractApiError(err)
      throw err
    } finally {
      loadingAll.value = false
    }
  }

  function getById(id) {
    return issues.value.find((i) => i.id === id) ?? null
  }

  async function fetchComments(issueId) {
    try {
      const { data } = await api.get(`/health-issues/${issueId}/comments`)
      comments.value = { ...comments.value, [issueId]: data }
      return data
    } catch (err) {
      error.value = extractApiError(err)
      return []
    }
  }

  async function addComment(issueId, text) {
    try {
      const { data } = await api.post(`/health-issues/${issueId}/comments`, { comment: text })
      const list = comments.value[issueId] || []
      comments.value = { ...comments.value, [issueId]: [...list, data] }
      return data
    } catch (err) {
      error.value = extractApiError(err)
      throw err
    }
  }

  async function removeComment(issueId, commentId) {
    try {
      await api.delete(`/health-issues/${issueId}/comments/${commentId}`)
      comments.value = {
        ...comments.value,
        [issueId]: (comments.value[issueId] || []).filter((c) => c.id !== commentId),
      }
    } catch (err) {
      error.value = extractApiError(err)
      throw err
    }
  }

  function getComments(issueId) {
    return comments.value[issueId] || []
  }

  return {
    issues,
    allIssues,
    allIssuesTotal,
    comments,
    loadingByCow,
    loadingOne,
    loadingAll,
    error,
    fetchByCow,
    fetchOne,
    fetchAll,
    create,
    updateStatus,
    remove,
    getCowIssues,
    getById,
    fetchComments,
    addComment,
    removeComment,
    getComments,
  }
})
