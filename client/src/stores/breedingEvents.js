import { ref, reactive, computed } from 'vue'
import { defineStore } from 'pinia'
import api from '../services/api'
import db from '../db/indexedDB'

export const useBreedingEventsStore = defineStore('breedingEvents', () => {
  const events = ref([])
  const upcoming = reactive({ heats: [], calvings: [], pregChecks: [], dryOffs: [], needsAttention: [] })
  const loading = ref(false)
  const error = ref(null)

  // ── Fetch all / by cow ───────────────────────────────────────────────────────

  async function fetchAll(filters = {}) {
    loading.value = true
    error.value = null
    try {
      const { data } = await api.get('/breeding-events', { params: filters })
      await db.breedingEvents.bulkPut(data)
      if (!filters.cow_id) events.value = data
      return data
    } catch (err) {
      error.value = err.message
      if (filters.cow_id) {
        return db.breedingEvents.where('cow_id').equals(filters.cow_id).toArray()
      }
      const local = await db.breedingEvents.orderBy('event_date').reverse().toArray()
      events.value = local
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

      const latestPerCow = (arr, field) => {
        const map = {}
        for (const e of arr) {
          if (!map[e.cow_id] || e.event_date > map[e.cow_id].event_date) map[e.cow_id] = e
        }
        return Object.values(map).sort((a, b) => a[field].localeCompare(b[field]))
      }

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
    const { data } = await api.post('/breeding-events', payload)
    events.value.unshift(data)
    await db.breedingEvents.put(data)
    // Refresh upcoming in background (don't block the UI)
    fetchUpcoming().catch(() => {})
    return data
  }

  // ── Update ───────────────────────────────────────────────────────────────────

  async function updateEvent(id, payload) {
    const { data } = await api.patch(`/breeding-events/${id}`, payload)
    const idx = events.value.findIndex((e) => e.id === id)
    if (idx !== -1) events.value[idx] = data
    await db.breedingEvents.put(data)
    fetchUpcoming().catch(() => {})
    return data
  }

  // ── Dismiss ─────────────────────────────────────────────────────────────────

  async function dismissEvent(id, reason = '') {
    const { data } = await api.patch(`/breeding-events/${id}/dismiss`, { reason })
    const idx = events.value.findIndex((e) => e.id === id)
    if (idx !== -1) events.value[idx] = data
    await db.breedingEvents.put(data)
    fetchUpcoming().catch(() => {})
    return data
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  async function deleteEvent(id) {
    await api.delete(`/breeding-events/${id}`)
    events.value = events.value.filter((e) => e.id !== id)
    await db.breedingEvents.delete(id)
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

  // Days between two ISO date strings
  function daysBetween(from, to) {
    const a = new Date(from)
    const b = new Date(to)
    return Math.round((b - a) / 86400000)
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
    deleteEvent,
    latestForCow,
    daysBetween,
    gestationPercent,
  }
})
