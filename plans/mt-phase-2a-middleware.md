# MT Phase 2A: Tenant Middleware + Core CRUD Routes

## Goal
Create the `tenantScope` middleware and apply it to the 5 core CRUD route files: cows (7 queries), milkRecords (12), healthIssues (14), treatments (8), breedingEvents (16). Total: ~57 query locations.

## Prerequisites
- Phase 1 complete (migration 030 applied, `farm_id` exists on all tables)
- Read `MEMORY.md` for file map and conventions
- Read `server/middleware/authorize.js` for middleware pattern reference
- Read each route file before modifying it

## Step 2A.1 -- Create `tenantScope` middleware

**Create** `server/middleware/tenantScope.js`:

```js
const db = require('../config/database');

// Sets req.farmId from JWT and provides req.scoped(table) helper.
// Super-admin with no farm context gets farmId = null (can't use scoped queries).
// Any non-super-admin missing farm_id is rejected with 401.
module.exports = function tenantScope(req, res, next) {
  const { farm_id, role } = req.user;

  if (role === 'super_admin') {
    req.farmId = farm_id ?? null;
  } else if (!farm_id) {
    return res.status(401).json({ error: 'Missing farm context' });
  } else {
    req.farmId = farm_id;
  }

  // Helper: returns a Knex query builder pre-scoped to the current farm
  req.scoped = (table) => db(table).where(`${table}.farm_id`, req.farmId);

  next();
};
```

## Step 2A.2 -- Wire middleware into `server/app.js`

No global wire-up needed. Each route file adds `tenantScope` after `authenticate`. This keeps auth-only routes (login, public settings) unaffected.

## Step 2A.3 -- Update shared query helpers

Each core route file has a base query helper function. These need to accept `farmId` and scope accordingly.

### `server/routes/breedingEvents.js` -- `breedingQuery()`
- Currently: `function breedingQuery() { return db('breeding_events').join(...) }`
- Change to: `function breedingQuery(farmId) { return db('breeding_events').where('breeding_events.farm_id', farmId).join(...) }`
- Update all call sites: `breedingQuery(req.farmId)`

### `server/routes/treatments.js` -- `treatmentQuery()` + `enrichWithMedications()`
- `treatmentQuery()` -> `treatmentQuery(farmId)` -- scope `treatments.farm_id`
- `enrichWithMedications(rows)` -- queries `treatment_medications` + `medications`. These are already filtered by treatment IDs (which are farm-scoped), so no additional scoping needed. But verify the medication lookup doesn't cross farms.
- Update all call sites

### `server/routes/healthIssues.js` -- `issueQuery()`
- `issueQuery()` -> `issueQuery(farmId)` -- scope `health_issues.farm_id`
- Update all call sites

### `server/routes/milkRecords.js` -- `milkQuery()`
- `milkQuery()` -> `milkQuery(farmId)` -- scope `milk_records.farm_id`
- Update all call sites

### `server/routes/cows.js`
- No shared query helper, but has multiple `db('cows')` calls
- Replace with `req.scoped('cows')` for SELECTs
- Add `farm_id: req.farmId` to INSERTs

## Step 2A.4 -- Update `server/routes/cows.js` (7 queries)

For each endpoint:

| Endpoint | Query changes |
|----------|--------------|
| `GET /` (list) | `db('cows')` -> `req.scoped('cows')`. Subquery for counts may also need scoping if it references other tables. |
| `GET /:id` | `db('cows').where('id', id)` -> `req.scoped('cows').where('id', id)` |
| `POST /` | Add `farm_id: req.farmId` to insert object |
| `PUT /:id` | `db('cows').where('id', id)` -> `req.scoped('cows').where('id', id)` for both SELECT check and UPDATE |
| `DELETE /:id` | `db('cows').where('id', id)` -> `req.scoped('cows').where('id', id)` |

Also check: any `db('cows')` in subqueries (e.g., checking `tag_number` uniqueness) must be farm-scoped. The unique constraint is now `(farm_id, tag_number)`, so uniqueness checks must include `farm_id`.

Add at top of file:
```js
const tenantScope = require('../middleware/tenantScope');
router.use(tenantScope);
```

## Step 2A.5 -- Update `server/routes/milkRecords.js` (12 queries)

| Endpoint | Query changes |
|----------|--------------|
| `GET /` (list) | `milkQuery(req.farmId)` |
| `GET /summary` | Scope `db('milk_records')` |
| `GET /:id` | `milkQuery(req.farmId).where('milk_records.id', id)` |
| `POST /` | Add `farm_id: req.farmId` to insert. Duplicate check needs farm scope. |
| `PUT /:id` | Scope the SELECT + UPDATE |
| `DELETE /:id` | Scope the SELECT + DELETE |

The withdrawal check (cow lookup) must also be farm-scoped -- verify the cow query filters by farm.

## Step 2A.6 -- Update `server/routes/healthIssues.js` (14 queries)

| Endpoint | Query changes |
|----------|--------------|
| `GET /` (list) | `issueQuery(req.farmId)` |
| `GET /:id` | `issueQuery(req.farmId).where('health_issues.id', id)` |
| `POST /` | Add `farm_id: req.farmId` to insert |
| `PATCH /:id/status` | Scope the SELECT + UPDATE |
| `POST /:id/comments` | Scope the issue SELECT. Add `farm_id: req.farmId` to comment insert |
| `DELETE /:id` | Scope the SELECT + DELETE |

Also: `health_issue_comments` queries -- scope by `farm_id` or rely on the issue being farm-scoped (comments belong to issues, and we verify issue ownership first). Either approach works, but explicit scoping is safer.

## Step 2A.7 -- Update `server/routes/treatments.js` (8 queries)

| Endpoint | Query changes |
|----------|--------------|
| `GET /` (list) | `treatmentQuery(req.farmId)` |
| `GET /withdrawal` | Scope the treatment + medication query |
| `POST /` | Add `farm_id: req.farmId` to treatment insert. `treatment_medications` inserts get farm_id too. |
| `DELETE /:id` | Scope the SELECT + DELETE |

`enrichWithMedications()` -- verify it doesn't return medications from other farms. Since it queries by treatment IDs (which are already farm-scoped from the parent query), it's safe. But if it does a standalone `db('medications')` lookup, that needs scoping.

## Step 2A.8 -- Update `server/routes/breedingEvents.js` (16 queries)

| Endpoint | Query changes |
|----------|--------------|
| `GET /` (list) | `breedingQuery(req.farmId)` |
| `GET /upcoming` | All 5 upcoming queries need farm scoping |
| `GET /:id` (if exists) | `breedingQuery(req.farmId).where('breeding_events.id', id)` |
| `POST /` | Add `farm_id: req.farmId` to insert. Breed type lookup needs scoping. |
| `PATCH /:id` | Scope SELECT + UPDATE |
| `PATCH /:id/dismiss` | Scope SELECT + UPDATE |
| `PATCH /dismiss-batch` | Scope the bulk UPDATE |
| `DELETE /:id` | Scope SELECT + DELETE |

The `calcDates()` helper in `server/helpers/breedingCalc.js` calls `getBreedTimings()` which does `db('breed_types').where('id', breedTypeId)`. This needs farm scoping -- pass `farmId` through.

## Step 2A.9 -- Update backend test infrastructure

Phase 1 added a shared test setup helper (`beforeAll` creates default farm, exports `TEST_FARM_ID`). Now that routes require `farm_id`, the test infrastructure needs full updates:

### 2A.9a -- Test token must include `farm_id`
Update the test JWT helper (or create `server/tests/helpers/testFarm.js`) to:
- Export `TEST_FARM_ID` (the default farm UUID from migration 030)
- Generate test tokens with `farm_id` in the payload so `tenantScope` middleware doesn't reject them

### 2A.9b -- All test inserts must include `farm_id`
Every test that inserts into a tenant-scoped table needs `farm_id: TEST_FARM_ID`. This affects all 26 test suites. Approach:
- Create a `testInsert(table, data)` helper that auto-injects `farm_id`
- Or do a bulk find-and-replace across test files (simpler, more explicit)
- Priority: update the 5 route test files touched in this phase first (cows, milkRecords, healthIssues, treatments, breedingEvents), then update remaining suites

### 2A.9c -- Verify all 451 tests pass
After updating, run `npm test` and confirm zero failures. Any test that does a raw `db('table').insert(...)` without `farm_id` will fail with a NOT NULL violation -- use that as a signal to find remaining misses.

## Verification Checklist

1. `grep -rn "db('" server/routes/cows.js server/routes/milkRecords.js server/routes/healthIssues.js server/routes/treatments.js server/routes/breedingEvents.js` -- every bare `db('table')` should now be `req.scoped('table')` or have explicit `.where('farm_id')` or be inside a scoped helper
2. `grep -rn "farm_id" server/middleware/tenantScope.js` -- middleware exists and is correct
3. `npm test` -- all backend tests pass
4. `npm run lint:fix` -- zero new errors
5. Verify: no endpoint returns data without farm scoping (trace each handler)
6. Verify: INSERT operations include `farm_id: req.farmId`
7. Verify: UPDATE/DELETE operations scope by `farm_id` to prevent cross-tenant modification

## Important Notes

- The existing tests don't send `farm_id` in JWT tokens yet. They will still work because:
  - The test JWT won't have `farm_id`, so `tenantScope` would reject non-super-admin users
  - **Solution**: Update test helper to include `farm_id` in test tokens (use the default farm ID from migration). This is a one-time change needed for all Phase 2 sub-plans.
  - Alternatively, create a `server/tests/helpers/testFarm.js` that exports the default farm ID and a token generator that includes it
- Do NOT modify auth routes or login flow -- that's Phase 3
- Do NOT modify analytics, reports, or services -- those are Phases 2C/2D
