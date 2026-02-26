import { ref } from 'vue'
import db, { ensureDeviceId, openDb } from '../db/indexedDB.js'
import api from './api.js'

// ── Reactive State ──────────────────────────────────────────────

const isOnline = ref(navigator.onLine)
const pendingCount = ref(0)
const isSyncing = ref(false)
const lastSyncTime = ref(null)
const failedItems = ref([])

// ── Queue Operations ────────────────────────────────────────────

async function enqueue(entityType, action, id, data) {
  await db.syncQueue.add({
    id,
    entityType,
    action,
    data,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
  })
  await refreshPendingCount()
  requestBackgroundSync()
}

// ── Background Sync ──────────────────────────────────────────────

function requestBackgroundSync() {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    navigator.serviceWorker.ready
      .then((reg) => reg.sync.register('myherder-sync'))
      .catch(() => {
        // Background Sync not supported or denied — polling handles it
      })
  }
}

async function dequeue(autoId) {
  await db.syncQueue.delete(autoId)
  await refreshPendingCount()
}

async function dequeueByEntityId(entityType, id) {
  const entries = await db.syncQueue
    .where({ entityType, id })
    .toArray()
  if (entries.length) {
    await db.syncQueue.bulkDelete(entries.map((e) => e.autoId))
    await refreshPendingCount()
  }
}

async function getPending() {
  return db.syncQueue.orderBy('createdAt').toArray()
}

async function getPendingCount() {
  return db.syncQueue.count()
}

async function refreshPendingCount() {
  pendingCount.value = await getPendingCount()
  // Update failed items list
  const all = await db.syncQueue.where('attempts').aboveOrEqual(5).toArray()
  failedItems.value = all
}

// ── Sync Operations ─────────────────────────────────────────────

async function pushChanges() {
  const pending = await getPending()
  if (!pending.length) return

  const deviceId = await ensureDeviceId()
  const changes = pending
    .filter((entry) => entry.attempts < 5)
    .map((entry) => ({
      id: entry.id,
      entityType: entry.entityType,
      action: entry.action,
      data: entry.data,
      updatedAt: entry.data?.updated_at || entry.createdAt,
    }))

  if (!changes.length) return

  try {
    const { data: response } = await api.post('/sync/push', {
      deviceId,
      changes,
    })

    // Process results
    for (const result of response.results) {
      const queueEntry = pending.find(
        (e) => e.id === result.id && e.entityType === result.entityType,
      )
      if (!queueEntry) continue

      if (result.status === 'applied' || result.status === 'conflict') {
        // Update local IndexedDB with server version if provided
        if (result.serverData) {
          const table = db.table(result.entityType)
          await table.put(result.serverData)
        }
        await dequeue(queueEntry.autoId)
      } else if (result.status === 'error') {
        // Increment attempts
        await db.syncQueue.update(queueEntry.autoId, {
          attempts: queueEntry.attempts + 1,
          lastError: result.error || 'Unknown error',
        })
      }
    }
  } catch (err) {
    if (isOfflineError(err)) {
      isOnline.value = false
      return
    }
    // Increment attempts for all entries on network error
    for (const entry of pending.filter((e) => e.attempts < 5)) {
      await db.syncQueue.update(entry.autoId, {
        attempts: entry.attempts + 1,
        lastError: err.message || 'Push failed',
      })
    }
  }

  await refreshPendingCount()
}

async function pullChanges(fullPull = false) {
  try {
    const params = {}
    if (fullPull) {
      params.full = 1
    } else {
      const meta = await db.syncMeta.get('lastPullTimestamp')
      if (meta?.value) {
        params.since = meta.value
      } else {
        params.full = 1
      }
    }

    const { data } = await api.get('/sync/pull', { params })

    // Bulk upsert into IndexedDB tables
    const tables = {
      cows: data.cows,
      medications: data.medications,
      treatments: data.treatments,
      healthIssues: data.healthIssues,
      milkRecords: data.milkRecords,
      breedingEvents: data.breedingEvents,
      breedTypes: data.breedTypes,
      issueTypes: data.issueTypes,
    }

    for (const [tableName, records] of Object.entries(tables)) {
      if (records?.length) {
        const table = db.table(tableName)
        await table.bulkPut(records)
      }
    }

    // Handle soft-deleted records (remove from local)
    if (data.deleted) {
      for (const { entityType, id } of data.deleted) {
        try {
          const table = db.table(entityType)
          await table.delete(id)
        } catch {
          // Table may not exist locally — ignore
        }
      }
    }

    // Update timestamp
    const syncedAt = data.syncedAt || new Date().toISOString()
    await db.syncMeta.put({ key: 'lastPullTimestamp', value: syncedAt })
    lastSyncTime.value = syncedAt
  } catch (err) {
    if (isOfflineError(err)) {
      isOnline.value = false
    }
    throw err
  }
}

async function sync() {
  if (isSyncing.value) return
  isSyncing.value = true

  try {
    await pushChanges()
    await pullChanges()
    isOnline.value = true
  } catch {
    // Push/pull errors are handled internally
  } finally {
    isSyncing.value = false
    await refreshPendingCount()
  }
}

// ── Connectivity ────────────────────────────────────────────────

let pollIntervalId = null

function startPolling() {
  stopPolling()
  pollIntervalId = setInterval(async () => {
    // Nothing to do if online with no pending items
    if (isOnline.value && pendingCount.value === 0) return

    // If online but have pending items, just sync
    if (isOnline.value && pendingCount.value > 0) {
      await sync()
      return
    }

    // Offline — check connectivity via health endpoint
    try {
      await api.head('/sync/health')
      isOnline.value = true
      await sync()
    } catch {
      isOnline.value = false
    }
  }, 30_000)
}

function stopPolling() {
  if (pollIntervalId) {
    clearInterval(pollIntervalId)
    pollIntervalId = null
  }
}

function handleOnline() {
  isOnline.value = true
  sync()
}

function handleOffline() {
  isOnline.value = false
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible' && pendingCount.value > 0) {
    sync()
  }
}

function initListeners() {
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  startPolling()
}

function destroyListeners() {
  window.removeEventListener('online', handleOnline)
  window.removeEventListener('offline', handleOffline)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  stopPolling()
}

// ── Helpers ─────────────────────────────────────────────────────

function isOfflineError(err) {
  return !navigator.onLine || err.code === 'ECONNABORTED' || !err.response
}

// ── Initial Sync (called after login) ───────────────────────────

const initialSyncProgress = ref(null) // null = not syncing, string = current step

async function initialSync(forceFull = false) {
  if (isSyncing.value) return

  try {
    initialSyncProgress.value = 'pushing'
    await pushChanges()

    initialSyncProgress.value = 'pulling'
    await pullChanges(forceFull)

    isOnline.value = true
    initialSyncProgress.value = null
  } catch {
    // Offline — allow app to continue with cached data
    initialSyncProgress.value = null
  } finally {
    await refreshPendingCount()
  }
}

// ── Initialize ──────────────────────────────────────────────────

async function init() {
  await openDb()
  await refreshPendingCount()
  const meta = await db.syncMeta.get('lastPullTimestamp')
  if (meta?.value) {
    lastSyncTime.value = meta.value
  }
  initListeners()
}

// ── Exports ─────────────────────────────────────────────────────

export {
  // Reactive state (readonly)
  isOnline,
  pendingCount,
  isSyncing,
  lastSyncTime,
  failedItems,
  initialSyncProgress,

  // Queue operations
  enqueue,
  dequeue,
  dequeueByEntityId,
  getPending,
  getPendingCount,

  // Sync operations
  pushChanges,
  pullChanges,
  sync,
  initialSync,

  // Lifecycle
  init,
  destroyListeners,

  // Helpers
  isOfflineError,
}
