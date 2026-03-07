# MT Phase 2D: Reports, Services & Helpers

## Goal
Apply tenant scoping to report routes (12 queries across 4 files), services (syncService, auditService, reportService), and helpers (breedingCalc). Also update the sync route which delegates to syncService.

## Prerequisites
- Phases 2A-2C complete (all other routes scoped)
- Read each file before modifying

## Step 2D.1 -- Update report routes (12 queries)

### `server/routes/reports/helpers.js` (3 queries)
- `batchMedications(treatmentIds)` -- queries `treatment_medications` + `medications` by treatment IDs. Since treatment IDs are already farm-scoped from the caller, this is safe. But add `farmId` param for explicit safety if standalone `db('medications')` queries exist.

### `server/routes/reports/treatment.js` (3 queries)
- `GET /withdrawal-compliance` -- scope `treatments`, `medications` queries
- `GET /treatment-history` -- scope `treatments` query

### `server/routes/reports/production.js` (2 queries)
- `GET /discarded-milk` -- scope `milk_records` query
- `GET /milk-production` -- scope `milk_records` + `cows` queries

### `server/routes/reports/herd.js` (4 queries)
- `GET /medication-usage` -- scope `treatments` + `medications`
- `GET /breeding` -- scope `breeding_events`
- `GET /herd-health` -- scope `health_issues`

Add `tenantScope` to the reports router index (`server/routes/reports/index.js`):
```js
const tenantScope = require('../../middleware/tenantScope');
router.use(tenantScope);
```

Pass `req.farmId` to any shared helpers that need it.

## Step 2D.2 -- Update `server/services/auditService.js` (1 query)

The audit service logs actions. It needs `farm_id` in every insert:

```js
// Before
async function logAudit({ entity_type, entity_id, action, user_id, old_data, new_data }) {
  await db('audit_log').insert({ id: uuid(), entity_type, entity_id, action, user_id, old_data, new_data });
}

// After -- add farm_id parameter
async function logAudit({ entity_type, entity_id, action, user_id, farm_id, old_data, new_data }) {
  await db('audit_log').insert({ id: uuid(), entity_type, entity_id, action, user_id, farm_id, old_data, new_data });
}
```

**Then update all callers** -- every route that calls `logAudit()` must pass `farm_id: req.farmId`. Search for all `logAudit(` calls:
- `server/routes/cows.js`
- `server/routes/users.js`
- `server/routes/appSettings.js`
- Any other routes that log audits

## Step 2D.3 -- Update `server/services/syncService.js`

This is the most complex service change. The sync service handles push (client -> server) and pull (server -> client).

### `processChange(change, userId)` -> `processChange(change, userId, farmId)`
- Every INSERT adds `farm_id: farmId`
- Every UPDATE/DELETE scopes by `farm_id`
- Entity lookups (cow, health_issue, etc.) must be farm-scoped

### `pullData(since, full)` -> `pullData(since, full, farmId)`
- Every table query adds `.where('farm_id', farmId)`
- The `deleted` query (if any) also needs scoping

### `logSync(deviceId, direction, stats)` -> `logSync(deviceId, direction, stats, farmId)`
- Add `farm_id: farmId` to sync_log insert

### Update `server/routes/sync.js`
- Add `tenantScope` middleware (after authenticate, which sync routes already use)
- Pass `req.farmId` to all syncService method calls:
  - `POST /push`: `syncService.processChange(change, req.user.id, req.farmId)`
  - `GET /pull`: `syncService.pullData(since, full, req.farmId)`
- `GET /health`: No auth, no tenant scope needed

## Step 2D.4 -- Update `server/services/reportService.js` (1 query)

Check if reportService has any direct queries. If it only provides PDF/Excel generation utilities, no changes needed. If it queries the DB, scope by `farmId` param.

## Step 2D.5 -- Update `server/helpers/breedingCalc.js` (1 query)

### `getBreedTimings(breedTypeId)` -> `getBreedTimings(breedTypeId, farmId)`
- `db('breed_types').where('id', breedTypeId)` -> `db('breed_types').where('id', breedTypeId).where('farm_id', farmId)`
- Update `calcDates()` to accept and pass `farmId`

### Update callers
- `server/routes/breedingEvents.js` -- where `calcDates()` is called, pass `req.farmId`

## Step 2D.6 -- Update `server/services/withdrawalService.js`

Check if it has direct DB queries. If it checks withdrawal status by querying treatments, those queries need farm scoping. Pass `farmId` as parameter.

## Verification Checklist

1. `grep -rn "db('" server/routes/reports/ server/services/ server/helpers/` -- all bare `db()` calls scoped or explicitly filtered
2. `grep -rn "logAudit(" server/routes/` -- every call passes `farm_id`
3. `npm test` -- all backend tests pass (including sync tests, report tests)
4. `npm run lint:fix` -- zero new errors
5. Verify: sync push creates records with correct `farm_id`
6. Verify: sync pull only returns current farm's data
7. Verify: audit log entries include `farm_id`
8. Verify: report endpoints only include current farm's data
9. Verify: `breedingCalc.js` functions accept and use `farmId`

## Important Notes

- After this phase, ALL backend query locations should be farm-scoped. Run a final comprehensive grep:
  ```
  grep -rn "db('" server/routes/ server/services/ server/helpers/
  ```
  Every result should either use `req.scoped()`, have `.where('farm_id')`, or be in a non-tenant context (like reading the `farms` table itself).
- The sync route's `GET /health` endpoint is intentionally unscoped (no auth, just connectivity check).
- This is the last Phase 2 sub-plan. After completion, the entire backend should be tenant-scoped.
