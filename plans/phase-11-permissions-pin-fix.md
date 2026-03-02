# Phase 11: Permission Enforcement & PIN Fix

## Overview

Two issues discovered during testing:
1. **PIN length mismatch** — User management allows 4-6 digit PINs but login only accepts exactly 4
2. **Permissions not enforced** — Worker permissions are stored but never checked (backend or frontend)

### Quality Gate (applies after EVERY phase)

After completing each phase, run the following checklist before moving to the next:

1. **Refactor scan** — check all touched files for:
   - Duplicated logic that can be extracted into a shared helper
   - Dead code (unused imports, unreachable branches, commented-out blocks)
   - Overly complex conditionals that can be simplified
2. **Efficiency check** — no redundant DB queries, no unnecessary re-renders, no duplicate API calls
3. **Run all tests** — `cd client && npm run test:run` + backend tests for touched routes. All must pass.
4. **Self-review** — re-read each changed file end-to-end; verify no regressions introduced
5. **Cost-effective** — minimal lines changed, no over-engineering, no unnecessary abstractions

---

## Phase 11.1: Standardize PIN to 4 Digits

**Goal:** Make PIN consistently 4 digits everywhere.

### Changes

**Backend — `server/routes/users.js`:**
- Change Joi `createSchema.pin` from `/^\d{4,6}$/` to `/^\d{4}$/`
- Change Joi `updateSchema.pin` from `/^\d{4,6}$/` to `/^\d{4}$/`

**Frontend — `client/src/views/admin/UserManagement.vue`:**
- Change PIN input `pattern` from `\d{4,6}` to `\d{4}`
- Change `maxlength` from `6` to `4`

**i18n:**
- `en.json` users.pinPlaceholder: `"4–6 digit PIN"` → `"4-digit PIN"`
- `af.json` users.pinPlaceholder: `"4–6 syfer PIN"` → `"4-syfer PIN"`

**Tests:**
- Existing `server/tests/users.test.js` — verify PIN validation tests still pass (they test create/update flows)
- Add 1 test: creating a user with a 5-digit PIN returns 400

**Verification:** Create a worker with a 5-digit PIN → should get validation error. Create with 4-digit PIN → should succeed and login works.

**Quality gate:** Run all tests, scan for any other PIN length references across the codebase.

---

## Phase 11.2: Backend Permission Enforcement

**Goal:** Add `authorize()` middleware to all write routes that should be gated by worker permissions. Read routes (GET) remain open to all authenticated users — workers can view data but can't create/modify without the relevant permission. Admin role auto-bypasses all checks (already handled by `authorize()` middleware).

### Permission → Route mapping

| Permission | Route file | Methods to gate |
|---|---|---|
| `can_record_milk` | `milkRecords.js` | POST, PUT, DELETE |
| `can_log_issues` | `healthIssues.js` | POST, PATCH (status) |
| `can_log_treatments` | `treatments.js` | POST, DELETE |
| `can_log_breeding` | `breedingEvents.js` | POST |
| `can_view_analytics` | `analytics.js` | All GET routes (router.use level) |

### Changes per file

**`server/routes/milkRecords.js`:**
- Add `const authorize = require('../middleware/authorize')`
- Add `authorize('can_record_milk')` to POST `/`, PUT `/:id`, DELETE `/:id`

**`server/routes/healthIssues.js`:**
- Already imports authorize
- Add `authorize('can_log_issues')` to POST `/`, PATCH `/:id/status`, POST `/:id/comments`

**`server/routes/treatments.js`:**
- Add `const authorize = require('../middleware/authorize')`
- Add `authorize('can_log_treatments')` to POST `/`, DELETE `/:id`

**`server/routes/breedingEvents.js`:**
- Add `const authorize = require('../middleware/authorize')`
- Add `authorize('can_log_breeding')` to POST `/`, PATCH `/dismiss-batch`, PATCH `/:id/dismiss`

**`server/routes/analytics.js`:**
- Add `const authorize = require('../middleware/authorize')`
- Add `router.use(authorize('can_view_analytics'))` at top level (all analytics routes gated)

### Existing admin-only gates (no change needed)
- `healthIssues.js` DELETE — already `authorize('admin')` ✓
- `breedingEvents.js` PATCH `/:id`, DELETE `/:id` — already admin-gated by pattern ✓

### Tests — `server/tests/permissions.test.js` (new file)

Test the key permission gates (each tests 403 without permission, 200/201 with permission):
1. `can_record_milk` — POST `/api/milk-records` 403 vs 201
2. `can_log_issues` — POST `/api/health-issues` 403 vs 201
3. `can_log_treatments` — POST `/api/treatments` 403 vs 201
4. `can_log_breeding` — POST `/api/breeding-events` 403 vs 201
5. `can_view_analytics` — GET `/api/analytics/herd-summary` 403 vs 200
6. Admin bypasses all permission checks → 200/201

**Quality gate:** Run all backend tests (existing + new). Check no existing tests break from the new middleware. Scan for any route that should be gated but was missed.

---

## Phase 11.3: Frontend Router Permission Guard

**Goal:** Add `requiresPermission` meta to routes and check permissions in the navigation guard.

### Auth store additions

Add a `hasPermission(perm)` method to the auth store:
```js
function hasPermission(perm) {
  if (user.value?.role === 'admin') return true
  return (user.value?.permissions || []).includes(perm)
}
```

Refactor: replace existing `canManageCows` computed with `hasPermission('can_manage_cows')` usage where referenced. If `canManageCows` is only used in the router guard, remove it and use `hasPermission` directly. If used elsewhere, keep it as a thin wrapper: `const canManageCows = computed(() => hasPermission('can_manage_cows'))`.

### Router meta additions

| Route(s) | `requiresPermission` value |
|---|---|
| `/milk`, `/milk/history` | `can_record_milk` |
| `/log/issue`, `/health-issues`, `/issues/:id`, `/cows/:id/issues` | `can_log_issues` |
| `/log/treatment`, `/treatments/:id`, `/withdrawal`, `/cows/:id/treatments` | `can_log_treatments` |
| `/breed`, `/breed/*` (except `/breed/edit/:id` which is admin-only) | `can_log_breeding` |
| `/analytics`, `/analytics/*` | `can_view_analytics` |

### Router guard update

In `beforeEach`, after the `requiresAdmin` check, add:
```js
if (to.meta.requiresPermission && !authStore.hasPermission(to.meta.requiresPermission)) {
  return { name: 'dashboard' }
}
```

Remove the separate `requiresManage` check — replace with `requiresPermission: 'can_manage_cows'` on cow-new / cow-edit routes.

### Tests

- Update `auth.store.test.js` — add tests for `hasPermission()` (admin always true, worker with/without perm)
- Verify existing router-related tests still pass

**Quality gate:** Run all client tests. Check for dead `canManageCows` references if refactored. Verify no routes are missing permission meta.

---

## Phase 11.4: Frontend Navigation Filtering

**Goal:** Hide nav items and dashboard cards that the worker doesn't have permission for.

### BottomNav changes (`components/organisms/BottomNav.vue`)

Add permission checking alongside feature flag filtering:

| Tab | Feature flag | Permission |
|---|---|---|
| Milk | `milkRecording` | `can_record_milk` |
| Breed | `breeding` | `can_log_breeding` |

Update `visibleTabs` computed to also check `authStore.hasPermission(tab.permission)` when a tab has a `permission` property. Tabs without a `permission` property (Home, Cows) are always visible.

### DashboardView changes (`views/DashboardView.vue`)

Add permission gates to action cards alongside feature flag checks:

| Card | Feature flag | Permission |
|---|---|---|
| Analytics | `analytics` | `can_view_analytics` |
| Log Treatment | `treatments` | `can_log_treatments` |
| Log Issue | `healthIssues` | `can_log_issues` |
| Open Issues | `healthIssues` | `can_log_issues` |
| Withdrawal | `treatments` | `can_log_treatments` |
| Record Milk | `milkRecording` | `can_record_milk` |
| Breeding | `breeding` | `can_log_breeding` |

Pattern: `v-if="flags.treatments && hasPermission('can_log_treatments')"` — both feature flag AND permission must be true.

### Tests

- `BottomNav.test.js` — add tests:
  - Worker without `can_record_milk` → milk tab hidden
  - Worker with `can_record_milk` → milk tab visible
  - Admin → all tabs visible
- `DashboardView.test.js` (new or extend existing) — add tests:
  - Worker with only `can_record_milk` → only View Cows + Record Milk cards shown
  - Admin → all cards shown

**Quality gate:** Run all client tests. Check no duplicate permission logic between BottomNav and DashboardView — extract shared helper if pattern repeats. Verify admin user always sees everything.

---

## Phase 11.5: Full Test Suite & Regression Check

**Goal:** Ensure all existing tests pass and no regressions were introduced across the entire phase.

### Actions

1. Run full client test suite: `cd client && npm run test:run` — all must pass
2. Run full backend test suite — all must pass
3. Fix any broken tests caused by new permission middleware (e.g., test helpers that create workers may now need permissions in their JWT/mock)
4. Scan for test files that mock `authStore` — ensure they provide `permissions` array and `hasPermission` method in mocks
5. Verify test count hasn't decreased (no tests accidentally deleted)

### Test count targets
- Backend: existing 180+ tests + ~12 new permission tests = ~192+
- Client: existing 372 tests + ~8 new permission tests = ~380+

**Quality gate:** Zero test failures. No skipped tests unless pre-existing. Console output clean (no unhandled warnings).

---

## Phase 11.6: i18n, Docs & Final Cleanup

**Goal:** Ensure all user-facing strings are translated and project docs are current.

### i18n
- Add `common.noPermission` key: "You don't have permission for this action" / "Jy het nie toestemming vir hierdie aksie nie"
- Scan all touched files for any hardcoded English strings — move to i18n

### Docs
- Update CLAUDE.md:
  - Add note about permission enforcement pattern (which routes use which permissions)
  - Document `hasPermission()` in auth store
  - Update PIN docs (4 digits only)
- Update MEMORY.md with phase 11 completion status

### Final cleanup
- Run `npm run lint` — fix any new warnings
- Run dead code scan on touched files (unused imports, unreachable branches)
- Remove any TODO/FIXME comments added during implementation
- Verify no console.log debugging left in code

**Quality gate:** Lint clean. All tests pass. No dead code. Both i18n files have matching key sets.

---

## File Summary

| File | Phase | Change |
|---|---|---|
| `server/routes/users.js` | 11.1 | PIN regex to `\d{4}` |
| `client/src/views/admin/UserManagement.vue` | 11.1 | PIN maxlength + pattern |
| `client/src/i18n/en.json` | 11.1, 11.6 | PIN placeholder, noPermission |
| `client/src/i18n/af.json` | 11.1, 11.6 | PIN placeholder, noPermission |
| `server/routes/milkRecords.js` | 11.2 | authorize middleware |
| `server/routes/healthIssues.js` | 11.2 | authorize on POST/PATCH |
| `server/routes/treatments.js` | 11.2 | authorize middleware |
| `server/routes/breedingEvents.js` | 11.2 | authorize middleware |
| `server/routes/analytics.js` | 11.2 | authorize router.use |
| `server/tests/permissions.test.js` | 11.2 | new — permission gate tests |
| `server/tests/users.test.js` | 11.1 | add 5-digit PIN rejection test |
| `client/src/stores/auth.js` | 11.3 | hasPermission method, refactor canManageCows |
| `client/src/router/index.js` | 11.3 | requiresPermission meta + guard, remove requiresManage |
| `client/src/components/organisms/BottomNav.vue` | 11.4 | permission filtering |
| `client/src/views/DashboardView.vue` | 11.4 | permission filtering |
| `client/src/tests/BottomNav.test.js` | 11.4 | permission visibility tests |
| `client/src/tests/auth.store.test.js` | 11.3 | hasPermission tests |
