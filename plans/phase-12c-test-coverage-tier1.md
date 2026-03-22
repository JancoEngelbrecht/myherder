# Phase 12C: Test Coverage Tier 1 — Critical Untested Code

**Goal:** Add tests for the highest-risk untested code: sync engine, untested CRUD routes, all data-entry form views, and 3 untested stores. Target: cover the code paths most likely to produce bugs in production.

**Estimated effort:** 2–3 sessions

---

## Audit Baseline (2026-03-03)

| Category                   | Tested | Total      | Coverage |
| -------------------------- | ------ | ---------- | -------- |
| Backend routes             | 14/17  | 375 tests  | 82%      |
| Backend services           | 1/4    | 6 tests    | 25%      |
| Frontend stores            | 8/11   | 143 tests  | 73%      |
| Frontend views             | 13/33  | ~157 tests | 39%      |
| Frontend components        | 7/14   | ~67 tests  | 50%      |
| Frontend utils/composables | 2/7    | ~45 tests  | 29%      |

**Untested backend routes:** sync.js, breedTypes.js, featureFlags.js
**Untested stores:** breedTypes.js, medications.js, treatments.js
**Untested data-entry views:** CowFormView, LogBreedingView, LogIssueView, LogTreatmentView (+ 16 more in 12D)

After 12C: backend routes → 100%, stores → 100%, data-entry views covered.

---

## 12C.1 — Backend: `sync.js` Route + `syncService.js` Tests

**Priority:** HIGHEST — sync is the most complex untested code path (LWW conflict resolution, batch push/pull, device tracking).

**New file:** `server/tests/sync.test.js`

**Test scenarios (~15 tests):**

| #   | Test                                                                            | Why                                 |
| --- | ------------------------------------------------------------------------------- | ----------------------------------- |
| 1   | `GET /sync/health` returns `{ ok, timestamp }` without auth                     | Public endpoint — no token required |
| 2   | `POST /sync/push` with empty changes array returns empty results                | Edge case — shouldn't crash         |
| 3   | `POST /sync/push` creates a new cow                                             | Happy path — create action          |
| 4   | `POST /sync/push` updates an existing cow                                       | Happy path — update action          |
| 5   | `POST /sync/push` soft-deletes a cow (sets deleted_at)                          | Happy path — delete action          |
| 6   | `POST /sync/push` LWW: server row newer → keeps server data                     | Conflict resolution core logic      |
| 7   | `POST /sync/push` LWW: client row newer → applies client data                   | Conflict resolution core logic      |
| 8   | `POST /sync/push` with invalid entityType returns error per item                | Error handling — invalid entity     |
| 9   | `POST /sync/push` mixed batch (some succeed, some fail) returns per-item status | Partial success handling            |
| 10  | `GET /sync/pull` returns all entity types (cows, meds, treatments, etc.)        | Full pull — check all keys present  |
| 11  | `GET /sync/pull?since=<ISO>` returns only rows updated after `since`            | Incremental pull — delta sync       |
| 12  | `GET /sync/pull?full=1` ignores `since` param                                   | Full refresh override               |
| 13  | `GET /sync/pull` includes soft-deleted items in `deleted` array                 | Soft delete propagation             |
| 14  | `POST /sync/push` requires auth (401 without token)                             | Auth guard                          |
| 15  | `GET /sync/pull` requires auth (401 without token)                              | Auth guard                          |

**Pattern:** Follow `server/tests/cows.test.js` structure (supertest + shared app setup).

---

## 12C.2 — Backend: `breedTypes.js` Route Tests

**New file:** `server/tests/breedTypes.test.js`

**Test scenarios (~12 tests):**

| #   | Test                                                                   | Why                     |
| --- | ---------------------------------------------------------------------- | ----------------------- |
| 1   | `GET /breed-types` returns active only (excludes is_active=0)          | Default filtering       |
| 2   | `GET /breed-types?all=1` returns all including inactive (admin)        | Admin override          |
| 3   | `GET /breed-types?all=1` returns 403 for worker role                   | Authorization           |
| 4   | `POST /breed-types` creates with auto-generated code from name         | Code slug generation    |
| 5   | `POST /breed-types` rejects duplicate name (409)                       | Uniqueness constraint   |
| 6   | `POST /breed-types` returns 403 for worker role                        | Authorization           |
| 7   | `PUT /breed-types/:id` updates name but code stays immutable           | Code immutability       |
| 8   | `PUT /breed-types/:id` can update timing fields (gestation_days, etc.) | Breed-specific settings |
| 9   | `PUT /breed-types/:id` returns 404 for nonexistent id                  | Not found handling      |
| 10  | `DELETE /breed-types/:id` succeeds when no cows reference it           | Clean delete            |
| 11  | `DELETE /breed-types/:id` returns 409 when cows reference it           | FK protection           |
| 12  | `DELETE /breed-types/:id` returns 403 for worker role                  | Authorization           |

**Pattern:** Follow `server/tests/issueTypes.test.js` (closest CRUD-with-code-slug pattern).

---

## 12C.3 — Backend: `featureFlags.js` Route Tests

**New file:** `server/tests/featureFlags.test.js`

**Test scenarios (~8 tests):**

| #   | Test                                                        | Why                                                 |
| --- | ----------------------------------------------------------- | --------------------------------------------------- |
| 1   | `GET /feature-flags` returns all flags as camelCase object  | Response shape — DB is snake_case, API is camelCase |
| 2   | `GET /feature-flags` requires auth (401 without token)      | Auth guard                                          |
| 3   | `PATCH /feature-flags` toggles a single flag (admin)        | Happy path update                                   |
| 4   | `PATCH /feature-flags` updates multiple flags at once       | Bulk update                                         |
| 5   | `PATCH /feature-flags` returns 403 for worker role          | Admin-only enforcement                              |
| 6   | `PATCH /feature-flags` with invalid/unknown key returns 400 | Validation — reject bad keys                        |
| 7   | `PATCH /feature-flags` with non-boolean value returns 400   | Validation — type check                             |
| 8   | `PATCH /feature-flags` returns updated full flags object    | Response shape after update                         |

---

## 12C.4 — Frontend Store: `breedTypes.js` Tests

**New file:** `client/src/tests/breedTypes.store.test.js`

**Test scenarios (~10 tests):**

| #   | Test                                                    | Why                     |
| --- | ------------------------------------------------------- | ----------------------- |
| 1   | `fetchAll()` populates store items from API             | Happy path              |
| 2   | `fetchAll()` falls back to IndexedDB when API fails     | Offline resilience      |
| 3   | `fetchAll()` persists API data to IndexedDB             | Cache persistence       |
| 4   | `fetchAll()` skips re-fetch when already loaded (cache) | Prevent redundant calls |
| 5   | `fetchActive()` returns only active breed types         | Active filtering        |
| 6   | `create()` calls API and refreshes store                | Mutation + refresh      |
| 7   | `update()` calls API and refreshes store                | Mutation + refresh      |
| 8   | `remove()` calls API and refreshes store                | Mutation + refresh      |
| 9   | `getById()` returns correct breed type by id            | Getter lookup           |
| 10  | `$reset()` clears store state                           | Cleanup                 |

**Pattern:** Follow `client/src/tests/issueTypes.store.test.js` (mocked API + IndexedDB).

---

## 12C.5 — Frontend Store: `medications.js` Tests

**New file:** `client/src/tests/medications.store.test.js`

**Test scenarios (~8 tests):**

| #   | Test                                                 | Why                     |
| --- | ---------------------------------------------------- | ----------------------- |
| 1   | `fetchAll()` populates store from API (active only)  | Default behavior        |
| 2   | `fetchAll()` falls back to IndexedDB on failure      | Offline resilience      |
| 3   | `fetchAll({ includeInactive: true })` sends `?all=1` | Admin mode              |
| 4   | `fetchAll()` persists to IndexedDB on success        | Cache persistence       |
| 5   | `fetchAll()` skips re-fetch when already loaded      | Prevent redundant calls |
| 6   | `create()` calls API and refreshes store             | Mutation + refresh      |
| 7   | `update()` calls API and refreshes store             | Mutation + refresh      |
| 8   | `remove()` calls API and refreshes store             | Mutation + refresh      |

**Pattern:** Follow `client/src/tests/issueTypes.store.test.js`.

---

## 12C.6 — Frontend Store: `treatments.js` Tests

**New file:** `client/src/tests/treatments.store.test.js`

**Test scenarios (~10 tests):**

| #   | Test                                               | Why                 |
| --- | -------------------------------------------------- | ------------------- |
| 1   | `fetchByCow(cowId)` populates items from API       | Per-cow fetch       |
| 2   | `fetchByCow()` falls back to IndexedDB on failure  | Offline resilience  |
| 3   | `fetchWithdrawal()` populates withdrawal list      | Withdrawal tracking |
| 4   | `create()` calls API with correct payload          | Mutation happy path |
| 5   | `create()` enqueues to sync queue when offline     | Offline create      |
| 6   | `remove()` calls API                               | Delete happy path   |
| 7   | `remove()` enqueues to sync queue when offline     | Offline delete      |
| 8   | Fetched treatments include joined medication names | Joined field check  |
| 9   | `clearAll()` resets store state                    | Cleanup             |
| 10  | `fetchByCow()` persists to IndexedDB               | Cache persistence   |

**Pattern:** Follow `client/src/tests/healthIssues.store.test.js` (mocked API + IndexedDB).

---

## 12C.7 — Frontend View: `CowFormView.vue` Tests

**New file:** `client/src/tests/CowFormView.test.js`

**Test scenarios (~12 tests):**

| #   | Test                                                                     | Why                   |
| --- | ------------------------------------------------------------------------ | --------------------- |
| 1   | Renders create form with empty fields (no route id)                      | Create mode           |
| 2   | Renders edit form pre-filled with cow data (route id present)            | Edit mode             |
| 3   | Tag number field is required — submit blocked without it                 | Validation            |
| 4   | Submits create form → calls cowsStore.createCow()                        | Create mutation       |
| 5   | Submits edit form → calls cowsStore.updateCow()                          | Update mutation       |
| 6   | Breed dropdown shows breed types from breedTypesStore                    | Store integration     |
| 7   | Sex toggle changes visible fields (bull fields for male)                 | Conditional rendering |
| 8   | is_dry toggle visible for female cows only                               | Sex-conditional field |
| 9   | Shows calving banner when routed from calving event (query.from_calving) | Calving pre-fill flow |
| 10  | Life phase override dropdown renders options                             | Life phase selection  |
| 11  | Back button navigates to cow list                                        | Navigation            |
| 12  | Sire/dam search dropdowns render for parent linkage                      | Parent fields         |

**Pattern:** Follow `client/src/tests/MilkRecordingView.test.js` for view testing setup (router mock, store stubs).

---

## 12C.8 — Frontend View: `LogBreedingView.vue` Tests

**New file:** `client/src/tests/LogBreedingView.test.js`

**Test scenarios (~12 tests):**

| #   | Test                                                                     | Why                   |
| --- | ------------------------------------------------------------------------ | --------------------- |
| 1   | Renders create form with CowSearchDropdown                               | Form structure        |
| 2   | Event type selector shows all breeding event types                       | Type options          |
| 3   | Selecting `preg_check_positive` shows expected calving date input        | Conditional field     |
| 4   | Selecting `ai_insemination` shows bull/semen fields                      | Conditional field     |
| 5   | Submits form → calls breedingEventsStore.create() with correct payload   | Create mutation       |
| 6   | Edit mode pre-fills from existing event (route id present)               | Edit mode             |
| 7   | Auto-dates populate based on breed type when cow selected                | Breed-aware auto-calc |
| 8   | Cost field accepts numeric input                                         | Field validation      |
| 9   | Required field validation blocks submit (cow_id, event_type, event_date) | Validation            |
| 10  | Shows back button navigating to breeding hub                             | Navigation            |
| 11  | Calving event redirects to cow form with from_calving query              | Post-calving flow     |
| 12  | `expected_dry_off` auto-calculates from expected calving date            | Preg check date calc  |

---

## 12C.9 — Frontend View: `LogIssueView.vue` Tests

**New file:** `client/src/tests/LogIssueView.test.js`

**Test scenarios (~10 tests):**

| #   | Test                                                        | Why                   |
| --- | ----------------------------------------------------------- | --------------------- |
| 1   | Renders form with CowSearchDropdown and issue type selector | Form structure        |
| 2   | Issue type dropdown populated from issueTypesStore          | Store integration     |
| 3   | TeatSelector visible when mastitis-type issue selected      | Conditional component |
| 4   | TeatSelector hidden for non-mastitis issues                 | Conditional component |
| 5   | Severity selector renders (1-5 scale)                       | Severity input        |
| 6   | Submits form → calls healthIssuesStore.create()             | Create mutation       |
| 7   | Shows validation error when cow not selected                | Required field        |
| 8   | Pre-fills cow when cow_id in route query                    | Pre-fill from context |
| 9   | Notes textarea accepts free text                            | Optional field        |
| 10  | Back button navigates correctly                             | Navigation            |

---

## 12C.10 — Frontend View: `LogTreatmentView.vue` Tests

**New file:** `client/src/tests/LogTreatmentView.test.js`

**Test scenarios (~10 tests):**

| #   | Test                                                        | Why                   |
| --- | ----------------------------------------------------------- | --------------------- |
| 1   | Renders form with CowSearchDropdown and medication dropdown | Form structure        |
| 2   | Medication dropdown populated from medicationsStore         | Store integration     |
| 3   | Withdrawal dates auto-calculate when medication selected    | Auto-calc             |
| 4   | Submits form → calls treatmentsStore.create()               | Create mutation       |
| 5   | Cost field accepts decimal numbers                          | Numeric input         |
| 6   | Dosage and route fields render and accept input             | Optional fields       |
| 7   | Links to health issue when issue_id in route query          | Pre-fill from context |
| 8   | Vet visit toggle works (boolean checkbox/switch)            | Toggle field          |
| 9   | Back button navigates correctly                             | Navigation            |
| 10  | Additional medications multi-select works                   | Extra meds junction   |

---

## Verification Checklist

After each section, run the relevant tests:

- [x] `npm test -- sync` → 15 tests passing
- [x] `npm test -- breedTypes` → 12 tests passing
- [x] `npm test -- featureFlags` → 8 tests passing
- [x] `cd client && npm run test:run` → 3 new store test files passing (30 tests)
- [x] `cd client && npm run test:run` → 4 new view test files passing (45 tests)

Final checks:

- [x] `npm test` → full backend suite green (375 existing + 35 new = 410)
- [x] `cd client && npm run test:run` → full frontend suite green (393 existing + 75 new = 468, 1 pre-existing failure)
- [x] `npm run lint` → 0 new errors
- [x] Total new tests: 110 (35 backend + 75 frontend)
- [x] Coverage of critical paths: sync engine, breed types CRUD, feature flags, cow form, breeding log, issue log, treatment log
- [x] All 3 untested backend routes now covered → 17/17 (100%)
- [x] All 3 untested stores now covered → 11/11 (100%)
- [x] All 4 critical data-entry views now covered

## What's NOT in 12C (deferred to 12D)

The audit found 20 additional untested frontend files. These are covered by Phase 12D:

**Views (16 untested):** CowDetailView (764 LOC), CowListView (458), CowReproView (462), LoginView (365), DashboardView (284), IssueDetailView (526), TreatmentDetailView (343), OpenIssuesView (311), WithdrawalListView (311), BreedingEventsView (351), CowIssueHistoryView (186), CowTreatmentHistoryView (236), admin/BreedTypeManagement (414), admin/IssueTypeManagement (592), admin/MedicationManagement (560), admin/SettingsView (364)

**Components (7 untested):** SyncPanel (327), BreedingEventCard (301), PaginationBar (173), TeatSelector (122), ToastMessage (107), SearchInput (101), ConfirmDialog (69)

**Utils (4 untested):** useToast.js, apiError.js, initials.js, chartSetup.js
