import Dexie from 'dexie'
import { ref } from 'vue'

// ── Schema (single source of truth) ────────────────────────────
const CURRENT_SCHEMA = {
  cows: 'id, tag_number, name, status, sex, updated_at',
  auth: 'key',
  medications: 'id, name, is_active, updated_at',
  treatments: 'id, cow_id, medication_id, treatment_date, withdrawal_end_milk, updated_at',
  healthIssues: 'id, cow_id, issue_type, status, observed_at, updated_at',
  milkRecords: 'id, cow_id, session, recording_date, updated_at',
  breedingEvents: 'id, cow_id, event_type, event_date, expected_calving, expected_next_heat, updated_at',
  breedTypes: 'id, code, name, is_active, sort_order',
  issueTypes: 'id, code, is_active, sort_order',
  syncQueue: '++autoId, id, entityType, action, createdAt, attempts',
  syncMeta: 'key',
}

// ── DB Instance ────────────────────────────────────────────────

let db = createDb()

function createDb() {
  const instance = new Dexie('myherder_db')
  // Keep v7 as baseline (matches previously deployed version)
  instance.version(7).stores(CURRENT_SCHEMA)
  // v8: added attempts index on syncQueue
  instance.version(8).stores(CURRENT_SCHEMA)
  return instance
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
        const req = indexedDB.deleteDatabase('myherder_db')
        req.onsuccess = resolve
        req.onerror = reject
        req.onblocked = resolve // proceed even if blocked
      })
    }
    db = createDb()
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
  let entry = await db.syncMeta.get('deviceId')
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
  },
)

export default dbProxy
export { ensureDeviceId, openDb, dbRecovered, clearRecoveredFlag }
