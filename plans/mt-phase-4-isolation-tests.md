# MT Phase 4: Cross-Tenant Isolation Tests

## Goal

Write comprehensive tests that verify no data leaks between farms. This phase is intentionally placed BEFORE session management and super-admin UI to catch scoping bugs early.

## Prerequisites

- Phases 1-3 complete (DB, all routes scoped, auth updated)
- Read `server/tests/` for existing test patterns (especially `server/tests/helpers.js` if it exists)

## Step 4.1 -- Test infrastructure helpers

Create or update `server/tests/helpers.js` with multi-tenant test utilities:

```js
const db = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');

async function seedFarm(code, name = `Farm ${code}`) {
  const farmId = uuid();
  await db('farms').insert({
    id: farmId,
    name,
    code: code.toUpperCase(),
    slug: code.toLowerCase(),
    is_active: true
  });
  return farmId;
}

async function seedFarmAdmin(farmId, username = 'admin', password = 'testpass123') {
  const userId = uuid();
  await db('users').insert({
    id: userId,
    farm_id: farmId,
    username,
    full_name: `Admin ${username}`,
    role: 'admin',
    password_hash: await bcrypt.hash(password, 10),
    permissions: JSON.stringify(['can_manage_cows', 'can_record_milk', 'can_log_issues', 'can_log_treatments', 'can_log_breeding', 'can_view_analytics']),
    is_active: true,
    token_version: 0
  });
  return userId;
}

function tokenForFarm(farmId, userId, role = 'admin') {
  return jwt.sign(
    { id: userId, farm_id: farmId, role, username: 'test', permissions: [...], token_version: 0 },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
}

async function seedCowInFarm(farmId, tagNumber = 'COW001') {
  const cowId = uuid();
  await db('cows').insert({
    id: cowId,
    farm_id: farmId,
    tag_number: tagNumber,
    name: `Test Cow ${tagNumber}`,
    sex: 'female',
    status: 'active',
    dob: '2022-01-01'
  });
  return cowId;
}
```

## Step 4.2 -- Create `server/tests/tenantIsolation.test.js`

### Test structure

```
describe('Tenant Isolation')
  beforeAll: seed Farm A + Farm B with identical data
  afterAll: clean up

  describe('Cows')
    it('Farm B cannot GET Farm A cow by ID -> 404')
    it('Farm B list returns zero Farm A cows')
    it('Farm B cannot UPDATE Farm A cow -> 404')
    it('Farm B cannot DELETE Farm A cow -> 404')
    it('Same tag_number allowed in both farms')

  describe('Milk Records')
    it('Farm B cannot GET Farm A milk record -> 404')
    it('Farm B list returns zero Farm A records')
    it('Farm B cannot UPDATE Farm A record -> 404')
    it('Farm B cannot DELETE Farm A record -> 404')

  describe('Health Issues')
    it('Farm B cannot GET Farm A issue -> 404')
    it('Farm B list returns zero Farm A issues')
    it('Farm B cannot change Farm A issue status -> 404')
    it('Farm B cannot add comment to Farm A issue -> 404')

  describe('Treatments')
    it('Farm B cannot GET Farm A treatment list with Farm A cow_id -> empty')
    it('Farm B cannot DELETE Farm A treatment -> 404')

  describe('Breeding Events')
    it('Farm B cannot GET Farm A breeding events -> empty')
    it('Farm B cannot dismiss Farm A event -> 404')
    it('Farm B upcoming returns zero Farm A events')

  describe('Medications')
    it('Farm B cannot GET Farm A medication by ID -> 404')
    it('Farm B list returns zero Farm A medications')

  describe('Analytics')
    it('Farm B daily-kpis reflect only Farm B data')
    it('Farm B herd-summary counts only Farm B cows')
    it('Farm B top-producers returns only Farm B cows')

  describe('Reports')
    it('Farm B treatment-history contains zero Farm A treatments')

  describe('Sync')
    it('Farm B push cannot create cow in Farm A namespace')
    it('Farm B pull returns zero Farm A data')

  describe('Auth Isolation')
    it('Same username in Farm A and Farm B are independent')
    it('Farm A admin cannot log in with Farm B farm code')
    it('Deactivated farm rejects login')

  describe('Export')
    it('Farm B export contains zero Farm A records')

  describe('Audit Log')
    it('Farm B audit log contains zero Farm A entries')
```

### Key test pattern

```js
it('Farm B cannot GET Farm A cow by ID', async () => {
  const res = await request(app)
    .get(`/api/cows/${farmACowId}`)
    .set('Authorization', `Bearer ${farmBToken}`)

  expect(res.status).toBe(404) // NOT 403 -- don't reveal existence
})
```

**Important**: Cross-tenant access should return 404, not 403. The resource doesn't exist in the requesting farm's scope.

## Step 4.3 -- Verify edge cases

Add tests for:

- **Empty farm**: Farm C with no data -- all endpoints return empty lists, not errors
- **Farm with deactivated users**: Deactivated user's JWT (from before deactivation) returns 401
- **Concurrent identical data**: Both farms have cow tag "COW001", health issue for same cow name -- no crossover
- **Sync with conflicting IDs**: Farm A and Farm B push changes with same entity ID format -- server handles correctly per farm

## Verification Checklist

1. All isolation tests pass -- zero cross-tenant data leaks
2. Coverage: every CRUD resource has at least GET-by-ID + list + mutation isolation tests
3. `npm test` -- all existing + new tests pass
4. Test count documented in this file
5. No test uses hardcoded farm IDs -- all use seeded values from helpers
6. Tests clean up after themselves (or use transactions/rollback)

## Important Notes

- These tests are the safety net for the entire multi-tenancy implementation. They should be thorough.
- Return 404 (not 403) for cross-tenant access -- don't leak information about other farms' resources.
- Test file may be large (50+ tests). Consider splitting into `tenantIsolation.cows.test.js`, `tenantIsolation.auth.test.js`, etc. if needed.
- Run these tests as part of CI -- they catch regressions when new endpoints are added later.
