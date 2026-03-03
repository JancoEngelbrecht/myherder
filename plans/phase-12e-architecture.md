# Phase 12E: Architecture — Split analytics.js

**Goal:** Split the 1,522-line `server/routes/analytics.js` into 4 focused category files for maintainability. Mirror the split in test files. No functional changes — pure refactor.

**Estimated effort:** 1 session

---

## 12E.1 — Plan the Split

### Current: 1 file, 28 endpoints

`server/routes/analytics.js` (1,522 lines) contains endpoints across 4 logical categories:

| Category | Endpoints | Lines (approx) |
|----------|-----------|-----------------|
| **KPI/Overview** | daily-kpis, herd-summary | ~130 |
| **Financial/Milk** | milk-trends, top-producers, bottom-producers, wasted-milk, litres-per-cow, treatment-costs | ~300 |
| **Fertility** | breeding-overview, breeding-activity, conception-rate, calving-interval, days-open, seasonal-prediction | ~350 |
| **Health** | issue-frequency, mastitis-rate, withdrawal-days, health-resolution-stats, health-resolution-by-type, health-recurrence, health-cure-rate-trend, slowest-to-resolve, unhealthiest | ~450 |
| **Structure** | age-distribution, breed-composition, mortality-rate, herd-turnover, herd-size-trend | ~250 |
| **Shared helpers** | MS_PER_DAY, round2, localDate, monthExpr, parseIssueCodes, getIssueTypeDefMap, countServicesForPregCheck | ~50 |

### Target: 5 files + 1 shared helpers file

```
server/routes/analytics/
  index.js              # Router mount point — imports & uses sub-routers
  helpers.js            # Shared constants + helper functions
  kpi.js                # daily-kpis, herd-summary
  financial.js          # milk-trends, top/bottom-producers, wasted-milk, litres-per-cow, treatment-costs
  fertility.js          # breeding-overview, breeding-activity, conception-rate, calving-interval, days-open, seasonal-prediction
  health.js             # all health-resolution-*, issue-frequency, mastitis-rate, withdrawal-days, unhealthiest, slowest-to-resolve
  structure.js          # age-distribution, breed-composition, mortality-rate, herd-turnover, herd-size-trend
```

---

## 12E.2 — Create Shared Helpers File

**New file:** `server/routes/analytics/helpers.js`

Extract from current `analytics.js`:
- `MS_PER_DAY` constant
- `RECURRENCE_WINDOW_DAYS` constant (from 12A)
- `PREDICTION_MONTHS` constant (from 12A)
- `MS_PER_YEAR` constant (from 12A)
- `round2()` function
- `localDate()` function
- `monthExpr()` function
- `defaultRange()` function
- `parseIssueCodes()` function
- `getIssueTypeDefMap()` function
- `countServicesForPregCheck()` function (or batched version from 12B)

All exported as named exports via `module.exports = { ... }`.

---

## 12E.3 — Create Category Route Files

Each file follows this pattern:

```javascript
const express = require('express');
const db = require('../../config/database');
const { round2, monthExpr, defaultRange, MS_PER_DAY } = require('./helpers');

const router = express.Router();

// endpoints...

module.exports = router;
```

### `kpi.js` — Daily KPIs + Herd Summary
- Move `/daily-kpis` handler
- Move `/herd-summary` handler

### `financial.js` — Milk & Cost Analytics
- Move `/milk-trends`, `/top-producers`, `/bottom-producers`, `/wasted-milk`, `/litres-per-cow`, `/treatment-costs`

### `fertility.js` — Breeding & Reproduction Analytics
- Move `/breeding-overview`, `/breeding-activity`, `/conception-rate`, `/calving-interval`, `/days-open`, `/seasonal-prediction`

### `health.js` — Health Analytics
- Move `/unhealthiest`, `/issue-frequency`, `/mastitis-rate`, `/withdrawal-days`, `/health-resolution-stats`, `/health-resolution-by-type`, `/health-recurrence`, `/health-cure-rate-trend`, `/slowest-to-resolve`

### `structure.js` — Herd Structure Analytics
- Move `/age-distribution`, `/breed-composition`, `/mortality-rate`, `/herd-turnover`, `/herd-size-trend`

---

## 12E.4 — Create Router Mount Point

**New file:** `server/routes/analytics/index.js`

```javascript
const express = require('express');
const auth = require('../../middleware/auth');
const authorize = require('../../middleware/authorize');

const router = express.Router();
router.use(auth);
router.use(authorize('can_view_analytics'));

router.use('/', require('./kpi'));
router.use('/', require('./financial'));
router.use('/', require('./fertility'));
router.use('/', require('./health'));
router.use('/', require('./structure'));

module.exports = router;
```

---

## 12E.5 — Update App Mount

**File:** `server/app.js`

Change:
```javascript
app.use('/api/analytics', require('./routes/analytics'));
```
No change needed — the new `analytics/index.js` exports the same router interface.

---

## 12E.6 — Split Test File

**Current:** `server/tests/analytics.test.js` (1,813 lines, 109 tests)

**Target:**
```
server/tests/analytics/
  kpi.test.js           # daily-kpis + herd-summary tests
  financial.test.js     # milk/cost tests
  fertility.test.js     # breeding analytics tests
  health.test.js        # health analytics tests
  structure.test.js     # structure analytics tests
```

Each test file gets its own `beforeAll`/`afterAll` for DB setup (shared test helpers).

Update Jest config if needed to pick up nested test files.

---

## 12E.7 — Delete Old Files

After all tests pass:
- Delete `server/routes/analytics.js` (replaced by `analytics/` directory)
- Delete `server/tests/analytics.test.js` (replaced by `analytics/` directory)

---

## Verification Checklist

- [ ] All 109 analytics tests pass (same tests, just reorganized)
- [ ] `npm run lint` → 0 errors
- [ ] `npm run knip` → no new unused exports
- [ ] API responses identical (no functional change)
- [ ] `server/app.js` mount unchanged
- [ ] Old monolithic files deleted
- [ ] No file exceeds 500 lines
