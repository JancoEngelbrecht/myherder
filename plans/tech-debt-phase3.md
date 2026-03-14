# Tech Debt Phase 3 — Test Hardening + Minor Security

## Goal
Add high-value tests for untested business logic, remove zero-value tests, and add TOTP replay protection. No file splitting in this phase (deferred — high blast radius, lower urgency).

**Note:** No frontend source changes — `client/dist` rebuild NOT required.

---

## Execution Order

1. Add breedingCalc.js unit tests (highest-value gap)
2. Add syncService ownership check tests
3. Add calcWithdrawalDates combined hours+days test
4. Remove/replace zero-value sync store tests
5. Add TOTP used-code replay protection
6. Run full test suite

---

## Step 1. Add breedingCalc.js unit tests (HIGH value)

**Problem:** `server/helpers/breedingCalc.js` has ZERO unit tests. It's the only function computing breeding auto-dates (expected heat, preg check, calving, dry-off). A wrong constant would pass all integration tests.

**File to create:** `server/tests/breedingCalc.test.js`

**Test cases (pure unit, no DB — mock `getBreedTimings` or test `calcDates` directly):**

1. `heat_observed` event → returns `expected_next_heat` and `expected_preg_check`, calving/dry_off are null
2. `ai_insemination` event → returns all 4 dates (heat, preg_check, calving, dry_off)
3. `bull_service` event → same as ai_insemination (both compute calving/dry_off)
4. Default timings: heat_cycle=21d, preg_check=35d, gestation=283d, dry_off=60d — verify exact dates
5. Breed-specific overrides: pass `{ heat_cycle_days: 18, gestation_days: 279, preg_check_days: 30, dry_off_days: 55 }` (Jersey-like) → verify dates use overrides
6. Non-insemination event types (`preg_check_positive`, `calving`, `dry_off`, `abort`) → all 4 dates are null
7. Edge case: month boundary crossing (e.g., event on Jan 31 + 21 days = Feb 21)

**Verification:** `npx jest server/tests/breedingCalc.test.js` passes with all 7+ test cases.

**Risk:** LOW — new test file only, no production code changes.

---

## Step 2. Add syncService ownership check tests (HIGH value)

**Problem:** The ownership check in `handleUpdate` (line 219) and `handleDelete` (line 255) of `syncService.js` blocks worker A from modifying worker B's records — but this access boundary has no test coverage.

**File:** `server/tests/sync.test.js` — add tests to existing file.

**Test cases:**
1. Worker A creates a milk record → Worker B tries to update it via sync push → status: 'error', error: 'Cannot modify records owned by another user'
2. Worker A creates a milk record → Worker B tries to delete it via sync push → status: 'error', same message
3. Admin can update any worker's record → status: 'applied' (admin bypass)
4. Worker A can update their OWN record → status: 'applied'

**Implementation notes:**
- The sync test setup already creates admin and worker tokens
- Need a second worker user for cross-ownership tests
- Entity type `milkRecords` has `ownerField: 'recorded_by'` in the ENTITY_CONFIG

**Verification:** `npx jest server/tests/sync.test.js` passes.

**Risk:** LOW — adding tests to existing test file, no production code changes.

---

## Step 3. Add calcWithdrawalDates combined hours+days test (MEDIUM value)

**Problem:** No test verifies the additive formula when BOTH hours AND days are non-zero for the same withdrawal type (e.g., milk_hours=12, milk_days=2 should yield 60 total hours).

**File:** `server/tests/withdrawalService.test.js` — add 1 test case.

**Test case:**
```js
it('combines hours and days for both milk and meat', () => {
  const { withdrawalEndMilk, withdrawalEndMeat } = calcWithdrawalDates(BASE, 12, 2, 6, 3)
  // milk: 12h + 2*24h = 60h after 2026-01-01T12:00Z = 2026-01-04T00:00Z
  expect(withdrawalEndMilk).toEqual(new Date('2026-01-04T00:00:00.000Z'))
  // meat: 6h + 3*24h = 78h after 2026-01-01T12:00Z = 2026-01-04T18:00Z
  expect(withdrawalEndMeat).toEqual(new Date('2026-01-04T18:00:00.000Z'))
})
```

**Risk:** LOW — adding 1 test to existing file.

---

## Step 4. Remove/replace zero-value sync store tests (MEDIUM value)

**Problem:** `client/src/tests/sync.store.test.js` has 12 tests (lines 54–137) that directly set reactive refs (`isSyncing.value = true`) and check computed properties. These test Vue's reactivity system, not application logic.

**Fix:** Remove the 12 computed-status tests. They test one-line ternary chains and provide zero safety. The sync store's actual value comes from its actions (triggerSync, retryFailed) which are already tested in `syncManager.test.js`.

**What stays:** Keep the `sync store — actions` tests at the bottom of the file (if any), and keep the file itself if it has other valuable tests.

**Verification:** `cd client && npx vitest run src/tests/sync.store.test.js` passes with reduced count.

**Risk:** LOW — removing tests that test nothing meaningful. If any computed logic has a bug, syncManager tests catch it at the integration level.

---

## Step 5. Add TOTP used-code replay protection (SECURITY — MEDIUM)

**Problem:** TOTP `verify-2fa` and `confirm-2fa` accept the same code multiple times within the 90-second window (window=1). An attacker with an intercepted code can replay it for a concurrent session.

**Fix:** In-memory LRU cache of recently used TOTP codes per user. After successful verification, store `(userId, code)` with a 90-second TTL. Reject if the same `(userId, code)` pair is found.

**Implementation:**
- Add a `Map` at module level in `server/routes/auth.js`:
  ```js
  const usedTotpCodes = new Map()  // key: `${userId}:${code}`, value: expiry timestamp
  ```
- After successful `totp.validate()` in both `verify-2fa` and `confirm-2fa`:
  ```js
  const cacheKey = `${user.id}:${code}`
  const now = Date.now()
  if (usedTotpCodes.has(cacheKey) && usedTotpCodes.get(cacheKey) > now) {
    return res.status(401).json({ error: 'Code already used' })
  }
  usedTotpCodes.set(cacheKey, now + 90000)  // 90s TTL
  ```
- Add periodic cleanup to avoid memory leak (run every 5 min, delete expired entries):
  ```js
  setInterval(() => {
    const now = Date.now()
    for (const [key, expiry] of usedTotpCodes) {
      if (expiry <= now) usedTotpCodes.delete(key)
    }
  }, 5 * 60 * 1000).unref()
  ```

**Verification:**
- `npx jest server/tests/auth.test.js` passes
- Add a test: call `verify-2fa` twice with the same valid code → first succeeds, second returns 401

**Risk:** MEDIUM — modifies auth flow. The cache check runs AFTER `totp.validate()` succeeds, so a wrong code is still rejected by speakeasy before hitting the cache. The only behavioral change is that a valid code can't be used twice. The `.unref()` on setInterval ensures it doesn't prevent process exit.

**Note on testing:** The auth test setup uses `speakeasy.totp()` to generate codes. Calling `verify-2fa` twice in quick succession with the same code tests the replay scenario naturally.

---

## Out of Scope (deferred)

- File splitting (CowDetailView 766 lines, LogBreedingView 669 lines) — high blast radius, needs careful component extraction with CSS migration. Better done as a focused session.
- milkRecords 409 PUT recovery — needs UX design decision (silent retry vs error)
- Auth store offline login test — needs IndexedDB mock refactoring
- Cows store offline update/remove tests — needs IndexedDB mock refactoring
- Analytics exact-value assertions — needs test isolation refactoring
- Semicolon normalization, $t() → t() migration, .content → .page-content — cosmetic, deferred
