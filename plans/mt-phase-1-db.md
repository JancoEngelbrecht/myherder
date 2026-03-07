# MT Phase 1: Database Foundation

Phase 1 adds multi-tenancy schema to the database. Split into two sub-phases:

| Sub-phase | File | Scope | Produces |
|-----------|------|-------|----------|
| **1A** | [mt-phase-1a-migration.md](mt-phase-1a-migration.md) | Migration 030 -- farms table, farm_id columns, table recreations, indexes, CHECK constraints, rollback | `server/migrations/030_add_multi_tenancy.js` |
| **1B** | [mt-phase-1b-seed-tests.md](mt-phase-1b-seed-tests.md) | Seed file + test infrastructure -- farm_id in all inserts, updated tokens | `server/seeds/001_initial_data.js`, `server/tests/helpers/*`, 26 test files |

**Order:** 1A then 1B (1B depends on 1A's schema being in place).

**Shared constant:** `DEFAULT_FARM_ID = '00000000-0000-4000-a000-000000000099'`

**Rule:** Do NOT modify any route files, middleware, or frontend code in Phase 1. Only migration + seed + test setup.

**Rule:** Do NOT create a second farm until Phase 2A middleware is fully deployed.

## Combined Verification (after both sub-phases)

1. Fresh DB: `rm dev.sqlite3 && npm run migrate && npm run seed` -- no errors
2. Existing DB: restore backup, `npm run migrate` -- backfills farm_id
3. Rollback: `npm run migrate:rollback && npm run migrate` -- clean round-trip
4. All farm_id values non-null across 13 tables
5. All indexes preserved (compare against Appendix A in 1A)
6. All CHECK constraints preserved (users includes super_admin)
7. `npm test` -- 451 backend tests green
8. `cd client && npm run test:run` -- 608 frontend tests green
9. `npm run lint:fix` -- zero new errors
10. `npm run dev` -- app loads, login works, browse cows
