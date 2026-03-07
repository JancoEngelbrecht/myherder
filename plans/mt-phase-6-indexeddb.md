# MT Phase 6: Frontend IndexedDB Isolation

## Goal
Namespace IndexedDB per farm so offline data is isolated. Since one device = one farm, this is a safety measure more than a hard requirement.

## Prerequisites
- Phases 1-5 complete (backend fully multi-tenant)
- Read `client/src/db/indexedDB.js` for current Dexie setup
- Read `client/src/stores/auth.js` for login/logout flow
- Read `client/src/services/syncManager.js` for sync initialization

## Step 6.1 -- Namespace IndexedDB per farm

Update `client/src/db/indexedDB.js`:

```js
// Before
const db = new Dexie('myherder_db');

// After
let db = null;

export function initDb(farmId) {
  if (db) {
    db.close();
  }
  const dbName = farmId ? `myherder_db_${farmId}` : 'myherder_db';
  db = new Dexie(dbName);
  // ... define schema versions as before ...
  db.open();
  return db;
}

export function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDb(farmId) first.');
  return db;
}

// For backward compatibility during migration, keep default export
// but log warning if used before initDb
export default db; // Will be null until initDb() called
```

**Important**: All store imports of `db` from indexedDB.js need to use `getDb()` instead of the default import, OR the stores need to be initialized lazily after `initDb()` runs.

Approach options:
- **Option A**: Stores call `getDb()` every time they access IndexedDB (safest, slight overhead)
- **Option B**: Stores receive `db` reference after login (reactive ref or re-import)
- **Recommended**: Option A -- `getDb()` is a simple module-level getter, negligible cost

## Step 6.2 -- Wire into login flow

Update `client/src/stores/auth.js`:

### In `setSession(token)`:
```js
// After decoding JWT and extracting farm_id:
import { initDb } from '../db/indexedDB';
initDb(user.farm_id);
// Then proceed with initialSync() as before
```

### In `logout()`:
```js
import { getDb } from '../db/indexedDB';

// Before clearing state:
const farmId = user.value?.farm_id;
const dbInstance = getDb();
if (dbInstance) {
  dbInstance.close();
}
// Delete the farm-scoped DB
if (farmId) {
  await indexedDB.deleteDatabase(`myherder_db_${farmId}`);
}
// Clear localStorage, reset stores, etc.
```

## Step 6.3 -- Update all store IndexedDB access

Every Pinia store that uses IndexedDB needs to call `getDb()` instead of importing `db` directly:

| Store | IndexedDB tables used |
|-------|----------------------|
| `cows.js` | `cows` |
| `auth.js` | `auth` |
| `breedTypes.js` | `breedTypes` |
| `issueTypes.js` | `issueTypes` |
| `medications.js` | `medications` (if cached) |
| `milkRecords.js` | (if offline queue) |
| `sync.js` | `syncQueue`, `syncMeta` |

For each store, replace:
```js
// Before
import db from '../db/indexedDB';
await db.cows.toArray();

// After
import { getDb } from '../db/indexedDB';
const db = getDb();
await db.cows.toArray();
```

## Step 6.4 -- Update syncManager

Update `client/src/services/syncManager.js`:
- Replace `import db from '../db/indexedDB'` with `import { getDb } from '../db/indexedDB'`
- Use `getDb()` for all IndexedDB operations
- In `init()`: verify DB is initialized before starting sync

## Step 6.5 -- Update service worker

Update `client/public/sw-custom.js`:
- Receive farm-scoped DB name via `postMessage` from main app
- Use dynamic DB name for background sync operations
- On logout message: clear background sync registration

In main app (App.vue or auth store), after `initDb()`:
```js
if (navigator.serviceWorker?.controller) {
  navigator.serviceWorker.controller.postMessage({
    type: 'SET_DB_NAME',
    dbName: `myherder_db_${farmId}`
  });
}
```

## Step 6.6 -- localStorage key review

| Key | Scope | Change needed? |
|-----|-------|----------------|
| `auth_token` | Global (one user per device) | No |
| `farm_code` | Global (entry point) | No |
| `locale` | Global (user pref) | No |
| `sync_device_id` | Global (device UUID) | No |

No localStorage namespacing needed -- one device = one farm.

## Verification Checklist

1. Login -> IndexedDB created with farm-scoped name (`myherder_db_<farmId>`)
2. All stores use `getDb()` -- no direct `db` imports from indexedDB.js
3. Logout -> farm-scoped IndexedDB deleted
4. Offline mode works: login -> go offline -> reload -> data available from farm-scoped DB
5. `cd client && npm run test:run` -- all frontend tests pass
6. `npm run lint:fix` -- zero new errors
7. `npm run build` -- builds successfully
8. Verify: no hardcoded `'myherder_db'` string remains (except in `initDb` fallback)

## Important Notes

- Since one device = one farm, we don't need to handle the "switch farm on same device" scenario. But the namespaced DB protects against edge cases.
- Frontend tests mock IndexedDB -- they may need updating to work with `getDb()` pattern. Check test setup files.
- The Dexie proxy pattern (if used) may need adjustment for the lazy initialization approach.
- If `getDb()` throws before login (e.g., during app initialization), add a guard: some stores may try to read IndexedDB before the user logs in. Handle gracefully with try/catch or an `isInitialized` check.
