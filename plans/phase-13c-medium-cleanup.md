# Phase 13C: Medium Priority Cleanup

> Priority: **MEDIUM** — Code quality and consistency improvements

---

## 13C.1 — Inline Admin Checks → requireAdmin Middleware

**Problem:** `breedingEvents.js` uses inline `if (req.user.role !== 'admin')` checks instead of `requireAdmin` middleware.

**Files:** `server/routes/breedingEvents.js`

**Tasks:**

1. Replace inline admin check on `PATCH /:id` (~line 331) with `requireAdmin` middleware in the route definition
2. Replace inline admin check on `DELETE /:id` (~line 408) with `requireAdmin` middleware
3. Verify `requireAdmin` is already imported (it should be)
4. Existing tests should pass unchanged

**Acceptance:** All admin-only routes use `requireAdmin` middleware consistently.

---

## 13C.2 — Extract Shared Helpers (toCode, ISO_DATE_RE, pagination)

**Problem:** `toCode()` duplicated in issueTypes.js + breedTypes.js. `ISO_DATE_RE` defined in 5 files. Pagination boilerplate in 6 files.

**Files:** New `server/helpers/constants.js`, modify 6+ route files

**Tasks:**

1. Create `server/helpers/constants.js` exporting:
   - `ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/`
   - `toCode(name)` — the slug generator
   - `DEFAULT_PAGE_SIZE = 25`, `MAX_PAGE_SIZE = 100`, `MAX_SEARCH_LENGTH = 100`
   - `parsePagination(query, defaults)` — returns `{ page, limit, offset }`
2. Replace all local `ISO_DATE_RE` definitions with import from constants (fix `auditLog.js` missing `$` anchor)
3. Replace `toCode()` in `issueTypes.js` and `breedTypes.js` with import
4. Replace pagination boilerplate in cows.js, healthIssues.js, auditLog.js, breedingEvents.js, medications.js, issueTypes.js with `parsePagination()`
5. All existing tests must pass

**Acceptance:** Zero duplicated utility code. Single source of truth for shared constants.

---

## 13C.3 — logAudit() Await Consistency

**Problem:** `logAudit()` is async but called without `await` in cows.js, users.js, and appSettings.js. Safe today but fragile.

**Files:** `server/routes/cows.js`, `server/routes/users.js`, `server/routes/appSettings.js`

**Tasks:**

1. Add `await` before all `logAudit()` calls in the three files
2. Verify the audit service's internal try/catch still prevents route failures from audit errors
3. Existing tests should pass

**Acceptance:** All `logAudit()` calls are awaited. No unhandled promise rejections possible.

---

## 13C.4 — SettingsView Timeout Cleanup

**Problem:** `saveTimeout` in SettingsView.vue is not cleared on component unmount — dangling closure.

**Files:** `client/src/views/admin/SettingsView.vue`

**Tasks:**

1. Import `onUnmounted` from Vue
2. Track the timeout ID in a `let` variable
3. Clear it in `onUnmounted(() => clearTimeout(saveTimeout))`

**Acceptance:** No dangling timers when navigating away from settings mid-save.

---

## 13C.5 — MilkRecordingView Withdrawal Map Optimization

**Problem:** `isOnWithdrawal()` and `withdrawalEndDate()` are O(N×M) per render — linear scan of withdrawal list per cow.

**Files:** `client/src/views/MilkRecordingView.vue`

**Tasks:**

1. Add a `withdrawalMap` computed property that indexes `treatmentsStore.withdrawalCows` by `cow_id`
2. Rewrite `isOnWithdrawal(cowId)` to use map lookup: `cowId in withdrawalMap.value`
3. Rewrite `withdrawalEndDate(cowId)` to use map lookup: `withdrawalMap.value[cowId]?.withdrawal_end_milk`
4. Existing tests should pass

**Acceptance:** Withdrawal checks are O(1) per cow instead of O(M).

---

## 13C.6 — Double authorize Import Cleanup

**Problem:** 5 route files import `authorize` on two separate `require()` lines from the same module.

**Files:** `server/routes/cows.js`, `server/routes/milkRecords.js`, `server/routes/healthIssues.js`, `server/routes/treatments.js`, `server/routes/breedingEvents.js`

**Tasks:**

1. In each file, replace:
   ```js
   const authorize = require('../middleware/authorize')
   const { requireAdmin } = require('../middleware/authorize')
   ```
   with:
   ```js
   const authorize = require('../middleware/authorize')
   const { requireAdmin } = authorize
   ```
2. Lint check passes

**Acceptance:** Single `require()` call per module per file.

---

## 13C.7 — Sync Error Message Sanitization

**Problem:** `processChange()` in syncService.js returns raw DB error messages to clients, leaking schema information.

**Files:** `server/services/syncService.js`

**Tasks:**

1. In the catch block of `processChange()`, log the full `err.message` server-side
2. Return a generic message to the client: `error: 'Failed to apply change'`
3. Add a test: sync push with invalid data returns generic error (not DB column names)

**Acceptance:** No internal DB details leaked via sync error responses.

---

## 13C.8 — dismiss-batch Joi Validation

**Problem:** `dismiss-batch` in breedingEvents.js doesn't validate that `ids` are UUIDs or that `reason` has a max length.

**Files:** `server/routes/breedingEvents.js`

**Tasks:**

1. Add Joi schema for dismiss-batch body: `ids: Joi.array().items(Joi.string().uuid()).min(1).max(100).required()`, `reason: Joi.string().max(500).allow(null, '').optional()`
2. Apply same validation to the single dismiss endpoint's `reason` field
3. Add `heat_signs` max constraints in `breedingSchemas.js`: `Joi.array().items(Joi.string().max(100)).max(20)`
4. Add 1-2 tests for validation rejection

**Acceptance:** All dismiss/breeding inputs are properly bounded.

---

## 13C.9 — MilkRecords Store Debounce Cleanup

**Problem:** Debounce timers in milkRecords store are not cleared on session switch — potential stale writes.

**Files:** `client/src/stores/milkRecords.js`

**Tasks:**

1. In `fetchSession()`, before clearing `records`, cancel all outstanding debounce timers:
   ```js
   Object.values(debounceTimers).forEach(clearTimeout)
   Object.keys(debounceTimers).forEach((k) => delete debounceTimers[k])
   ```
2. Verify existing tests pass

**Acceptance:** No stale debounce timers survive a session switch.

---

## 13C.10 — getIssueTypeDefMap() Cache

**Problem:** `getIssueTypeDefMap()` hits the DB on every call across 4+ analytics endpoints. Issue type definitions rarely change.

**Files:** `server/routes/analytics/helpers.js`

**Tasks:**

1. Add module-level cache with 60-second TTL:
   ```js
   let _cache = null, _expiry = 0;
   async function getIssueTypeDefMap() {
     if (Date.now() < _expiry) return _cache;
     const defs = await db('issue_type_definitions')...;
     _cache = Object.fromEntries(...);
     _expiry = Date.now() + 60_000;
     return _cache;
   }
   ```
2. Existing tests should pass (cache is transparent)

**Acceptance:** Repeated calls within 60 seconds serve from memory. Zero API behavior change.

---

## Verification

After all 13C steps:

- [ ] Run full backend test suite: `npm test` (all pass)
- [ ] Run full frontend test suite: `cd client && npm run test:run` (all pass)
- [ ] Lint clean: `npm run lint`
- [ ] Knip clean: `npm run knip`
