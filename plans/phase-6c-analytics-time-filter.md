# Sub-Plan: Analytics Time Range Filter Chips

> Sub-plan: `plans/phase-6c-analytics-time-filter.md`

## Context

All 4 analytics category views (Financial, Health, Fertility, Structure) currently show a fixed 12-month window with no way for the farmer to look further back or narrow down. The backend already supports `from`/`to` query params on ~10 endpoints, but 5 endpoints have hardcoded time windows and the frontend never passes date params at all.

**Goal:** Add a row of filter chips (3M, 6M, **12M** default, 24M) to each category view. Each category maintains its own independent filter. Tapping a chip re-fetches all time-sensitive charts in that view. Snapshot endpoints (herd-summary, age-distribution, etc.) are unaffected.

---

## Phase 1: Backend — Add `from`/`to` to 5 Endpoints + Fix Bug

**Files:** `server/routes/analytics.js`, `server/tests/analytics.test.js`

### 1.1 Fix `unhealthiest` toISOString bug

- Line ~130 uses `.toISOString()` (UTC) instead of `localDate()` (local) — causes off-by-one near midnight
- Replace with `localDate()`

### 1.2 Add `from`/`to` support to 5 endpoints

Each follows the identical pattern — replace hardcoded date arithmetic with `defaultRange(req.query.from, req.query.to)`:

| Endpoint            | Current hardcoded range        | Change                     |
| ------------------- | ------------------------------ | -------------------------- |
| `/unhealthiest`     | 90 days (`.toISOString()` bug) | `defaultRange()` + fix bug |
| `/top-producers`    | 90 days (`localDate()`)        | `defaultRange()`           |
| `/bottom-producers` | 90 days (`localDate()`)        | `defaultRange()`           |
| `/conception-rate`  | 12 months                      | `defaultRange()`           |
| `/days-open`        | 24 months                      | `defaultRange()`           |

All backward-compatible — no params = `defaultRange()` 12-month default.

### 1.3 Tests (10 new)

For each of the 5 endpoints, add 2 tests:

- "respects from/to date range" — seed data at known date, query matching range, verify match
- "returns empty/zero for date range with no data" — query `1990-01-01` to `1990-12-31`

### 1.4 Refactor & dead code check

- Verify each modified endpoint has no leftover `ninetyDaysAgo`, `cutoff`, `twelveMonthsAgo`, `twentyFourMonthsAgo` variables
- All 5 endpoints should use `defaultRange()` consistently

### 1.5 Verify

- Run `cd server && npm test` — all 60 existing + 10 new = 70 tests pass
- Update CLAUDE.md API docs for the 5 endpoints (now accept `from`/`to`)

---

## Phase 2: Shared Composable + i18n + Dead Key Cleanup

**Files:** `client/src/composables/useAnalytics.js`, `client/src/i18n/en.json`, `client/src/i18n/af.json`

### 2.1 Add `useTimeRange()` composable

New export in `useAnalytics.js`:

- `TIME_RANGE_OPTIONS` — array of `{ value: 3|6|12|24, labelKey: 'analytics.timeRange.3m' }` etc.
- `useTimeRange(defaultMonths = 12)` — returns `{ selectedRange, dateRange, TIME_RANGE_OPTIONS }`
  - `selectedRange` — `ref(12)`, the currently selected months-back value
  - `dateRange` — `computed` returning `{ from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }` based on `selectedRange`
  - Date formatting mirrors backend's `localDate()` format exactly

### 2.2 i18n keys

Add to both `en.json` and `af.json` under `analytics`:

```json
"timeRange": { "3m": "3M", "6m": "6M", "12m": "12M", "24m": "24M" }
```

### 2.3 Dead i18n key cleanup

Remove 11 dead top-level analytics keys from both `en.json` and `af.json`:

- `analytics.unhealthiest`, `analytics.milkTrends`, `analytics.wastedMilk`, `analytics.breedingOverview`, `analytics.treatmentCosts`, `analytics.seasonalPrediction`, `analytics.totalLitres`, `analytics.litres`, `analytics.discardedTotal`, `analytics.basedOnYears`, `analytics.noPredictions`

(8 top-level keys remain active: `topProducers`, `avgDaily`, `discardedLitres`, `totalSpend`, `pregnantCount`, `openCount`, `servicesPerConception`, `expectedCalvings`)

### 2.4 Refactor & dead code check

- Verify `useAnalytics.js` exports are all still used
- Verify no test files reference the removed i18n keys

### 2.5 Verify

- Run `cd client && npm run test:run` — all existing tests pass (purely additive + dead key removal)

---

## Phase 3: FinancialView — Filter Chips + Reactive Data Fetching

**Files:** `client/src/views/analytics/FinancialView.vue`, `client/src/tests/analytics/FinancialView.test.js`

### 3.1 Template

Add filter chips row after offline banner, before first `<section>`:

```html
<div class="filter-chips">
  <button
    v-for="opt in TIME_RANGE_OPTIONS"
    :key="opt.value"
    class="chip"
    :class="{ active: selectedRange === opt.value }"
    @click="selectedRange = opt.value"
  >
    {{ t(opt.labelKey) }}
  </button>
</div>
```

### 3.2 Script refactor

- Import `watch` from Vue, import `useTimeRange, TIME_RANGE_OPTIONS` from composable
- Init `const { selectedRange, dateRange } = useTimeRange()`
- Extract all time-sensitive fetches into `loadData()`:
  - **Time-sensitive (pass `from`/`to`):** litres-per-cow, milk-trends, top-producers, bottom-producers, wasted-milk, treatment-costs
  - **Snapshot (fetch once in onMounted):** `/settings`, `herd-summary`
- `loadData()` resets loading states, builds `?from=...&to=...` params, fires all fetches
- `onMounted`: fetch snapshots + call `loadData()`
- `watch(selectedRange, loadData)` — re-fetch on chip tap

### 3.3 Tests (2 new)

1. "renders time range filter chips with 12M active by default" — check 4 chips, active class on 12M
2. "re-fetches data when time range chip is clicked" — click 3M chip, verify API calls include `from=` and `to=` params

### 3.4 Refactor & dead code check

- Verify `onMounted` has no duplicated fetch logic (all time-sensitive fetches only in `loadData()`)
- No unused imports or variables

### 3.5 Verify

- Run `cd client && npm run test:run` — 9 existing + 2 new = 11 FinancialView tests pass
- Full suite passes

---

## Phase 4: HealthView — Filter Chips + Reactive Data Fetching

**Files:** `client/src/views/analytics/HealthView.vue`, `client/src/tests/analytics/HealthView.test.js`

### 4.1 Template

Same filter chips row pattern as Phase 3.

### 4.2 Script refactor

Same composable import pattern. Extract into `loadData()`:

- **Time-sensitive (pass `from`/`to`):** issue-frequency, mastitis-rate, withdrawal-days, unhealthiest
- **Snapshot (fetch once):** daily-kpis, seasonal-prediction

### 4.3 Tests (2 new)

1. "renders time range filter chips with 12M active by default"
2. "re-fetches data when time range chip is clicked"

### 4.4 Refactor & dead code check

- Verify daily-kpis and seasonal-prediction are NOT re-fetched on chip click
- No dead code in refactored `onMounted`

### 4.5 Verify

- 10 existing + 2 new = 12 HealthView tests pass. Full suite passes.

---

## Phase 5: FertilityView — Filter Chips + Reactive Data Fetching

**Files:** `client/src/views/analytics/FertilityView.vue`, `client/src/tests/analytics/FertilityView.test.js`

### 5.1 Template

Same filter chips row pattern.

### 5.2 Script refactor

Lightest refactor — only 2 time-sensitive endpoints:

- **Time-sensitive (pass `from`/`to`):** conception-rate, days-open
- **Snapshot/all-time (fetch once):** breeding-overview, calving-interval

### 5.3 Tests (2 new)

1. "renders time range filter chips with 12M active by default"
2. "re-fetches conception-rate and days-open when time range chip is clicked"

### 5.4 Refactor & dead code check

- Verify breeding-overview and calving-interval are NOT called again on chip click

### 5.5 Verify

- 7 existing + 2 new = 9 FertilityView tests pass. Full suite passes.

---

## Phase 6: StructureView — Filter Chips + Reactive Data Fetching

**Files:** `client/src/views/analytics/StructureView.vue`, `client/src/tests/analytics/StructureView.test.js`

### 6.1 Template

Same filter chips row pattern.

### 6.2 Script refactor

Only 2 time-sensitive endpoints:

- **Time-sensitive (pass `from`/`to`):** mortality-rate, herd-size-trend
- **Snapshot (fetch once):** herd-summary, age-distribution, breed-composition

### 6.3 Tests (2 new)

1. "renders time range filter chips with 12M active by default"
2. "re-fetches mortality-rate and herd-size-trend when time range chip is clicked"

### 6.4 Refactor & dead code check

- Verify snapshot endpoints are NOT re-fetched on chip click

### 6.5 Verify

- 8 existing + 2 new = 10 StructureView tests pass
- Full test suite: `cd client && npm run test:run` (all ~330 tests) + `cd server && npm test` (all ~70 tests)
- Lint: `npm run lint`

---

## Post-Implementation

- Update CLAUDE.md API docs for the 5 endpoints that now accept `from`/`to`
- Update MEMORY.md with feature completion status
- Create `plans/phase-6c-analytics-time-filter.md` with this plan content

## Summary

| Phase     | Files modified | New tests    | Key change                           |
| --------- | -------------- | ------------ | ------------------------------------ |
| 1         | 2 server files | 10           | Backend from/to support + bug fix    |
| 2         | 3 client files | 0            | Composable + i18n + dead key cleanup |
| 3         | 2 client files | 2            | FinancialView chips + reactive fetch |
| 4         | 2 client files | 2            | HealthView chips + reactive fetch    |
| 5         | 2 client files | 2            | FertilityView chips + reactive fetch |
| 6         | 2 client files | 2            | StructureView chips + reactive fetch |
| **Total** | **13 files**   | **18 tests** |                                      |
