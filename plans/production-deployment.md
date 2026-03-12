# Production Deployment Plan (cPanel + MySQL)

> Target host: VitalHost cPanel with Node.js App Setup (Passenger)
> Database: MySQL (cPanel phpMyAdmin)
> Status: PLANNING

---

## Phase 1: Dependency & Config Fixes
> Priority: CRITICAL — app won't start without these

- [x] **1A.** Add `mysql2` to root `package.json` dependencies
- [x] **1B.** Move `better-sqlite3` from `dependencies` to `devDependencies` (native module won't compile on Linux shared hosting, not needed for MySQL production). Note: still needed for `npm test` — dev-only, not a problem.
- [x] **1C.** Add `"engines": { "node": ">=18.0.0", "npm": ">=8" }` to root `package.json`
- [x] **1D.** Add production DB env validation to `server/config/env.js` — fail fast if `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` are missing when `NODE_ENV=production` (moved from Phase 2C — this is a startup blocker, not a Passenger concern)
- [x] **1E.** Add `charset: 'utf8mb4'` + `pool: { min: 0, max: 5 }` to knexfile.js production config — emoji columns (issue types) will silently corrupt without utf8mb4; pool prevents `PROTOCOL_CONNECTION_LOST` after idle
- [ ] **1F.** Verify `npm install --production` works without `better-sqlite3` (knexfile only loads it for dev/test) — ✅ verified: knex lazy-loads driver, production config uses mysql2 only

---

## Phase 2: Passenger Compatibility
> Priority: CRITICAL — cPanel uses Phusion Passenger to run Node apps

- [x] **2A.** Created root `app.js` that exports `require('./server/app')` without calling `listen()`. Set cPanel "Application startup file" to `app.js`. `server/index.js` (with `app.listen()`) remains unchanged for direct node execution. This eliminates the PORT/socket conflict risk with Passenger.
- [x] **2B.** Verified: catch-all SPA route `/{*path}` is valid Express 5 syntax — no change needed.
- [ ] **2C.** ~~DB env validation~~ — moved to Phase 1D
- [x] **2D.** Added `setHeaders` to `express.static` in `server/app.js`: `index.html` → `no-cache, no-store, must-revalidate`; all other assets → `public, max-age=31536000, immutable`
- [ ] **2E.** Test that the app works when started via `node server/index.js` with `NODE_ENV=production` and MySQL env vars set

---

## Phase 3: MySQL Migration Compatibility
> Priority: CRITICAL — 4 migrations have SQLite-specific code that will fail on MySQL

### 3A. Migration 007 (`add_withdrawal_hours_days`) — LOW risk
- [ ] `.after('column_name')` is MySQL-only but harmless on MySQL (it's the target). SQLite ignores column ordering. **No fix needed** — we're migrating TO MySQL.

### 3B. Migration 009 (`add_health_issue_id_to_treatments`) — LOW risk
- [ ] Same `.after()` issue as 007. **No fix needed** for MySQL target.

### 3C. Migration 011 (`multi_issue_types`) — NO ACTION NEEDED
- [x] `json_array()` and `json_extract()` are valid MySQL 5.7.8+ and MariaDB 10.2.3+ functions (case-insensitive SQL). Path syntax `'$[0]'` is identical. Works as-is.

### 3D. Migration 022 (`fix_breeding_event_type_enum`) — FIXED
- [x] Added MySQL dialect branch: `if (!isSQLite)` uses `ALTER TABLE breeding_events MODIFY COLUMN event_type ENUM(...) NOT NULL`
- [x] SQLite path (table recreation) unchanged — dev/test continue to work
- [x] `down` migration also branched: MySQL shrinks ENUM back; SQLite uses table recreation

### 3E. Migration 030 (`add_multi_tenancy`) — VERIFIED, NO ACTION NEEDED
- [x] `ALTER TABLE t ALTER COLUMN col DROP DEFAULT` is valid ANSI SQL supported by MySQL 5.7+, MySQL 8.x, and MariaDB 10.x. No version issue.
- [x] Unique index names (`users_username_unique`, etc.) match Knex naming convention. Correct.

### 3F. Migrations 031, 032 — VERIFIED, NO ACTION NEEDED
- [x] Already have MySQL branches. `.alter()` usage verified correct with Knex + mysql2.

### 3G. Migration 033 (`global_defaults_and_announcements`) — VERIFIED, NO ACTION NEEDED
- [x] Conditional `.collate('utf8mb4_unicode_ci')` is correct Knex API and produces valid MySQL SQL. FK on `created_by` correctly gated behind `if (!isSQLite)`.

### 3H. Full migration test — COMPLETE ✓
- [x] Spun up MariaDB 10.11 via Docker Desktop
- [x] All 34 migrations passed (`Batch 1 run: 34 migrations`)
- [x] All 3 seed files passed (114,336 milk records, 648 health issues, 691 treatments, 214 breeding events, 5 default breed types, 9 issue types, 5 default medications)
- [x] **Fixes applied:**
  - `server/seeds/001_initial_data.js` — `PRAGMA foreign_keys` → MySQL `SET FOREIGN_KEY_CHECKS=0/1`; `PRAGMA ignore_check_constraints` guarded with `if (isSQLite)`; 2× ISO 8601 `dismissed_at` strings fixed to `YYYY-MM-DD HH:MM:SS`
  - `server/seeds/002_medications.js` — `new Date().toISOString()` → `knex.fn.now()`
  - `server/seeds/003_demo_analytics.js` — `PRAGMA ignore_check_constraints` guarded; `e.event_date.slice()` fixed for MySQL2 Date objects; added `isSQLite` flag
  - `server/migrations/012, 016, 017, 018, 019, 023, 024, 033` — `new Date().toISOString()` → `knex.fn.now()`
  - `server/migrations/030` — MySQL branch wrapped in `SET FOREIGN_KEY_CHECKS=0/1` to allow unique index drop on `milk_records`

---

## Phase 4: Seed Data for Production — COMPLETE
> Priority: HIGH — first deploy needs initial data

- [x] **4A.** Review seed files for production safety — demo seeds (001-003) truncate all tables and insert demo data. **Solution:** production knexfile now points to separate `server/seeds/production/` directory.
- [x] **4B.** Created `server/seeds/production/001_super_admin.js`:
  - Creates a single `super_admin` user with `farm_id: NULL` (no farm context needed)
  - Password from `SUPER_ADMIN_PASSWORD` env var (required, fails fast if missing)
  - Username from `SUPER_ADMIN_USERNAME` env var (optional, defaults to `super_admin`)
  - Idempotent: skips if a super_admin already exists
  - Uses `knex.fn.now()` for timestamps (MySQL-safe)
  - bcrypt cost 12 (production-grade)
- [x] **4C.** MySQL strict mode handled:
  - `knex.fn.now()` for timestamps (no ISO 8601 string issues)
  - `JSON.stringify([])` for permissions column (valid JSON)
  - `farm_id: null` allowed (migration 032 made users.farm_id nullable)
  - Fixed `farmSeedService.js` to use `trx.fn.now()` instead of `new Date().toISOString()`
- [x] **4D.** First-deploy setup documented below

### First-Deploy Workflow

1. **Create MySQL database** in cPanel (phpMyAdmin or Database Wizard)
2. **Set environment variables** (see Phase 5A for full list):
   - `NODE_ENV=production`
   - `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
   - `JWT_SECRET` (strong random string, 32+ chars)
   - `SUPER_ADMIN_PASSWORD` (for initial seed only)
   - `SUPER_ADMIN_USERNAME` (optional, defaults to `super_admin`)
3. **Run migrations:** `npx knex migrate:latest --env production`
   - This also seeds global defaults (breed types, issue types, medications) via migration 033
4. **Run production seed:** `npx knex seed:run --env production`
   - Creates the super_admin user; safe to re-run (idempotent)
5. **Start the app** — super_admin logs in (no farm code needed)
6. **Remove `SUPER_ADMIN_PASSWORD`** from cPanel env vars (no longer needed after seed)
7. **Create first farm** via super-admin panel → `POST /api/farms` atomically creates farm + farm admin + all defaults (breed types, issue types, medications, feature flags, settings)
8. **Farm admin logs in** with farm code → starts using the app

### Dev/test seeds unchanged
- `npm run seed` (dev) still uses `server/seeds/` (demo data with 30 cows, analytics, etc.)
- `npm test` (test) uses in-memory SQLite with test helpers — no seed files involved
- Only `--env production` uses `server/seeds/production/`

---

## Phase 5: Build & Deploy Checklist
> Priority: HIGH — the actual deployment steps

- [ ] **5A.** Create `.env.production.example` with all required production vars documented
- [ ] **5B.** Write deployment guide (README section or separate doc):
  1. Create MySQL database in cPanel (phpMyAdmin or Database Wizard)
  2. Set up Node.js app in cPanel (version, root, startup file)
  3. Set environment variables in cPanel Node.js app config
  4. Upload code (git clone or File Manager)
  5. Run NPM Install (cPanel button)
  6. SSH in → run `npm run build` and `npm run migrate`
  7. Start/Restart app
- [ ] **5C.** Verify PWA manifest + service worker paths work with the production domain
- [ ] **5D.** Test HTTPS + SSL (free Let's Encrypt via cPanel)
- [ ] **5E.** Verify CORS with production domain in `ALLOWED_ORIGINS`

---

## Phase 6: Production Hardening (Post-Deploy)
> Priority: MEDIUM — nice-to-have for reliability

- [ ] **6A.** Add a `/api/health` endpoint (returns 200 + DB connectivity check) for monitoring
- [ ] **6B.** Consider adding `compression` middleware for API responses
- [ ] **6C.** Set `trust proxy` on Express if behind cPanel's reverse proxy (for correct `req.ip` in rate limiting)
- [ ] **6D.** Review rate limiting — Passenger may restart workers, resetting in-memory rate limit counters. Consider if this is acceptable or if you need a persistent store.
- [ ] **6E.** Add MySQL connection pool settings to knexfile (pool min/max)

---

## Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Migration 022 fails on MySQL | Blocks deploy | High | Phase 3D — add MySQL branch |
| Migration 011 JSON functions fail | Blocks deploy | Medium | Phase 3C — test + branch |
| Passenger doesn't call app correctly | App won't start | Medium | Phase 2A — proper entry point |
| MariaDB version too old for migration 030 | Blocks deploy | Low | Phase 3E — verify version |
| `better-sqlite3` compile fails on install | npm install fails | High | Phase 1B — move to devDeps |
| ~~Seeds create insecure demo users~~ | ~~Security hole~~ | ~~Medium~~ | ~~Phase 4B~~ — MITIGATED: separate production seed directory |
| Rate limit counters reset on worker restart | Reduced protection | Low | Phase 6D — acceptable for low-traffic farm app |

---

## Execution Order

**Do first (blockers):** Phase 1 → Phase 2A → Phase 3 (with local MySQL test)
**Then:** Phase 4 → Phase 5
**After first successful deploy:** Phase 6
