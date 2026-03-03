# Phase 12C: Test Coverage Tier 1 — Critical Untested Code

**Goal:** Add tests for the highest-risk untested code: sync engine, untested CRUD routes, all data-entry form views, and 3 untested stores. Target: cover the code paths most likely to produce bugs in production.

**Estimated effort:** 2–3 sessions

---

## 12C.1 — Backend: `sync.js` Route + `syncService.js` Tests

**Priority:** HIGHEST — sync is the most complex untested code path.

**New file:** `server/tests/sync.test.js`

**Test scenarios (~15 tests):**

| # | Test | Why |
|---|------|-----|
| 1 | `GET /sync/health` returns `{ ok, timestamp }` without auth | Public endpoint |
| 2 | `POST /sync/push` with empty changes array returns empty results | Edge case |
| 3 | `POST /sync/push` creates a new cow | Happy path — create |
| 4 | `POST /sync/push` updates an existing cow | Happy path — update |
| 5 | `POST /sync/push` soft-deletes a cow | Happy path — delete |
| 6 | `POST /sync/push` LWW: server newer wins | Conflict resolution |
| 7 | `POST /sync/push` LWW: client newer wins | Conflict resolution |
| 8 | `POST /sync/push` with invalid entityType returns error per item | Error handling |
| 9 | `POST /sync/push` mixed batch (some succeed, some fail) | Partial success |
| 10 | `GET /sync/pull` returns all entity types | Full pull |
| 11 | `GET /sync/pull?since=<ISO>` returns only newer data | Incremental pull |
| 12 | `GET /sync/pull?full=1` ignores `since` | Full refresh |
| 13 | `GET /sync/pull` includes deleted items in `deleted` array | Soft delete sync |
| 14 | `POST /sync/push` requires auth | Auth check |
| 15 | `GET /sync/pull` requires auth | Auth check |

**Pattern:** Follow `server/tests/cows.test.js` structure.

---

## 12C.2 — Backend: `breedTypes.js` Route Tests

**New file:** `server/tests/breedTypes.test.js`

**Test scenarios (~12 tests):**

| # | Test |
|---|------|
| 1 | `GET /breed-types` returns active only |
| 2 | `GET /breed-types?all=1` returns all (admin) |
| 3 | `GET /breed-types?all=1` forbidden for worker |
| 4 | `POST /breed-types` creates with auto-generated code |
| 5 | `POST /breed-types` rejects duplicate name |
| 6 | `POST /breed-types` forbidden for worker |
| 7 | `PUT /breed-types/:id` updates name (code stays immutable) |
| 8 | `PUT /breed-types/:id` returns 404 for nonexistent |
| 9 | `DELETE /breed-types/:id` succeeds when unused |
| 10 | `DELETE /breed-types/:id` blocked when cows reference it |
| 11 | `DELETE /breed-types/:id` forbidden for worker |
| 12 | `GET /breed-types` requires auth |

**Pattern:** Follow `server/tests/issueTypes.test.js` (closest CRUD-with-code-slug pattern).

---

## 12C.3 — Backend: `featureFlags.js` Route Tests

**New file:** `server/tests/featureFlags.test.js`

**Test scenarios (~6 tests):**

| # | Test |
|---|------|
| 1 | `GET /feature-flags` returns all flags as camelCase |
| 2 | `PATCH /feature-flags` toggles a flag (admin) |
| 3 | `PATCH /feature-flags` forbidden for worker |
| 4 | `PATCH /feature-flags` with invalid key returns 400 |
| 5 | `PATCH /feature-flags` returns updated full object |
| 6 | `GET /feature-flags` requires auth |

---

## 12C.4 — Frontend Store: `breedTypes.js` Tests

**New file:** `client/src/tests/breedTypes.store.test.js`

**Test scenarios (~10 tests):**

| # | Test |
|---|------|
| 1 | `fetchAll()` populates store from API |
| 2 | `fetchAll()` falls back to IndexedDB when API fails |
| 3 | `fetchActive()` returns only active breed types |
| 4 | `create()` calls API and enqueues sync |
| 5 | `update()` calls API and enqueues sync |
| 6 | `remove()` calls API and enqueues sync |
| 7 | `create()` offline enqueues to sync queue |
| 8 | Store caches after first fetch (doesn't re-fetch) |
| 9 | `getById()` returns correct breed type |
| 10 | Store persists to IndexedDB on fetch |

**Pattern:** Follow `client/src/tests/issueTypes.store.test.js`.

---

## 12C.5 — Frontend Store: `medications.js` Tests

**New file:** `client/src/tests/medications.store.test.js`

**Test scenarios (~8 tests):**

| # | Test |
|---|------|
| 1 | `fetchAll()` populates store from API |
| 2 | `fetchAll()` falls back to IndexedDB on failure |
| 3 | `fetchAll({ includeInactive: true })` sends `?all=1` |
| 4 | `create()` calls API and refreshes |
| 5 | `update()` calls API and refreshes |
| 6 | `remove()` calls API |
| 7 | Offline create enqueues to sync queue |
| 8 | Store caches after first successful fetch |

**Pattern:** Follow `client/src/tests/issueTypes.store.test.js`.

---

## 12C.6 — Frontend Store: `treatments.js` Tests

**New file:** `client/src/tests/treatments.store.test.js`

**Test scenarios (~10 tests):**

| # | Test |
|---|------|
| 1 | `fetchByCow(cowId)` populates items from API |
| 2 | `fetchByCow()` falls back to IndexedDB on failure |
| 3 | `fetchWithdrawal()` returns cows on withdrawal |
| 4 | `create()` calls API with correct payload |
| 5 | `create()` offline enqueues to sync queue |
| 6 | `remove()` calls API |
| 7 | `remove()` offline enqueues to sync queue |
| 8 | Store groups withdrawal by cow |
| 9 | Fetched treatments include medication names |
| 10 | Store resets on clearAll() |

**Pattern:** Follow `client/src/tests/healthIssues.store.test.js`.

---

## 12C.7 — Frontend View: `CowFormView.vue` Tests

**New file:** `client/src/tests/CowFormView.test.js`

**Test scenarios (~12 tests):**

| # | Test |
|---|------|
| 1 | Renders create form with empty fields |
| 2 | Renders edit form pre-filled with cow data |
| 3 | Tag number field is required |
| 4 | Submits create form → calls store.createCow() |
| 5 | Submits edit form → calls store.updateCow() |
| 6 | Breed dropdown shows breed types from store |
| 7 | Sex toggle changes visible fields (bull fields for male) |
| 8 | Shows calving banner when routed from calving event |
| 9 | Displays validation errors for invalid input |
| 10 | Shows back button navigating to cow list |
| 11 | is_dry toggle visible for female cows only |
| 12 | Life phase override dropdown works |

**Pattern:** Follow `client/src/tests/MilkRecordingView.test.js` for view testing setup.

---

## 12C.8 — Frontend View: `LogBreedingView.vue` Tests

**New file:** `client/src/tests/LogBreedingView.test.js`

**Test scenarios (~10 tests):**

| # | Test |
|---|------|
| 1 | Renders create form with cow search dropdown |
| 2 | Event type selector shows all breeding event types |
| 3 | Selecting "preg_check_positive" shows expected calving date input |
| 4 | Submits form → calls breedingEventsStore.create() |
| 5 | Auto-dates populate based on breed type |
| 6 | Edit mode pre-fills from existing event |
| 7 | Bull/semen fields show for insemination events |
| 8 | Cost field accepts numeric input |
| 9 | Shows back button navigating to breeding hub |
| 10 | Required field validation (cow_id, event_type, event_date) |

---

## 12C.9 — Frontend View: `LogIssueView.vue` Tests

**New file:** `client/src/tests/LogIssueView.test.js`

**Test scenarios (~8 tests):**

| # | Test |
|---|------|
| 1 | Renders form with cow search and issue type selector |
| 2 | TeatSelector visible for mastitis-type issues |
| 3 | Severity selector works (1-5 scale) |
| 4 | Submits form → calls healthIssuesStore.create() |
| 5 | Shows validation error when cow not selected |
| 6 | Pre-fills cow when cow_id in route query |
| 7 | Notes textarea accepts free text |
| 8 | Back button navigates correctly |

---

## 12C.10 — Frontend View: `LogTreatmentView.vue` Tests

**New file:** `client/src/tests/LogTreatmentView.test.js`

**Test scenarios (~8 tests):**

| # | Test |
|---|------|
| 1 | Renders form with cow search and medication dropdown |
| 2 | Withdrawal dates auto-calculate from medication |
| 3 | Submits form → calls treatmentsStore.create() |
| 4 | Cost field accepts decimal numbers |
| 5 | Dosage and route fields work |
| 6 | Links to health issue when issue_id provided |
| 7 | Vet visit toggle works |
| 8 | Back button navigates correctly |

---

## Verification Checklist

- [ ] `npx jest -- sync` → 15+ tests passing
- [ ] `npx jest -- breedTypes` → 12+ tests passing
- [ ] `npx jest -- featureFlags` → 6+ tests passing
- [ ] `cd client && npm run test:run` → 3 new store test files passing (~28 tests)
- [ ] `cd client && npm run test:run` → 4 new view test files passing (~38 tests)
- [ ] Full test suite: 0 failures
- [ ] Total new tests: ~99 (33 backend + 66 frontend)
- [ ] Coverage of critical data-entry paths: sync, breed types, feature flags, cow form, breeding log, issue log, treatment log
