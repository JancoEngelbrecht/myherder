# Phase 12D: Test Coverage Tier 2 — Views, Components, Utilities

**Goal:** Cover the remaining untested views (navigation, detail, admin, history), untested components, and utility functions. After this phase, every source file has at least basic test coverage.

**Estimated effort:** 2–3 sessions

**Prerequisite:** Phase 12C complete (stores 100%, data-entry views covered)

---

## Audit Baseline (post-12C targets)

| Category                           | Pre-12D     | Post-12D Target |
| ---------------------------------- | ----------- | --------------- |
| Frontend views                     | 17/33 (52%) | 33/33 (100%)    |
| Frontend components                | 7/14 (50%)  | 14/14 (100%)    |
| Frontend utils/composables         | 2/7 (29%)   | 7/7 (100%)      |
| Backend middleware/config/services | 1/5 (20%)   | 5/5 (100%)      |

**Remaining untested:** 16 views, 7 components, 5 utils/composables, 5 backend infrastructure files = 31 new test files, ~152 new tests

---

## 12D.1 — Frontend Views: Navigation & Dashboard (~22 tests)

### `DashboardView.vue` Tests (284 LOC)

**New file:** `client/src/tests/DashboardView.test.js`

| #   | Test                                             | Why                  |
| --- | ------------------------------------------------ | -------------------- |
| 1   | Renders welcome message with user's name         | Basic render         |
| 2   | Action cards render based on user permissions    | Permission gating    |
| 3   | Admin sees all action cards                      | Admin bypass         |
| 4   | Worker with limited permissions sees subset only | Worker restrictions  |
| 5   | Action card click navigates to correct route     | Navigation           |
| 6   | Shows farm name from settings                    | Settings integration |

### `LoginView.vue` Tests (365 LOC)

**New file:** `client/src/tests/LoginView.test.js`

| #   | Test                                             | Why                    |
| --- | ------------------------------------------------ | ---------------------- |
| 1   | Renders password login form by default           | Default mode           |
| 2   | Toggle switches to PIN login form                | Mode switching         |
| 3   | PIN input limited to 4 digits                    | PIN format enforcement |
| 4   | Submits password login → calls authStore.login() | Password auth          |
| 5   | Submits PIN login → calls authStore.loginPin()   | PIN auth               |
| 6   | Shows error message on invalid credentials       | Error display          |
| 7   | Redirects to dashboard on success                | Post-login navigation  |
| 8   | Shows farm name from public settings endpoint    | Branding               |

### `CowListView.vue` Tests (458 LOC)

**New file:** `client/src/tests/CowListView.test.js`

| #   | Test                                   | Why                  |
| --- | -------------------------------------- | -------------------- |
| 1   | Renders list of cow cards              | Basic render         |
| 2   | Search input filters cows              | Search functionality |
| 3   | Status filter chips work               | Status filtering     |
| 4   | Sex filter chips work                  | Sex filtering        |
| 5   | Empty state shown when no cows match   | Empty state          |
| 6   | FAB button navigates to cow form       | Create action        |
| 7   | Cow card click navigates to cow detail | Navigation           |
| 8   | Pagination loads next page             | Pagination           |

---

## 12D.2 — Frontend Views: Detail & History Views (~25 tests)

### `CowDetailView.vue` Tests (764 LOC — largest view)

**New file:** `client/src/tests/CowDetailView.test.js`

| #   | Test                                                         | Why                  |
| --- | ------------------------------------------------------------ | -------------------- |
| 1   | Renders cow info (tag, name, breed, dob, status)             | Basic render         |
| 2   | Shows life phase badge                                       | Life phase display   |
| 3   | Shows sire/dam names when available                          | Parent linkage       |
| 4   | Shows breed type name                                        | Breed display        |
| 5   | Action buttons render (edit, log issue, log treatment, etc.) | Action section       |
| 6   | Delete button shows ConfirmDialog (admin only)               | Admin delete         |
| 7   | Shows withdrawal badge for female on withdrawal              | Withdrawal indicator |
| 8   | Male cows don't show withdrawal badge                        | Sex guard            |
| 9   | Shows 404/error for invalid cow ID                           | Error state          |

### `IssueDetailView.vue` Tests (526 LOC)

**New file:** `client/src/tests/IssueDetailView.test.js`

| #   | Test                                            | Why                |
| --- | ----------------------------------------------- | ------------------ |
| 1   | Renders issue with type emoji, severity, status | Basic render       |
| 2   | Shows affected teats (parsed from JSON string)  | Teat display       |
| 3   | Status change buttons work (resolve, escalate)  | Status transitions |
| 4   | Comments section renders existing comments      | Comments list      |
| 5   | Add comment form submits                        | Comment creation   |
| 6   | Shows linked treatments if any                  | Treatment linkage  |

### `TreatmentDetailView.vue` Tests (343 LOC)

**New file:** `client/src/tests/TreatmentDetailView.test.js`

| #   | Test                                              | Why                |
| --- | ------------------------------------------------- | ------------------ |
| 1   | Renders treatment info (medication, dosage, cost) | Basic render       |
| 2   | Shows withdrawal end dates (milk + meat)          | Withdrawal display |
| 3   | Shows linked health issue if present              | Issue linkage      |
| 4   | Delete button visible for admin only              | Admin delete       |

### `CowIssueHistoryView.vue` Tests (186 LOC)

**New file:** `client/src/tests/CowIssueHistoryView.test.js`

| #   | Test                                      | Why            |
| --- | ----------------------------------------- | -------------- |
| 1   | Renders list of issues for a specific cow | Per-cow issues |
| 2   | Issue cards link to issue detail          | Navigation     |
| 3   | Empty state when no issues                | Empty state    |

### `CowTreatmentHistoryView.vue` Tests (236 LOC)

**New file:** `client/src/tests/CowTreatmentHistoryView.test.js`

| #   | Test                                          | Why                |
| --- | --------------------------------------------- | ------------------ |
| 1   | Renders list of treatments for a specific cow | Per-cow treatments |
| 2   | Treatment cards link to treatment detail      | Navigation         |
| 3   | Empty state when no treatments                | Empty state        |

---

## 12D.3 — Frontend Views: Issue & Withdrawal Lists (~9 tests)

### `OpenIssuesView.vue` Tests (311 LOC)

**New file:** `client/src/tests/OpenIssuesView.test.js`

| #   | Test                                       | Why            |
| --- | ------------------------------------------ | -------------- |
| 1   | Renders open issues across all cows        | Issue list     |
| 2   | Filters by issue type chips                | Type filtering |
| 3   | Issue card click navigates to issue detail | Navigation     |
| 4   | Empty state when no open issues            | Empty state    |
| 5   | Shows issue count badge per type           | Count display  |

### `WithdrawalListView.vue` Tests (311 LOC)

**New file:** `client/src/tests/WithdrawalListView.test.js`

| #   | Test                                   | Why             |
| --- | -------------------------------------- | --------------- |
| 1   | Renders cows currently on withdrawal   | Withdrawal list |
| 2   | Shows withdrawal end dates per cow     | Date display    |
| 3   | Empty state when none on withdrawal    | Empty state     |
| 4   | Cow card click navigates to cow detail | Navigation      |

---

## 12D.4 — Frontend Views: Breeding Views (~8 tests)

### `CowReproView.vue` Tests (462 LOC)

**New file:** `client/src/tests/CowReproView.test.js`

| #   | Test                                          | Why               |
| --- | --------------------------------------------- | ----------------- |
| 1   | Renders reproduction timeline for cow         | Timeline display  |
| 2   | Shows breeding events chronologically         | Event ordering    |
| 3   | Shows expected dates (calving, heat, dry-off) | Auto-date display |
| 4   | Back button navigates to cow detail           | Navigation        |

### `BreedingEventsView.vue` Tests (351 LOC)

**New file:** `client/src/tests/BreedingEventsView.test.js`

| #   | Test                                        | Why             |
| --- | ------------------------------------------- | --------------- |
| 1   | Renders paginated breeding events list      | Pagination      |
| 2   | Event type filter chips work (multi-select) | Type filtering  |
| 3   | Pagination controls navigate pages          | Page navigation |
| 4   | Empty state shown when no events            | Empty state     |

---

## 12D.5 — Frontend Views: Admin Management (~19 tests)

### `BreedTypeManagement.vue` Tests (414 LOC)

**New file:** `client/src/tests/BreedTypeManagement.test.js`

| #   | Test                                             | Why                     |
| --- | ------------------------------------------------ | ----------------------- |
| 1   | Renders list of breed types                      | Basic render            |
| 2   | Add form creates new breed type                  | Create flow             |
| 3   | Edit form updates breed type                     | Update flow             |
| 4   | Delete with ConfirmDialog                        | Delete flow             |
| 5   | Shows timing fields (gestation, heat cycle days) | Breed-specific settings |

### `IssueTypeManagement.vue` Tests (592 LOC)

**New file:** `client/src/tests/IssueTypeManagement.test.js`

| #   | Test                                                | Why           |
| --- | --------------------------------------------------- | ------------- |
| 1   | Renders list of issue types with emoji + name       | Basic render  |
| 2   | Add form creates new issue type                     | Create flow   |
| 3   | Edit form updates issue type                        | Update flow   |
| 4   | Delete blocked when issue type in use (shows toast) | FK protection |

### `MedicationManagement.vue` Tests (560 LOC)

**New file:** `client/src/tests/MedicationManagement.test.js`

| #   | Test                                             | Why                |
| --- | ------------------------------------------------ | ------------------ |
| 1   | Renders list of medications                      | Basic render       |
| 2   | Add form creates with withdrawal days            | Create flow        |
| 3   | Edit form updates medication                     | Update flow        |
| 4   | Toggle active/inactive                           | Deactivation       |
| 5   | Shows withdrawal period info (milk + meat hours) | Withdrawal display |

### `SettingsView.vue` Tests (364 LOC)

**New file:** `client/src/tests/SettingsView.test.js`

| #   | Test                                                | Why              |
| --- | --------------------------------------------------- | ---------------- |
| 1   | Shows farm name (editable inline)                   | Settings display |
| 2   | Shows default language selector                     | Language setting |
| 3   | Links to admin sub-pages (users, breed types, etc.) | Navigation links |
| 4   | Force sync button triggers syncManager              | Sync action      |
| 5   | Export button triggers download                     | Export action    |

---

## 12D.6 — Frontend Components: Untested Molecules & Atoms (~30 tests)

### `ConfirmDialog.vue` Tests (69 LOC)

**New file:** `client/src/tests/ConfirmDialog.test.js`

| #   | Test                                               | Why                 |
| --- | -------------------------------------------------- | ------------------- |
| 1   | Renders when `show=true`, hidden when `show=false` | Visibility toggle   |
| 2   | Displays custom message prop                       | Message display     |
| 3   | Confirm button emits `@confirm`                    | Confirm action      |
| 4   | Cancel button emits `@cancel`                      | Cancel action       |
| 5   | Shows loading state on confirm button              | Loading state       |
| 6   | Custom button labels via props                     | Label customization |

### `TeatSelector.vue` Tests (122 LOC)

**New file:** `client/src/tests/TeatSelector.test.js`

| #   | Test                                    | Why             |
| --- | --------------------------------------- | --------------- |
| 1   | Renders 4 teat buttons                  | Basic render    |
| 2   | Clicking teat toggles selection         | Toggle behavior |
| 3   | Multiple teats can be selected          | Multi-select    |
| 4   | Emits updated selection array on change | Event emission  |
| 5   | Pre-selected teats render as active     | Initial state   |

### `BreedingEventCard.vue` Tests (301 LOC)

**New file:** `client/src/tests/BreedingEventCard.test.js`

| #   | Test                                      | Why          |
| --- | ----------------------------------------- | ------------ |
| 1   | Renders event type with emoji from config | Type display |
| 2   | Shows cow tag number and event date       | Card content |
| 3   | Edit button emits edit event              | Edit action  |
| 4   | Delete button shows ConfirmDialog         | Delete flow  |

### `SyncPanel.vue` Tests (327 LOC)

**New file:** `client/src/tests/SyncPanel.test.js`

| #   | Test                                       | Why               |
| --- | ------------------------------------------ | ----------------- |
| 1   | Slide-up panel visible when open prop true | Visibility        |
| 2   | Displays pending sync count from store     | Pending count     |
| 3   | Shows last sync timestamp                  | Timestamp display |
| 4   | Sync now button triggers sync action       | Manual sync       |

### `SearchInput.vue` Tests (101 LOC)

**New file:** `client/src/tests/SearchInput.test.js`

| #   | Test                                       | Why            |
| --- | ------------------------------------------ | -------------- |
| 1   | Renders input with placeholder prop        | Basic render   |
| 2   | Emits search value on input                | Event emission |
| 3   | Clear button resets and emits empty string | Clear action   |

### `PaginationBar.vue` Tests (173 LOC)

**New file:** `client/src/tests/PaginationBar.test.js`

| #   | Test                              | Why         |
| --- | --------------------------------- | ----------- |
| 1   | Renders page info ("Page X of Y") | Display     |
| 2   | Next button emits page change     | Next action |
| 3   | Previous button emits page change | Prev action |
| 4   | Disables prev on first page       | Edge case   |
| 5   | Disables next on last page        | Edge case   |

### `ToastMessage.vue` Tests (107 LOC)

**New file:** `client/src/tests/ToastMessage.test.js`

| #   | Test                                                 | Why            |
| --- | ---------------------------------------------------- | -------------- |
| 1   | Renders toast with message text                      | Basic render   |
| 2   | Applies correct type class (success, error, warning) | Type styling   |
| 3   | Dismiss button removes toast                         | Manual dismiss |

---

## 12D.7 — Frontend Utilities & Composables (~21 tests)

### `apiError.js` Tests (31 LOC)

**New file:** `client/src/tests/apiError.test.js`

| #   | Test                                         | Why             |
| --- | -------------------------------------------- | --------------- |
| 1   | Extracts message from axios error response   | Standard error  |
| 2   | Handles network error (no response body)     | Offline/timeout |
| 3   | Handles non-axios error (plain Error)        | Fallback        |
| 4   | Returns generic message for unexpected shape | Edge case       |

### `initials.js` Tests (12 LOC)

**New file:** `client/src/tests/initials.test.js`

| #   | Test                                                | Why           |
| --- | --------------------------------------------------- | ------------- |
| 1   | Returns initials from full name ("John Doe" → "JD") | Two-word name |
| 2   | Returns first char of username as fallback          | No full_name  |
| 3   | Handles null/undefined user gracefully              | Null safety   |
| 4   | Handles single-word name ("Admin" → "A")            | Single name   |

### `useToast.js` Tests (19 LOC)

**New file:** `client/src/tests/useToast.test.js`

| #   | Test                                          | Why            |
| --- | --------------------------------------------- | -------------- |
| 1   | `show()` adds toast to reactive list          | Add toast      |
| 2   | `show()` with type sets correct type property | Type param     |
| 3   | `dismiss()` removes toast by id               | Manual dismiss |

### `useAnalytics.js` Tests (135 LOC)

**New file:** `client/src/tests/useAnalytics.test.js`

| #   | Test                                                       | Why               |
| --- | ---------------------------------------------------------- | ----------------- |
| 1   | `formatMonth()` formats "2024-01" to readable string       | Month formatting  |
| 2   | `useTimeRange()` returns default 12-month range            | Default range     |
| 3   | `useTimeRange()` updates range when option changes         | Reactive update   |
| 4   | `chartColors` exports expected color array                 | Config export     |
| 5   | `horizontalAnnotation()` returns valid Chart.js annotation | Annotation helper |
| 6   | `verticalAnnotation()` returns valid Chart.js annotation   | Annotation helper |

### `chartSetup.js` Tests (20 LOC)

**New file:** `client/src/tests/chartSetup.test.js`

| #   | Test                                   | Why                 |
| --- | -------------------------------------- | ------------------- |
| 1   | Registers required Chart.js components | Plugin registration |
| 2   | Registers annotation plugin            | Annotation plugin   |
| 3   | Import doesn't throw                   | Smoke test          |

---

## 12D.8 — Backend: Middleware, Config & Service Infrastructure Tests (~18 tests)

**Gap found in repo audit:** 5 backend infrastructure files have zero dedicated unit tests — only indirect coverage via route integration tests. These are small but high-impact (auth/authorize runs on every request).

### `authorize.js` + `auth.js` Middleware Tests

**New file:** `server/tests/middleware.test.js`

| #   | Test                                                                      | Why                |
| --- | ------------------------------------------------------------------------- | ------------------ |
| 1   | `authorize('perm')` — admin role bypasses permission check → calls next() | Admin bypass logic |
| 2   | `authorize('perm')` — worker with matching permission → calls next()      | Happy path         |
| 3   | `authorize('perm')` — worker without permission → 403                     | Permission denial  |
| 4   | `authorize('perm')` — no req.user → 401                                   | Missing auth       |
| 5   | `requireAdmin` — admin role → calls next()                                | Admin pass         |
| 6   | `requireAdmin` — worker role → 403                                        | Non-admin denial   |
| 7   | `auth` middleware — valid Bearer token → sets req.user, calls next()      | Token parsing      |
| 8   | `auth` middleware — missing Authorization header → 401                    | Missing header     |
| 9   | `auth` middleware — invalid token → 401                                   | Bad token          |
| 10  | `auth` middleware — expired token → 401                                   | Expired token      |

### `errorHandler.js` Tests

**Add to same file or new `server/tests/errorHandler.test.js`**

| #   | Test                                                                | Why                         |
| --- | ------------------------------------------------------------------- | --------------------------- |
| 11  | SQLite UNIQUE constraint error → 409 with duplicate message         | SQLite constraint detection |
| 12  | MySQL ER_DUP_ENTRY error → 409 with duplicate message               | MySQL constraint detection  |
| 13  | Error with `.message` containing 'UNIQUE' → 409                     | Fallback UNIQUE detection   |
| 14  | Joi validation error with status 400 → 400 with sanitized message   | Validation passthrough      |
| 15  | Generic error in production → 500 'Internal server error' (no leak) | Production error masking    |
| 16  | Generic error in dev → 500 with actual error message                | Dev error visibility        |

### `auditService.js` Tests

**New file:** `server/tests/auditService.test.js`

| #   | Test                                                | Why                   |
| --- | --------------------------------------------------- | --------------------- |
| 17  | `logAudit()` inserts row into audit_log table       | Happy path            |
| 18  | `logAudit()` silently swallows DB errors (no throw) | Best-effort guarantee |

**Pattern:** Unit-test each middleware/service in isolation using mock req/res objects (not supertest). For `auditService`, use the real test DB.

---

## Verification Checklist

After each section, run the relevant test suite to verify:

- [ ] 12D.1 — DashboardView, LoginView, CowListView → 22 new tests
- [ ] 12D.2 — CowDetailView, IssueDetailView, TreatmentDetailView, history views → 25 new tests
- [ ] 12D.3 — OpenIssuesView, WithdrawalListView → 9 new tests
- [ ] 12D.4 — CowReproView, BreedingEventsView → 8 new tests
- [ ] 12D.5 — 4 admin management views → 19 new tests
- [ ] 12D.6 — 7 untested components → 30 new tests
- [ ] 12D.7 — 5 utils/composables → 21 new tests
- [ ] 12D.8 — middleware, errorHandler, auditService → 18 new backend tests

Final checks:

- [ ] `cd client && npm run test:run` → full suite green (~468 from 12C + ~134 new = ~602)
- [ ] `npm test` → full backend suite green (~410 from 12C + ~18 new = ~428)
- [ ] `npm run lint` → 0 new errors
- [ ] Every view file has a corresponding test file
- [ ] Every component has a corresponding test file
- [ ] Every utility/composable has a corresponding test file
- [ ] Every middleware/service has a corresponding test file
- [ ] 100% file coverage across all frontend AND backend source categories
