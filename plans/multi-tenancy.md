# Multi-Tenancy Implementation Plan

## Context

MyHerder currently serves a single farm. This plan transforms it into a multi-tenant SaaS where multiple farms share one database, isolated by `farm_id` on every tenant-scoped table. A super-admin role with TOTP 2FA provides cross-farm management. Single domain login (`myherder.app`) uses a farm code field to resolve the tenant.

## Architecture Decisions

- **Single database** with `farm_id` column on all tenant-scoped tables
- **Single domain** — no subdomains. Farm code field on login screen, remembered per device in localStorage
- **Super-admin** logs in without farm code, gets 2FA prompt. Has `farm_id = null` in JWT
- **Farm admin/worker** logs in with farm code + credentials. JWT contains `farm_id`
- **TOTP 2FA** for super-admin only (Google Authenticator compatible, `otpauth` npm package)
- **Token versioning** for instant session revocation (stolen device response)
- **Scoped query helper** `req.scoped(table)` to prevent developer mistakes
- Subdomains can be added later as cosmetic upgrade — zero backend changes needed

## Login Flow

```
Login screen (single domain: myherder.app)
    │
    ├── Farm code provided ("BOER")
    │   → Resolve farm by code → find user in that farm
    │   → Issue JWT with farm_id
    │
    └── Farm code empty
        → Find user WHERE role = 'super_admin'
        → Verify password → prompt 2FA code
        → Issue JWT with farm_id = null, role = super_admin
```

Farm code saved to `localStorage('farm_code')` after first successful login — pre-filled on subsequent visits.

## Quality Gate (run after EVERY sub-phase)

Every sub-phase ends with a mandatory quality gate before moving on. Do NOT skip any step.

### A. Correctness
1. **Tests**: Write tests for all new code (routes, views, stores). Run full test suites — all must pass:
   - Backend: `npm test` (all suites)
   - Frontend: `cd client && npm run test:run` (all suites)
2. **Lint**: Run `npm run lint:fix` — zero errors (warnings from pre-existing baseline are acceptable).
3. **i18n completeness**: Verify every new user-facing string has keys in BOTH `en.json` and `af.json`.
4. **Isolation check**: After any query change, verify no code path can return another farm's data by tracing `farm_id` through all JOINs, subqueries, and service calls. This is the most critical check — a missed scope is a data breach.

### B. Code Quality & Readability
5. **Dead code scan**: Run `npm run knip` — no new unused exports, files, or dependencies. Remove anything flagged.
6. **Refactor review** — For every file touched in this sub-phase, check:
   - **Duplication**: Is any logic repeated that should be extracted into a shared helper? (e.g., two routes doing the same farm lookup, repeated Joi schemas)
   - **Complexity**: Are any functions >40 lines or >3 levels of nesting? Split them.
   - **Naming**: Are variables, functions, and routes named clearly? Would a new developer understand them without comments?
   - **Consistency**: Does the new code follow existing patterns? (section dividers `// -- Section --`, Joi schema placement at top, back buttons with `back-to`, etc. per MEMORY.md conventions)
   - **Comments**: Remove any obvious/redundant comments. Add comments only where the "why" isn't clear from the code.
7. **DRY check** — Specifically look for:
   - Repeated `farm_id` scoping logic that should use `req.scoped()` instead
   - Repeated Joi validation patterns that should use shared schema fragments
   - Repeated DB queries across routes that should be shared helpers
   - Frontend components with copy-pasted logic that should be composables

### C. Efficiency & Performance
8. **Query efficiency**:
   - No N+1 queries (batch lookups, use JOINs or `whereIn`)
   - No redundant queries (e.g., re-fetching data that's already in scope)
   - Verify new indexes cover the most common `WHERE farm_id = ? AND ...` patterns
   - Use `Promise.all()` for independent parallel queries
9. **Bundle check**: After frontend changes, run `cd client && npm run build` — verify no unexpected size increase. If a new dependency was added, confirm it's tree-shakeable.
10. **Cost efficiency**: Is this the simplest implementation that works? Could fewer lines achieve the same result? Are we over-abstracting for a single use case?

### D. Security
11. **Tenant isolation audit**: For every new or modified endpoint:
    - Does every SELECT include `farm_id` scoping (via `req.scoped()` or explicit `.where`)?
    - Does every INSERT include `farm_id: req.farmId`?
    - Does every UPDATE/DELETE scope by `farm_id` to prevent cross-tenant modification?
    - Do JOINed tables also filter by `farm_id` where applicable?
12. **Auth check**: Verify no endpoint is accessible without proper authentication + tenant scope middleware.
13. **Input validation**: All user inputs validated with Joi before reaching DB queries. No raw `req.body` or `req.query` values used in queries.

### E. Surprise Check
14. **Stop and notify**: If anything unexpected is discovered during implementation (schema inconsistencies, broken existing code, missing data, security concerns, performance issues, data that doesn't fit the multi-tenant model), **stop and notify the user** before proceeding. Do not silently work around surprises.

---

## Phase 1: Database Foundation (Migration 027)

### Step 1.1 — Create `farms` table

```sql
CREATE TABLE farms (
  id          TEXT PRIMARY KEY,  -- UUID
  name        TEXT NOT NULL,
  code        TEXT NOT NULL UNIQUE,  -- short code like "BOER", uppercase
  slug        TEXT NOT NULL UNIQUE,  -- url-friendly, for future subdomain use
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Step 1.2 — Add `farm_id` to all tenant-scoped tables

Tables that need `farm_id TEXT REFERENCES farms(id)` (nullable initially, made NOT NULL after data backfill):
- `users`
- `cows`
- `medications`
- `treatments`
- `treatment_medications`
- `health_issues`
- `health_issue_comments`
- `milk_records`
- `breeding_events`
- `breed_types`
- `issue_type_definitions`
- `breeding_event_types`
- `feature_flags` (composite PK becomes `(farm_id, key)`)
- `app_settings` (composite PK becomes `(farm_id, key)`)
- `audit_log`
- `sync_log`

### Step 1.3 — Update unique constraints

| Table | Old constraint | New constraint |
|-------|---------------|----------------|
| `users` | `UNIQUE(username)` | `UNIQUE(farm_id, username)` |
| `cows` | `UNIQUE(tag_number)` | `UNIQUE(farm_id, tag_number)` |
| `breed_types` | `UNIQUE(code)` | `UNIQUE(farm_id, code)` |
| `issue_type_definitions` | `UNIQUE(code)` | `UNIQUE(farm_id, code)` |
| `breeding_event_types` | `UNIQUE(code)` | `UNIQUE(farm_id, code)` |
| `milk_records` | `UNIQUE(cow_id, session, recording_date)` | `UNIQUE(farm_id, cow_id, session, recording_date)` |
| `feature_flags` | PK `key` | Composite PK `(farm_id, key)` |
| `app_settings` | PK `key` | Composite PK `(farm_id, key)` |

### Step 1.4 — Add token versioning column

- `users`: add `token_version INTEGER NOT NULL DEFAULT 0`

### Step 1.5 — Add 2FA columns

- `users`: add `totp_secret TEXT` (encrypted TOTP seed, null for non-super-admin)
- `users`: add `totp_enabled BOOLEAN NOT NULL DEFAULT false`
- `users`: add `recovery_codes TEXT` (JSON array of bcrypt-hashed one-time codes)

### Step 1.6 — Extend role enum

- `users.role`: add `'super_admin'` alongside existing `'admin'` and `'worker'`

### Step 1.7 — Seed default farm and backfill

In the migration's `up()`:
1. Create a default farm: code `DEFAULT`, name pulled from `app_settings.farm_name` (fallback: `'My Farm'`)
2. `UPDATE <table> SET farm_id = <default_farm_id>` for every tenant-scoped table
3. Alter `farm_id` columns to NOT NULL
4. Create a super-admin user (username `superadmin`, password prompt deferred — set via CLI or first-run flow)

### Step 1.8 — Add indexes

- `farm_id` index on every table that has it
- Compound indexes for common filter patterns:
  - `(farm_id, status)` on `cows`
  - `(farm_id, recording_date)` on `milk_records`
  - `(farm_id, event_date)` on `breeding_events`
  - `(farm_id, observed_at)` on `health_issues`
  - `(farm_id, treatment_date)` on `treatments`

### Step 1.9 — Quality Gate

Run full Quality Gate (A-E). Phase-specific focus:
- Migration runs cleanly on existing dev DB — zero data loss
- Rollback (`down()`) works and restores original schema
- Run `SELECT COUNT(*) FROM <table> WHERE farm_id IS NULL` on every table — must return 0
- Verify all new indexes exist with `.indexes` pragma or equivalent
- Check migration file for: hardcoded values, missing tables, constraint typos

---

## Phase 2: Tenant Middleware + Scoped Queries

### Step 2.1 — Create `tenantScope` middleware

**Create** `server/middleware/tenantScope.js`:

```js
// Sets req.farmId from JWT and provides req.scoped(table) helper.
// Super-admin with no farm context sets farmId = null.
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
  req.scoped = (table) => db(table).where(`${table}.farm_id`, req.farmId);
  next();
};
```

### Step 2.2 — Apply middleware to all route files

Add `router.use(tenantScope)` immediately after `router.use(authenticate)` in every route file.

Exceptions (do NOT add tenantScope):
- `POST /api/auth/login` — resolves farm from `farm_code` in body
- `POST /api/auth/login-pin` — resolves farm from `farm_code` in body
- `POST /api/auth/refresh` — farm comes from existing JWT
- `GET /api/settings` — public endpoint, uses `farm_code` query param
- `GET /api/sync/health` — no auth

### Step 2.3 — Update core CRUD routes (~80 query locations)

For each file: replace bare `db('table')` with `req.scoped('table')` for SELECTs and add `farm_id: req.farmId` to all INSERTs.

| File | Approx. query locations |
|------|------------------------|
| `server/routes/cows.js` | 8 + subqueries |
| `server/routes/milkRecords.js` | 14 |
| `server/routes/healthIssues.js` | 14 (including comments) |
| `server/routes/treatments.js` | 16 (including junction table) |
| `server/routes/breedingEvents.js` | 18 + upcoming queries |
| `server/routes/medications.js` | 10 |
| `server/routes/issueTypes.js` | 11 |
| `server/routes/breedTypes.js` | 6 |
| `server/routes/users.js` | 11 |
| `server/routes/appSettings.js` | 6 |
| `server/routes/featureFlags.js` | 4 |
| `server/routes/auditLog.js` | 3 |
| `server/routes/export.js` | 11 |
| `server/routes/sync.js` | delegates to syncService |

### Step 2.4 — Update analytics routes (~60 query locations)

| File | Notes |
|------|-------|
| `server/routes/analytics/helpers.js` | Make `getIssueTypeDefMap()` farm-scoped (key cache by `farm_id` or remove cache) |
| `server/routes/analytics/kpi.js` | 7 query locations |
| `server/routes/analytics/financial.js` | 6 query locations |
| `server/routes/analytics/fertility.js` | 12+ query locations |
| `server/routes/analytics/health.js` | 11 query locations |
| `server/routes/analytics/structure.js` | 11+ query locations |

### Step 2.5 — Update report routes (~20 query locations)

| File | Approx. query locations |
|------|------------------------|
| `server/routes/reports/treatment.js` | 8 |
| `server/routes/reports/production.js` | 5 |
| `server/routes/reports/herd.js` | 6 |

### Step 2.6 — Update services and helpers

- `server/services/syncService.js` — 12+ query locations (processChange, pullData, logSync). Accept `farmId` as parameter, scope all queries.
- `server/services/auditService.js` — add `farm_id` field to audit log inserts.
- `server/helpers/breedingCalc.js` — scope `getBreedTimings()` by `farm_id` when looking up breed types.

### Step 2.7 — Scope shared query helpers once

These shared helpers are called by multiple endpoints. Scope them once at the definition site:

| Helper | Used by |
|--------|---------|
| `breedingQuery()` in breedingEvents.js | 5+ endpoints |
| `milkQuery()` in milkRecords.js | 5+ endpoints |
| `issueQuery()` in healthIssues.js | 5+ endpoints |
| `treatmentQuery()` in treatments.js | 4+ endpoints |
| `enrichWithMedications()` in treatments.js | 3+ endpoints |
| `batchMedications()` in reports/ | 3+ report endpoints |

Each helper should accept `farmId` as a parameter and apply `.where('farm_id', farmId)` on the base query.

### Step 2.8 — Quality Gate

Run full Quality Gate (A-E). Phase-specific focus:
- **Isolation spot-check**: Farm A token cannot retrieve Farm B's cow by ID (expect 404, not 403)
- **Grep audit**: `grep -rn "db('" server/routes/ server/services/ server/helpers/` — every bare `db('table')` should be replaced with `req.scoped('table')` or have an explicit `.where('farm_id')`. Flag any misses.
- **Refactor check**: Are any routes doing the same farm lookup/scoping pattern manually instead of using `req.scoped()`? Extract.
- **Shared helper audit**: Do `breedingQuery()`, `milkQuery()`, etc. all accept and use `farmId`? One missed helper = multiple leaking endpoints.
- **Performance**: No new N+1 queries introduced by the scoping changes. `req.scoped()` should add only one `.where()` — verify no double-filtering.

---

## Phase 3: Auth Changes

### Step 3.1 — Update login endpoints

Update `server/routes/auth.js`:

- `POST /api/auth/login`:
  - Accept `farm_code` in request body (optional)
  - If `farm_code` is empty: look for user `WHERE role = 'super_admin'` (no farm filter)
  - If `farm_code` is provided: resolve farm by code, then find user `WHERE farm_id = farm.id AND username = ?`
  - Include `farm_id` and `token_version` in JWT payload

- `POST /api/auth/login-pin`:
  - Require `farm_code` (PIN login is farm-scoped only, no super-admin PIN)
  - Resolve farm → find worker in that farm

- JWT payload shape: `{ id, username, full_name, role, permissions, language, farm_id, token_version }`

- `POST /api/auth/refresh`:
  - Preserve `farm_id` and `role` from existing token
  - Verify `token_version` in token matches DB before issuing new token

### Step 3.2 — Token version check in auth middleware

Update `server/middleware/auth.js`:

After JWT signature verification, fetch `token_version` from `users` table using the decoded `id`. If `decoded.token_version !== user.token_version`, return 401 with `{ error: 'Token revoked' }`.

This adds one indexed PK lookup per request — acceptable cost.

### Step 3.3 — 2FA for super-admin login

Install `otpauth` npm package.

After password verification for a `super_admin` user:
- If `totp_enabled = false` (first login): return `{ requires_totp_setup: true, temp_token: <short-lived JWT, 10 min> }`
- If `totp_enabled = true`: return `{ requires_2fa: true, temp_token: <short-lived JWT, 10 min> }`

New endpoints:
- `POST /api/auth/setup-2fa` — authenticated with `temp_token`; generates TOTP secret, returns `{ qr_uri, secret }` and 8 plaintext recovery codes (store hashed in DB)
- `POST /api/auth/confirm-2fa` — authenticated with `temp_token`; verifies first TOTP code, enables 2FA, returns full JWT
- `POST /api/auth/verify-2fa` — authenticated with `temp_token`; verifies TOTP code (or recovery code), returns full JWT

Recovery codes: 8 one-time codes, stored as bcrypt hashes in `users.recovery_codes` (JSON array). Consumed code is removed from array on use.

### Step 3.4 — Frontend auth store changes

Update `client/src/stores/auth.js`:
- `login()` and `loginPin()` send `farm_code` in request body (read from `localStorage('farm_code')` or form input)
- Handle `requires_2fa` response: set `pendingTempToken`, navigate to `/auth/2fa`
- Handle `requires_totp_setup` response: set `pendingTempToken`, navigate to `/auth/setup-2fa`
- Store `farm_id` in user object (comes from JWT decode, already done by `setSession()`)
- On successful login: `localStorage.setItem('farm_code', farmCode)`

### Step 3.5 — Login view changes

Update `client/src/views/LoginView.vue`:
- Add "Farm Code" text input above username (uppercase transform on input)
- Pre-fill from `localStorage('farm_code')`
- If farm code is empty, show only password field (no PIN tab) — super-admin login
- Optional: on blur of farm code field, call `GET /api/settings?farm_code=X` to show farm name as confirmation

### Step 3.6 — New auth views

- **`client/src/views/TwoFactorVerifyView.vue`**: 6-digit OTP input, submit calls `POST /api/auth/verify-2fa`. Link to "Use recovery code" toggles to a text input.
- **`client/src/views/TwoFactorSetupView.vue`**: Shows QR code (rendered client-side from `qr_uri` using a frontend QR library), secret text for manual entry, confirm-code step, then displays recovery codes for user to save.

### Step 3.7 — Quality Gate

Run full Quality Gate (A-E). Phase-specific focus:
- **Auth flow matrix**: Test all 4 login paths work correctly:
  - Farm worker (farm code + PIN) → JWT has `farm_id`
  - Farm admin (farm code + password) → JWT has `farm_id`
  - Super-admin (no farm code + password + 2FA) → JWT has `farm_id = null`
  - PIN login without farm code → rejected
- **Token payload**: Verify `farm_id` and `token_version` are in ALL issued JWTs
- **2FA security**: Verify temp_token cannot access any API endpoint (only 2FA endpoints). Verify TOTP secret is encrypted in DB, not plaintext. Verify recovery codes are bcrypt-hashed.
- **Refactor check**: Is the 2FA flow adding duplicate validation logic? Should TOTP verification be a shared helper?
- **Dead code**: Remove any old login logic that's been replaced (e.g., login without farm_code handling for non-super-admin)

---

## Phase 4: Session Management + Stolen Device Response

### Step 4.1 — Token revocation endpoint

- `POST /api/users/:id/revoke-sessions` — increments `token_version` by 1 for the target user
- Farm admin can revoke users within their own farm
- Super-admin can revoke any user
- Returns `{ revoked: true, new_version: N }`

### Step 4.2 — Revoke Sessions UI

In `client/src/views/admin/UserManagement.vue`:
- Add "Revoke Sessions" button per user row
- Button calls revoke endpoint, shows success toast
- Inform admin: "This user will be logged out from all devices immediately"

### Step 4.3 — Super-admin session visibility

In `client/src/views/super/FarmDetailView.vue` (created in Phase 6):
- Show users with "Revoke Sessions" button per user
- "Revoke All Farm Sessions" bulk action button

### Step 4.4 — Sessions table (future enhancement — document only)

For future per-device session tracking, a `sessions` table can be added:

```sql
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,   -- UUID, used as JWT 'jti' claim
  user_id     TEXT NOT NULL REFERENCES users(id),
  farm_id     TEXT REFERENCES farms(id),
  device_id   TEXT NOT NULL,
  device_name TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at  DATETIME NOT NULL,
  revoked     BOOLEAN DEFAULT FALSE
);
```

Token versioning (Step 4.1) is sufficient for the current phase. The sessions table is deferred.

### Step 4.5 — Quality Gate

Run full Quality Gate (A-E). Phase-specific focus:
- **Revocation test**: Bump token version → existing JWTs return 401 on next request. New login issues token with new version.
- **Permission check**: Farm admin can only revoke their own farm's users. Super-admin can revoke any user.
- **Efficiency**: Token version check in auth middleware is a single indexed PK lookup — verify it doesn't add a second query if one already exists for permission checks.
- **UI review**: Revoke button has ConfirmDialog. Success/error toasts display correctly. i18n keys in both locales.

---

## Phase 5: Frontend IndexedDB Isolation

### Step 5.1 — Namespace IndexedDB per farm

Update `client/src/db/indexedDB.js`:
- Database name becomes `myherder_db_${farmId}` (e.g., `myherder_db_abc123`)
- Export `initDb(farmId)` function that creates or reuses the Dexie instance for that farm
- All stores import and use the current DB instance from a reactive ref or module-level singleton

### Step 5.2 — Logout cleanup

Update `client/src/stores/auth.js` logout():
- Delete the farm-scoped IndexedDB: `indexedDB.deleteDatabase('myherder_db_' + farmId)`
- Clear `localStorage('auth_token')` and all farm-scoped keys
- Reset all Pinia store state (call `$reset()` on each store)
- Reset `syncInitialized` flag so next login re-runs `initialSync()`

### Step 5.3 — Login initialization

On successful login (in `setSession()`):
- Call `initDb(farmId)` to create the farm-scoped IndexedDB
- Run `initialSync()` to populate fresh data from server

### Step 5.4 — Service worker updates

Update `client/public/sw-custom.js`:
- Receive farm-scoped DB name via `postMessage` from main app thread
- Use dynamic DB name for background sync operations
- Clear background sync registration on logout postMessage

### Step 5.5 — localStorage key conventions

| Key | Scope | Notes |
|-----|-------|-------|
| `auth_token` | Global | Single user per device |
| `farm_code` | Global | Entry point, not per-farm |
| `locale` | Global | User preference, not farm-specific |
| `sync_device_id` | Global | Device UUID, not farm-specific |

No namespace changes needed for localStorage — single user per device.

### Step 5.6 — Quality Gate

Run full Quality Gate (A-E). Phase-specific focus:
- **Isolation test**: Login as Farm A → populate data → logout → login as Farm B → verify IndexedDB is fresh (no Farm A data)
- **Offline test**: Login → go offline → reload → verify offline login works with farm-scoped DB
- **Cleanup test**: After logout, verify `indexedDB.databases()` no longer lists the old farm DB
- **Store reset**: Verify all 11 Pinia stores are properly reset on logout — no stale Farm A data leaking into Farm B session
- **Service worker**: Verify SW receives updated DB name via postMessage and uses it for background sync
- **Dead code**: Remove any old unscoped IndexedDB references (`'myherder_db'` hardcoded string should not exist anywhere)

---

## Phase 6: Super-Admin Panel

### Step 6.1 — Farm CRUD API

**Create** `server/routes/farms.js`:

All endpoints require super-admin role (use `requireAdmin` or add `requireSuperAdmin` middleware).

- `GET /api/farms` — list all farms with stats: `{ id, name, code, is_active, user_count, cow_count, last_sync_at }`
- `GET /api/farms/:id` — farm detail with users list and activity stats
- `POST /api/farms` — create farm; body: `{ name, code, admin_username, admin_password }`. Seeds defaults (see Step 6.2). Returns created farm + admin user.
- `PATCH /api/farms/:id` — update `name`, `code`, `is_active`
- `DELETE /api/farms/:id` — soft-deactivate (`is_active = false`). Does not delete data.

### Step 6.2 — Farm creation seeding

When `POST /api/farms` succeeds, seed the new `farm_id` with:
- Farm admin user (from request body `admin_username` + `admin_password`)
- Default breed types (copy from seed data or existing farm if specified)
- Default issue types (copy from seed data)
- Default medications (copy from seed data)
- Default feature flags (all enabled by default)
- Default app settings (`farm_name` = request `name`, `default_language` = `'en'`)

Extract seeding logic into `server/services/farmSeedService.js` so it can also be called from migration for the default farm.

### Step 6.3 — "Enter Farm" functionality

- `POST /api/farms/:id/enter` — super-admin only; issues a new JWT scoped to `farm_id` while preserving `role = 'super_admin'`. Original token is NOT invalidated.
- Frontend stores both tokens: `localStorage('super_admin_token')` (original) and `localStorage('auth_token')` (farm-entered)
- App.vue shows a banner: "Viewing: [Farm Name] — [Exit]" when `super_admin_token` is present and differs from `auth_token`
- "Exit" button: restore `auth_token` from `super_admin_token`, clear `super_admin_token`, navigate to `/super/farms`

### Step 6.4 — Super-admin views

**Create** `client/src/views/super/`:

- **`FarmListView.vue`**: Table of all farms, columns: Name, Code, Status, Users, Cows, Last Active. Actions: View, Edit, Deactivate. "Create Farm" button in header.
- **`FarmDetailView.vue`**: Farm name/code/status, user list with Revoke Sessions per user, "Revoke All Farm Sessions" button, "Enter Farm" button, Edit farm fields inline.
- **`CreateFarmView.vue`**: Form with farm name, farm code (auto-generated from name, editable), admin username, admin password. Submit calls `POST /api/farms`.

### Step 6.5 — Super-admin routes

Add to `client/src/router/index.js`:

```
/super/farms          → FarmListView    (meta: { requiresSuperAdmin: true })
/super/farms/new      → CreateFarmView  (meta: { requiresSuperAdmin: true })
/super/farms/:id      → FarmDetailView  (meta: { requiresSuperAdmin: true })
```

Router guard: if `requiresSuperAdmin` meta and `authStore.user.role !== 'super_admin'`, redirect to `/`.

### Step 6.6 — Navigation

- DashboardView: when `user.role === 'super_admin'`, show "Farms" card linking to `/super/farms` (and hide farm-specific cards like Cows, Milking, Breeding)
- BottomNav: hide when user is super-admin with no farm context (super-admin navigates from their own dashboard)

### Step 6.7 — i18n keys

Add `superAdmin` namespace to `en.json` and `af.json`:
- Farm list, detail, create labels
- "Enter Farm" / "Exit Farm" banner
- Session revocation confirmations

### Step 6.8 — Quality Gate

Run full Quality Gate (A-E). Phase-specific focus:
- **Farm creation**: Create farm → verify all seeded data (breed types, issue types, medications, feature flags, app_settings) exists under new `farm_id`
- **Enter/Exit farm**: Enter farm → app shows only that farm's data → Exit → super-admin context restored, no farm data visible
- **Refactor check**: `farmSeedService.js` — is seeding logic DRY? Reuses existing seed data definitions? Not duplicating data from migration seeds?
- **UI consistency**: Super-admin views follow same design system (`.card`, `.badge`, `.btn-primary`, etc.) and atomic design tiers
- **Permission matrix**: Verify farm admin cannot access `/super/*` routes (redirect to `/`). Verify super-admin without farm context cannot access farm-scoped routes.
- **Bundle impact**: Check `npm run build` output — 3 new views should be lazy-loaded (route-level code splitting) to avoid bloating the main bundle

---

## Phase 7: Cross-Tenant Isolation Tests

### Step 7.1 — Test infrastructure helpers

Add to `server/tests/helpers.js` (or create if it does not exist):

```js
async function seedFarm(code, adminUsername, adminPassword = 'testpass123') {
  // Creates farm + admin user, returns { farmId, adminToken }
}

async function loginAsFarm(farmCode, username, password) {
  // Returns scoped JWT for that farm
}
```

### Step 7.2 — Create `tenantIsolation.test.js`

**Create** `server/tests/tenantIsolation.test.js`

For every major CRUD resource (cows, milk records, health issues, treatments, breeding events, medications):

- Seed Farm A and Farm B with identical data (same tag numbers, usernames, etc.)
- **GET by ID**: Farm B token requests Farm A's resource ID → expect 404 (not 403)
- **GET list**: Farm B list endpoint → verify response contains zero Farm A records
- **PUT/PATCH**: Farm B token updates Farm A's resource ID → expect 404
- **DELETE**: Farm B token deletes Farm A's resource ID → expect 404
- **Analytics**: Farm B analytics endpoints only aggregate Farm B's data

Additional auth isolation tests:
- Farm A admin cannot log in with Farm B's farm code
- Same username in Farm A and Farm B are independent (each can log in with their own farm code)
- Super-admin login without farm code succeeds
- Super-admin login requires 2FA
- Token version bump invalidates all existing tokens for that user
- Deactivated farm users cannot log in

### Step 7.3 — Quality Gate

Run full Quality Gate (A-E). Phase-specific focus:
- **All isolation tests pass** — zero cross-tenant data leaks across all CRUD resources
- **Coverage review**: Are there any endpoints NOT covered by isolation tests? Cross-reference with route file list in MEMORY.md.
- **Edge cases tested**: Empty farm (no data), deactivated farm, super-admin entering a farm, sync push/pull isolation
- **Test quality**: Tests are readable, use descriptive names, follow patterns from existing test files. No duplicated test setup — use shared helpers.
- **Target**: Full isolation verified before proceeding to Phase 8.

---

## Phase 8: Migration Path for Existing Data

### Step 8.1 — Zero-downtime migration strategy

1. Deploy migration 027 with `farm_id` columns **nullable** — existing app continues to work
2. Run data backfill script (part of migration `up()`): create default farm, UPDATE all rows
3. Alter columns to NOT NULL
4. Deploy new application code (now requires `farm_id` in JWT)
5. All existing sessions expire within 24h (admin) / 7d (worker) naturally — or force via token version bump

### Step 8.2 — Rollback plan

Migration 027 `down()` must:
- Drop `farm_id` columns from all tables
- Drop `farms` table
- Drop `token_version`, `totp_secret`, `totp_enabled`, `recovery_codes` columns from `users`
- Restore original unique constraints

Test rollback on a copy of the DB before production deployment.

### Step 8.3 — Post-deploy verification checklist

- [ ] Default farm exists with correct `farm_name` from `app_settings`
- [ ] All existing cows, users, milk records have `farm_id` set
- [ ] Existing admin can log in with farm code `DEFAULT`
- [ ] Super-admin account created and 2FA setup completed
- [ ] No orphaned rows (run `SELECT COUNT(*) FROM <table> WHERE farm_id IS NULL` on every table)
- [ ] All existing functionality works end-to-end with the default farm
- [ ] Offline sync still works (push/pull with farm-scoped data)
- [ ] PWA installs and works offline with farm-scoped IndexedDB

### Step 8.4 — Final Quality Gate

Run full Quality Gate (A-E) one last time across the entire codebase. Phase-specific focus:
- **Full grep audit**: `grep -rn "db('" server/` — zero bare `db('table')` calls without farm scoping
- **Dead code sweep**: `npm run knip` — remove anything accumulated during the 8 phases
- **Bundle analysis**: `cd client && npm run build:analyze` — verify bundle size is reasonable, new dependencies are tree-shaken
- **Test coverage**: All backend + frontend tests pass. No skipped tests. Total test count documented.
- **Documentation**: CLAUDE.md updated with multi-tenancy API docs, new roles, new endpoints. MEMORY.md updated with phase completion status.
- **Security review**: One final pass through all auth endpoints, middleware, and tenant scoping for any gaps

---

## File Impact Summary

### New files

| File | Purpose |
|------|---------|
| `server/migrations/027_add_multi_tenancy.js` | DB schema changes, data backfill |
| `server/middleware/tenantScope.js` | Tenant scoping middleware + `req.scoped()` |
| `server/routes/farms.js` | Farm CRUD API (super-admin) |
| `server/services/farmSeedService.js` | Farm default data seeding (used by farms.js + migration) |
| `client/src/views/TwoFactorVerifyView.vue` | 2FA code entry |
| `client/src/views/TwoFactorSetupView.vue` | 2FA QR code setup |
| `client/src/views/super/FarmListView.vue` | Farm list (super-admin) |
| `client/src/views/super/FarmDetailView.vue` | Farm detail (super-admin) |
| `client/src/views/super/CreateFarmView.vue` | Create farm form |
| `server/tests/tenantIsolation.test.js` | Cross-tenant isolation tests |

### Modified files (major changes)

| File | Changes |
|------|---------|
| `server/routes/auth.js` | Farm code login, 2FA flow, token_version in JWT |
| `server/middleware/auth.js` | Token version check on every request |
| All 26 route files | Add `tenantScope`, use `req.scoped()`, add `farm_id` to INSERTs |
| All analytics files (6) | Farm-scoped queries, farm-keyed cache |
| All report files (3) | Farm-scoped queries |
| `server/services/syncService.js` | Accept and propagate `farmId` |
| `server/services/auditService.js` | Add `farm_id` to audit log inserts |
| `server/helpers/breedingCalc.js` | Scope breed type lookup by `farm_id` |
| `client/src/stores/auth.js` | Farm code, 2FA state, `farm_id` in user, logout cleanup |
| `client/src/views/LoginView.vue` | Farm code field, 2FA redirect |
| `client/src/db/indexedDB.js` | Farm-scoped DB name, `initDb(farmId)` export |
| `client/src/services/syncManager.js` | Farm-scoped sync init and teardown |
| `client/public/sw-custom.js` | Farm-scoped background sync DB name |
| `client/src/router/index.js` | Super-admin routes + `requiresSuperAdmin` guard |
| `server/app.js` | Mount `farms.js` route |
| `client/src/i18n/en.json` | `superAdmin`, `login.farmCode`, `twoFactor` namespaces |
| `client/src/i18n/af.json` | Same keys in Afrikaans |

### Modified files (minor — add `farm_id` to queries only)

- All 11 Pinia stores — reference `initDb(farmId)` instance
- `client/src/views/DashboardView.vue` — super-admin card + Enter Farm banner
- `client/src/components/organisms/BottomNav.vue` — hide when no farm context

---

## Implementation Order

Recommended sequence — each phase is a prerequisite for the next:

1. **Phase 1** — DB foundation (everything depends on this)
2. **Phase 2** — Tenant middleware + query scoping (biggest phase)
3. **Phase 3** — Auth changes (login flow)
4. **Phase 7** — Isolation tests (verify correctness before UI)
5. **Phase 4** — Session management (stolen device response)
6. **Phase 5** — Frontend IndexedDB isolation (client-side)
7. **Phase 6** — Super-admin panel (management UI last)
8. **Phase 8** — Production migration path (when ready to deploy)

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `otpauth` | TOTP 2FA generation and verification (server) |
| `qrcode` (frontend only) | QR code rendering for 2FA setup page, or use a Vue QR component |

No other new dependencies required. All other functionality uses the existing Express + Knex + JWT + bcryptjs stack.
