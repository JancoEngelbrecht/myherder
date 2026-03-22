# Phase 12B: Performance — N+1 Queries, SQL Aggregates, Validation, Redundant Fetches

**Goal:** Eliminate all N+1 query patterns, move aggregation from JavaScript to SQL, add missing input validation on query parameters, and remove redundant re-fetches after INSERT.

**Estimated effort:** 2 sessions

---

## 12B.1 — Fix N+1: `milk-trends` Endpoint ✅

**File:** `server/routes/analytics.js` (~lines 238-251)

**Problem:** For each month row, fires a separate `countDistinct('cow_id')` query. 12 months = 12 extra queries.

**Fix:** Combine into a single query using `countDistinct` in the GROUP BY:

```javascript
const rows = await db('milk_records')
  .whereNull('cows.deleted_at')
  .join('cows', 'milk_records.cow_id', 'cows.id')
  .whereBetween('recording_date', [start, end])
  .select(db.raw(`${monthExpr('recording_date')} as month`))
  .sum('litres as total_litres')
  .count('* as record_count')
  .countDistinct('cow_id as cow_count')
  .groupByRaw(monthExpr('recording_date'))
  .orderBy('month')

const months = rows.map((row) => ({
  month: row.month,
  total_litres: round2(Number(row.total_litres) || 0),
  record_count: row.record_count,
  avg_per_cow: round2((Number(row.total_litres) || 0) / (Number(row.cow_count) || 1)),
}))
```

**Verification:** Existing `analytics.test.js` milk-trends tests pass with same response shape.

---

## 12B.2 — Fix N+1: `breeding-overview` + `conception-rate` Services-Per-Conception ✅

**File:** `server/routes/analytics.js` (~lines 486-492, 842-855)

**Problem:** `countServicesForPregCheck()` fires 2 queries per positive pregnancy check (find last reset event + count services). With 50 preg checks = 100 queries.

**Fix:** Batch approach — fetch all relevant data in 2 bulk queries, then compute in-memory:

```javascript
// Step 1: Get all preg-check-positive events in range (already have this)
// Step 2: Bulk-fetch all calving/abortion events for those cow_ids
const cowIds = [...new Set(positiveChecks.map((c) => c.cow_id))]
const resets = await db('breeding_events')
  .whereIn('cow_id', cowIds)
  .whereIn('event_type', ['calving', 'abortion'])
  .select('cow_id', 'event_date')
  .orderBy('event_date', 'desc')

// Step 3: Bulk-fetch all insemination/bull_service events for those cow_ids
const services = await db('breeding_events')
  .whereIn('cow_id', cowIds)
  .whereIn('event_type', ['ai_insemination', 'bull_service'])
  .select('cow_id', 'event_date')

// Step 4: Build lookup maps, compute per-check service counts in memory
```

Extract as a shared helper `batchCountServices(positiveChecks)` since both `breeding-overview` and `conception-rate` use the same pattern.

**Verification:** Existing breeding-overview + conception-rate tests pass. Response shape unchanged.

---

## 12B.3 — Fix Memory Aggregation: `herd-summary` ✅

**File:** `server/routes/analytics.js` (~lines 140-168)

**Problem:** Loads all cow rows into memory, then loops in JavaScript to count males/females/milking/dry. Should use SQL aggregates.

**Fix:** Use conditional COUNT/SUM:

```javascript
const [summary] = await db('cows')
  .whereNull('deleted_at')
  .select(
    db.raw('COUNT(*) as total'),
    db.raw("SUM(CASE WHEN sex = 'male' THEN 1 ELSE 0 END) as males"),
    db.raw("SUM(CASE WHEN sex = 'female' THEN 1 ELSE 0 END) as females"),
    db.raw("SUM(CASE WHEN sex = 'female' AND is_dry = 1 THEN 1 ELSE 0 END) as dry_count"),
    db.raw(
      "SUM(CASE WHEN sex = 'female' AND is_dry = 0 AND status IN ('active','pregnant','sick') THEN 1 ELSE 0 END) as milking_count"
    )
  )
```

Keep the heifer query + replacement_rate calculation separate (needs breeding_events join).

**Verification:** Existing herd-summary tests pass. Response shape unchanged.

---

## 12B.4 — Add Joi Query Validation: `cows.js` GET ✅

**File:** `server/routes/cows.js`

**Problem:** GET `/api/cows` accepts 14 query params as raw strings without validation. Malformed values silently produce unexpected results.

**Fix:** Add a `cowQuerySchema`:

```javascript
const cowQuerySchema = Joi.object({
  search: Joi.string().max(100).allow(''),
  status: Joi.string().valid('active', 'dry', 'pregnant', 'sick', 'sold', 'dead'),
  sex: Joi.string().valid('female', 'male'),
  breed_type_id: Joi.string().max(36),
  is_dry: Joi.string().valid('0', '1', 'true', 'false'),
  life_phase: Joi.string().valid('calf', 'heifer', 'cow', 'young_bull', 'bull'),
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
  sort: Joi.string().valid('tag_number', 'name', 'dob', 'status'),
  order: Joi.string().valid('asc', 'desc'),
}).unknown(false)
```

Validate at the start of the GET handler with `{ allowUnknown: false }`.

**Verification:** Existing cow tests pass. Add 2 new tests: invalid query params return 400.

---

## 12B.5 — Add Joi Query Validation: `healthIssues.js` GET ✅

**File:** `server/routes/healthIssues.js`

**Problem:** Same as cows — GET accepts `cow_id`, `status`, `search`, `page`, `limit` without validation.

**Fix:** Add `issueQuerySchema` with appropriate types and valid values.

**Verification:** Existing health issue tests pass. Add 1 new test.

---

## 12B.6 — Remove Redundant Re-Fetches After INSERT ✅

**Files:** `server/routes/cows.js`, `server/routes/breedTypes.js`, `server/routes/issueTypes.js`, `server/routes/medications.js`, `server/routes/users.js`

**Problem:** After inserting a row, immediately fetches it back with `WHERE id = ?`. The data is already available from the insert payload + UUID. These POST endpoints return raw fields only (no JOINs needed).

**Redundant re-fetches to eliminate:**

| File           | Endpoint | Line | Notes                                       |
| -------------- | -------- | ---- | ------------------------------------------- |
| cows.js        | POST     | ~227 | No joins in create response                 |
| breedTypes.js  | POST     | ~71  | No joins, data in memory                    |
| issueTypes.js  | POST     | ~82  | No joins, data in memory                    |
| medications.js | POST     | ~82  | No joins, data in memory                    |
| users.js       | POST     | ~135 | No joins, just sanitize from insert payload |

**Fix:** Construct the response object from the validated input + generated fields (id, created_at, updated_at) instead of re-querying.

**Justified re-fetches (KEEP — need JOIN data):**

- healthIssues.js POST (needs cow/user names via issueQuery JOIN)
- treatments.js POST (needs medication/cow/user names via treatmentQuery JOIN)
- milkRecords.js POST (needs cow/user names via milkQuery JOIN)
- breedingEvents.js POST/PATCH/dismiss (needs cow/sire/user names via breedingQuery JOIN)

**Verification:** Existing tests pass. Response shape unchanged.

---

## 12B.7 — Add Joi Date Validation: Analytics Shared Schema ✅

**File:** `server/routes/analytics.js`

**Problem:** All 32 analytics GET endpoints accept `from`/`to` date params used directly in SQL `whereBetween()` without any validation. Malformed dates silently produce incorrect results.

**Fix:** Add a shared `dateRangeSchema` at the top of analytics.js and validate in `defaultRange()` or a middleware:

```javascript
const dateRangeSchema = Joi.object({
  from: Joi.date().iso().allow(''),
  to: Joi.date().iso().allow(''),
}).unknown(true) // allow other params like format
```

Apply validation inside `defaultRange()` helper or at the start of each handler. Since all 32 endpoints call `defaultRange(req.query.from, req.query.to)`, the cleanest approach is to validate inside that helper and throw a 400 if invalid.

**Verification:** Existing analytics tests pass. Add 2 new tests: invalid date returns 400.

---

## 12B.8 — Add Joi Query Validation: Remaining Routes ✅

**Files:** `server/routes/auditLog.js`, `server/routes/breedingEvents.js`, `server/routes/treatments.js`, `server/routes/medications.js`, `server/routes/issueTypes.js`

**Problem:** Several GET endpoints accept query params with only manual parsing or length guards, no schema validation.

| Route                 | Params                                                                         | Risk       |
| --------------------- | ------------------------------------------------------------------------------ | ---------- |
| auditLog.js GET       | `page`, `limit`, `entity_type`, `entity_id`, `user_id`, `action`, `from`, `to` | MEDIUM     |
| breedingEvents.js GET | `date_from`, `date_to` (other params already validated)                        | MEDIUM     |
| treatments.js GET     | `cow_id`                                                                       | MEDIUM     |
| medications.js GET    | `all`, `search`, `page`, `limit`                                               | LOW-MEDIUM |
| issueTypes.js GET     | `all`, `search`, `page`, `limit`                                               | LOW-MEDIUM |

**Fix:** Add Joi query schemas to each. Follow the pattern from milkRecords.js (the exemplary reference).

**Verification:** Existing tests pass. Add 1 test per route for invalid params.

---

## 12B.9 — Move JS Aggregations to SQL (6 endpoints) ✅

**File:** `server/routes/analytics.js`, `server/routes/milkRecords.js`, `server/routes/treatments.js`

**Problem:** Several endpoints fetch all rows and aggregate in JavaScript when SQL could do it in one query.

| Endpoint               | File:Lines          | Current Pattern                     | SQL Fix                                                  |
| ---------------------- | ------------------- | ----------------------------------- | -------------------------------------------------------- |
| mortality-rate         | analytics:1108-1139 | Loop counting sold/dead per month   | `GROUP BY month` + `SUM(CASE WHEN status='sold'...)`     |
| age-distribution       | analytics:1022-1054 | Loop assigning age brackets         | `CASE` expression for brackets in SQL                    |
| health-cure-rate-trend | analytics:1452-1466 | Manual monthly total/resolved count | `GROUP BY month` + `SUM(CASE WHEN status='resolved'...)` |
| slowest-to-resolve     | analytics:1488-1514 | Per-cow avg resolution days in JS   | SQL `AVG()` + date arithmetic + `GROUP BY cow_id`        |
| milk-summary           | milkRecords:130-154 | Manual session totals               | `GROUP BY session` + `SUM(litres)`                       |
| treatments/withdrawal  | treatments:93-113   | Dedup latest per cow in JS          | Subquery with `MAX(withdrawal_end_milk)` per cow         |

**Fix for each:**

- Replace JS loops with SQL aggregation queries
- For age-distribution, use `CASE WHEN age < 1 THEN 'calf' WHEN age < 2 THEN 'yearling' ...` (adjust brackets to match current JS logic)
- For slowest-to-resolve, use `JULIANDAY(resolved_at) - JULIANDAY(observed_at)` in SQLite (or `TIMESTAMPDIFF` in MySQL)

**Note:** Skip endpoints with justified JS aggregation:

- seasonal-prediction, issue-frequency, health-resolution-by-type (JSON column parsing in SQLite)
- health-recurrence (complex 60-day window logic)
- withdrawal-days (intentional per code comment — SQLite date limitations)
- breeding-overview repro categorization (multi-step Set logic)

**Verification:** Existing analytics/milkRecords tests pass. Response shapes unchanged.

---

## Verification Checklist

- [x] `npm test -- analytics` → 111 passing (milk-trends, breeding-overview, conception-rate, herd-summary, mortality-rate, age-distribution, cure-rate-trend, slowest-to-resolve + 2 date validation)
- [x] `npm test -- cows` → 18 passing + 2 new query validation tests
- [x] `npm test -- healthIssues` → 35 passing + 1 new query validation test
- [x] `npm test -- milkRecords` → all passing (milk-summary SQL aggregation)
- [x] `npm test -- treatments` → all passing (withdrawal dedup) + 1 new validation test
- [x] No N+1 patterns remain (milk-trends countDistinct, breeding services batch)
- [x] No redundant re-fetches after INSERT for non-JOIN responses (cows, breedTypes, issueTypes, medications, users)
- [x] All date params validated before reaching SQL (analytics defaultRange + breedingEvents + auditLog)
- [x] `cd client && npm run test:run` → 392/393 pass (1 pre-existing breedingEvents store failure)
- [x] All 375 backend tests pass

---

## Implementation Order (ALL COMPLETE)

1. **12B.1–12B.3** — N+1 fixes + herd-summary SQL ✓
2. **12B.7** — Analytics date validation ✓
3. **12B.4–12B.5** — Cows + healthIssues query validation ✓
4. **12B.8** — Remaining route validation (auditLog, breedingEvents, treatments, medications, issueTypes, breedTypes) ✓
5. **12B.6** — Redundant re-fetches (cows, breedTypes, issueTypes, medications, users) ✓
6. **12B.9** — JS → SQL aggregation (mortality-rate, age-distribution, cure-rate-trend, slowest-to-resolve, milk-summary, treatments/withdrawal) ✓
