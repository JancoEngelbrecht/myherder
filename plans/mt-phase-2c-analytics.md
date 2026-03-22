# MT Phase 2C: Analytics Routes

## Goal

Apply tenant scoping to all analytics route files. 6 files, 50 query locations total.

## Prerequisites

- Phase 2A complete (tenantScope middleware exists)
- Phase 2B complete (reference routes scoped)
- Read `server/routes/analytics/index.js` for how analytics router is mounted
- Read each analytics file before modifying

## File-by-File Breakdown

### `server/routes/analytics/index.js`

- This is the router mount point. Add `tenantScope` middleware here (applies to all analytics sub-routes):

```js
const tenantScope = require('../../middleware/tenantScope')
router.use(tenantScope)
```

- No direct queries in this file.

### `server/routes/analytics/helpers.js` (3 queries)

Contains `getIssueTypeDefMap()` -- a cached lookup of issue type definitions.

**Critical change**: This cache is currently global (all issue types). With multi-tenancy, it must be farm-scoped:

- Option A: Accept `farmId` param, cache per farm: `cache[farmId] = { data, expiry }`
- Option B: Remove cache entirely (simplest, slight perf cost)
- Option C: Accept `farmId`, no cache (since <10 farms, cache benefit is minimal)

**Recommended**: Option C -- accept `farmId`, query with `.where('farm_id', farmId)`, no cache. Simpler and safe.

Also scope any other shared helper that queries a table.

### `server/routes/analytics/kpi.js` (10 queries)

`GET /api/analytics/daily-kpis` -- multiple independent queries for today's stats.

Each query (litres today, cows milked, active issues, breeding actions) needs:

- `db('milk_records')` -> `.where('milk_records.farm_id', req.farmId)`
- `db('cows')` -> `.where('cows.farm_id', req.farmId)`
- `db('health_issues')` -> `.where('health_issues.farm_id', req.farmId)`
- `db('breeding_events')` -> `.where('breeding_events.farm_id', req.farmId)`

Use `req.scoped('table')` where possible. For JOINed queries, use explicit `.where('table.farm_id', req.farmId)`.

### `server/routes/analytics/financial.js` (6 queries)

Endpoints: litres-per-cow, bottom-producers, top-producers, treatment-costs, wasted-milk, milk-trends.

Each query on `milk_records`, `treatments`, `cows` needs farm scoping. Watch for subqueries that count cows -- those need scoping too.

### `server/routes/analytics/fertility.js` (14 queries)

Endpoints: breeding-overview, breeding-activity, conception-rate, calving-interval, days-open.

This is the most query-heavy analytics file. Key concerns:

- `breeding-overview` has multiple parallel queries -- scope each one
- `conception-rate` uses `countServicesForPregCheck` helper -- verify it's farm-scoped or receives farm-scoped data
- `calving-interval` and `days-open` query breeding events by cow -- the cow filter implicitly scopes (cows are farm-scoped), but add explicit `farm_id` for safety

### `server/routes/analytics/health.js` (10 queries)

Endpoints: health-resolution-stats, health-resolution-by-type, health-recurrence, health-cure-rate-trend, slowest-to-resolve, issue-frequency, seasonal-prediction.

- `getIssueTypeDefMap()` calls need `req.farmId` passed in (after helpers.js update)
- All `health_issues` queries need farm scoping
- `seasonal-prediction` has year-bounded queries -- scope those too

### `server/routes/analytics/structure.js` (7 queries)

Endpoints: herd-summary, age-distribution, breed-composition, mortality-rate, herd-size-trend, herd-turnover.

- `herd-summary` has parallel queries -- scope each
- `breed-composition` joins `breed_types` -- both tables need farm scoping in the JOIN
- `mortality-rate` and `herd-turnover` query cows by date ranges -- scope by farm

## Scoping Pattern for JOINed Queries

When a query JOINs multiple tables, scope on the primary table:

```js
// Before
db('breeding_events')
  .join('cows', 'cows.id', 'breeding_events.cow_id')
  .where('breeding_events.event_date', '>=', from)

// After
db('breeding_events')
  .where('breeding_events.farm_id', req.farmId) // scope primary table
  .join('cows', 'cows.id', 'breeding_events.cow_id')
  .where('breeding_events.event_date', '>=', from)
```

No need to scope the JOINed table separately IF the join is on a FK from the primary table (the cow belongs to the same farm as the breeding event, enforced by the application). But for aggregation queries that start from `cows` and JOIN other tables, scope `cows` as the primary.

## Verification Checklist

1. `grep -rn "db('" server/routes/analytics/` -- all bare `db()` calls scoped
2. `npm test` -- all analytics tests pass (111 tests across 5 files)
3. `npm run lint:fix` -- zero new errors
4. Verify: `getIssueTypeDefMap()` accepts and uses `farmId`
5. Verify: no analytics endpoint can aggregate data from another farm
6. Verify: subqueries (e.g., cow count denominators) are also farm-scoped
7. Check that `Promise.all()` calls still work correctly with the scoped queries

## Important Notes

- Analytics tests use a single test database where all data has the same `farm_id`. Tests will pass as long as the test token includes `farm_id`.
- The `getIssueTypeDefMap()` cache removal is safe -- it's only called once per request, and the query is fast (small table).
- `seasonal-prediction` has a 3-year bound -- make sure the date filter AND farm filter are both applied.
- Some analytics queries use raw SQL (`db.raw()`). These need manual `AND farm_id = ?` injection -- cannot use `req.scoped()`.
