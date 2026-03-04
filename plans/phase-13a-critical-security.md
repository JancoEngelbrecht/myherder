# Phase 13A: Critical Security Fixes

> Priority: **CRITICAL** — Must fix before any production deployment

---

## 13A.1 — Sync Push Permission Bypass

**Problem:** `POST /api/sync/push` accepts any authenticated user but can write to admin-only tables (breedTypes, issueTypes, medications). A worker can modify withdrawal hours, deactivate breed types, etc.

**Files:** `server/services/syncService.js`

**Tasks:**
1. Add a `requiredRole` field to each entry in `ENTITY_MAP` (e.g. `breedTypes: { table: 'breed_types', requiredRole: 'admin' }`, `cows: { ..., requiredRole: null }`)
2. Add a `allowedFields` allowlist per entity in `ENTITY_MAP` — only these fields can be written via sync
3. In `processChange()`, check `req.user.role` against `requiredRole` before processing; return `{ status: 'error', error: 'Insufficient permissions' }` for unauthorized changes
4. Add permission checks: map entity types to required permissions (e.g. `milkRecords` → `can_record_milk`, `healthIssues` → `can_log_issues`, `breedingEvents` → `can_log_breeding`)
5. In `handleCreate`/`handleUpdate`, pick only `allowedFields` from `data` before writing (strip unknown columns)
6. Add tests: worker cannot sync breedTypes/issueTypes/medications changes; worker can sync milk records with correct permission; field stripping works

**Acceptance:** No authenticated user can write to tables they lack permission for via sync. Unknown fields are silently dropped.

---

## 13A.2 — Password Login Account Lockout

**Problem:** Only PIN login has lockout logic. Password login increments `failed_attempts` but never checks/sets `locked_until`. Admin accounts can be brute-forced.

**Files:** `server/routes/auth.js`

**Tasks:**
1. In the password login handler (POST `/api/auth/login`), add the same lockout check that exists in PIN login:
   - Check `locked_until > now` → return 423 "Account locked"
   - After failed attempt: if `failed_attempts >= lockoutThreshold`, set `locked_until = now + lockoutDuration`
2. Extract shared lockout logic into a helper function used by both login handlers to avoid duplication:
   ```js
   async function checkAndApplyLockout(user, lockoutThreshold, lockoutMinutes)
   ```
3. Add tests: password login locks after threshold; locked account returns 423; lockout expires after duration

**Acceptance:** Both login methods have identical lockout behavior. Shared helper eliminates duplication.

---

## 13A.3 — JWT Secret Hardening

**Problem:** `JWT_SECRET` defaults to `'dev-secret-change-in-production'` for any non-production environment. Staging/demo deployments are vulnerable to token forgery.

**Files:** `server/config/env.js`

**Tasks:**
1. Change the default check: require `JWT_SECRET` env var to be set and ≥32 characters in ALL environments (not just production)
2. In development only (`NODE_ENV === 'development'` or unset), allow a fallback but log a loud warning to stderr on startup
3. For test environment (`NODE_ENV === 'test'`), allow the existing default (tests need a predictable secret)
4. Update `.env.example` with a comment: `# REQUIRED: Set to a random string of at least 32 characters`

**Acceptance:** App refuses to start in staging/production without a strong JWT_SECRET. Dev mode warns. Tests unaffected.

---

## 13A.4 — CORS Default Restriction

**Problem:** When `ALLOWED_ORIGINS` is unset, `cors(undefined)` enables all origins. Any website can make cross-origin API requests.

**Files:** `server/app.js`, `server/config/env.js`

**Tasks:**
1. In `env.js`, add a `corsOrigins` config that defaults to `['http://localhost:5173', 'http://localhost:3000']` in dev
2. In `app.js`, always pass an explicit origin config to `cors()` — never `undefined`
3. In production, require `ALLOWED_ORIGINS` to be set; throw on startup if missing
4. Update `.env.example` with `ALLOWED_ORIGINS=https://yourdomain.com`

**Acceptance:** CORS is never wide-open. Dev defaults to localhost origins. Production requires explicit configuration.

---

## Verification

After all 13A steps:
- [ ] Run full backend test suite: `npm test` (all pass)
- [ ] Run full frontend test suite: `cd client && npm run test:run` (all pass)
- [ ] Manual test: worker sync push of breedType change → rejected
- [ ] Manual test: 6 failed password logins → account locked
- [ ] Manual test: start app without JWT_SECRET in non-test env → error
- [ ] Manual test: start app without ALLOWED_ORIGINS in production → error
