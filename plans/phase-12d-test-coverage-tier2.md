# Phase 12D: Test Coverage Tier 2 — Views, Components, Utilities

**Goal:** Cover the remaining untested views (navigation, detail, admin, history), untested components, and utility functions. After this phase, every source file has at least basic test coverage.

**Estimated effort:** 2–3 sessions

---

## 12D.1 — Frontend Views: Navigation & Dashboard

### `DashboardView.vue` Tests
**New file:** `client/src/tests/DashboardView.test.js`

| # | Test |
|---|------|
| 1 | Renders KPI widgets (litres today, cows milked, active issues) |
| 2 | Action cards render based on user permissions |
| 3 | Admin sees all action cards |
| 4 | Worker with limited permissions sees subset |
| 5 | Action card click navigates to correct route |
| 6 | Shows farm name from settings |

### `LoginView.vue` Tests
**New file:** `client/src/tests/LoginView.test.js`

| # | Test |
|---|------|
| 1 | Renders password login form by default |
| 2 | Toggle switches to PIN login form |
| 3 | PIN input limited to 4 digits |
| 4 | Submits password login → calls authStore.login() |
| 5 | Submits PIN login → calls authStore.loginPin() |
| 6 | Shows error message on invalid credentials |
| 7 | Redirects to dashboard on success |
| 8 | Shows farm name from public settings endpoint |

### `CowListView.vue` Tests
**New file:** `client/src/tests/CowListView.test.js`

| # | Test |
|---|------|
| 1 | Renders list of cow cards |
| 2 | Search input filters cows |
| 3 | Status filter chips work |
| 4 | Sex filter chips work |
| 5 | Empty state shown when no cows match |
| 6 | FAB button navigates to cow form |
| 7 | Cow card click navigates to detail |
| 8 | Pagination loads next page |

---

## 12D.2 — Frontend Views: Detail & History Views

### `CowDetailView.vue` Tests
**New file:** `client/src/tests/CowDetailView.test.js`

| # | Test |
|---|------|
| 1 | Renders cow info (tag, name, breed, dob, status) |
| 2 | Shows life phase badge |
| 3 | Shows sire/dam names when available |
| 4 | Action buttons render (edit, log issue, log treatment, etc.) |
| 5 | Delete button shows ConfirmDialog (admin only) |
| 6 | Shows withdrawal badge for female on withdrawal |
| 7 | Male cows don't show withdrawal badge |
| 8 | Shows loading state |
| 9 | Shows 404 for invalid cow ID |

### `IssueDetailView.vue` Tests
**New file:** `client/src/tests/IssueDetailView.test.js`

| # | Test |
|---|------|
| 1 | Renders issue with type, severity, status |
| 2 | Shows affected teats (parsed from JSON) |
| 3 | Status change buttons work (resolve, escalate) |
| 4 | Comments section renders existing comments |
| 5 | Add comment form submits |
| 6 | Shows linked treatments |

### `TreatmentDetailView.vue` Tests
**New file:** `client/src/tests/TreatmentDetailView.test.js`

| # | Test |
|---|------|
| 1 | Renders treatment info (medication, dosage, cost) |
| 2 | Shows withdrawal end dates |
| 3 | Shows linked health issue |
| 4 | Delete button for admin only |

### `CowIssueHistoryView.vue` Tests
**New file:** `client/src/tests/CowIssueHistoryView.test.js`

| # | Test |
|---|------|
| 1 | Renders list of issues for a cow |
| 2 | Issue cards link to detail |
| 3 | Empty state when no issues |

### `CowTreatmentHistoryView.vue` Tests
**New file:** `client/src/tests/CowTreatmentHistoryView.test.js`

| # | Test |
|---|------|
| 1 | Renders list of treatments for a cow |
| 2 | Treatment cards link to detail |
| 3 | Empty state when no treatments |

### `OpenIssuesView.vue` Tests
**New file:** `client/src/tests/OpenIssuesView.test.js`

| # | Test |
|---|------|
| 1 | Renders open issues across all cows |
| 2 | Filters by issue type |
| 3 | Issue card click navigates to detail |

### `WithdrawalListView.vue` Tests
**New file:** `client/src/tests/WithdrawalListView.test.js`

| # | Test |
|---|------|
| 1 | Renders cows currently on withdrawal |
| 2 | Shows withdrawal end dates |
| 3 | Empty state when none on withdrawal |

---

## 12D.3 — Frontend Views: Breeding Views

### `CowReproView.vue` Tests
**New file:** `client/src/tests/CowReproView.test.js`

| # | Test |
|---|------|
| 1 | Renders reproduction timeline for cow |
| 2 | Shows breeding events chronologically |
| 3 | Shows expected dates (calving, heat, dry-off) |
| 4 | Back button navigates to cow detail |

### `BreedingEventsView.vue` Tests
**New file:** `client/src/tests/BreedingEventsView.test.js`

| # | Test |
|---|------|
| 1 | Renders paginated breeding events list |
| 2 | Event type filter chips work |
| 3 | Pagination controls work |
| 4 | Empty state shown when no events |

---

## 12D.4 — Frontend Views: Admin Management

### `BreedTypeManagement.vue` Tests
**New file:** `client/src/tests/BreedTypeManagement.test.js`

| # | Test |
|---|------|
| 1 | Renders list of breed types |
| 2 | Add form creates new breed type |
| 3 | Edit form updates breed type |
| 4 | Delete with ConfirmDialog |
| 5 | Shows timing fields (gestation, heat cycle days) |

### `IssueTypeManagement.vue` Tests
**New file:** `client/src/tests/IssueTypeManagement.test.js`

| # | Test |
|---|------|
| 1 | Renders list of issue types with emoji |
| 2 | Add form creates new issue type |
| 3 | Edit form updates issue type |
| 4 | Delete blocked when in use |

### `MedicationManagement.vue` Tests
**New file:** `client/src/tests/MedicationManagement.test.js`

| # | Test |
|---|------|
| 1 | Renders list of medications |
| 2 | Add form creates with withdrawal days |
| 3 | Edit form updates medication |
| 4 | Toggle active/inactive |
| 5 | Shows withdrawal period info |

### `SettingsView.vue` Tests
**New file:** `client/src/tests/SettingsView.test.js`

| # | Test |
|---|------|
| 1 | Shows farm name (editable) |
| 2 | Shows default language selector |
| 3 | Links to admin sub-pages (users, breed types, etc.) |
| 4 | Force sync button triggers sync |
| 5 | Export button downloads JSON |

---

## 12D.5 — Frontend Components: Untested Molecules & Atoms

### `ConfirmDialog.vue` Tests
**New file:** `client/src/tests/ConfirmDialog.test.js`

| # | Test |
|---|------|
| 1 | Renders when `show=true`, hidden when `show=false` |
| 2 | Displays custom message |
| 3 | Confirm button emits `@confirm` |
| 4 | Cancel button emits `@cancel` |
| 5 | Shows loading state on confirm button |
| 6 | Custom button labels |

### `TeatSelector.vue` Tests
**New file:** `client/src/tests/TeatSelector.test.js`

| # | Test |
|---|------|
| 1 | Renders 4 teat buttons |
| 2 | Clicking teat toggles selection |
| 3 | Multiple teats can be selected |
| 4 | Emits updated selection array |
| 5 | Pre-selected teats render as active |

### `BreedingEventCard.vue` Tests
**New file:** `client/src/tests/BreedingEventCard.test.js`

| # | Test |
|---|------|
| 1 | Renders event type with emoji |
| 2 | Shows cow tag number and date |
| 3 | Edit button emits edit event |
| 4 | Delete button shows ConfirmDialog |

### `SyncPanel.vue` Tests
**New file:** `client/src/tests/SyncPanel.test.js`

| # | Test |
|---|------|
| 1 | Slide-up panel shows when open |
| 2 | Displays pending sync count |
| 3 | Shows last sync time |
| 4 | Sync now button triggers sync |

### `SearchInput.vue` Tests
**New file:** `client/src/tests/SearchInput.test.js`

| # | Test |
|---|------|
| 1 | Renders input with placeholder |
| 2 | Emits search value on input |
| 3 | Debounces input |
| 4 | Clear button clears value |

### `PaginationBar.vue` Tests
**New file:** `client/src/tests/PaginationBar.test.js`

| # | Test |
|---|------|
| 1 | Renders page info (page X of Y) |
| 2 | Next button emits page change |
| 3 | Previous button emits page change |
| 4 | Disables prev on first page |
| 5 | Disables next on last page |

### `ToastMessage.vue` Tests
**New file:** `client/src/tests/ToastMessage.test.js`

| # | Test |
|---|------|
| 1 | Renders toast with message |
| 2 | Applies type class (success, error, warning) |
| 3 | Dismiss button removes toast |
| 4 | Auto-dismisses after timeout |

---

## 12D.6 — Frontend Utilities & Composables

### `apiError.js` Tests
**New file:** `client/src/tests/apiError.test.js`

| # | Test |
|---|------|
| 1 | `extractApiError()` extracts message from axios error |
| 2 | `extractApiError()` handles network error (no response) |
| 3 | `extractApiError()` handles non-axios error |
| 4 | `resolveError()` resolves i18n key when found |
| 5 | `resolveError()` passes through raw message when no i18n key |

### `initials.js` Tests
**New file:** `client/src/tests/initials.test.js`

| # | Test |
|---|------|
| 1 | Returns initials from full name ("John Doe" → "JD") |
| 2 | Returns first char of username as fallback |
| 3 | Handles null/undefined user |
| 4 | Handles single-word name |

### `useToast.js` Tests
**New file:** `client/src/tests/useToast.test.js`

| # | Test |
|---|------|
| 1 | `show()` adds toast to list |
| 2 | `show()` with type sets correct type |
| 3 | `dismiss()` removes toast by id |
| 4 | Auto-dismiss fires after duration |

### `useAnalytics.js` Tests
**New file:** `client/src/tests/useAnalytics.test.js`

| # | Test |
|---|------|
| 1 | `formatMonth()` formats "2024-01" to readable string |
| 2 | `useTimeRange()` returns default range (12 months) |
| 3 | `useTimeRange()` updates range on option change |
| 4 | `chartColors` exports expected color array |
| 5 | `horizontalAnnotation()` returns valid annotation config |
| 6 | `verticalAnnotation()` returns valid annotation config |

---

## Verification Checklist

- [ ] `cd client && npm run test:run` → all new test files passing
- [ ] Total new client tests: ~140 across 25 new test files
- [ ] Every view file has a corresponding test file
- [ ] Every component has a corresponding test file
- [ ] Every utility/composable has a corresponding test file
- [ ] Full suite: 0 failures
- [ ] File coverage: 89/89 source files now have tests (100%)
