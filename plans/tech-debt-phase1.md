# Tech Debt Phase 1 — Critical Fixes (Security + Production Breakage + Stale Tests)

## Goal
Fix issues that affect production safety, security, and CI reliability. Every change is minimal and targeted — no refactoring, no new features.

**Note:** No frontend source changes in this phase — `client/dist` rebuild is NOT required.

---

## Execution Order

1. Step 5 — Fix stale tests (establish green baseline with no prod code changes)
2. Step 2 — Fix julianday MySQL breakage in cows.js
3. Step 3 — Gate err.code in production
4. Step 4 — Harden token_version check (auth middleware + refresh endpoint)
5. Step 1 — npm update express-rate-limit (last, to isolate dependency changes)
6. Final — Full suite run, npm audit, commit package-lock.json

---

## Step 1. Update express-rate-limit (SECURITY — HIGH)

**Problem:** Version 8.2.1 has an IPv6 bypass (GHSA-46wh-pxpv-q5gq). Attackers can use IPv4-mapped IPv6 addresses to circumvent rate limiting on login/PIN endpoints.

**Fix:** `npm update express-rate-limit` (8.2.1 → 8.3.1). No code changes needed. Commit `package-lock.json` alongside the change.

**Verification:** `npm audit` should no longer flag express-rate-limit. Run `npm test` to confirm no regressions.

**Risk:** LOW — patch version, no API changes.

---

## Step 2. Fix `julianday()` MySQL breakage in cows.js (PRODUCTION — MEDIUM)

**Problem:** `LIFE_PHASE_SQL`, `LAST_CALVING_SQL` DIM filters, and the yield subquery in `server/routes/cows.js` use SQLite-only functions (`julianday()`, `date()`). The analytics helpers already solved this with `isMySQL()` + portable wrappers. The cows endpoint 500s on every request in production (MySQL).

**Three SQLite-only expressions to fix:**
1. `LIFE_PHASE_SQL` (lines 71-81) — uses `julianday('now') - julianday(c.dob)` in 5 places
2. DIM filters (lines 139, 145) — uses `julianday('now') - julianday(LAST_CALVING_SQL)`
3. Yield subquery (line 161) — uses `date('now', '-7 days')`

### Sub-steps:

**2a. Export `isMySQL` from `analytics/helpers.js`**

`isMySQL()` is currently a private function (defined at line 58, NOT in module.exports). Add it to the exports object at line 156. This is zero-risk: no existing code imports it externally, so adding the export changes nothing for current consumers.

**2b. Import `isMySQL` in `cows.js`**

Add to the imports at top of cows.js:
```js
const { isMySQL } = require('./analytics/helpers')
```

No circular dependency risk — analytics/helpers.js imports from `config/database` and `helpers/constants`, not from cows.js.

**2c. Replace `LIFE_PHASE_SQL` with a function `lifePhaseSql()`**

The age-in-months expression needs branching:
- SQLite: `(julianday('now') - julianday(c.dob)) / 30.44`
- MySQL: `DATEDIFF(NOW(), c.dob) / 30.44`

Convert the constant string to a function that returns the appropriate SQL.

**2d. Replace DIM filter expressions (lines 139, 145)**

- SQLite: `julianday('now') - julianday(${LAST_CALVING_SQL})` (current)
- MySQL: `DATEDIFF(NOW(), ${LAST_CALVING_SQL})`

**2e. Replace yield date expression (line 161)**

- SQLite: `date('now', '-7 days')` (current)
- MySQL: `DATE_SUB(NOW(), INTERVAL 7 DAY)`

**Verification:**
- `npm test -- --testPathPattern=cows` passes (SQLite path)
- **Note:** Existing cows tests do NOT exercise `life_phase`, `dim_min`, `dim_max`, or `yield_min`/`yield_max` query params. The tests verify the SQLite path doesn't regress but CANNOT verify the MySQL expressions are correct. We mitigate this by using the exact same patterns proven in `analytics/helpers.js` (`ageYearsExpr`, `dayDiffExpr`).
- Manual spot-check: verify the generated MySQL SQL is syntactically valid.

**Risk:** MEDIUM — changes production SQL. Mitigated by reusing proven patterns from analytics/helpers.js. The cows endpoint is currently broken in MySQL anyway, so the fix can only improve the situation.

---

## Step 3. Gate `err.code` in production error responses (SECURITY — MEDIUM)

**Problem:** `server/middleware/errorHandler.js` line 21 leaks DB error codes (`ER_NO_SUCH_TABLE`, `SQLITE_CONSTRAINT`, etc.) in production 500 responses.

**Fix:** Change lines 21-23 from:
```js
if (status === 500 && err.code) {
  response.code = err.code;
}
```
To:
```js
if (status === 500 && err.code && process.env.NODE_ENV !== 'production') {
  response.code = err.code;
}
```

**Verification:** `npm test -- --testPathPattern=errorHandler` passes (runs in test env, not production, so the `err.code` assertion still works).

**Risk:** LOW — only removes a field from 500 responses in production. No client code reads `err.code` from 500 responses.

---

## Step 4. Harden `token_version` check (SECURITY — MEDIUM)

**Problem:** TWO locations check `token_version` with a bypass for tokens missing the field:
1. `server/middleware/auth.js` line 32 — the main auth middleware
2. `server/routes/auth.js` line 441 — the `/api/auth/refresh` handler

Both use the same vulnerable pattern:
```js
if (typeof decoded.token_version === 'number' && decoded.token_version !== user.token_version) {
```
A token without `token_version` passes both checks, making it irrevocable AND able to refresh into a fresh valid token.

### Pre-flight check (MUST pass before proceeding):

Grep all `jwt.sign(` calls. Every production token payload must include `token_version`. Confirmed by safety auditor:
- `issueFullToken()` → calls `buildUserResponse(user)` which sets `token_version: user.token_version ?? 0` ✓
- `issueTempToken()` → no `token_version`, BUT temp tokens are rejected before the version check ✓
- `farms.js` enter-farm token → `token_version: user.token_version ?? 0` ✓
- Refresh → calls `issueFullToken(buildUserResponse(user))` ✓

### Fix:

**4a. Auth middleware** (`server/middleware/auth.js` line 32):
```js
// Before:
if (typeof decoded.token_version === 'number' && decoded.token_version !== user.token_version) {
// After:
if (typeof decoded.token_version !== 'number' || decoded.token_version !== user.token_version) {
```

**4b. Refresh handler** (`server/routes/auth.js` line 441):
Same change — replace `=== 'number' &&` with `!== 'number' ||`.

**4c. Add test for missing token_version rejection:**

Add a test to `server/tests/middleware.test.js`: sign a token omitting `token_version`, assert the middleware returns 401 with `'Token revoked'`. This prevents future regressions on this specific bypass.

**Verification:**
- `npm test -- --testPathPattern=middleware` passes (includes new test)
- `npm test -- --testPathPattern=auth` passes
- All existing token-based tests pass (they all include `token_version: 0`)

**Risk:** MEDIUM — if any code path issues a JWT without `token_version`, those tokens will be rejected. Pre-flight check confirms all production paths are safe. Old pre-versioning tokens (if any still circulating) would require re-login — acceptable given 24h/7d TTLs mean they've long expired.

---

## Step 5. Fix 6 stale tests (CI — LOW risk)

All are test-only changes. No production code is modified.

### 5a. MilkHistoryView — limit 25 → 20
**File:** `client/src/tests/MilkHistoryView.test.js` line 161
**Change:** `limit: 25` → `limit: 20`
**Why:** Source changed default page size from 25 to 20. Test not updated.

### 5b. FertilityView — rounded percentages
**File:** `client/src/tests/analytics/FertilityView.test.js` lines 171, 173
**Change:** `'45.5%'` → `'46%'`, `'18.5%'` → `'19%'`
**Why:** Source now applies `Math.round()` on stat chip values for display. Test expects raw decimals.

### 5c. HealthView — rounded avg days
**File:** `client/src/tests/analytics/HealthView.test.js` line 210
**Change:** `'8.2d'` → `'8d'`
**Why:** Same rounding change as 5b.

### 5d. HealthView — rounded incidence rates (SCOPED assertion)
**File:** `client/src/tests/analytics/HealthView.test.js` lines 220-222
**Change:** Replace:
```js
expect(text).toContain('9.6')   // mastitis rate
expect(text).toContain('5.1')   // lameness rate
expect(text).toContain('2.8')   // respiratory rate
```
With (scoped to `.incidence-panel` to avoid false-positive match against mastitis frequency count of 10):
```js
const incidenceText = wrapper.find('.incidence-panel').text()
expect(incidenceText).toContain('10')   // mastitis rate (Math.round(9.6))
expect(incidenceText).toContain('5')    // lameness rate (Math.round(5.1))
expect(incidenceText).toContain('3')    // respiratory rate (Math.round(2.8))
```

### 5e. kpi.test.js — heifer count uses life_phase_override
**File:** `server/tests/analytics/kpi.test.js` lines 199-217
**Change:** Set `life_phase_override: 'heifer'` on the test cow fixture instead of relying on calving-event absence.
**Semantic note:** This changes what the test verifies — from "calving-event inference" to "life_phase_override flag detection." This aligns with how the source actually works (kpi.js line 65 uses `SUM(CASE WHEN life_phase_override = 'heifer' ...)`). The calving-event inference was never implemented in the source.

**Verification:** Full suite — `cd client && npm run test:run` + `npm test` — all green.

**Risk:** LOW — test-only changes cannot affect production.

---

## Out of Scope (deferred to Phase 2/3)

- milkRecords 409 PUT recovery (source change, needs design decision)
- TOTP replay protection (needs design, possibly new cache/table)
- milk_price_per_litre pre-auth exposure (LOW priority)
- Lint fixes in seed files
- Code deduplication
- Pattern drift fixes
- Test quality improvements (new tests for breedingCalc, sync ownership, etc.)
- File splitting (CowDetailView, LogBreedingView)
- Sync pull permission model (accepted design trade-off for offline-first)
