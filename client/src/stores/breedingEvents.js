import { ref, reactive, computed } from 'vue'
import { defineStore } from 'pinia'
import { v4 as uuidv4 } from 'uuid'
import api from '../services/api'
import db from '../db/indexedDB'
import { enqueue, dequeueByEntityId, isOfflineError } from '../services/syncManager'
import { extractApiError } from '../utils/apiError'

/** Keep only the latest event per cow, sorted by the given date field */
function latestPerCow(arr, field) {
  const map = {}
  for (const e of arr) {
    if (!map[e.cow_id] || e.event_date > map[e.cow_id].event_date) map[e.cow_id] = e
  }
  return Object.values(map).sort((a, b) => (a[field] || '').localeCompare(b[field] || ''))
}

export const useBreedingEventsStore = defineStore('breedingEvents', () => {
  const events = ref([])
  const total = ref(0)
  const upcoming = reactive({ heats: [], calvings: [], pregChecks: [], dryOffs: [], needsAttention: [] })
  const loading = ref(false)
  const error = ref(null)

  // ── Fetch all / by cow ───────────────────────────────────────────────────────

  async function fetchAll(filters = {}) {
    loading.value = true
    error.value = null
    try {
      const payload = (await api.get('/breeding-events', { params: filters })).data

      if (filters.cow_id && !filters.page && !filters.limit) {
        // cow_id without pagination → plain array; return directly without updating global paginated state
        await db.breedingEvents.bulkPut(payload)
        return payload
      }

      // Paginated response { data: [...], total: N }
      await db.breedingEvents.bulkPut(payload.data)
      events.value = payload.data
      total.value = payload.total
      return payload.data
    } catch (err) {
      error.value = extractApiError(err)
      if (filters.cow_id && !filters.page && !filters.limit) {
        // Non-paginated cow query — return plain array from IndexedDB
        return db.breedingEvents.where('cow_id').equals(filters.cow_id).toArray()
      }
      // Paginated fallback (global or cow-filtered)
      let local = await db.breedingEvents.orderBy('event_date').reverse().toArray()
      if (filters.cow_id) {
        local = local.filter((e) => e.cow_id === filters.cow_id)
      }
      events.value = local
      total.value = local.length
      return local
    } finally {
      loading.value = false
    }
  }

  function fetchForCow(cowId) {
    return fetchAll({ cow_id: cowId })
  }

  async function fetchUpcoming() {
    try {
      const { data } = await api.get('/breeding-events/upcoming')
      upcoming.heats = data.heats ?? []
      upcoming.calvings = data.calvings ?? []
      upcoming.pregChecks = data.pregChecks ?? []
      upcoming.dryOffs = data.dryOffs ?? []
      upcoming.needsAttention = data.needsAttention ?? []
    } catch {
      // Offline: derive from cached events
      const today = new Date().toISOString().slice(0, 10)
      const in7  = new Date(Date.now() + 7  * 86400000).toISOString().slice(0, 10)
      const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)

      const all = await db.breedingEvents.toArray()
      const inRange = (date, from, to) => date && date >= from && date <= to

      upcoming.heats = latestPerCow(
        all.filter((e) => inRange(e.expected_next_heat, today, in7)),
        'expected_next_heat',
      )
      upcoming.calvings = latestPerCow(
        all.filter((e) => inRange(e.expected_calving, today, in14)),
        'expected_calving',
      )
      upcoming.pregChecks = latestPerCow(
        all.filter((e) => inRange(e.expected_preg_check, today, in7)),
        'expected_preg_check',
      )
    }
  }

  // ── Create ───────────────────────────────────────────────────────────────────

  async function createEvent(payload) {
    const now = new Date().toISOString()
    const localEvent = { id: uuidv4(), ...payload, updated_at: now, created_at: now }

    await db.breedingEvents.put(localEvent)
    await enqueue('breedingEvents', 'create', localEvent.id, localEvent)

    try {
      const { data } = await api.post('/breeding-events', payload)
      await db.breedingEvents.put(data)
      await dequeueByEntityId('breedingEvents', localEvent.id)
      events.value.unshift(data)
      fetchUpcoming().catch(() => {})
      return data
    } catch (err) {
      if (isOfflineError(err)) {
        events.value.unshift(localEvent)
        return localEvent
      }
      await dequeueByEntityId('breedingEvents', localEvent.id)
      await db.breedingEvents.delete(localEvent.id)
      throw err
    }
  }

  // ── Update ───────────────────────────────────────────────────────────────────

  async function updateEvent(id, payload) {
    const now = new Date().toISOString()
    const existing = await db.breedingEvents.get(id)
    const localEvent = { ...existing, ...payload, id, updated_at: now }

    await db.breedingEvents.put(localEvent)
    await enqueue('breedingEvents', 'update', id, localEvent)

    try {
      const { data } = await api.patch(`/breeding-events/${id}`, payload)
      await db.breedingEvents.put(data)
      await dequeueByEntityId('breedingEvents', id)
      const idx = events.value.findIndex((e) => e.id === id)
      if (idx !== -1) events.value[idx] = data
      fetchUpcoming().catch(() => {})
      return data
    } catch (err) {
      if (isOfflineError(err)) {
        const idx = events.value.findIndex((e) => e.id === id)
        if (idx !== -1) events.value[idx] = localEvent
        return localEvent
      }
      await dequeueByEntityId('breedingEvents', id)
      throw err
    }
  }

  // ── Dismiss ─────────────────────────────────────────────────────────────────

  async function dismissEvent(id, reason = '') {
    const now = new Date().toISOString()
    const existing = await db.breedingEvents.get(id)
    const localEvent = { ...existing, id, dismissed_at: now, dismiss_reason: reason, updated_at: now }

    await db.breedingEvents.put(localEvent)
    await enqueue('breedingEvents', 'update', id, localEvent)

    try {
      const { data } = await api.patch(`/breeding-events/${id}/dismiss`, { reason })
      await db.breedingEvents.put(data)
      await dequeueByEntityId('breedingEvents', id)
      const idx = events.value.findIndex((e) => e.id === id)
      if (idx !== -1) events.value[idx] = data
      fetchUpcoming().catch(() => {})
      return data
    } catch (err) {
      if (isOfflineError(err)) {
        const idx = events.value.findIndex((e) => e.id === id)
        if (idx !== -1) events.value[idx] = localEvent
        return localEvent
      }
      await dequeueByEntityId('breedingEvents', id)
      throw err
    }
  }

  async function dismissBatch(ids, reason = '') {
    const now = new Date().toISOString()

    // Snapshot for rollback (bulk read)
    const existing = await db.breedingEvents.bulkGet(ids)
    const snapshots = existing.filter(Boolean).map((e) => ({ ...e }))
    const updated = snapshots.map((e) => ({ ...e, dismissed_at: now, dismiss_reason: reason, updated_at: now }))
    if (updated.length) await db.breedingEvents.bulkPut(updated)

    try {
      await api.patch('/breeding-events/dismiss-batch', { ids, reason })
      fetchUpcoming().catch(() => {})
    } catch (err) {
      if (!isOfflineError(err)) {
        // Rollback optimistic updates
        if (snapshots.length) await db.breedingEvents.bulkPut(snapshots)
        throw err
      }
      // Offline: enqueue individual dismiss updates
      const locals = await db.breedingEvents.bulkGet(ids)
      for (const local of locals) {
        if (local) await enqueue('breedingEvents', 'update', local.id, local)
      }
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  async function deleteEvent(id) {
    const backup = events.value.find((e) => e.id === id)
    events.value = events.value.filter((e) => e.id !== id)
    await enqueue('breedingEvents', 'delete', id, { id })

    try {
      await api.delete(`/breeding-events/${id}`)
      await db.breedingEvents.delete(id)
      await dequeueByEntityId('breedingEvents', id)
    } catch (err) {
      if (isOfflineError(err)) return
      if (backup) events.value.unshift(backup)
      await dequeueByEntityId('breedingEvents', id)
      throw err
    }
  }

  // ── Computed ─────────────────────────────────────────────────────────────────

  const upcomingCount = computed(
    () => upcoming.heats.length + upcoming.calvings.length + upcoming.pregChecks.length + upcoming.dryOffs.length + upcoming.needsAttention.length,
  )

  // Latest event per cow — used in CowDetailView repro summary
  function latestForCow(cowId, eventsArr) {
    const arr = (eventsArr || events.value).filter((e) => e.cow_id === cowId)
    if (arr.length === 0) return null
    return arr.reduce((latest, e) =>
      !latest || e.event_date > latest.event_date ? e : latest, null)
  }

  // Gestation progress for a pregnant cow: 0–100
  function gestationPercent(expectedCalving, gestationDays = 283) {
    if (!expectedCalving) return null
    const today = new Date()
    const calving = new Date(expectedCalving)
    const conception = new Date(calving)
    conception.setDate(conception.getDate() - gestationDays)
    const elapsed = Math.round((today - conception) / 86400000)
    return Math.min(100, Math.max(0, Math.round((elapsed / gestationDays) * 100)))
  }

  return {
    events,
    total,
    upcoming,
    loading,
    error,
    upcomingCount,
    fetchAll,
    fetchForCow,
    fetchUpcoming,
    createEvent,
    updateEvent,
    dismissEvent,
    dismissBatch,
    deleteEvent,
    latestForCow,
    gestationPercent,
  }
})
