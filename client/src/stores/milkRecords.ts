import { ref, reactive } from 'vue'
import { defineStore } from 'pinia'
import { v4 as uuidv4 } from 'uuid'
import api from '../services/api'
import db from '../db/indexedDB'
import { enqueue, dequeueByEntityId, isOfflineError } from '../services/syncManager'
import { extractApiError } from '../utils/apiError'

const DEBOUNCE_MS = 1500

export const useMilkRecordsStore = defineStore('milkRecords', () => {
  // Map: animal_id → record (for the currently viewed session/date)
  const records = reactive<Record<string, any>>({})
  // Map: animal_id → 'idle' | 'saving' | 'saved' | 'error'
  const syncStatus = reactive<Record<string, string>>({})
  // Non-reactive debounce timers: animal_id → timeoutId
  const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {}
  // Non-reactive pending write args: animal_id → latest autoSave args (kept in sync with debounceTimers)
  const pendingData: Record<string, any> = {}

  const loading = ref(false)
  const error = ref<string | null>(null)

  // Track the active session/date so _persist can guard against stale UI updates
  const currentSession = ref<string | null>(null)
  const currentDate = ref<string | null>(null)

  // ── Fetch ───────────────────────────────────────────────────────────────────

  async function fetchSession(date: string, session: string) {
    // Show loading immediately so the animal list is hidden during flush + fetch
    loading.value = true
    error.value = null

    // Cancel all outstanding debounce timers before switching context so no
    // stale writes fire after the session clears.
    Object.values(debounceTimers).forEach(clearTimeout)
    Object.keys(debounceTimers).forEach((k) => delete debounceTimers[k])

    // Flush any remaining pending writes BEFORE switching context and querying.
    // currentDate/currentSession still hold the OLD values here, so _persist's
    // second guard will match and correctly update records for the old context
    // (which we're about to clear anyway).
    await flushPending()

    currentSession.value = session
    currentDate.value = date

    // Clear stale records/status from previous session
    Object.keys(records).forEach((k) => delete records[k])
    Object.keys(syncStatus).forEach((k) => delete syncStatus[k])

    try {
      const { data } = await api.get('/milk-records', { params: { date, session } })
      for (const row of data) {
        records[row.animal_id] = row
      }
      await db.milkRecords.bulkPut(data)
    } catch (err) {
      // Offline fallback — use compound filter on indexed fields
      const local = await db.milkRecords
        .where('session')
        .equals(session)
        .and((r: any) => r.recording_date === date)
        .toArray()
      for (const row of local) {
        records[row.animal_id] = row
      }
      error.value = extractApiError(err)
    } finally {
      loading.value = false
    }
  }

  async function fetchCowHistory(cowId: string) {
    try {
      const { data } = await api.get('/milk-records', { params: { animal_id: cowId } })
      await db.milkRecords.bulkPut(data)
      return data
    } catch (err) {
      error.value = extractApiError(err)
      return db.milkRecords.where('animal_id').equals(cowId).toArray()
    }
  }

  // ── Auto-save ────────────────────────────────────────────────────────────────

  function autoSave(
    cowId: string,
    litres: number,
    session: string,
    date: string,
    discarded = false,
    discardReason: string | null = null,
    sessionTime: string | null = null
  ) {
    syncStatus[cowId] = 'saving'

    // Capture the existing record ID NOW while the context is still correct.
    // By the time the debounce fires the user may have switched date/session,
    // making records[cowId] belong to a different context.
    const existingId: string | null = records[cowId]?.id ?? null

    // Optimistically update the local record so the input reflects the user's
    // typing immediately instead of waiting for the debounce + API round-trip.
    if (records[cowId]) {
      records[cowId] = {
        ...records[cowId],
        litres,
        milk_discarded: discarded,
        discard_reason: discardReason,
      }
    } else {
      records[cowId] = {
        animal_id: cowId,
        litres,
        session,
        recording_date: date,
        milk_discarded: discarded,
        discard_reason: discardReason,
      }
    }

    // Keep pendingData up-to-date with the latest values so flushPending can
    // fire an immediate write if the user navigates away before the debounce fires.
    pendingData[cowId] = {
      litres,
      session,
      date,
      discarded,
      discardReason,
      sessionTime,
      existingId,
    }

    if (debounceTimers[cowId]) {
      clearTimeout(debounceTimers[cowId])
    }

    debounceTimers[cowId] = setTimeout(() => {
      delete debounceTimers[cowId]
      delete pendingData[cowId]
      _persist(cowId, litres, session, date, discarded, discardReason, sessionTime, existingId)
    }, DEBOUNCE_MS)
  }

  /** @private Flush all pending debounced writes immediately. Internal — not exported. */
  // Immediately fire all pending debounced writes and await their completion.
  // Called at the start of fetchSession so no data is lost when navigating between dates.
  async function flushPending() {
    const entries = Object.entries(pendingData)
    if (entries.length === 0) return

    const promises: Promise<void>[] = []
    for (const [cowId, d] of entries) {
      if (debounceTimers[cowId]) {
        clearTimeout(debounceTimers[cowId])
        delete debounceTimers[cowId]
      }
      delete pendingData[cowId]
      promises.push(
        _persist(
          cowId,
          d.litres,
          d.session,
          d.date,
          d.discarded,
          d.discardReason,
          d.sessionTime,
          d.existingId
        )
      )
    }
    await Promise.all(promises)
  }

  async function _persist(
    cowId: string,
    litres: number,
    session: string,
    date: string,
    discarded: boolean,
    discardReason: string | null,
    sessionTime: string | null,
    existingId: string | null = null
  ) {
    const effectiveTime = sessionTime || new Date().toTimeString().slice(0, 5)
    const now = new Date().toISOString()
    const payload = {
      litres: Math.round(Number(litres) * 100) / 100,
      milk_discarded: discarded,
      discard_reason: discardReason || null,
    }

    // Build local record for IndexedDB + queue
    const localRecord = {
      id: existingId || uuidv4(),
      animal_id: cowId,
      session,
      recording_date: date,
      session_time: effectiveTime,
      ...payload,
      updated_at: now,
    }

    try {
      let result: any
      if (existingId) {
        const { data } = await api.put(`/milk-records/${existingId}`, payload)
        result = data
      } else {
        const { data } = await api.post('/milk-records', {
          animal_id: cowId,
          session,
          recording_date: date,
          session_time: effectiveTime,
          ...payload,
        })
        result = data
      }

      // Only update the reactive UI state if we're still viewing this session/date
      if (session === currentSession.value && date === currentDate.value) {
        records[cowId] = result
        syncStatus[cowId] = 'saved'
      } else {
        syncStatus[cowId] = 'idle'
      }
      await db.milkRecords.put(result)
      await dequeueByEntityId('milkRecords', localRecord.id)
    } catch (err: any) {
      // Handle 409 Conflict — record already exists for this cow/session/date/time
      if (err.response?.status === 409) {
        const recorder = err.response.data?.recorded_by_name
        syncStatus[cowId] = 'error'
        error.value = recorder
          ? `Record already exists (recorded by ${recorder})`
          : err.response.data?.error || 'Record already exists'
        return
      }

      // Offline: save locally and enqueue for later sync
      if (isOfflineError(err)) {
        await db.milkRecords.put(localRecord)
        await enqueue('milkRecords', existingId ? 'update' : 'create', localRecord.id, localRecord)
        if (session === currentSession.value && date === currentDate.value) {
          records[cowId] = localRecord
          syncStatus[cowId] = 'saved'
        }
        return
      }

      syncStatus[cowId] = 'error'
      error.value = extractApiError(err)
    }
  }

  // ── Getters ──────────────────────────────────────────────────────────────────

  function getRecord(cowId: string): any {
    return records[cowId] ?? null
  }

  function getStatus(cowId: string): string {
    return syncStatus[cowId] ?? 'idle'
  }

  return {
    records,
    syncStatus,
    loading,
    error,
    currentSession,
    currentDate,
    fetchSession,
    fetchCowHistory,
    autoSave,
    getRecord,
    getStatus,
  }
})
