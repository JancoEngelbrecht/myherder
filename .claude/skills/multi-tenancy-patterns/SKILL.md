---
name: multi-tenancy-patterns
description: Multi-tenant architecture patterns for farm-scoped data isolation. Covers tenantScope middleware, farm_id query scoping, IndexedDB per-farm isolation, super-admin cross-farm access, and cross-tenant isolation testing. Load when writing tenant-scoped queries, adding new tables/routes, or testing data isolation.
---

# Multi-Tenancy Patterns

## 1. Database Schema

### farm_id on every tenant-scoped table
All tenant data tables have `farm_id NOT NULL` with FK to `farms.id`:

```js
// In migrations
table.string('farm_id').notNullable().references('farms.id');
table.index('farm_id'); // Always index farm_id
```

### Tables that are NOT tenant-scoped
- `farms` — the tenants themselves
- `users` — has `farm_id` but nullable (super_admin has no farm)
- `default_breed_types`, `default_issue_types`, `default_medications` — global defaults
- `system_announcements`, `announcement_dismissals` — cross-farm announcements

### Composite primary keys
Feature flags and app settings use composite PKs to scope per-farm:
```js
table.primary(['farm_id', 'key']); // Instead of auto-increment id
```

---

## 2. tenantScope Middleware

Applied to all `/api/*` routes except auth, settings, and announcements:

```js
// server/middleware/tenantScope.js
function tenantScope(req, res, next) {
  const farmId = req.user?.farm_id;

  // Super-admin without farm context — only allowed on farm management routes
  if (req.user?.role === 'super_admin' && !farmId) {
    return res.status(403).json({ error: { code: 'NO_FARM_CONTEXT' } });
  }

  req.farmId = farmId; // All downstream code uses req.farmId
  next();
}
```

### Mounting
```js
// server/app.js
app.use('/api', tenantScope); // Before route mounts
// Exclude: auth routes handle their own scoping
```

---

## 3. Query Scoping Patterns

### Every SELECT must filter by farm_id
```js
// CORRECT
const cows = await db('cows').where({ farm_id: req.farmId });

// WRONG — returns data from all farms
const cows = await db('cows');
```

### Every INSERT must include farm_id
```js
await db('cows').insert({
  id: uuid(),
  ...value,
  farm_id: req.farmId,  // ALWAYS include
  created_at: knex.fn.now()
});
```

### Shared query helpers accept farmId
```js
// server/routes/analytics/helpers.js
function treatmentQuery(db, farmId) {
  return db('treatments')
    .where('treatments.farm_id', farmId)
    .whereNull('treatments.deleted_at');
}

// Usage in routes
const treatments = await treatmentQuery(db, req.farmId)
  .whereBetween('treatment_date', [from, to]);
```

### Helper functions accept farmId parameter
Never use global caches — they leak data across tenants:
```js
// CORRECT — farm-scoped query
async function getIssueTypeMap(db, farmId) {
  const types = await db('issue_type_definitions').where({ farm_id: farmId });
  return new Map(types.map(t => [t.code, t]));
}

// WRONG — global cache shared across all farms
let cachedTypes = null;
async function getIssueTypeMap(db) {
  if (!cachedTypes) cachedTypes = await db('issue_type_definitions');
  return cachedTypes;
}
```

---

## 4. Auth & Farm-Code Login

### Login flow
- **Admin login**: `POST /auth/login` with optional `farm_code` — looks up farm by code
- **Worker PIN login**: `POST /auth/login-pin` — requires `farm_code` (workers don't know farm IDs)

### JWT payload includes farm_id
```js
const token = jwt.sign({
  id: user.id,
  username: user.username,
  role: user.role,
  farm_id: user.farm_id,  // null for super_admin
  permissions: user.permissions,
  token_version: user.token_version
}, JWT_SECRET);
```

### Token versioning
Auth middleware checks `token_version` on every request to support session revocation:
```js
// In auth middleware
const dbUser = await db('users').where({ id: decoded.id }).first();
if (dbUser.token_version !== decoded.token_version) {
  return res.status(401).json({ error: 'Session revoked' });
}
```

---

## 5. Super-Admin Cross-Farm Access

### Enter-farm flow
Super-admin can "enter" any farm via a scoped JWT:
```js
// POST /api/farms/:id/enter
const scopedToken = jwt.sign({
  ...superAdminPayload,
  farm_id: targetFarmId,  // Temporarily scoped
  original_role: 'super_admin'
}, JWT_SECRET, { expiresIn: '4h' });
```

### Frontend state management
```js
// authStore
enterFarm(farmId) {
  localStorage.setItem('superAdminToken', currentToken); // Save original
  const response = await api.post(`/farms/${farmId}/enter`);
  setSession(response.data); // Switch to farm-scoped token
}

exitFarm() {
  const originalToken = localStorage.getItem('superAdminToken');
  setSession(decodeToken(originalToken)); // Restore super-admin context
  localStorage.removeItem('superAdminToken');
}
```

---

## 6. IndexedDB Per-Farm Isolation

### Farm-scoped database naming
```js
// client/src/db/indexedDB.js
function initDb(farmId) {
  const dbName = farmId ? `myherder_db_${farmId}` : 'myherder_db';
  db = new Dexie(dbName);
  db.version(4).stores({ cows: 'id', auth: 'key' });
}
```

### Lifecycle
- `setSession()` calls `initDb(farm_id)` after successful login
- `hydrate()` reads `farm_id` from localStorage to reconnect on page reload
- `logout()` calls `closeDb()` and cleans up localStorage (`farm_id`, `farm_code`)
- 401 interceptor also cleans up and closes DB

### Proxy pattern
Stores access `db.cows`, `db.auth` via a Proxy that routes to the current Dexie instance. No store changes needed when switching farms — the Proxy handles it.

---

## 7. Cross-Tenant Isolation Tests

### Test setup helpers
```js
// server/tests/helpers/setup.js
async function seedFarm(db, overrides = {}) {
  const farm = { id: uuid(), name: 'Test Farm', code: 'TEST01', ...overrides };
  await db('farms').insert(farm);
  return farm;
}

async function seedFarmUser(db, farmId, overrides = {}) {
  const user = {
    id: uuid(), farm_id: farmId, role: 'admin',
    username: `user_${uuid().slice(0, 8)}`, ...overrides
  };
  await db('users').insert(user);
  return user;
}

function tokenForFarm(user) {
  return jwt.sign({ id: user.id, farm_id: user.farm_id, role: user.role, ... }, JWT_SECRET);
}
```

### Isolation test pattern
Every test creates two farms and verifies data doesn't leak:

```js
describe('Tenant isolation - cows', () => {
  let farmA, farmB, tokenA, tokenB;

  beforeAll(async () => {
    farmA = await seedFarm(db);
    farmB = await seedFarm(db, { code: 'FARMB' });
    const userA = await seedFarmUser(db, farmA.id);
    const userB = await seedFarmUser(db, farmB.id);
    tokenA = tokenForFarm(userA);
    tokenB = tokenForFarm(userB);
  });

  it('farm A cannot see farm B cows', async () => {
    // Create cow in farm B
    await request(app).post('/api/cows')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ tag_number: 'B001', name: 'Bessie' });

    // Farm A sees nothing
    const res = await request(app).get('/api/cows')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.body).toHaveLength(0);
  });

  it('farm A cannot update farm B cow', async () => {
    const cowB = await db('cows').where({ farm_id: farmB.id }).first();
    await request(app).put(`/api/cows/${cowB.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Hacked' })
      .expect(404); // Scoped query returns not found
  });
});
```

### What to test for every tenant-scoped resource
1. **Read isolation**: Farm A cannot list/get Farm B's records
2. **Write isolation**: Farm A cannot create/update/delete Farm B's records
3. **Analytics isolation**: Aggregate queries only include own farm's data
4. **Sync isolation**: Pull only returns own farm's data; push rejects cross-farm entities
5. **Edge cases**: Empty farm (no data), deactivated farm, deactivated user, token version mismatch

---

## 8. Adding a New Tenant-Scoped Table

Checklist for adding any new table:

1. **Migration**: Add `farm_id NOT NULL` column with FK to `farms.id` + index
2. **Route INSERT**: Include `farm_id: req.farmId` in all insert operations
3. **Route SELECT**: Add `.where({ farm_id: req.farmId })` to all queries
4. **Route UPDATE/DELETE**: Scope the lookup by `farm_id` (not just `id`)
5. **Seeds**: Include `farm_id` in dev/demo seeds (use `DEFAULT_FARM_ID`)
6. **Tests**: Update test helpers to include `farm_id`, add isolation tests
7. **Sync**: If entity syncs offline, add to `syncService` pull/push with farm_id scoping

---

## 9. Session Revocation

### Revoking a single user's sessions
```js
// POST /api/users/:id/revoke-sessions
await db('users').where({ id: userId }).increment('token_version', 1);
// All existing tokens with old token_version are now rejected by auth middleware
```

### Revoking all sessions for a farm
```js
// POST /api/farms/:id/revoke-all-sessions
await db('users').where({ farm_id: farmId }).increment('token_version', 1);
```

### Frontend: Revoke button with ConfirmDialog
Always use ConfirmDialog for destructive session actions — the user needs to understand they're logging out other users.
