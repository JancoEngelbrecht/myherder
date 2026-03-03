# Phase 12A: Quick Wins — Lint, Dead Code, Test Fixes, Bug Fixes, Constants

**Goal:** Fix all low-hanging issues: ESLint errors, knip dead exports, pre-existing test failures, magic numbers, dead code, and targeted bug fixes that are small in scope but high in impact.

**Estimated effort:** 2–3 sessions

---

## 12A.1 — Fix ESLint Errors (7 errors → 0)

| File | Line | Issue | Fix |
|------|------|-------|-----|
| `client/src/tests/BreedingNotificationsView.test.js` | 3 | Unused imports `reactive`, `ref` | Remove from import |
| `client/src/tests/syncManager.test.js` | 3 | Unused import `Dexie` | Remove from import |
| `client/src/views/admin/IssueTypeManagement.vue` | 191 | Unused import `resolveError` | Remove from import |
| `server/routes/sync.js` | 71 | Unused variable `appliedCount` | Prefix with `_` or remove |
| `server/seeds/001_initial_data.js` | 33 | Unused parameter `_` | Already prefixed — verify ESLint config allows it |
| `server/seeds/003_demo_analytics.js` | 76 | Unused variable `seasonalHealthFactor` | Remove or use |

**Verification:** `npm run lint` exits with 0 errors.

---

## 12A.2 — Fix Knip Dead Code (2 unused exports)

| File | Export | Fix |
|------|--------|-----|
| `server/config/env.js` | `default` export | Change to named export or remove if unused |
| `server/services/syncService.js:174` | `ENTITY_MAP` | Remove export keyword (keep if used internally) |

**Verification:** `npm run knip` reports 0 unused exports.

---

## 12A.3 — Fix Pre-existing Test Failures (4 failures → 0)

| Suite | Failures | Likely cause |
|-------|----------|-------------|
| `server/tests/analytics.test.js` | 1 (calving-interval) | Date calculation edge case or seed data mismatch |
| `client/src/tests/BreedingNotificationsView.test.js` | 3 (ConfirmDialog interaction) | Component prop/emit wiring or test selector mismatch |

**Steps:**
1. Read the failing test + source code to diagnose
2. Fix the root cause (test or source — whichever is wrong)
3. Run full test suite to confirm no regressions

**Verification:** `cd client && npm run test:run` → 0 failures. `npx jest` → 0 failures.

---

## 12A.4 — Remove Dead Code Snippets

| File | Line | Issue | Fix |
|------|------|-------|-----|
| `server/routes/auditLog.js` | 54 | No-op `.then((r) => r)` | Remove the `.then()` chain |
| `client/src/components/molecules/CowSearchDropdown.vue` | 111 | Dead `r.data.cows \|\|` fallback (API returns plain array) | Simplify to `r.data` |
| `client/src/views/TreatmentDetailView.vue` | — | `formatDate` imported but never used (only `formatDateTime` used) | Remove unused import |
| `client/src/views/DashboardView.vue` | 235 | `.disabled-action` CSS class defined but never referenced in template | Remove dead CSS rule |
| `client/src/views/analytics/FinancialView.vue` | 136 | `RouterLink` explicitly imported but globally registered by vue-router | Remove redundant import |
| `client/src/views/analytics/HealthView.vue` | 217 | Same redundant `RouterLink` import | Remove redundant import |
| `client/src/views/AnalyticsView.vue` | — | Same redundant `RouterLink` import (if present) | Remove redundant import |

---

## 12A.5 — Extract Magic Numbers to Named Constants

### `server/routes/breedingEvents.js` (lines 160-163)
**Before:**
```javascript
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
```

**After:**
```javascript
const MS_PER_DAY = 1000 * 60 * 60 * 24
const UPCOMING_HEAT_DAYS = 7
const UPCOMING_CALVING_DAYS = 14
const OVERDUE_LOOKBACK_DAYS = 30

const yesterday = new Date(Date.now() - MS_PER_DAY).toISOString().slice(0, 10)
const in7 = new Date(Date.now() + UPCOMING_HEAT_DAYS * MS_PER_DAY).toISOString().slice(0, 10)
```

### `server/routes/analytics.js`
Replace all inline `1000 * 60 * 60 * 24` with existing `MS_PER_DAY` constant (lines 736, 804, 1042).

Add named constants:
```javascript
const RECURRENCE_WINDOW_DAYS = 60
const PREDICTION_MONTHS = 2
const MS_PER_YEAR = MS_PER_DAY * 365.25
```

---

## 12A.6 — Fix Dual/Broken Permission Checks

| File | Issue | Fix |
|------|-------|-----|
| `server/routes/milkRecords.js` DELETE | `authorize('can_record_milk')` middleware AND inline `req.user.role !== 'admin'` check | Remove middleware; keep inline admin-only guard |
| `server/routes/treatments.js` DELETE | Same dual pattern — `authorize('can_log_treatments')` + inline `role !== 'admin'` | Remove middleware; keep inline admin-only guard |
| `server/routes/breedingEvents.js` PATCH `/:id` | Inline admin check, no `authorize` middleware — inconsistent with other routes | Add inline admin-only guard or `requireAdmin` middleware for consistency |
| `server/routes/breedingEvents.js` DELETE `/:id` | Same — inline admin check without `authorize` | Same fix as above |

---

## 12A.7 — Create `requireAdmin` Middleware

**Problem:** 9+ route files use `authorize('admin')` which passes the string `'admin'` as a permission. This only works by accident because the admin role short-circuits before `permissions.includes('admin')` is evaluated. If the middleware is ever refactored, all admin-only routes silently open to workers.

**Affected files:** `cows.js`, `issueTypes.js`, `breedTypes.js`, `healthIssues.js`, `featureFlags.js`, `reports.js`, `auditLog.js`, `export.js`, `users.js`

**Fix:**
1. Create `requireAdmin` middleware in `server/middleware/authorize.js`:
```javascript
function requireAdmin(req, res, next) {
  if (req.user.role === 'admin') return next()
  return res.status(403).json({ error: 'Admin access required' })
}
```
2. Replace all `authorize('admin')` calls with `requireAdmin`
3. Grep for any remaining `authorize('admin')` to ensure none were missed

---

## 12A.8 — Fix Analytics Date Range Bugs (5 endpoints)

**Problem:** Five analytics endpoints use `whereBetween(col, [start, end])` on datetime/timestamp columns but pass date-only strings (e.g. `2024-03-15`). Records after midnight on the final day are silently excluded. Other endpoints in the same file correctly use `endTs` (with `T23:59:59`).

| Endpoint | Column | Line (approx) |
|----------|--------|------|
| `treatment-costs` | `treatment_date` | 560 |
| `issue-frequency` | `observed_at` | 889 |
| `mastitis-rate` | `observed_at` | 943 |
| `withdrawal-days` | `treatment_date` | 974 |
| `mortality-rate` | `updated_at` | 1109 |

**Fix:** Replace `end` with `endTs` in each `whereBetween` call. The `defaultRange()` helper already provides `endTs` — it's just not being used in these 5 locations.

**Verification:** Grep for `whereBetween` in analytics.js and confirm all datetime columns use `endTs`.

---

## 12A.9 — Fix `pregnant_count` String Type

**File:** `server/routes/analytics.js:360`

**Problem:** `pregnantRow?.count || 0` — Knex returns count values as strings in SQLite. Every other count in the file wraps with `Number()`. This one doesn't.

**Fix:** `Number(pregnantRow?.count || 0)`

---

## 12A.10 — Fix Sync Log Device ID

**File:** `server/routes/sync.js:102`

**Problem:** `logSync(req.user.id, 'pull', 'pull', totalRecords, 'success')` — passes the string `'pull'` as the `deviceId` parameter. Every pull log entry has junk in the `device_id` column.

**Fix:** Pass the actual device ID from the request. The client should send `deviceId` as a query param on pull requests, or extract it from headers. Align with how push requests pass `deviceId` in the body.

---

## 12A.11 — Guard JSON.parse Calls

Two locations do `JSON.parse()` on potentially malformed data without try/catch:

| File | Line | Data source | Fix |
|------|------|-------------|-----|
| `server/routes/auditLog.js` | 64 | `old_values`/`new_values` columns | Wrap in try/catch, return `null` on parse failure |
| `client/src/components/molecules/BreedingEventCard.vue` | 84 | `calving_details` from DB | Wrap in try/catch, return `null` on parse failure |

---

## 12A.12 — Fix Login Flow Error Handling

**File:** `client/src/views/LoginView.vue:176-184`

**Problem:** `cowsStore.fetchAll()` is in the same try/catch as the auth call. If auth succeeds but the cow fetch fails (network timeout, server error), the user sees a login error despite being authenticated. JWT is stored but they're stranded on the login screen.

**Fix:** Move `cowsStore.fetchAll()` into its own try/catch after navigation, or fire-and-forget:
```javascript
try {
  await loginFn()
  router.push('/')
  // Non-blocking — failure is OK, offline fallback will handle it
  cowsStore.fetchAll().catch(() => {})
} catch (err) {
  errorMsg.value = getErrorMessage(err)
}
```

---

## 12A.13 — Fix CowSearchDropdown Server-Side Filtering

**File:** `client/src/components/molecules/CowSearchDropdown.vue`

**Problem:** Fetches first page of cows, then filters by `props.sexFilter` client-side. On a large herd, a female search may return 0 results despite 80+ females existing on later pages.

**Fix:** Pass `sex` as a query param to the API:
```javascript
const params = { search: query.value }
if (props.sexFilter) params.sex = props.sexFilter
const r = await api.get('/cows', { params })
let rows = r.data  // remove dead r.data.cows fallback too
```

---

## 12A.14 — Fix Frontend Navigation & UI Bugs

| File | Issue | Fix |
|------|-------|-----|
| `client/src/views/LogIssueView.vue:113` | `backRoute` defaults to `/log` — not a registered route | Change fallback to `'/'` |
| `client/src/views/LogTreatmentView.vue:186` | Same `/log` fallback | Change fallback to `'/'` |
| `client/src/views/admin/IssueTypeManagement.vue` | `back-to="/"` instead of `/settings` | Change to `back-to="/settings"` |
| `client/src/views/admin/MedicationManagement.vue` | `back-to="/"` instead of `/settings` | Change to `back-to="/settings"` |
| `client/src/views/admin/SettingsView.vue:151` | Force Sync icon blank — `{{ syncing ? '' : '' }}` | Restore icons (e.g. sync spinner vs refresh icon) |
| `client/src/components/molecules/BreedingEventCard.vue` | Chevron `›` shown when `showCow=false` — implies navigability | Conditionally render: `<span v-if="showCow" class="chevron">›</span>` |

---

## 12A.15 — Fix ReportsView Generating State

**File:** `client/src/views/admin/ReportsView.vue:108`

**Problem:** If `reportTypes.find()` returns undefined, the early `return` inside `try` bypasses `finally`, leaving `generating.value = true` permanently. Generate button is disabled forever.

**Fix:** Move the guard before setting `generating.value = true`:
```javascript
const report = reportTypes.find((r) => r.key === selectedReport.value)
if (!report) return
generating.value = true
try { ... } finally { generating.value = false }
```

---

## 12A.16 — Fix Silent Delete Failures (Missing Catch Blocks)

| File | Issue | Fix |
|------|-------|-----|
| `client/src/views/CowReproView.vue:236` | `doDelete` has try/finally, no catch — optimistic removal with no rollback | Add catch block that restores the event and shows error toast |
| `client/src/views/BreedingEventsView.vue` | Same pattern | Same fix |

---

## 12A.17 — Fix `initialSync()` Race Condition

**File:** `client/src/services/syncManager.js:283-301`

**Problem:** `initialSync()` does not set `isSyncing.value = true`. If a polling interval or `online` event fires `sync()` simultaneously, both run `pushChanges` + `pullChanges` concurrently, causing duplicate push payloads.

**Fix:** Set `isSyncing.value = true` at the top of `initialSync()` and clear in `finally`, mirroring `sync()`.

---

## 12A.18 — Fix `breedingEvents` Store Crash on Null Date

**File:** `client/src/stores/breedingEvents.js:77`

**Problem:** `latestPerCow` sort calls `.localeCompare()` on a potentially null date field. Breaks the entire breeding hub offline.

**Fix:** Guard the sort: `(a[field] || '').localeCompare(b[field] || '')`

---

## 12A.19 — Add Error Handling to healthIssues Comment Functions

**File:** `client/src/stores/healthIssues.js:151-170`

**Problem:** `fetchComments`, `addComment`, `removeComment` are async with no try/catch. Unhandled promise rejections in production.

**Fix:** Wrap each in try/catch, set `error.value` on failure, matching the pattern used by all other store actions in the file.

---

## 12A.20 — Fix Test Bugs

| File | Issue | Fix |
|------|-------|-----|
| `server/tests/permissions.test.js:78` | Admin POST milk-records test uses same cow/date/session as worker test → 409 collision | Use different date or session for admin test |
| `client/src/tests/ReportsView.test.js:113` | `stubDownloadApis()` called after `resolveGet()` — anchor mock not active during download | Call `stubDownloadApis()` before `resolveGet()` |

---

## 12A.21 — Fix Config Issues

| File | Issue | Fix |
|------|-------|-----|
| `package.json` (root) | Self-referential dependency `"myherder": "file:"` | Remove from dependencies |
| `client/package.json` | Same self-referential dependency | Remove from dependencies |
| `.env.example` | Missing production MySQL vars (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`) | Add with placeholder values and comments |

---

## 12A.22 — Replace MedicationManagement Inline Modals with ConfirmDialog

**File:** `client/src/views/admin/MedicationManagement.vue:209-234`

**Problem:** Uses hand-rolled `<div class="modal-overlay">` dialogs for delete and deactivate confirmations. Violates the CLAUDE.md architecture rule ("Every delete action must use ConfirmDialog"). No Escape key handler, no focus trap, no `aria-modal`.

**Fix:** Replace both inline modal divs with `<ConfirmDialog>` components, matching the pattern in `IssueTypeManagement.vue` and `BreedTypeManagement.vue`.

---

## 12A.23 — Fix Mastitis Rate LIKE Query

**File:** `server/routes/analytics.js:944`

**Problem:** `WHERE issue_types LIKE '%mastitis%'` matches any issue type code containing "mastitis" (e.g. `post_mastitis_inflammation`). Also brittle if the mastitis type was named differently.

**Fix:** Look up the exact mastitis code from `issue_type_definitions` and query for that specific code in the JSON array. Or use the code directly if it's known to be `mastitis`:
```javascript
// Match exact code in JSON array, not substring
.where('issue_types', 'like', '%"mastitis"%')
// Or better: lookup from issue_type_definitions table
```

---

## 12A.24 — Miscellaneous Small Fixes

| File | Issue | Fix |
|------|-------|-----|
| `server/routes/users.js` | Route uses `?active=1` but CLAUDE.md documents `?active_only=1` | Align route to match docs: accept `active_only` param |
| `client/src/views/TreatmentDetailView.vue:134` | `const now = new Date()` frozen at mount time — withdrawal badges go stale | Move `new Date()` inside computed |
| `client/src/stores/featureFlags.js:28` | Sequential `await db.featureFlags.put()` in loop | Replace with single `db.featureFlags.bulkPut(entries)` |
| `client/src/views/CowFormView.vue:256` | `String(q.breed_type_id)` causes select mismatch | Remove `String()` coercion |
| `server/routes/reports.js:151` | Withdrawal days calc uses `formatDate()` (truncates time) | Use raw timestamps for arithmetic |
| `client/src/views/admin/UserManagement.vue` | Delete error overwrites ConfirmDialog message prop | Use separate `deleteError` ref |
| `client/src/stores/breedingEvents.js:180` | `dismissBatch` has no rollback on non-offline API failure | Snapshot + restore on error, matching other store patterns |

---

## Verification Checklist

- [ ] `npm run lint` → 0 errors, 0 warnings
- [ ] `npm run knip` → 0 unused exports (only config hints)
- [ ] `npx jest` → all passing
- [ ] `cd client && npm run test:run` → all passing
- [ ] No magic numbers in breedingEvents.js or analytics.js date calculations
- [ ] No no-op code or dead fallbacks
- [ ] All `authorize('admin')` replaced with `requireAdmin`
- [ ] All analytics `whereBetween` on datetime columns use `endTs`
- [ ] All `JSON.parse` on user/DB data guarded with try/catch
- [ ] No dual permission checks (middleware + inline)
- [ ] All admin views have `back-to="/settings"`
- [ ] CowSearchDropdown passes `sex` param to server
- [ ] `initialSync()` guards with `isSyncing`
- [ ] Login flow separates auth from cow fetch
- [ ] MedicationManagement uses ConfirmDialog (no inline modals)
- [ ] Self-referential deps removed from package.json
- [ ] `.env.example` has production MySQL vars

---

## Items Deferred to 12B (Performance) or 12E (Architecture)

These were found during the audit but are larger in scope:

| Issue | Deferred to |
|-------|-------------|
| N+1 queries in `breeding-overview` and `conception-rate` (`countServicesForPregCheck` loop) | 12B |
| `milk-trends` fires one `countDistinct` per month — N+1 inside `Promise.all` | 12B |
| Password login has no account lockout (brute-force exposure) | 12B |
| No Joi validation on analytics `from`/`to` query params | 12B |
| `dismiss-batch` accepts arbitrary strings in `ids[]` — no UUID validation | 12B |
| `api.js` 401 handler uses `window.location.href` (hard reload) — loses in-memory state | 12B |
| `syncService.js` `handleCreate` duplicate returns old data instead of applying update | 12B |
| `syncManager.js` network-level push failure increments attempts on all queue items | 12B |
| `milkRecords.js` store 409 retry has empty inner catch — silently falls through | 12B |
| i18n test setup uses empty messages — all key assertions are tautologies | 12C/12D |
| `reports.test.js` only asserts HTTP 200, not data content (smoke not integration) | 12C/12D |
| BreedingHubView nav cards are `<div @click>` not `<RouterLink>` (keyboard inaccessible) | 12E |
| ConfirmDialog missing `aria-modal`, focus trap, Escape key handler | 12E |
| `auditLog.js` count query clones SQL string and re-executes via `db.raw()` | 12E |
