# Phase 12B: Performance — N+1 Queries, SQL Aggregates, Validation

**Goal:** Eliminate all N+1 query patterns, move aggregation from JavaScript to SQL, and add missing input validation on query parameters.

**Estimated effort:** 1 session

---

## 12B.1 — Fix N+1: `milk-trends` Endpoint

**File:** `server/routes/analytics.js` (lines 238-251)

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
  .orderBy('month');

const months = rows.map(row => ({
  month: row.month,
  total_litres: round2(Number(row.total_litres) || 0),
  record_count: row.record_count,
  avg_per_cow: round2((Number(row.total_litres) || 0) / (Number(row.cow_count) || 1)),
}));
```

**Verification:** Existing `analytics.test.js` milk-trends tests pass with same response shape.

---

## 12B.2 — Fix N+1: `breeding-overview` + `conception-rate` Services-Per-Conception

**File:** `server/routes/analytics.js` (lines 486-492, 842-855)

**Problem:** `countServicesForPregCheck()` fires 2 queries per positive pregnancy check (find last reset event + count services). With 50 preg checks = 100 queries.

**Fix:** Batch approach — fetch all relevant data in 2 bulk queries, then compute in-memory:

```javascript
// Step 1: Get all preg-check-positive events in range (already have this)
// Step 2: Bulk-fetch all calving/abortion events for those cow_ids
const cowIds = [...new Set(positiveChecks.map(c => c.cow_id))];
const resets = await db('breeding_events')
  .whereIn('cow_id', cowIds)
  .whereIn('event_type', ['calving', 'abortion'])
  .select('cow_id', 'event_date')
  .orderBy('event_date', 'desc');

// Step 3: Bulk-fetch all insemination/bull_service events for those cow_ids
const services = await db('breeding_events')
  .whereIn('cow_id', cowIds)
  .whereIn('event_type', ['ai_insemination', 'bull_service'])
  .select('cow_id', 'event_date');

// Step 4: Build lookup maps, compute per-check service counts in memory
```

Extract as a shared helper `batchCountServices(positiveChecks)` since both `breeding-overview` and `conception-rate` use the same pattern.

**Verification:** Existing breeding-overview + conception-rate tests pass. Response shape unchanged.

---

## 12B.3 — Fix Memory Aggregation: `herd-summary`

**File:** `server/routes/analytics.js` (lines 140-168)

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
    db.raw("SUM(CASE WHEN sex = 'female' AND is_dry = 0 AND status IN ('active','pregnant','sick') THEN 1 ELSE 0 END) as milking_count"),
  );
```

Keep the heifer query + replacement_rate calculation separate (needs breeding_events join).

**Verification:** Existing herd-summary tests pass. Response shape unchanged.

---

## 12B.4 — Add Joi Query Validation: `cows.js` GET

**File:** `server/routes/cows.js`

**Problem:** GET `/api/cows` accepts `search`, `status`, `sex`, `breed_type_id`, `is_dry`, `page`, `limit` as raw query params without validation. Malformed values silently produce unexpected results.

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
}).unknown(false);
```

Validate at the start of the GET handler with `{ allowUnknown: false }`.

**Verification:** Existing cow tests pass. Add 2 new tests: invalid query params return 400.

---

## 12B.5 — Add Joi Query Validation: `healthIssues.js` GET

**File:** `server/routes/healthIssues.js`

**Problem:** Same as cows — GET accepts `cow_id`, `status`, `search` without validation.

**Fix:** Add `issueQuerySchema` with appropriate types and valid values.

**Verification:** Existing health issue tests pass. Add 1 new test.

---

## 12B.6 — Remove Redundant Re-Fetches After INSERT

**Files:** `server/routes/cows.js` POST, `server/routes/healthIssues.js` POST

**Problem:** After inserting a row, immediately fetches it back with `WHERE id = ?`. The data is already available from the insert payload + UUID.

**Fix:** Construct the response object from the validated input + generated fields (id, created_at) instead of re-querying. Keep re-fetch only if JOINed data is needed (e.g., cows GET/:id joins sire_name/dam_name — that one is justified).

**Note:** Review each POST to determine if joined data is part of the response. If so, the re-fetch is justified and should be kept.

---

## Verification Checklist

- [ ] `npx jest -- analytics` → all passing (breeding-overview, milk-trends, conception-rate, herd-summary)
- [ ] `npx jest -- cows` → all passing + new query validation tests
- [ ] `npx jest -- healthIssues` → all passing + new query validation test
- [ ] No N+1 patterns remain (grep for `await` inside `for` or `.map(async`)
- [ ] Manual smoke test: `GET /api/analytics/milk-trends` returns same shape
