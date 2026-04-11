import Dexie from 'dexie'
import { ref } from 'vue'

// ── Schema (single source of truth) ────────────────────────────
const CURRENT_SCHEMA = {
  animals: 'id, tag_number, name, status, sex, updated_at',
  auth: 'key',
  medications: 'id, name, is_active, updated_at',
  treatments: 'id, animal_id, medication_id, treatment_date, withdrawal_end_milk, updated_at',
  healthIssues: 'id, animal_id, issue_type, status, observed_at, updated_at',
  milkRecords: 'id, animal_id, session, recording_date, updated_at',
  breedingEvents:
    'id, animal_id, event_type, event_date, expected_calving, expected_next_heat, updated_at',
  breedTypes: 'id, code, name, is_active, sort_order',
  issueTypes: 'id, code, is_active, sort_order',
  syncQueue: '++autoId, id, entityType, action, createdAt, attempts, [entityType+id]',
  syncMeta: 'key',
  featureFlags: 'key',
  species: 'id, code, is_active',
}

// ── DB Instance ────────────────────────────────────────────────

let db = createDb('myherder_db')
let currentDbName = 'myherder_db'

function createDb(dbName) {
  const instance = new Dexie(dbName)
  // Keep v7 as baseline (matches previously deployed version)
  instance.version(7).stores(CURRENT_SCHEMA)
  // v8: added attempts index on syncQueue
  instance.version(8).stores(CURRENT_SCHEMA)
  // v9: added featureFlags table
  instance.version(9).stores(CURRENT_SCHEMA)
  // v10: compound index [entityType+id] on syncQueue
  instance.version(10).stores(CURRENT_SCHEMA)
  // v11: added species table
  instance.version(11).stores(CURRENT_SCHEMA)
  // v12: animals table (post cow-rename)
  instance.version(12).stores(CURRENT_SCHEMA)
  return instance
}

/**
 * Reinitialize the database with a farm-scoped name.
 * Call after login once farm_id is known from JWT.
 * The existing Proxy ensures all modules see the new instance.
 */
async function initDb(farmId) {
  const newName = farmId ? `myherder_db_${farmId}` : 'myherder_db'
  if (newName === currentDbName && db.isOpen()) return

  // Same name but closed — just reopen without recreating
  if (newName === currentDbName) {
    await db.open()
    return
  }

  // Different name — close old instance and create new one
  if (db.isOpen()) {
    db.close()
  }

  currentDbName = newName
  db = createDb(newName)
  await db.open()

  // Notify service worker of the farm-scoped DB name for background sync
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'SET_DB_NAME', dbName: newName })
  }
}

/**
 * Close and delete the current farm-scoped database (call on logout).
 * Deletes farm-scoped DBs to prevent stale data on shared devices.
 */
async function closeDb() {
  if (db.isOpen()) {
    db.close()
  }
  // Delete farm-scoped DB to prevent stale data exposure; keep default DB
  if (currentDbName !== 'myherder_db') {
    try {
      await new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase(currentDbName)
        req.onsuccess = resolve
        req.onerror = reject
        req.onblocked = resolve
      })
    } catch {
      // Best-effort — may fail if another tab holds the DB open
    }
  }
}

// ── Resilient Open ─────────────────────────────────────────────

const dbRecovered = ref(false)

async function openDb() {
  try {
    await db.open()
  } catch (err) {
    console.warn('[IndexedDB] Failed to open database, attempting recovery:', err.message)
    try {
      await db.delete()
    } catch {
      // delete can fail if db never opened — try native API
      await new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase(currentDbName)
        req.onsuccess = resolve
        req.onerror = reject
        req.onblocked = resolve // proceed even if blocked
      })
    }
    db = createDb(currentDbName)
    await db.open()
    dbRecovered.value = true
    console.warn('[IndexedDB] Database recovered — local cache was reset')
  }
}

function clearRecoveredFlag() {
  dbRecovered.value = false
}

// ── Helpers ────────────────────────────────────────────────────

/**
 * Ensure a deviceId exists in syncMeta. Generates one on first use.
 * Returns the deviceId string.
 */
async function ensureDeviceId() {
  const entry = await db.syncMeta.get('deviceId')
  if (!entry) {
    const deviceId = crypto.randomUUID()
    await db.syncMeta.put({ key: 'deviceId', value: deviceId })
    return deviceId
  }
  return entry.value
}

// ── Exports ────────────────────────────────────────────────────

// Use a proxy so all modules always reference the current `db` instance
// (in case it gets recreated during recovery)
const dbProxy = new Proxy(
  {},
  {
    get(_, prop) {
      return db[prop]
    },
    set(_, prop, value) {
      db[prop] = value
      return true
    },
  }
)

export default dbProxy
export { initDb, closeDb, ensureDeviceId, openDb, dbRecovered, clearRecoveredFlag }
