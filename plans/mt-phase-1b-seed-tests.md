# MT Phase 1B: Seed File + Test Infrastructure Updates

## Goal

Update the seed file and all 26 backend test suites to include `farm_id` on every tenant-scoped table insert. Update test JWT tokens to include `farm_id` in payload.

## Prerequisites

- Phase 1A migration (030) must be complete and passing verification checks 1-7
- Read `server/tests/helpers/setup.js` and `server/tests/helpers/tokens.js`
- Read `server/seeds/001_initial_data.js`

## Shared Constant

Both the seed file and test helpers must use the same deterministic farm ID:

```js
const DEFAULT_FARM_ID = '00000000-0000-4000-a000-000000000099'
```

This matches the ID created by migration 030 in Phase 1A.

---

## Step 1.1 -- Update seed file

Update `server/seeds/001_initial_data.js` (do NOT delete and rewrite from scratch -- the file is 25K+ tokens with extensive seed data):

1. Add `farms` to the truncation block at the top (before the FK-on restore)
2. After the truncation block, insert the default farm:
   ```js
   await knex('farms').insert({
     id: DEFAULT_FARM_ID,
     name: 'My Farm',
     code: 'DEFAULT',
     slug: 'default',
     is_active: true,
   })
   ```
3. Add `farm_id: DEFAULT_FARM_ID` to every `.insert()` call across all 13 tenant-scoped tables
4. This is a mechanical find-and-replace -- preserve all existing seed data exactly

### Tables to update in seed file

Every insert into these tables needs `farm_id: DEFAULT_FARM_ID`:

- `users`
- `cows`
- `medications`
- `treatments`
- `health_issues`
- `health_issue_comments`
- `milk_records`
- `breeding_events`
- `breed_types`
- `issue_type_definitions`
- `feature_flags`
- `app_settings`
- `audit_log`

---

## Step 1.2 -- Update test helpers

### 1.2a -- Export deterministic farm ID constant

Update `server/tests/helpers/setup.js`:

```js
const DEFAULT_FARM_ID = '00000000-0000-4000-a000-000000000099'
// Must match the ID used in migration 030
```

Export it alongside the existing `ADMIN_ID`, `WORKER_ID`, etc.

### 1.2b -- Update `seedUsers` to create farm first

The `seedUsers()` function in `setup.js` is called by `beforeAll` in all 26 test suites. Update it to:

1. Insert a row into `farms` with `DEFAULT_FARM_ID` (idempotent -- use `INSERT OR IGNORE` / `.onConflict().ignore()`)
2. Add `farm_id: DEFAULT_FARM_ID` to both user inserts

```js
async function seedUsers(db) {
  // Ensure default farm exists (idempotent for test re-runs)
  await db.raw(
    `INSERT OR IGNORE INTO farms (id, name, code, slug, is_active) VALUES (?, 'Test Farm', 'TEST', 'test', 1)`,
    [DEFAULT_FARM_ID]
  )

  await db('users').insert([
    {
      id: ADMIN_ID,
      farm_id: DEFAULT_FARM_ID,
      username: 'test_admin',
      // ... rest unchanged
    },
    {
      id: WORKER_ID,
      farm_id: DEFAULT_FARM_ID,
      username: 'test_worker',
      // ... rest unchanged
    },
  ])
}
```

### 1.2c -- Update test JWT tokens

Update `server/tests/helpers/tokens.js` to include `farm_id: DEFAULT_FARM_ID` in the token payload for both `adminToken()` and `workerToken()`:

```js
const { DEFAULT_FARM_ID } = require('./setup')

function adminToken() {
  const payload = {
    id: ADMIN_ID,
    farm_id: DEFAULT_FARM_ID, // NEW
    username: 'test_admin',
    // ... rest unchanged
  }
  return `Bearer ${jwt.sign(payload, jwtSecret, { expiresIn: '1h' })}`
}
```

This is needed so that Phase 2's `tenantScope` middleware doesn't reject test requests.

---

## Step 1.3 -- Update all factory inserts across 26 test files

Every test that does `db('cows').insert(...)`, `db('milk_records').insert(...)`, etc. must include `farm_id: DEFAULT_FARM_ID`.

### Strategy

1. Import `DEFAULT_FARM_ID` from `./helpers/setup` at the top of each test file (where not already imported)
2. Add `farm_id: DEFAULT_FARM_ID` to every `.insert()` call that targets a tenant-scoped table

### Affected test files

All 26 backend test suites in `server/tests/` (from MEMORY.md):

| File                          | Tables inserted                                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------- |
| `cows.test.js`                | cows, breed_types                                                                                   |
| `milkRecords.test.js`         | cows, milk_records                                                                                  |
| `healthIssues.test.js`        | cows, health_issues, health_issue_comments, issue_type_definitions                                  |
| `treatments.test.js`          | cows, medications, treatments, health_issues                                                        |
| `breedingEvents.test.js`      | cows, breeding_events, breed_types                                                                  |
| `medications.test.js`         | medications                                                                                         |
| `issueTypes.test.js`          | issue_type_definitions, health_issues                                                               |
| `breedTypes.test.js`          | breed_types, cows                                                                                   |
| `users.test.js`               | users                                                                                               |
| `auth.test.js`                | users                                                                                               |
| `permissions.test.js`         | cows, milk_records, health_issues, treatments, breeding_events, medications                         |
| `sync.test.js`                | cows, milk_records, health_issues                                                                   |
| `featureFlags.test.js`        | feature_flags                                                                                       |
| `appSettings.test.js`         | app_settings                                                                                        |
| `auditLog.test.js`            | audit_log, cows                                                                                     |
| `export.test.js`              | cows, medications, treatments                                                                       |
| `reports.test.js`             | cows, medications, treatments, milk_records, health_issues, breeding_events, issue_type_definitions |
| `middleware.test.js`          | (uses tokens only -- no direct inserts)                                                             |
| `errorHandler.test.js`        | (no inserts)                                                                                        |
| `auditService.test.js`        | audit_log                                                                                           |
| `withdrawalService.test.js`   | cows, medications, treatments                                                                       |
| `analytics/kpi.test.js`       | cows, milk_records, health_issues, breeding_events                                                  |
| `analytics/financial.test.js` | cows, milk_records, treatments, medications                                                         |
| `analytics/fertility.test.js` | cows, breeding_events, breed_types                                                                  |
| `analytics/health.test.js`    | cows, health_issues, treatments, medications, issue_type_definitions                                |
| `analytics/structure.test.js` | cows, breed_types                                                                                   |

### Tip

After updating `seedUsers` (Step 1.2b), run `npm test` -- every failing test will report `NOT NULL constraint failed: <table>.farm_id`, making it easy to find remaining misses. Work through errors iteratively rather than trying to find every insert upfront.

---

## Gap Analysis (Phase 1B specific)

| #   | Gap                                   | Impact                                                                                                           | Mitigation                                                               |
| --- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | **Seed file assumes no `farm_id`**    | All inserts fail with NOT NULL violation after migration 030.                                                    | Add `farm_id: DEFAULT_FARM_ID` to every insert (Step 1.1).               |
| 2   | **Backend tests assume no `farm_id`** | All 26 test suites fail in `beforeAll` (`seedUsers` inserts without `farm_id`), cascading to all 451 tests.      | Update `setup.js`, `tokens.js`, and all factory inserts (Steps 1.2-1.3). |
| 3   | **Token payload missing `farm_id`**   | Tests will pass now but fail when Phase 2 middleware checks `req.user.farm_id`. Fixing now avoids a second pass. | Include `farm_id` in test tokens (Step 1.2c).                            |

---

## Verification Checklist (Phase 1B)

After implementation, run these checks:

1. **Seed file works:** `npm run seed` completes without errors
2. **Backend tests pass:** `npm test` -- all 451 tests green
3. **Frontend tests pass:** `cd client && npm run test:run` -- all 608 tests green (should be unaffected, but verify)
4. **Lint clean:** `npm run lint:fix` -- zero new errors
5. **Dev server starts:** `npm run dev` -- app loads, can log in, browse cows
6. **Spot check seed data:** After seeding, verify a few tables have `farm_id` populated:
   ```bash
   node -e "const db = require('./server/config/database'); db('users').select('id','username','farm_id').then(r => console.log(r)).then(() => db.destroy())"
   ```

## Important Notes

- Do NOT modify any route files, middleware, or frontend code in this phase. Only seed + test files.
- The seed file is large (25K+ tokens). Use targeted edits, not a full rewrite.
- Every `INSERT OR IGNORE` in the seed should include `farm_id` -- Knex's `useNullAsDefault` will NOT fill in a NOT NULL column.
- If a test file creates helper/factory functions for inserts, update the factory rather than each individual call site.
