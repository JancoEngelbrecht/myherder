# Fix: Exclude Heifers from Milk Withdrawal

## Problem

Heifers (young females that have never calved) appear on the milk withdrawal page after receiving treatments with milk withdrawal periods. This is incorrect — heifers are not being milked, so milk withdrawal is irrelevant for them. Meat withdrawal should still apply.

## Audit Finding: `status` is NOT `heifer`

The initial implementation compared `c.status !== 'heifer'` — but `status` is an enum of `['active', 'dry', 'pregnant', 'sick', 'sold', 'dead']`. "Heifer" is a **computed life phase** derived from `dob`, `sex`, `life_phase_override`, and breed-specific age thresholds. The original fix was a no-op.

**Source of truth:**

- Backend: `LIFE_PHASE_SQL` in `server/routes/cows.js:71-81` (SQLite-only, uses `julianday`)
- Frontend: `computeLifePhase(cow, breedType)` in `client/src/stores/cows.js`

## Approach: JS-side computation (not SQL)

The `LIFE_PHASE_SQL` CASE expression is SQLite-only and requires a `breed_types` join. Rather than duplicating and making it cross-dialect, the simpler approach is:

1. **Backend GET /withdrawal** — add an **inline** `LEFT JOIN breed_types` and extra selects (NOT in `treatmentQuery` — keep that base function lean). Filter in JS after fetching.
2. **Backend POST /treatments** — already has the cow row; compute life phase in JS.
3. **Frontend** — the withdrawal API response will include `life_phase` (computed by backend). Frontend filters on that field. Offline fallback computes life phase from cached cow data.

This avoids dialect-specific SQL and reuses existing logic.

---

## Phase 1: Shared life phase helper

### 1A. Extract `computeLifePhase` to a shared server helper

Create `server/helpers/lifePhase.js` with the same logic as the client-side `computeLifePhase()` in `client/src/stores/cows.js:13-33`:

```js
function computeLifePhase(cow, breedType = null) {
  if (cow.life_phase_override) return cow.life_phase_override
  if (!cow.dob) return cow.sex === 'male' ? 'bull' : 'cow'
  const ageMs = Date.now() - new Date(cow.dob).getTime()
  const ageMonths = ageMs / (1000 * 60 * 60 * 24 * 30.44)
  const calfMax = breedType?.calf_max_months ?? 6
  const heiferMin = breedType?.heifer_min_months ?? 15
  const youngBullMin = breedType?.young_bull_min_months ?? 15
  if (cow.sex === 'male') {
    if (ageMonths < calfMax) return 'calf'
    if (ageMonths < youngBullMin) return 'young_bull'
    return 'bull'
  }
  if (ageMonths < calfMax) return 'calf'
  if (ageMonths < heiferMin) return 'heifer'
  return 'cow'
}
```

---

## Phase 2: Backend fixes

### 2A. GET /api/treatments/withdrawal — exclude heifers + calves + sold/dead

**File:** `server/routes/treatments.js`

- Add **inline** (not in `treatmentQuery`) `LEFT JOIN breed_types as bt ON c.breed_type_id = bt.id` to the withdrawal route query only
- Select `c.dob`, `c.life_phase_override`, `c.status`, `bt.calf_max_months`, `bt.heifer_min_months`
- **Revert** the broken `.andWhere('c.status', '!=', 'heifer')` from the SQL query — go back to simple `WHERE withdrawal_end_milk > now OR withdrawal_end_meat > now`
- After fetching rows, compute `life_phase` for each cow using `computeLifePhase()`
- For milk withdrawal: null out `withdrawal_end_milk` for life phases `heifer` and `calf`
- Filter out `status` in `['sold', 'dead']` entirely (no withdrawal concern for removed animals)
- Include `life_phase` in the response objects so frontend can use it

**Why inline, not in `treatmentQuery`:** `treatmentQuery` is used by GET /treatments, GET /treatments/:id, and POST create — adding a breed_types join + extra columns there would bloat all those responses unnecessarily.

### 2B. POST /api/treatments — skip milk withdrawal for heifers/calves

**File:** `server/routes/treatments.js`

- Import `computeLifePhase` from the new helper
- After fetching the cow row, also fetch the breed type if `cow.breed_type_id` is set
- Compute `lifePhase = computeLifePhase(cow, breedType)`
- Replace `const isHeifer = cow.status === 'heifer'` with `const skipMilkWithdrawal = isMale || lifePhase === 'heifer' || lifePhase === 'calf'`
- Use `if (!skipMilkWithdrawal && withdrawalEndMilk ...)` for the milk withdrawal condition

### 2C. GET /api/analytics/withdrawal-days — exclude heifers/calves

**File:** `server/routes/analytics/health.js`

- Join `cows as c ON c.id = treatments.cow_id` and `LEFT JOIN breed_types as bt ON c.breed_type_id = bt.id`
- Add `.whereNull('c.deleted_at')` to guard soft-deleted cows
- Select cow fields needed for life phase computation (`c.dob`, `c.sex`, `c.life_phase_override`, `bt.calf_max_months`, `bt.heifer_min_months`)
- After fetching, filter out rows where computed life phase is `heifer` or `calf`

**Note on legacy data:** Existing heifer treatment records with `withdrawal_end_milk` set will be correctly filtered out by the JS computation. They will age out naturally as the withdrawal period expires.

### 2D. GET /api/reports/withdrawal-compliance — exclude heifers/calves

**File:** `server/routes/reports/treatment.js` (function `getWithdrawalData`)

- This endpoint already joins cows (`c.sex = 'female'` filter) but does not exclude heifers
- Add `LEFT JOIN breed_types as bt ON c.breed_type_id = bt.id`
- Select `c.dob`, `c.life_phase_override`, `bt.calf_max_months`, `bt.heifer_min_months`
- After fetching, filter out rows where computed life phase is `heifer` or `calf`

---

## Phase 3: Frontend fixes

### 3A. WithdrawalListView.vue — filter on `life_phase` from API response

**File:** `client/src/views/WithdrawalListView.vue`

- Replace `c.status !== 'heifer'` with `c.life_phase !== 'heifer' && c.life_phase !== 'calf'`
- The `life_phase` field comes from the updated API response (Phase 2A)
- Fallback: if `life_phase` is undefined (offline path), still show the record (backend is the primary filter)

### 3B. CowDetailView.vue — withdrawal badge excludes heifers

**File:** `client/src/views/CowDetailView.vue`

- `computeLifePhase` and `breedTypesStore` are **already imported** (lines 275, 298)
- `lifePhase` is **already computed** (lines 307-311)
- Just add to `onWithdrawal` computed (line 332): `if (lifePhase.value === 'heifer' || lifePhase.value === 'calf') return false`
- Same guard in `cowWithdrawalEnd` computed (line 340)

### 3C. CowTreatmentHistoryView.vue — withdrawal badge excludes heifers

**File:** `client/src/views/CowTreatmentHistoryView.vue`

- This view has its own `onWithdrawal` and `cowWithdrawalEnd` computeds that only check `sex === 'male'`
- Import `computeLifePhase` from `../stores/cows.js` and `useBreedTypesStore` from `../stores/breedTypes.js`
- Compute life phase from the loaded cow object
- Add the same `heifer`/`calf` guard to both computeds

### 3D. Offline fallback — treatments store `fetchWithdrawal`

**File:** `client/src/stores/treatments.js`

- The offline branch of `fetchWithdrawal()` populates `withdrawalCows` from IndexedDB
- It does not attach `life_phase` — so the frontend filter `c.life_phase !== 'heifer'` would pass `undefined !== 'heifer'` (always true), showing heifers
- Fix: after resolving cow data from IndexedDB, also fetch the cow's breed type and compute `life_phase` using `computeLifePhase`, then attach it to the response object
- If breed type data is unavailable offline, use default thresholds (6/15 months)

---

## Phase 4: Tests

### 4A. Backend tests (`server/tests/treatments.test.js`)

1. `GET /withdrawal` — heifer (by age) with milk withdrawal medication is excluded from milk results
2. `GET /withdrawal` — heifer with meat withdrawal medication IS included
3. `GET /withdrawal` — sold/dead cow excluded entirely
4. `POST /treatments` — treatment for heifer stores `withdrawal_end_milk: null`
5. `POST /treatments` — treatment for adult cow still stores `withdrawal_end_milk` correctly

### 4B. Frontend tests (`client/src/tests/WithdrawalListView.test.js`)

1. Heifer record (with `life_phase: 'heifer'`) filtered out of milk tab
2. Heifer record still shows in meat tab
3. Calf record filtered out of milk tab

---

## Already Safe (no changes needed)

- **`MilkRecordingView.vue`** — uses `computeLifePhase(c) === 'cow'` as the `isMilkable` gate; heifers and calves already excluded from milk recording entirely
- **`TreatmentDetailView.vue`** — shows `withdrawal_end_milk` from DB for individual treatments. After Phase 2B, new heifer treatments will have `withdrawal_end_milk: null`. Existing legacy records will display until they expire naturally. No frontend guard needed (low impact, self-correcting).

---

## Edge Cases

1. **Heifer with only meat withdrawal** — appears in meat tab only (Phase 2A filter is milk-specific)
2. **Heifer with both milk + meat meds** — meat tab only, no milk tab
3. **Cow transitions heifer → cow** — new treatments after aging past threshold correctly compute `life_phase: 'cow'` and get milk withdrawal
4. **Existing heifer treatments with `withdrawal_end_milk` set** — filtered out by JS computation in GET (Phase 2A) and frontend (Phase 3A). Legacy data self-corrects as withdrawals expire.
5. **Male exclusion unchanged** — existing `isMale` check untouched
6. **`life_phase_override: 'heifer'`** — manual override respected by `computeLifePhase`
7. **Sold/dead cows** — excluded from withdrawal list entirely (Phase 2A)
8. **Calves** — also excluded from milk withdrawal (calves aren't milked either)
9. **No breed type** — `computeLifePhase` defaults to 6/15 month thresholds
10. **Offline mode** — Phase 3D ensures life phase is computed from cached cow data in IndexedDB

## Files Modified

| File                                           | Change                                            |
| ---------------------------------------------- | ------------------------------------------------- |
| `server/helpers/lifePhase.js`                  | **NEW** — shared `computeLifePhase()`             |
| `server/routes/treatments.js`                  | Fix GET /withdrawal (inline join) + POST creation |
| `server/routes/analytics/health.js`            | Fix withdrawal-days analytics                     |
| `server/routes/reports/treatment.js`           | Fix withdrawal-compliance report                  |
| `client/src/views/WithdrawalListView.vue`      | Filter on `life_phase` field                      |
| `client/src/views/CowDetailView.vue`           | Withdrawal badge excludes heifers                 |
| `client/src/views/CowTreatmentHistoryView.vue` | Withdrawal badge excludes heifers                 |
| `client/src/stores/treatments.js`              | Offline fallback computes `life_phase`            |
| `server/tests/treatments.test.js`              | New heifer withdrawal tests                       |
| `client/src/tests/WithdrawalListView.test.js`  | New heifer filter tests                           |
