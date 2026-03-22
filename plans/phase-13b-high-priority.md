# Phase 13B: High Priority Fixes

> Priority: **HIGH** — Fix soon after critical security fixes

---

## 13B.1 — Missing Database Indexes

**Problem:** Frequently queried columns lack indexes, causing full table scans on every analytics/hub page load.

**Files:** New migration `server/migrations/026_add_missing_indexes.js`

**Tasks:**

1. Create migration 026 with the following indexes:
   - `milk_records.recording_date` — used by all milk analytics + history view
   - `milk_records.milk_discarded` — used by wasted-milk analytics + withdrawal report
   - `breeding_events.expected_preg_check` — used by `/upcoming` endpoint
   - `breeding_events.expected_dry_off` — used by `/upcoming` endpoint
   - `breeding_events.dismissed_at` — used in all upcoming filters
   - `sync_log.synced_at` — future admin diagnostics
   - `sync_log.user_id` — future admin diagnostics
   - `audit_log.user_id` — AuditLogView filters by user_id alone
2. Test: run `npm run migrate` and verify all indexes created
3. Test: run full backend test suite (all pass with new migration)

**Acceptance:** All hot-path date-range queries can use indexes. Migration is additive-only (safe rollback = drop indexes).

---

## 13B.2 — Unbounded Seasonal Prediction Query

**Problem:** `GET /api/analytics/seasonal-prediction` fetches the ENTIRE `health_issues` table with no date filter. Grows unbounded.

**Files:** `server/routes/analytics/health.js` (or `fertility.js` — locate the `seasonal-prediction` handler)

**Tasks:**

1. Add a 3-year lookback filter: `WHERE observed_at >= <3 years ago>`
2. Update the `years_of_data` response field to reflect actual data range (cap at 3)
3. Add a test: seasonal-prediction with large dataset returns results efficiently

**Acceptance:** Query is bounded to 3 years of data. Response unchanged for farms with <3 years of history.

---

## 13B.3 — Treatments N+1 Medication Lookup

**Problem:** `POST /api/treatments` loops through `value.medications` and issues a separate `SELECT` per medication to validate it exists.

**Files:** `server/routes/treatments.js`

**Tasks:**

1. Collect all `medication_id` values from `value.medications`
2. Batch-fetch with `db('medications').whereIn('id', medIds).where('is_active', true)`
3. Build a lookup map and validate all IDs exist in one check
4. Replace the loop with map lookups
5. Existing tests should still pass (no API change)

**Acceptance:** Single DB query for medication validation regardless of how many medications are in the treatment.

---

## 13B.4 — Treatments Pagination

**Problem:** `GET /api/treatments` returns all treatments with no pagination. Unbounded for long-running farms.

**Files:** `server/routes/treatments.js`

**Tasks:**

1. Add optional `page`/`limit` query params (Joi validated)
2. When `page`/`limit` provided: return `{ data: [...], total: N }` (same pattern as milkRecords, healthIssues)
3. When omitted: return plain array (backward compatible with per-cow repro views)
4. Add `sort`/`order` support (default: `treatment_date desc`)
5. Add Joi query schema validation
6. Add 3-4 server tests for paginated responses

**Acceptance:** Treatments endpoint supports pagination. Existing callers unaffected (no breaking change).

---

## 13B.5 — SQLite Number() Coercion Fixes

**Problem:** Four analytics endpoints return raw SQLite `COUNT()`/`SUM()` strings instead of numbers.

**Files:**

- `server/routes/analytics/fertility.js` — `calvings_by_month` count (line ~136)
- `server/routes/analytics/financial.js` — `record_count` (line ~26), `discard_count` (line ~90), `treatment_count` (line ~117)

**Tasks:**

1. Wrap each raw count/sum with `Number()`:
   - `fertility.js`: `count: Number(r.count)` in calvings_by_month mapping
   - `financial.js`: `record_count: Number(row.record_count)` in milk-trends
   - `financial.js`: `discard_count: Number(r.discard_count)` in wasted-milk
   - `financial.js`: `treatment_count: Number(r.treatment_count)` in treatment-costs
2. Grep for any other uncoerced count/sum fields across all analytics files
3. Existing tests should still pass (numbers are a superset of string-numbers in JSON)

**Acceptance:** All analytics endpoints return numeric types for count/sum fields. No string counts leak to the frontend.

---

## 13B.6 — Soft-Deleted Users Accessible via ID

**Problem:** `GET /api/users/:id` and `PATCH /api/users/:id` don't filter `deleted_at`, allowing access to deactivated users.

**Files:** `server/routes/users.js`

**Tasks:**

1. Add `.whereNull('deleted_at')` to the `GET /:id` query (~line 93)
2. Add `.whereNull('deleted_at')` to the `PATCH /:id` query (~line 146)
3. Add 2 tests: GET deleted user → 404; PATCH deleted user → 404

**Acceptance:** Soft-deleted users are inaccessible via individual ID routes.

---

## Verification

After all 13B steps:

- [ ] Run `npm run migrate` — migration 026 succeeds
- [ ] Run full backend test suite: `npm test` (all pass, including new tests)
- [ ] Run full frontend test suite: `cd client && npm run test:run` (all pass)
- [ ] Lint clean: `npm run lint`
