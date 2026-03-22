# Multi-Tenancy Master Plan

## Overview

Transform MyHerder from single-tenant to multi-tenant SaaS. Multiple farms share one MySQL database on cPanel, isolated by `farm_id` on every tenant-scoped table. A super-admin role with TOTP 2FA provides cross-farm management.

## Architecture Decisions

- **Single database** with `farm_id` column on all tenant-scoped tables
- **Single domain** -- no subdomains. Farm code field on login screen, remembered per device
- **Super-admin** logs in without farm code, gets 2FA prompt. Has `farm_id = null` in JWT
- **Farm admin/worker** logs in with farm code + credentials. JWT contains `farm_id`
- **TOTP 2FA** for super-admin only (`otpauth` npm package)
- **Token versioning** for instant session revocation
- **Manual farm_id scoping** via `.where('farm_id', req.farmId)` in all routes (consistent, no abstraction needed)
- **One device = one farm** -- no multi-farm device switching needed

## Dependencies

| Package   | Purpose                                         |
| --------- | ----------------------------------------------- |
| `otpauth` | TOTP 2FA generation and verification (server)   |
| `qrcode`  | QR code rendering for 2FA setup page (frontend) |

## Implementation Order

Each phase is a standalone sub-plan, completable in a single conversation. Phases are sequential -- each depends on the previous.

| Phase | Sub-Plan                                                       | Description                                                                                        | Migration |
| ----- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------- |
| 1     | [mt-phase-1-db.md](mt-phase-1-db.md)                           | Database foundation (index)                                                                        | 030       |
| 1A    | [mt-phase-1a-migration.md](mt-phase-1a-migration.md)           | Migration 030 -- farms table, farm_id columns, table recreations, indexes, CHECK constraints       | 030       |
| 1B    | [mt-phase-1b-seed-tests.md](mt-phase-1b-seed-tests.md)         | Seed file + test infrastructure -- farm_id in all inserts, updated tokens                          | --        |
| 2A    | [mt-phase-2a-middleware.md](mt-phase-2a-middleware.md)         | Tenant middleware + core CRUD routes (cows, milk, health, treatments, breeding)                    | --        |
| 2B    | [mt-phase-2b-reference.md](mt-phase-2b-reference.md)           | Reference data routes (medications, issueTypes, breedTypes, users, settings, flags, audit, export) | --        |
| 2C    | [mt-phase-2c-analytics.md](mt-phase-2c-analytics.md)           | Analytics routes (6 files, ~60 query locations)                                                    | --        |
| 2D    | [mt-phase-2d-services.md](mt-phase-2d-services.md)             | Reports + services + helpers (syncService, auditService, breedingCalc)                             | --        |
| 3     | [mt-phase-3-auth.md](mt-phase-3-auth.md)                       | Auth changes -- farm code login, 2FA, token versioning                                             | --        |
| 4     | [mt-phase-4-isolation-tests.md](mt-phase-4-isolation-tests.md) | Cross-tenant isolation tests (verify before building more UI)                                      | --        |
| 5     | [mt-phase-5-sessions.md](mt-phase-5-sessions.md)               | Session management -- token revocation UI                                                          | --        |
| 6     | [mt-phase-6-indexeddb.md](mt-phase-6-indexeddb.md)             | Frontend IndexedDB isolation (farm-scoped DB name)                                                 | --        |
| 7     | [mt-phase-7-super-admin.md](mt-phase-7-super-admin.md)         | Super-admin panel -- farm CRUD, enter/exit farm, management views                                  | --        |
| 8     | [mt-phase-8-deploy.md](mt-phase-8-deploy.md)                   | Production migration path -- zero-downtime strategy, rollback, verification                        | --        |

## Quality Gate (run after EVERY sub-phase)

### A. Correctness

1. **Tests**: All backend + frontend tests pass
2. **Lint**: `npm run lint:fix` -- zero new errors
3. **i18n**: Every new string in both `en.json` and `af.json`
4. **Isolation check**: No code path can return another farm's data

### B. Code Quality

5. **Dead code**: `npm run knip` -- no new unused exports
6. **Refactor review**: No duplication, no >40-line functions, clear naming, consistent patterns
7. **DRY check**: `.where('farm_id', req.farmId)` used consistently across all routes

### C. Efficiency

8. **Query efficiency**: No N+1, no redundant queries, indexes cover common patterns
9. **Bundle check**: `npm run build` -- no unexpected size increase
10. **Simplicity**: Minimum complexity for current requirements

### D. Security

11. **Tenant isolation audit**: Every SELECT/INSERT/UPDATE/DELETE scoped by `farm_id`
12. **Auth check**: No endpoint accessible without proper auth + tenant scope
13. **Input validation**: All inputs validated with Joi

### E. Surprise Check

14. **Stop and notify** if anything unexpected is discovered

## File Impact Summary

### New files

| File                                         | Phase | Purpose                                                |
| -------------------------------------------- | ----- | ------------------------------------------------------ |
| `server/migrations/030_add_multi_tenancy.js` | 1     | DB schema changes, data backfill                       |
| `server/middleware/tenantScope.js`           | 2A    | Tenant scoping middleware (sets `req.farmId` from JWT) |
| `server/routes/farms.js`                     | 7     | Farm CRUD API (super-admin)                            |
| `server/services/farmSeedService.js`         | 7     | Farm default data seeding                              |
| `client/src/views/TwoFactorVerifyView.vue`   | 3     | 2FA code entry                                         |
| `client/src/views/TwoFactorSetupView.vue`    | 3     | 2FA QR code setup                                      |
| `client/src/views/super/FarmListView.vue`    | 7     | Farm list (super-admin)                                |
| `client/src/views/super/FarmDetailView.vue`  | 7     | Farm detail (super-admin)                              |
| `client/src/views/super/CreateFarmView.vue`  | 7     | Create farm form                                       |
| `server/tests/tenantIsolation.test.js`       | 4     | Cross-tenant isolation tests                           |

### Major modifications (all phases)

- All 26 route files -- `.where('farm_id', req.farmId)` + `farm_id` inserts
- All 6 analytics files -- farm-scoped queries
- All 3 report files -- farm-scoped queries
- `server/services/syncService.js` -- accept `farmId` param
- `server/services/auditService.js` -- `farm_id` in inserts
- `server/helpers/breedingCalc.js` -- scope breed lookup
- `client/src/stores/auth.js` -- farm code, 2FA, logout cleanup
- `client/src/views/LoginView.vue` -- farm code field, 2FA redirect
- `client/src/db/indexedDB.js` -- farm-scoped DB name
- `client/src/router/index.js` -- super-admin routes
