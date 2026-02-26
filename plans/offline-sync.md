# Phase 5: Offline Sync Engine — Detailed Implementation Plan

## Current State Assessment

### What exists today:
- **IndexedDB v6** with tables: cows, auth, medications, treatments, healthIssues, milkRecords, breedingEvents, breedTypes
- **Per-store offline fallback**: Each store catches API errors and reads from IndexedDB (read path only)
- **Per-store local mirroring**: Most stores write to IndexedDB on successful API response
- **SyncIndicator atom**: Shows green/yellow/red dot — currently only wired to `cowsStore.syncStatus`
- **syncManager.js**: Minimal helper (40 lines) — only handles cow pull/push, no queue
- **PWA**: Workbox NetworkFirst for `/api/*` routes (10s timeout), static asset precaching
- **Auth**: JWT cached in both localStorage and IndexedDB

### What's missing (the actual sync engine):
1. No **write queue** — offline writes are lost if the store doesn't handle them individually
2. No **`POST /api/sync` endpoint** — no batch processing
3. No **conflict resolution** — no `updated_at` comparison
4. No **Background Sync** — no Service Worker sync event
5. No **polling fallback** — no connectivity check loop
6. No **sync status** wired globally — SyncIndicator only reads cowsStore
7. No **full data pull** on login — stores fetch individually
8. No **sync_log** table — no server-side tracking
9. No **retry with backoff** — failed requests just fail

---

## Architecture Design

### Sync Flow (Write Path)
```
User action (create/update/delete)
  → Write to IndexedDB immediately (optimistic)
  → Add entry to syncQueue table in IndexedDB
  → Attempt API call
    → Success: Remove from syncQueue, update record with server response
    → Failure: Leave in syncQueue, mark as pending
  → SyncIndicator shows pending count

When connectivity restored (online event / polling / Background Sync):
  → Read all syncQueue entries ordered by timestamp
  → POST /api/sync with batch payload
  → Server processes each, returns results + conflicts
  → Update IndexedDB with server responses
  → Clear processed entries from syncQueue
  → SyncIndicator shows synced
```

### Sync Flow (Read Path — Full Pull)
```
On login / force refresh / first install:
  → GET /api/sync/pull?since=<lastSyncTimestamp>
  → Server returns all records updated since timestamp
  → Bulk upsert into IndexedDB tables
  → Update lastSyncTimestamp in IndexedDB
```

### Conflict Resolution (Last-Write-Wins)
```
Client sends: { id, entity_type, action, data, updated_at }
Server checks: server_record.updated_at vs client.updated_at
  → If client is newer (or record doesn't exist): apply client change
  → If server is newer: reject client change, return server version
  → Soft deletes: never truly remove, just set deleted_at
```

---

## Phase Breakdown

### Phase 5.1 — Sync Queue + Database Foundation
**Goal:** IndexedDB sync queue table + server sync_log migration + updated_at columns on all tables.

#### Backend tasks:
1. **Migration 020: add_updated_at_columns** — Ensure ALL entity tables have `updated_at` column with auto-update trigger (some may already have it, verify each):
   - `cows` ✓ (has it)
   - `medications` ✓ (has it)
   - `treatments` ✓ (has it)
   - `health_issues` ✓ (has it)
   - `milk_records` ✓ (has it)
   - `breeding_events` ✓ (has it)
   - `breed_types` — verify
   - `issue_types` — verify
   - `breeding_event_types` — verify (read-only, may skip)

2. **Migration 021: create_sync_log** — Create `sync_log` table per master plan schema:
   ```
   id (UUID), user_id (FK), device_id, action (push/pull),
   records_count, status (success/partial/failed),
   error_message, synced_at
   ```

#### Frontend tasks:
3. **IndexedDB v7** — Add two new tables:
   - `syncQueue`: `++autoId, id, entityType, action, data, createdAt, attempts, lastError`
     - `id` = entity UUID, `entityType` = 'cows'|'treatments'|etc, `action` = 'create'|'update'|'delete'
     - `data` = full entity payload
     - `createdAt` = timestamp for ordering
     - `attempts` = retry count, `lastError` = last failure message
   - `syncMeta`: `key` (primary)
     - Stores `lastPullTimestamp`, `deviceId` (generated UUID on first use)

4. **Generate deviceId** — On first app load, if no `deviceId` in syncMeta, generate UUID and store it.

#### Files to create/modify:
- `server/migrations/020_add_updated_at_columns.js` (new)
- `server/migrations/021_create_sync_log.js` (new)
- `client/src/db/indexedDB.js` (modify — bump to v7, add syncQueue + syncMeta)

---

### Phase 5.2 — Sync Service (Client-Side Engine)
**Goal:** Central sync service that manages the queue, processes pending items, and coordinates online/offline state.

#### Tasks:
1. **Rewrite `client/src/services/syncManager.js`** into a full sync engine:

   **State:**
   - `isOnline` (reactive ref)
   - `pendingCount` (reactive ref — count of syncQueue entries)
   - `isSyncing` (reactive ref — currently pushing/pulling)
   - `lastSyncTime` (reactive ref)

   **Queue operations:**
   - `enqueue(entityType, action, id, data)` — Add to syncQueue in IndexedDB
   - `dequeue(autoId)` — Remove processed entry
   - `getPending()` — Get all pending entries ordered by createdAt
   - `getPendingCount()` — Count of pending entries

   **Sync operations:**
   - `pushChanges()` — Read queue, POST to `/api/sync/push`, process results
   - `pullChanges(fullPull = false)` — GET `/api/sync/pull?since=X`, bulk upsert IndexedDB
   - `sync()` — Run push then pull (in that order — push first to avoid conflicts)

   **Connectivity:**
   - Listen to `window.addEventListener('online'/'offline')`
   - Polling fallback: check `navigator.onLine` + lightweight `HEAD /api/health` every 30s when offline
   - On connectivity restored → trigger `sync()`

   **Retry logic:**
   - On push failure: increment `attempts`, set `lastError`
   - Skip entries with `attempts >= 5` (mark as failed, surface to UI)
   - Exponential backoff: 2s, 4s, 8s, 16s, 32s between retries

2. **Export reactive state** for components to consume (replaces per-store syncStatus).

#### Files to create/modify:
- `client/src/services/syncManager.js` (rewrite)

---

### Phase 5.3 — Server Sync Endpoints
**Goal:** `POST /api/sync/push` and `GET /api/sync/pull` endpoints with conflict resolution.

#### Tasks:
1. **Create `server/routes/sync.js`**:

   **`POST /api/sync/push`** (authenticated):
   ```
   Body: {
     deviceId: string,
     changes: [
       { entityType, action, id, data, updatedAt }
     ]
   }
   Response: {
     results: [
       { id, entityType, status: 'applied'|'conflict'|'error', serverData?, error? }
     ]
   }
   ```
   - Process each change in a transaction
   - For each: compare `updatedAt` with server record
   - Apply if client is newer; return server version if server is newer
   - Log to `sync_log` table

   **`GET /api/sync/pull?since=<ISO timestamp>&full=1`** (authenticated):
   ```
   Response: {
     cows: [...], medications: [...], treatments: [...],
     healthIssues: [...], milkRecords: [...], breedingEvents: [...],
     breedTypes: [...], issueTypes: [...],
     syncedAt: <ISO timestamp>
   }
   ```
   - If `full=1`: return all non-deleted records
   - If `since=<timestamp>`: return records with `updated_at > since` (including soft-deleted)
   - Include soft-deleted records so client can remove them locally

   **`GET /api/sync/health`** (lightweight, no auth needed):
   - Returns `{ ok: true, timestamp: <ISO> }` — used for connectivity polling

2. **Mount route** in `server/app.js`: `app.use('/api/sync', require('./routes/sync'))`

3. **Conflict resolution helper** — `server/services/syncService.js`:
   - `processChange(entityType, action, id, data, clientUpdatedAt)` → result
   - Maps entityType to table name
   - Handles create (insert if not exists), update (compare timestamps), delete (soft-delete)

#### Files to create/modify:
- `server/routes/sync.js` (new)
- `server/services/syncService.js` (new)
- `server/app.js` (modify — mount sync route)

---

### Phase 5.4 — Store Integration (Wire Stores to Sync Queue)
**Goal:** All stores write to sync queue for offline support. Reads fall back to IndexedDB consistently.

#### Pattern for each store:
```javascript
// WRITE: optimistic local + queue
async function createCow(data) {
  const cow = { id: uuid(), ...data, updated_at: new Date().toISOString() }
  await db.cows.put(cow)                              // IndexedDB first
  await syncManager.enqueue('cows', 'create', cow.id, cow)  // Queue
  try {
    const { data: serverCow } = await api.post('/cows', data)
    await db.cows.put(serverCow)                       // Update with server version
    await syncManager.dequeueByEntityId('cows', cow.id) // Remove from queue
    return serverCow
  } catch (err) {
    if (syncManager.isOfflineError(err)) return cow    // Return local version
    throw err
  }
}

// READ: API with IndexedDB fallback (unchanged from current pattern)
```

#### Stores to update (in order):
1. **cows.js** — Create, update, soft-delete → enqueue. Already has best offline pattern, use as template.
2. **healthIssues.js** — Create, update status, delete → enqueue. Currently no write queue.
3. **treatments.js** — Create, delete → enqueue. Withdrawal dates calculated server-side — need to also calculate client-side for offline.
4. **milkRecords.js** — Special: debounced auto-save already works well. Wire failed saves into syncQueue instead of silently failing.
5. **breedingEvents.js** — Create, update, dismiss, delete → enqueue.
6. **medications.js** — Admin-only CRUD → enqueue (lower priority, admin usually online).
7. **issueTypes.js** — Admin-only CRUD → enqueue. Add IndexedDB table + offline fallback.
8. **breedTypes.js** — Admin-only CRUD → enqueue. Already has IndexedDB table but uses static fallback.

#### Additional IndexedDB changes:
- **issueTypes table** needs to be added to IndexedDB (currently missing — v8 or handle in v7).

#### Files to modify:
- All stores in `client/src/stores/` (8 files)
- `client/src/db/indexedDB.js` (add issueTypes table if not present)

---

### Phase 5.5 — Full Data Pull on Login
**Goal:** After login, pull all data into IndexedDB for full offline capability.

#### Tasks:
1. **Add `initialSync()` to syncManager** — Called after successful login:
   - Check `syncMeta.lastPullTimestamp`
   - If null (first login): `GET /api/sync/pull?full=1` → bulk upsert all tables
   - If exists: `GET /api/sync/pull?since=<timestamp>` → incremental update
   - Update `lastPullTimestamp`
   - Push any pending queue items first

2. **Wire into auth store** — After `setSession()`, call `syncManager.initialSync()`

3. **Show sync progress** — During initial sync, show a loading overlay:
   - "Syncing data... (X/Y tables)"
   - Block navigation until complete (or timeout after 15s and allow offline use)

4. **Force refresh** — Add "Force Sync" button in Settings (admin) that calls `initialSync(true)` to do a full pull.

#### Files to modify:
- `client/src/services/syncManager.js` (add initialSync)
- `client/src/stores/auth.js` (call initialSync after login)
- `client/src/views/admin/SettingsView.vue` (add Force Sync button)
- `client/src/App.vue` or new `SyncOverlay` molecule (sync progress UI)

---

### Phase 5.6 — Background Sync + Polling
**Goal:** Automatic sync when connectivity is restored, even if app is in background.

#### Tasks:
1. **Service Worker Background Sync** (where supported):
   - Register a `sync` event tag `'myherder-sync'` when items are added to queue
   - In service worker: on `sync` event, call `pushChanges()` via `fetch` to `/api/sync/push`
   - Note: Background Sync API has limited support — treat as enhancement

2. **Polling fallback** (primary mechanism):
   - When `isOnline` is false, poll `GET /api/sync/health` every 30 seconds
   - On first successful response → set `isOnline = true`, trigger `sync()`
   - When `isOnline` is true and `pendingCount > 0`, sync every 60 seconds
   - When `isOnline` is true and `pendingCount === 0`, no polling needed
   - Use `setInterval` with cleanup on unmount

3. **Online/offline event listeners**:
   - `window.addEventListener('online', () => sync())`
   - `window.addEventListener('offline', () => isOnline.value = false)`
   - These fire immediately on network change — polling is backup for unreliable events

4. **App visibility handling**:
   - On `document.visibilitychange` → if becoming visible and has pending items, trigger sync
   - Prevents stale data when user switches back to app

#### Files to modify:
- `client/src/services/syncManager.js` (add polling, visibility, Background Sync registration)
- Service worker config in `client/vite.config.js` (add custom SW code for Background Sync)

---

### Phase 5.7 — Sync Status UI
**Goal:** Global sync indicator shows pending count, errors, and allows manual retry.

#### Tasks:
1. **Create `client/src/stores/sync.js`** (new Pinia store):
   - Exposes syncManager reactive state: `isOnline`, `pendingCount`, `isSyncing`, `lastSyncTime`, `failedItems`
   - Actions: `triggerSync()`, `retryFailed()`, `clearFailed()`

2. **Update SyncIndicator atom** — Wire to sync store instead of cowsStore:
   - **Green + "Synced"**: `isOnline && pendingCount === 0`
   - **Yellow + "Pending (N)"**: `isOnline && pendingCount > 0`
   - **Yellow pulsing + "Syncing..."**: `isSyncing`
   - **Red + "Offline (N pending)"**: `!isOnline && pendingCount > 0`
   - **Red + "Offline"**: `!isOnline && pendingCount === 0`
   - Tap to open sync details panel

3. **Create SyncPanel molecule** (`client/src/components/molecules/SyncPanel.vue`):
   - Slide-up panel showing:
     - Last sync time
     - Pending items by entity type (e.g., "2 cows, 1 treatment")
     - Failed items with error messages
     - "Sync Now" button
     - "Retry Failed" button
     - "Force Full Sync" button (pulls everything fresh)
   - Opened by tapping SyncIndicator

4. **Update i18n** — Add sync keys for both en.json and af.json:
   - `sync.pending`, `sync.pendingCount`, `sync.failed`, `sync.syncNow`, `sync.retryFailed`, `sync.forcePull`, `sync.lastSync`, `sync.neverSynced`, `sync.syncComplete`, `sync.syncFailed`, `sync.conflictResolved`

5. **Remove per-store syncStatus** — cowsStore.syncStatus → use global sync store instead. Clean up SyncIndicator's old cowsStore dependency.

#### Files to create/modify:
- `client/src/stores/sync.js` (new)
- `client/src/components/atoms/SyncIndicator.vue` (modify)
- `client/src/components/molecules/SyncPanel.vue` (new)
- `client/src/stores/cows.js` (remove syncStatus)
- `client/src/i18n/en.json` (modify)
- `client/src/i18n/af.json` (modify)

---

### Phase 5.8 — Offline Login + Edge Cases
**Goal:** App works fully offline with cached JWT. Handle edge cases.

#### Tasks:
1. **Offline login** — Auth store already caches JWT in IndexedDB. Enhance:
   - On login page, if offline: check IndexedDB for valid (non-expired) JWT
   - If valid: hydrate session, allow offline use, show "Offline Mode" banner
   - If expired: show "Cannot login — no connection" message
   - JWT expiry check: decode payload, compare `exp` with `Date.now()`

2. **Token refresh handling**:
   - When online and token is within 1 hour of expiry: auto-refresh via `POST /api/auth/refresh`
   - Store refreshed token in both localStorage and IndexedDB

3. **Stale data warning**:
   - If `lastPullTimestamp` is > 24 hours old, show subtle banner: "Data may be outdated — connect to sync"
   - Don't block usage, just inform

4. **Queue overflow protection**:
   - If syncQueue has > 100 items, show warning
   - If > 500 items, show alert and suggest connecting to sync

5. **Concurrent edit protection**:
   - If two tabs are open, use `BroadcastChannel` to coordinate:
     - When one tab syncs, notify others to refresh their data
     - Prevent duplicate sync runs

#### Files to modify:
- `client/src/stores/auth.js` (offline login, token refresh)
- `client/src/services/syncManager.js` (stale data check, queue overflow, BroadcastChannel)
- `client/src/views/LoginView.vue` (offline login UI)
- `client/src/App.vue` (stale data banner)
- `server/routes/auth.js` (add refresh endpoint if missing)
- `client/src/i18n/en.json` + `af.json` (offline login messages)

---

## Quality Gate — After Every Phase

Each phase ends with a mandatory review/refactor/test step before moving to the next. Do NOT skip this.

### Step 1: Tests
- Write **unit tests** (Vitest) for all new functions/logic in the phase
- Run full test suite: `cd client && npm run test:run` — must pass
- Test files go in `client/src/tests/` following existing naming: `<feature>.test.js`

**Phase-specific test focus:**
| Phase | Test Focus |
|-------|-----------|
| 5.1 | IndexedDB v7 schema upgrade, syncQueue table CRUD, deviceId generation |
| 5.2 | enqueue/dequeue, getPending, retry backoff timing, isOfflineError detection |
| 5.3 | Server sync endpoints — conflict resolution logic (mock DB), push/pull payloads, sync_log writes |
| 5.4 | Each store's offline write path — enqueue on failure, dequeue on success, optimistic local write |
| 5.5 | initialSync full vs incremental, lastPullTimestamp update, auth→sync wiring |
| 5.6 | Polling start/stop, visibility handler, online/offline event reactions |
| 5.7 | Sync store state derivation, SyncIndicator states, SyncPanel pending/failed display |
| 5.8 | Offline login with valid/expired JWT, stale data detection, queue overflow thresholds |

### Step 2: Lint + Dead Code
- Run `npm run lint:fix` — fix all new warnings/errors
- Run `npm run knip` — ensure no dead exports, unused imports, or orphaned files were introduced
- Remove any code that was replaced (e.g., old per-store syncStatus after Phase 5.7)

### Step 3: Self-Review Checklist
Before marking a phase complete, verify:
- [ ] No redundant DB queries (e.g., fetching a record you already have)
- [ ] No duplicated patterns (e.g., offline fallback logic copy-pasted instead of using syncManager)
- [ ] Joi schemas at top level (not inside handlers) for any new server routes
- [ ] All new i18n keys added to BOTH `en.json` and `af.json`
- [ ] IndexedDB version bumped only once per phase (not per table)
- [ ] No console.log left in production code (use proper error handling)
- [ ] New files placed in correct tier (atoms/molecules/organisms/views)
- [ ] Existing tests still pass — no regressions

### Step 4: Update Documentation
- Update `MEMORY.md` phase status (e.g., "Phase 5.1: COMPLETE")
- Update `CLAUDE.md` API conventions if new endpoints were added
- Note any new pattern reference files in MEMORY.md

---

## Implementation Order & Dependencies

```
Phase 5.1 (DB Foundation)
    ↓ + Quality Gate
Phase 5.2 (Sync Service)  ←──── Phase 5.3 (Server Endpoints)
    ↓                                ↓
    └──── + Quality Gate ────────────┘
                  ↓
Phase 5.4 (Store Integration)
    ↓ + Quality Gate
Phase 5.5 (Full Pull on Login)
    ↓ + Quality Gate
Phase 5.6 (Background Sync + Polling)
    ↓ + Quality Gate
Phase 5.7 (Sync Status UI)
    ↓ + Quality Gate
Phase 5.8 (Edge Cases + Hardening)
    ↓ + Quality Gate (final)
```

Phases 5.2 and 5.3 can be built in parallel (client sync service + server endpoints).
All other phases are sequential. **No phase starts until the previous phase's quality gate passes.**

---

## Key Test Scenarios (Integration / Manual)

These span multiple phases and should be validated at the end of Phase 5.8:

1. Create cow offline → come online → cow syncs to server
2. Edit cow offline → same cow edited on server → conflict resolved (last-write-wins)
3. Delete cow offline → come online → soft-delete syncs
4. Bulk offline operations (10+ changes) → come online → all sync in order
5. Failed sync → retry with backoff → eventually succeeds
6. Login offline with cached JWT → full app access
7. Two devices sync conflicting milk records → correct winner
8. App closed during sync → reopen → queue intact, resumes sync

---

## Entity-to-Table Mapping (for sync endpoints)

| entityType (client) | DB Table | Sync Support |
|---------------------|----------|--------------|
| cows | cows | Full CRUD |
| medications | medications | Full CRUD (admin) |
| treatments | treatments | Create + Delete |
| healthIssues | health_issues | Full CRUD |
| milkRecords | milk_records | Create + Update |
| breedingEvents | breeding_events | Full CRUD |
| breedTypes | breed_types | Full CRUD (admin) |
| issueTypes | issue_types | Full CRUD (admin) |
