// Custom service-worker logic injected into Workbox-generated SW
// Background Sync: when browser fires the 'sync' event, push pending changes

// Farm-scoped DB name — updated via postMessage from the main thread
let currentDbName = 'myherder_db'

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SET_DB_NAME' && event.data.dbName) {
    currentDbName = event.data.dbName
  }
})

// Claim all open tabs immediately when this SW activates (enables seamless updates)
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})

self.addEventListener('sync', (event) => {
  if (event.tag === 'myherder-sync') {
    event.waitUntil(pushPendingChanges())
  }
})

async function pushPendingChanges() {
  // Open IndexedDB directly (Dexie is not available in SW context)
  const dbReq = indexedDB.open(currentDbName)

  const db = await new Promise((resolve, reject) => {
    dbReq.onsuccess = () => resolve(dbReq.result)
    dbReq.onerror = () => reject(dbReq.error)
  })

  // Read syncQueue
  const tx = db.transaction(['syncQueue', 'syncMeta'], 'readonly')
  const queueStore = tx.objectStore('syncQueue')
  const metaStore = tx.objectStore('syncMeta')

  const pending = await idbGetAll(queueStore)
  if (!pending.length) return

  // Get deviceId
  const deviceIdEntry = await idbGet(metaStore, 'deviceId')
  const deviceId = deviceIdEntry?.value
  if (!deviceId) return

  // Get auth token from localStorage (also available in SW)
  // Note: localStorage is NOT available in SW — read from IndexedDB auth table
  const authTx = db.transaction('auth', 'readonly')
  const authStore = authTx.objectStore('auth')
  const session = await idbGet(authStore, 'session')
  if (!session?.token) return

  const changes = pending
    .filter((e) => e.attempts < 5)
    .map((e) => ({
      id: e.id,
      entityType: e.entityType,
      action: e.action,
      data: e.data,
      updatedAt: e.data?.updated_at || e.createdAt,
    }))

  if (!changes.length) return

  try {
    const resp = await fetch('/api/sync/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ deviceId, changes }),
    })

    if (!resp.ok) return

    const { results } = await resp.json()

    // Remove successfully synced entries from queue
    const removeTx = db.transaction('syncQueue', 'readwrite')
    const removeStore = removeTx.objectStore('syncQueue')

    for (const result of results) {
      if (result.status === 'applied' || result.status === 'conflict') {
        const entry = pending.find((e) => e.id === result.id && e.entityType === result.entityType)
        if (entry) removeStore.delete(entry.autoId)
      }
    }

    await new Promise((resolve, reject) => {
      removeTx.oncomplete = resolve
      removeTx.onerror = () => reject(removeTx.error)
    })
  } catch {
    // Network error — will retry on next sync event
  }
}

// ── IDB helpers (Promise wrappers) ───────────────────────────────

function idbGetAll(store) {
  return new Promise((resolve, reject) => {
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbGet(store, key) {
  return new Promise((resolve, reject) => {
    const req = store.get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
