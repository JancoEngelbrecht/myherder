# MT Phase 1A: Migration 030 -- Multi-Tenancy Schema

## Goal

Create migration 030 that adds multi-tenancy schema: `farms` table, `farm_id` column on all tenant-scoped tables, updated unique constraints, token versioning, CHECK constraint preservation, and indexes.

## Prerequisites

- Read `MEMORY.md` for current state (latest migration: 029)
- Read `server/migrations/022_fix_breeding_event_type_enum.js` -- reference pattern for SQLite table recreation
- This phase produces ONLY the migration file. Seed + test updates are in Phase 1B.

## Tables Scoped to Farms (13 tables)

Add `farm_id TEXT NOT NULL REFERENCES farms(id)` to these tables:

| Table                    | Notes                                 |
| ------------------------ | ------------------------------------- |
| `users`                  |                                       |
| `cows`                   |                                       |
| `medications`            |                                       |
| `treatments`             |                                       |
| `health_issues`          |                                       |
| `health_issue_comments`  |                                       |
| `milk_records`           |                                       |
| `breeding_events`        |                                       |
| `breed_types`            |                                       |
| `issue_type_definitions` |                                       |
| `feature_flags`          | Composite PK becomes `(farm_id, key)` |
| `app_settings`           | Composite PK becomes `(farm_id, key)` |
| `audit_log`              |                                       |

### Tables EXCLUDED from farm scoping

| Table                   | Reason                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `treatment_medications` | Junction table -- farm isolation enforced by parent FK on `treatments` and `medications`. Note: SQLite FK enforcement is OFF (no `afterCreate` hook in knexfile), so isolation is enforced at the application layer via JOINs through parent tables. No route or sync entity queries this table directly. Adding `farm_id` here is redundant. |
| `breeding_event_types`  | Orphaned table -- hardcoded `VALID_EVENT_TYPES` in `breedingSchemas.js` and `breedingEventTypes.js` config are used instead. No route queries this table. Consider dropping in a future cleanup phase.                                                                                                                                        |
| `sync_log`              | Operational log -- scoped by `user_id` which is already farm-scoped. Can derive farm from user if needed.                                                                                                                                                                                                                                     |

---

## Step 1.1 -- Create `farms` table

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

## Step 1.2 -- Seed default farm and backfill

**IMPORTANT:** Use a deterministic UUID for the default farm so test infrastructure can reference it as a static constant. Do NOT use `crypto.randomUUID()`.

```js
const DEFAULT_FARM_ID = '00000000-0000-4000-a000-000000000099'
```

In the migration's `up()`:

1. Create a default farm: `id = DEFAULT_FARM_ID`, `code = 'DEFAULT'`, `name` pulled from `app_settings` table where `key = 'farm_name'` (fallback: `'My Farm'`), `slug = 'default'`
2. For each scoped table: add nullable `farm_id` column, backfill with `DEFAULT_FARM_ID`, then recreate table with NOT NULL (see Step 1.3)
3. Do NOT create super-admin user in migration -- defer to Phase 3 (auth)

## Step 1.3 -- SQLite table recreation strategy

### Why this is needed

SQLite cannot `ALTER COLUMN` to add `NOT NULL` after data is backfilled. The only way is to recreate the table:

1. Create `_new` table with the desired schema (including `farm_id NOT NULL`)
2. Copy all data from old table to `_new` table
3. Drop old table
4. Rename `_new` table to original name

### CRITICAL: Disable Knex transaction wrapping

`PRAGMA foreign_keys = OFF` is silently ignored inside SQLite transactions. Knex wraps each migration in a transaction by default. The migration MUST opt out:

```js
exports.config = { transaction: false }
```

Without this, `PRAGMA foreign_keys = OFF` has no effect and table drops will fail with FK constraint errors.

### Migration structure

```js
exports.config = { transaction: false }

exports.up = async function (knex) {
  const isSQLite = knex.client.config.client === 'better-sqlite3'

  if (isSQLite) {
    // Must be outside any transaction for SQLite — PRAGMA is silently ignored inside transactions
    await knex.raw('PRAGMA foreign_keys = OFF')

    // Wrap all DDL in a manual transaction for rollback safety.
    // SQLite supports transactional DDL (CREATE/DROP/ALTER are rollback-safe within BEGIN/COMMIT).
    await knex.raw('BEGIN')
  }

  try {
    // ... all table recreation work (SQLite) or ALTER TABLE work (MySQL) ...

    if (isSQLite) {
      await knex.raw('COMMIT')
      await knex.raw('PRAGMA foreign_keys = ON')
    }
  } catch (err) {
    if (isSQLite) {
      await knex.raw('ROLLBACK')
      await knex.raw('PRAGMA foreign_keys = ON')
    }
    throw err
  }
}
```

**IMPORTANT: Use `knex.raw()`, NOT `knex.schema.raw()`.**
Migration 022 used `knex.schema.raw()` which runs inside the Knex schema builder context. For this migration we use `knex.raw()` because: (a) PRAGMA statements must execute outside any schema builder transaction; (b) with `exports.config = { transaction: false }`, `knex.raw()` executes directly against the connection. This is a deliberate divergence from migration 022.

### Risks and mitigations

**Risk: FK violations during table drops**
SQLite enforces FK constraints at runtime when enabled. Dropping a table that other tables reference will fail.

**Mitigation:** `PRAGMA foreign_keys = OFF` at the start (outside transaction). Additionally, `knexfile.js` has no `afterCreate` hook to enable FKs, so they are likely already off at runtime. But do not rely on this -- explicitly disable.

**Risk: Index and constraint loss**
When recreating a table, ALL indexes, unique constraints, CHECK constraints, and FK definitions are dropped with the old table. They must be explicitly re-declared on the `_new` table.

**Mitigation:** Each table recreation uses a complete column+constraint definition from Appendix B. Every existing index from Appendix A is re-declared after recreation.

**Risk: Large migration scope**
13 table recreations in one migration. If any step fails mid-way, the database could be left in an inconsistent state.

**Mitigation:** Since we opted out of Knex transactions (`config.transaction = false`), wrap the DDL in a manual SQLite transaction for rollback safety. SQLite supports transactional DDL (CREATE/DROP/ALTER are rollback-safe within `BEGIN`/`COMMIT`).

**Risk: PRAGMA and BEGIN on different connections**
If Knex connection pool has >1 connection, `PRAGMA foreign_keys = OFF` might execute on a different connection than `BEGIN`/DDL.

**Mitigation:** Knex's `better-sqlite3` driver defaults to pool `{ min: 1, max: 1 }` (single connection). All `knex.raw()` calls execute on the same connection. No action needed, but do NOT add custom pool settings to knexfile.

### Table recreation order

Based on the FK dependency graph, recreate in this order (leaves first):

```
Phase A -- Leaf tables (no other table references these):
  audit_log, health_issue_comments, milk_records, breeding_events, treatments

Phase B -- Mid-level tables:
  health_issues (referenced by: treatments.health_issue_id, health_issue_comments)

Phase C -- Core entity tables:
  cows (referenced by: treatments, health_issues, milk_records, breeding_events + self-ref sire/dam)

Phase D -- Root/lookup tables (referenced by many):
  users, medications, breed_types, issue_type_definitions

Phase E -- Config tables (PK changes):
  feature_flags, app_settings
```

### Helper function

Follow the proven pattern from migration 022 (raw SQL CREATE, column copy, DROP, RENAME, re-index):

```js
async function recreateWithFarmId(knex, tableName, createSql, columns) {
  const tempName = `${tableName}_new`

  // 1. Create new table with farm_id NOT NULL + all original columns
  // Use precise prefix replacement to avoid mutating FK references or column names
  await knex.raw(createSql.replace(`CREATE TABLE ${tableName}`, `CREATE TABLE ${tempName}`))

  // 2. Copy data (farm_id was already backfilled as nullable column)
  const cols = columns.join(', ')
  await knex.raw(`INSERT INTO ${tempName} (${cols}) SELECT ${cols} FROM ${tableName}`)

  // 3. Swap
  await knex.raw(`DROP TABLE ${tableName}`)
  await knex.raw(`ALTER TABLE ${tempName} RENAME TO ${tableName}`)

  // 4. Indexes are created AFTER swap (separate step per table)
}
```

**Key:** The `columns` array is the explicit column list from Appendix B (including `farm_id`). The `createSql` is the raw CREATE TABLE statement with `farm_id NOT NULL` already included — it is hand-written (not extracted from `sqlite_master`). No PRAGMA table_info needed -- we use known, verified column lists.

### IMPORTANT: Match existing nullability exactly

Appendix B schemas must match the ACTUAL column nullability. Several tables have `created_at`/`updated_at` columns that are nullable (no NOT NULL) in the current schema. Do NOT add NOT NULL to columns that don't currently have it -- the `INSERT INTO ... SELECT` copies exact values, and any existing NULLs would violate a new NOT NULL constraint, failing the migration. The affected tables are: `breeding_events`, `treatments`, `health_issues`, `medications`, `audit_log`, `app_settings`, `feature_flags`.

### IMPORTANT: Avoid duplicate FK declarations

Use ONE style for foreign key declarations — either inline `REFERENCES` or separate `FOREIGN KEY` clauses, NOT both. Appendix B uses inline `REFERENCES` consistently. Do NOT also add separate `FOREIGN KEY (col) REFERENCES table(id)` clauses for the same column — SQLite will create two redundant FK constraints.

**MySQL branch:** Skip recreation entirely. For each table:

```sql
ALTER TABLE <table> ADD COLUMN farm_id VARCHAR(36) NOT NULL DEFAULT '<DEFAULT_FARM_ID>';
ALTER TABLE <table> ALTER COLUMN farm_id DROP DEFAULT;
```

For `feature_flags` and `app_settings` (composite PK change):

```sql
ALTER TABLE feature_flags ADD COLUMN farm_id VARCHAR(36) NOT NULL DEFAULT '<DEFAULT_FARM_ID>';
ALTER TABLE feature_flags DROP PRIMARY KEY, ADD PRIMARY KEY (farm_id, `key`);
ALTER TABLE feature_flags ALTER COLUMN farm_id DROP DEFAULT;
-- Same pattern for app_settings
```

For unique constraint changes (e.g., `users`):

```sql
ALTER TABLE users DROP INDEX username;
ALTER TABLE users ADD UNIQUE INDEX (farm_id, username);
```

For ENUM expansion (`users.role` — Knex `.enu()` creates ENUM in MySQL, not CHECK):

```sql
ALTER TABLE users MODIFY COLUMN role ENUM('admin', 'worker', 'super_admin') NOT NULL DEFAULT 'worker';
```

For adding `token_version`:

```sql
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
```

## Step 1.4 -- Update unique constraints

| Table                    | Old constraint                            | New constraint                                     |
| ------------------------ | ----------------------------------------- | -------------------------------------------------- |
| `users`                  | `UNIQUE(username)`                        | `UNIQUE(farm_id, username)`                        |
| `cows`                   | `UNIQUE(tag_number)`                      | `UNIQUE(farm_id, tag_number)`                      |
| `breed_types`            | `UNIQUE(code)`                            | `UNIQUE(farm_id, code)`                            |
| `issue_type_definitions` | `UNIQUE(code)`                            | `UNIQUE(farm_id, code)`                            |
| `milk_records`           | `UNIQUE(cow_id, session, recording_date)` | `UNIQUE(farm_id, cow_id, session, recording_date)` |
| `feature_flags`          | PK `key`                                  | Composite PK `(farm_id, key)`                      |
| `app_settings`           | PK `key`                                  | Composite PK `(farm_id, key)`                      |

These constraints are applied during table recreation (Step 1.3) in the raw CREATE SQL, not as separate ALTER statements.

## Step 1.5 -- Add token versioning column

- `users`: add `token_version INTEGER NOT NULL DEFAULT 0`
- Purpose: Increment on password change / force-logout-all. JWT middleware checks `token_version` matches the value in the token payload. Stale tokens are rejected.
- Implementation of the check is deferred to Phase 3 (auth changes).

## Step 1.6 -- Extend role enum + CHECK constraint strategy

- `users.role`: add `'super_admin'` alongside existing `'admin'` and `'worker'`
- **SQLite CHECK constraint exists** on `users.role` (`CHECK (role IN ('admin', 'worker'))`). The table recreation in Appendix B expands this to include `'super_admin'`.
- Super-admin user creation deferred to Phase 3 or CLI script

Knex generated CHECK constraints on several tables via `.enu()`. During table recreation, we **preserve and update** all CHECK constraints to maintain DB-level validation. The full list:

| Table             | Column       | CHECK values                                                      |
| ----------------- | ------------ | ----------------------------------------------------------------- |
| `users`           | `role`       | `'admin', 'worker', 'super_admin'` (expanded)                     |
| `cows`            | `sex`        | `'female', 'male'` (preserved)                                    |
| `cows`            | `status`     | `'active', 'dry', 'pregnant', 'sick', 'sold', 'dead'` (preserved) |
| `health_issues`   | `severity`   | `'low', 'medium', 'high'` (preserved)                             |
| `health_issues`   | `status`     | `'open', 'treating', 'resolved'` (preserved)                      |
| `milk_records`    | `session`    | `'morning', 'afternoon', 'evening'` (preserved)                   |
| `breeding_events` | `event_type` | (already in Appendix B -- preserved)                              |

## Step 1.7 -- Add indexes

New `farm_id` indexes (created after table recreation):

```js
// farm_id index on every tenant-scoped table
const tables = [
  'users',
  'cows',
  'medications',
  'treatments',
  'health_issues',
  'health_issue_comments',
  'milk_records',
  'breeding_events',
  'breed_types',
  'issue_type_definitions',
  'audit_log',
]

for (const table of tables) {
  await knex.raw(`CREATE INDEX idx_${table}_farm_id ON ${table}(farm_id)`)
}

// Compound indexes for common query patterns
await knex.raw('CREATE INDEX idx_cows_farm_status ON cows(farm_id, status)')
await knex.raw('CREATE INDEX idx_milk_records_farm_date ON milk_records(farm_id, recording_date)')
await knex.raw('CREATE INDEX idx_breeding_events_farm_date ON breeding_events(farm_id, event_date)')
await knex.raw(
  'CREATE INDEX idx_health_issues_farm_observed ON health_issues(farm_id, observed_at)'
)
await knex.raw('CREATE INDEX idx_treatments_farm_date ON treatments(farm_id, treatment_date)')
```

Note: `feature_flags` and `app_settings` don't need separate indexes -- `farm_id` is part of their composite PK.

All EXISTING indexes (from Appendix A) are also re-created after each table's recreation step. Use raw `CREATE INDEX` to ensure exact name preservation.

## Step 1.8 -- Rollback (`down()`)

Migration `down()` must:

1. `exports.config = { transaction: false }` (shared with `up`)
2. Safety check — refuse if multiple farms exist
3. SQLite branch: `PRAGMA foreign_keys = OFF`, `BEGIN`, recreate all 13 tables WITHOUT `farm_id`, `COMMIT`, `PRAGMA foreign_keys = ON`
4. MySQL branch: `ALTER TABLE DROP COLUMN farm_id` for each table, restore original PKs and UNIQUE constraints, revert ENUM
5. Drop `farms` table
6. Drop `token_version` column from `users` (via table recreation in SQLite, ALTER TABLE in MySQL)
7. Restore original unique constraints, PKs, and CHECK constraints (including reverting `users.role` CHECK/ENUM to `('admin', 'worker')` without `super_admin`)

**Safety check:** Guard against data loss if multiple farms exist:

```js
const farmCount = await knex('farms').count('* as c').first()
if (farmCount.c > 1) {
  throw new Error('Cannot rollback: multiple farms exist. Data would be lost.')
}
```

**Dedup guard for lookup tables:** When restoring `UNIQUE(code)` on `breed_types` and `issue_type_definitions`, only keep rows from the default farm to avoid duplicate `code` violations:

```js
// Before recreating breed_types without farm_id:
await knex('breed_types').whereNot('farm_id', DEFAULT_FARM_ID).del()
```

**Why other UNIQUE tables don't need dedup:** The farm count guard (above) ensures only 1 farm exists. Within a single farm, the farm-scoped constraint `UNIQUE(farm_id, X)` already prevents duplicate `X` values. So restoring `UNIQUE(X)` alone cannot have duplicates. The breed_types/issue_type_definitions guard is belt-and-suspenders for manually inserted data.

---

## Deferred to Later Phases

| Item                                                          | Deferred to                  | Reason                                                                                            |
| ------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------- |
| 2FA columns (`totp_secret`, `totp_enabled`, `recovery_codes`) | Phase 3 (Auth)               | No code uses them until auth changes are implemented. Avoids empty columns sitting in the schema. |
| Super-admin user creation                                     | Phase 3 (Auth) or CLI script | Requires auth flow changes first.                                                                 |
| `breeding_event_types` table scoping or cleanup               | Future cleanup               | Table is orphaned -- not queried by any route. Decide whether to drop it or start using it.       |

---

## Interim State Warning

Between Phase 1A (migration) and Phase 2 (middleware), the database schema is multi-tenant but the application queries are NOT farm-scoped. This means:

- Feature flag and app settings changes apply to ALL farms (there's only one farm at this point, so it's safe)
- No second farm should be created until Phase 2 middleware is complete
- Route files still query without `WHERE farm_id = ?` -- this is intentional and fixed in Phase 2

**Rule:** Do NOT create a second farm until Phase 2A middleware is fully deployed.

---

## Gap Analysis & Breaking Risk Assessment

### HIGH RISK -- Will break the app if not handled

| #   | Gap                                                | Impact                                                                                                                                                                                                                                   | Mitigation                                                                                         |
| --- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | **Existing indexes lost on recreation**            | ~35 indexes across migrations 003, 008, 010, 015, 022, 025, 026, 027, 028 on tables: `cows`, `health_issues`, `health_issue_comments`, `breeding_events`, `milk_records`, `treatments`, `audit_log`. Table recreation drops ALL indexes. | Re-declare every existing index after each table recreation. See full index catalog in Appendix A. |
| 2   | **`cows` self-referential FKs**                    | `cows.sire_id` and `cows.dam_id` reference `cows.id`. During recreation, the new table doesn't exist yet when FKs are declared.                                                                                                          | Not a runtime risk -- FK enforcement is OFF. Still declare FKs in schema for documentation/MySQL.  |
| 3   | **`health_issue_comments` CASCADE**                | Has `ON DELETE CASCADE` for both `health_issues` and `users`. If FKs were enforced, dropping `health_issues` first would cascade-delete comments.                                                                                        | Not a runtime risk because FK enforcement is OFF. Follow dependency order anyway.                  |
| 4   | **PRAGMA inside transaction is silently ignored**  | Knex wraps migrations in transactions by default. `PRAGMA foreign_keys = OFF` inside a transaction has no effect in SQLite -- the change is silently discarded. Table drops will fail with FK errors.                                    | Export `exports.config = { transaction: false }` from migration 030 (Step 1.3).                    |
| 5   | **`breeding_events` CHECK constraint**             | Migration 022 recreated the table with `CHECK (event_type IN ('heat_observed', ...))`. Table recreation must preserve this or DB-level event type validation breaks.                                                                     | Include CHECK in the raw CREATE SQL for `breeding_events`. See Appendix B.                         |
| 6   | **CHECK constraints on 5 other tables**            | `users.role`, `cows.sex`, `cows.status`, `health_issues.severity`, `health_issues.status`, `milk_records.session` all have CHECK constraints from Knex `.enu()`. If not included in recreation SQL, they are silently dropped.           | Include all CHECKs in Appendix B. Expand `users.role` to include `super_admin`. See Step 1.6.      |
| 7   | **`created_at`/`updated_at` nullability mismatch** | 5 tables (`breeding_events`, `treatments`, `health_issues`, `medications`, `audit_log`) have nullable timestamps in the actual schema. If Appendix B adds NOT NULL, `INSERT INTO ... SELECT` will fail on any NULL values.               | Appendix B must match actual nullability exactly. See note after Step 1.3.                         |

### MEDIUM RISK -- Degraded behavior if not handled

| #   | Gap                                                   | Impact                                                                                                                                                                                           | Mitigation                                                                                                                    |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| 8   | **`cows.breed_type_id` has no FK constraint**         | Migration 018 added this column without `.references()`.                                                                                                                                         | Add the FK constraint during recreation. Low risk since existing data has valid values or NULL. FK enforcement is off anyway. |
| 9   | **Missing `ON DELETE` rules on most FKs**             | Only `health_issue_comments` has CASCADE. Deleting a user orphans treatments, milk_records, etc.                                                                                                 | Out of scope. Document as tech debt for farm deletion strategy.                                                               |
| 10  | **MySQL composite PK for feature_flags/app_settings** | Standard `ALTER TABLE ADD COLUMN` works for most tables, but changing PRIMARY KEY structure requires `DROP PRIMARY KEY, ADD PRIMARY KEY (farm_id, key)`.                                         | MySQL branch must handle PK changes explicitly (see Step 1.3 MySQL section).                                                  |
| 11  | **`recreateWithFarmId` helper string replacement**    | Naive `createSql.replace(tableName, tempName)` could mutate FK references in self-referencing tables (e.g., `cows`).                                                                             | Use precise prefix: `createSql.replace('CREATE TABLE ' + tableName, 'CREATE TABLE ' + tempName)`.                             |
| 12  | **Duplicate `event_date` index on `breeding_events`** | DB has both `breeding_events_event_date_index` and `idx_breeding_events_event_date` -- exact duplicates.                                                                                         | Pick one canonical name and only create that one.                                                                             |
| 13  | **Lost indexes from migration 022**                   | `breeding_events_expected_calving_index` and `breeding_events_expected_next_heat_index` were created by migration 015 but lost when 022 recreated the table. They don't exist in the current DB. | Restore them during this migration (noted in Appendix A).                                                                     |

### LOW RISK -- Cosmetic or future concern

| #   | Gap                                        | Impact                                                                                                                            | Mitigation                                                      |
| --- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 14  | **Duplicate migration 026 filenames**      | Two files: `026_add_missing_indexes.js` and `026_add_users_deleted_at.js`. Knex runs both (sorted alphabetically), but confusing. | Not a blocker. Document in MEMORY.md.                           |
| 15  | **UUID generation inconsistency**          | Migrations use `crypto.randomUUID()`, seeds use `uuid.v4()`.                                                                      | Standardize on `crypto.randomUUID()`.                           |
| 16  | **SQLite foreign keys are NOT enforced**   | `knexfile.js` has no `afterCreate` hook. All FK constraints are schema-only.                                                      | Good news for migration safety. Document as separate tech debt. |
| 17  | **Migration 022 is the reference pattern** | Already does SQLite table recreation successfully.                                                                                | Use as template -- DO NOT invent a new approach.                |

---

## Verification Checklist (Phase 1A)

After implementing the migration, run these checks:

1. **Migration runs on fresh DB:** Delete `dev.sqlite3`, run `npm run migrate` -- creates all tables including `farms` with default farm
2. **Migration runs on existing DB:** Restore `dev.sqlite3` backup, run `npm run migrate` -- backfills all existing data with `farm_id`
3. **Rollback works:** `npm run migrate:rollback` then `npm run migrate`
4. **No null farm_id values:**
   ```bash
   node -e "const db = require('./server/config/database'); Promise.all(['cows','users','medications','treatments','health_issues','health_issue_comments','milk_records','breeding_events','breed_types','issue_type_definitions','feature_flags','app_settings','audit_log'].map(t => db(t).whereNull('farm_id').count('* as c').first().then(r => ({t, c: r.c})))).then(r => { r.forEach(x => console.log(x.t, x.c)); db.destroy() })"
   ```
   All counts must be 0.
5. **Default farm exists:**
   ```bash
   node -e "const db = require('./server/config/database'); db('farms').select('*').then(r => console.log(r)).then(() => db.destroy())"
   ```
6. **Indexes preserved:** Verify key indexes exist:
   ```bash
   node -e "const db = require('./server/config/database'); db.raw(\"SELECT name FROM sqlite_master WHERE type='index'\").then(r => console.log(r.map(i=>i.name).sort().join('\\n'))).then(() => db.destroy())"
   ```
7. **CHECK constraints preserved:** Verify all CHECK constraints survived recreation:
   ```bash
   node -e "const db = require('./server/config/database'); const checks = ['breeding_events','users','cows','health_issues','milk_records']; Promise.all(checks.map(t => db.raw(\"SELECT sql FROM sqlite_master WHERE name='\" + t + \"'\").then(r => ({t, has_check: r[0].sql.includes('CHECK')})))).then(r => { r.forEach(x => console.log(x.t, x.has_check ? 'OK' : 'MISSING CHECK!')); db.destroy() })"
   ```
   All tables must show `OK`. Additionally verify `users` includes `super_admin`:
   ```bash
   node -e "const db = require('./server/config/database'); db.raw(\"SELECT sql FROM sqlite_master WHERE name='users'\").then(r => { const sql = r[0].sql; console.log(sql.includes('super_admin') ? 'OK: super_admin in CHECK' : 'MISSING: super_admin not in CHECK'); db.destroy() })"
   ```

## Important Notes

- Do NOT modify any route files, middleware, or frontend code in this phase. Only the migration file.
- Do NOT update seed or test files in this phase -- that is Phase 1B.
- The `feature_flags` and `app_settings` tables have string PKs (`key`). Converting to composite PK `(farm_id, key)` requires table recreation in SQLite.
- Use `DEFAULT_FARM_ID = '00000000-0000-4000-a000-000000000099'` everywhere.
- For MySQL (production), standard `ALTER TABLE` works without table recreation. Branch on `knex.client.config.client`.
- `useNullAsDefault: true` in knexfile does NOT bypass `NOT NULL` constraints -- SQLite enforces NOT NULL at the engine level even when Knex sends NULL. Every insert must explicitly include `farm_id`.

---

## Appendix A: Full Index Catalog

Every index that must be re-created after table recreation. Use raw `CREATE INDEX` with exact names.

### `cows`

```sql
CREATE INDEX cows_sire_id_index ON cows(sire_id);
CREATE INDEX cows_dam_id_index ON cows(dam_id);
CREATE INDEX cows_status_index ON cows(status);
CREATE INDEX cows_created_by_index ON cows(created_by);
CREATE INDEX cows_deleted_at_index ON cows(deleted_at);
CREATE INDEX idx_cows_updated_at ON cows(updated_at);
-- UNIQUE on tag_number is now (farm_id, tag_number) -- declared in CREATE TABLE
```

### `health_issues`

```sql
CREATE INDEX health_issues_cow_id_index ON health_issues(cow_id);
CREATE INDEX health_issues_status_index ON health_issues(status);
CREATE INDEX health_issues_observed_at_index ON health_issues(observed_at);
CREATE INDEX idx_health_issues_updated_at ON health_issues(updated_at);
```

### `health_issue_comments`

```sql
CREATE INDEX health_issue_comments_health_issue_id_index ON health_issue_comments(health_issue_id);
-- NO updated_at index exists on this table (migration 028 did not include it)
```

### `breeding_events`

```sql
CREATE INDEX breeding_events_cow_id_index ON breeding_events(cow_id);
CREATE INDEX breeding_events_event_type_index ON breeding_events(event_type);
CREATE INDEX breeding_events_event_date_index ON breeding_events(event_date);
-- NOTE: idx_breeding_events_event_date is a duplicate of the above -- DROP, keep one canonical name
-- NOTE: breeding_events_expected_calving_index and breeding_events_expected_next_heat_index were
-- created by migration 015 but LOST when migration 022 recreated the table. They do NOT exist in
-- the current DB. We restore them here as they cover common query patterns.
CREATE INDEX breeding_events_expected_calving_index ON breeding_events(expected_calving);
CREATE INDEX breeding_events_expected_next_heat_index ON breeding_events(expected_next_heat);
CREATE INDEX idx_breeding_events_expected_preg_check ON breeding_events(expected_preg_check);
CREATE INDEX idx_breeding_events_expected_dry_off ON breeding_events(expected_dry_off);
CREATE INDEX idx_breeding_events_dismissed_at ON breeding_events(dismissed_at);
CREATE INDEX idx_breeding_events_updated_at ON breeding_events(updated_at);
```

### `milk_records`

```sql
CREATE INDEX idx_milk_records_recording_date ON milk_records(recording_date);
CREATE INDEX idx_milk_records_milk_discarded ON milk_records(milk_discarded);
CREATE INDEX idx_milk_records_updated_at ON milk_records(updated_at);
-- UNIQUE on (cow_id, session, recording_date) is now (farm_id, cow_id, session, recording_date) -- declared in CREATE TABLE
```

### `treatments`

```sql
CREATE INDEX idx_treatments_cow_withdrawal ON treatments(cow_id, withdrawal_end_milk);
CREATE INDEX idx_treatments_treatment_date ON treatments(treatment_date);
CREATE INDEX idx_treatments_updated_at ON treatments(updated_at);
```

### `audit_log`

```sql
CREATE INDEX audit_log_entity_type_entity_id_index ON audit_log(entity_type, entity_id);
CREATE INDEX audit_log_created_at_index ON audit_log(created_at);
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
```

### `breed_types`

```sql
CREATE INDEX idx_breed_types_updated_at ON breed_types(updated_at);
-- UNIQUE on code is now (farm_id, code) -- declared in CREATE TABLE
```

### `issue_type_definitions`

```sql
CREATE INDEX idx_issue_type_definitions_updated_at ON issue_type_definitions(updated_at);
-- UNIQUE on code is now (farm_id, code) -- declared in CREATE TABLE
```

### `medications`

```sql
CREATE INDEX idx_medications_updated_at ON medications(updated_at);
```

### `users`

```sql
-- NOTE: idx_users_updated_at does NOT exist in the current DB (migration 028 skipped users).
-- We add it here as a NEW index since sync pull queries users by updated_at.
CREATE INDEX idx_users_updated_at ON users(updated_at);
-- UNIQUE on username is now (farm_id, username) -- declared in CREATE TABLE
```

### Tables NOT being recreated (no action needed)

- `sync_log`: indexes on `synced_at`, `user_id`, `updated_at` -- not farm-scoped, untouched
- `treatment_medications`: no custom indexes -- not farm-scoped, untouched

---

## Appendix B: Full Column Schemas

Verified column lists for every table being recreated. These are the ground-truth schemas AFTER all 29 migrations. The `farm_id` column shown is the NEW column being added.

### `users` (14 existing + 2 new columns)

```sql
CREATE TABLE users (
  id char(36) PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  username varchar(255) NOT NULL,
  pin_hash varchar(255),
  password_hash varchar(255),
  full_name varchar(255) NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'worker', 'super_admin')) DEFAULT 'worker',
  permissions json DEFAULT '[]',
  language varchar(255) DEFAULT 'en',
  is_active boolean DEFAULT '1',
  failed_attempts integer DEFAULT '0',
  locked_until datetime,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at datetime NULL DEFAULT NULL,
  token_version INTEGER NOT NULL DEFAULT 0,
  UNIQUE(farm_id, username)
);
```

### `cows` (20 existing + 1 new column)

```sql
CREATE TABLE cows (
  id char(36) PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  tag_number varchar(255) NOT NULL,
  name varchar(255),
  dob date,
  breed varchar(255),
  sex text NOT NULL CHECK (sex IN ('female', 'male')) DEFAULT 'female',
  status text NOT NULL CHECK (status IN ('active', 'dry', 'pregnant', 'sick', 'sold', 'dead')) DEFAULT 'active',
  sire_id char(36) REFERENCES cows(id),
  dam_id char(36) REFERENCES cows(id),
  notes text,
  created_by char(36) REFERENCES users(id),
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at datetime,
  breed_type_id varchar(36) NULL REFERENCES breed_types(id),
  is_external boolean NOT NULL DEFAULT '0',
  purpose varchar(30) NULL,
  life_phase_override varchar(30) NULL,
  is_dry boolean NOT NULL DEFAULT '0',
  status_changed_at datetime NULL,
  UNIQUE(farm_id, tag_number)
);
```

### `medications` (13 existing + 1 new column)

```sql
CREATE TABLE medications (
  id varchar(36) PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  name varchar(100) NOT NULL,
  active_ingredient varchar(100),
  withdrawal_milk_hours integer NOT NULL DEFAULT '0',
  withdrawal_meat_days integer NOT NULL DEFAULT '0',
  default_dosage varchar(100),
  unit varchar(20),
  notes text,
  is_active boolean NOT NULL DEFAULT '1',
  created_at datetime DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime DEFAULT CURRENT_TIMESTAMP,
  withdrawal_milk_days integer NOT NULL DEFAULT '0',
  withdrawal_meat_hours integer NOT NULL DEFAULT '0'
);
```

Note: `withdrawal_milk_days` and `withdrawal_meat_hours` appear after `updated_at` because they were added by a later migration. Column order must match the actual schema for `INSERT INTO ... SELECT` to work correctly when using `SELECT *` (though we use explicit column lists, matching order avoids confusion).

### `treatments` (16 existing + 1 new column)

```sql
CREATE TABLE treatments (
  id varchar(36) PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  cow_id varchar(36) NOT NULL REFERENCES cows(id),
  medication_id varchar(36) NOT NULL REFERENCES medications(id),
  administered_by varchar(36) NOT NULL REFERENCES users(id),
  dosage varchar(50),
  cost float,
  treatment_date datetime NOT NULL,
  withdrawal_end_milk datetime,
  withdrawal_end_meat datetime,
  is_vet_visit boolean NOT NULL DEFAULT '0',
  vet_name varchar(100),
  notes text,
  created_at datetime DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime DEFAULT CURRENT_TIMESTAMP,
  synced_at datetime NULL,
  health_issue_id varchar(36) NULL REFERENCES health_issues(id)
);
```

Note: `health_issue_id` appears after `synced_at` and `cost` is `float` (not DECIMAL) -- matching actual schema from migrations. Inline `REFERENCES` only (no separate `FOREIGN KEY` clauses — avoids redundant FK constraints).

### `health_issues` (13 existing + 1 new column)

Note: `issue_types` is TEXT (JSON array), NOT the old `issue_type` enum (dropped in migration 011).

```sql
CREATE TABLE health_issues (
  id varchar(36) PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  cow_id varchar(36) NOT NULL REFERENCES cows(id),
  reported_by varchar(36) NOT NULL REFERENCES users(id),
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high')) DEFAULT 'medium',
  affected_teats json NULL,
  description text,
  observed_at datetime NOT NULL,
  status text NOT NULL CHECK (status IN ('open', 'treating', 'resolved')) DEFAULT 'open',
  resolved_at datetime NULL,
  created_at datetime DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime DEFAULT CURRENT_TIMESTAMP,
  synced_at datetime NULL,
  issue_types text NULL
);
```

Note: `issue_types` appears after `synced_at` (added by later migration). `created_at`/`updated_at` are nullable -- matching actual schema. Inline `REFERENCES` only (no separate `FOREIGN KEY` clauses).

### `health_issue_comments` (6 existing + 1 new column)

```sql
CREATE TABLE health_issue_comments (
  id char(36) PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  health_issue_id char(36) NOT NULL REFERENCES health_issues(id) ON DELETE CASCADE,
  user_id char(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment text NOT NULL,
  created_at datetime NOT NULL,
  updated_at datetime NOT NULL
);
```

### `milk_records` (13 existing + 1 new column)

```sql
CREATE TABLE milk_records (
  id varchar(36) PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  cow_id varchar(36) NOT NULL REFERENCES cows(id),
  recorded_by varchar(36) NOT NULL REFERENCES users(id),
  session text NOT NULL CHECK (session IN ('morning', 'afternoon', 'evening')),
  litres float NOT NULL,
  recording_date date NOT NULL,
  milk_discarded boolean NOT NULL DEFAULT '0',
  discard_reason varchar(255) NULL,
  notes text NULL,
  created_at datetime DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime DEFAULT CURRENT_TIMESTAMP,
  synced_at datetime NULL,
  session_time varchar(5) NULL,
  UNIQUE(farm_id, cow_id, session, recording_date)
);
```

Note: `session_time` appears after `synced_at` (added by later migration). `litres` is `float` (not DECIMAL). `created_at`/`updated_at` are nullable. Inline `REFERENCES` only (no separate `FOREIGN KEY` clauses).

### `breeding_events` (22 existing + 1 new column)

```sql
CREATE TABLE breeding_events (
  id VARCHAR(36) PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  cow_id VARCHAR(36) NOT NULL REFERENCES cows(id),
  event_type VARCHAR(255) NOT NULL CHECK (event_type IN (
    'heat_observed', 'ai_insemination', 'bull_service',
    'preg_check_positive', 'preg_check_negative',
    'calving', 'abortion', 'dry_off'
  )),
  event_date TIMESTAMP NOT NULL,
  sire_id VARCHAR(36) REFERENCES cows(id),
  semen_id VARCHAR(255),
  inseminator VARCHAR(255),
  heat_signs TEXT,
  preg_check_method VARCHAR(255),
  calving_details TEXT,
  cost DECIMAL(10,2),
  expected_next_heat DATE,
  expected_preg_check DATE,
  expected_calving DATE,
  expected_dry_off DATE,
  notes TEXT,
  recorded_by VARCHAR(36) REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  synced_at TIMESTAMP,
  dismissed_at TIMESTAMP,
  dismissed_by VARCHAR(36) REFERENCES users(id),
  dismiss_reason VARCHAR(500)
);
```

Note: `created_at`/`updated_at` are nullable (no NOT NULL) -- matching actual schema from migration 022.

### `breed_types` (15 existing + 1 new column)

```sql
CREATE TABLE breed_types (
  id varchar(36) PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  code varchar(50) NOT NULL,
  name varchar(100) NOT NULL,
  heat_cycle_days integer NOT NULL DEFAULT '21',
  gestation_days integer NOT NULL DEFAULT '283',
  preg_check_days integer NOT NULL DEFAULT '35',
  voluntary_waiting_days integer NOT NULL DEFAULT '45',
  dry_off_days integer NOT NULL DEFAULT '60',
  calf_max_months integer NOT NULL DEFAULT '6',
  heifer_min_months integer NOT NULL DEFAULT '15',
  young_bull_min_months integer NOT NULL DEFAULT '15',
  is_active boolean NOT NULL DEFAULT '1',
  sort_order integer NOT NULL DEFAULT '0',
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(farm_id, code)
);
```

### `issue_type_definitions` (9 existing + 1 new column)

```sql
CREATE TABLE issue_type_definitions (
  id char(36) PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  code varchar(50) NOT NULL,
  name varchar(100) NOT NULL,
  emoji varchar(10) NOT NULL DEFAULT '?',
  requires_teat_selection boolean NOT NULL DEFAULT '0',
  is_active boolean NOT NULL DEFAULT '1',
  sort_order integer NOT NULL DEFAULT '0',
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(farm_id, code)
);
```

### `feature_flags` (3 existing + 1 new column, PK change)

```sql
CREATE TABLE feature_flags (
  farm_id TEXT NOT NULL REFERENCES farms(id),
  key varchar(50) NOT NULL,
  enabled boolean NOT NULL DEFAULT '1',
  updated_at datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (farm_id, key)
);
```

Note: `updated_at` is nullable (no NOT NULL) -- matching actual schema. `enabled` default `'1'` matches actual (not `true`).

### `app_settings` (3 existing + 1 new column, PK change)

```sql
CREATE TABLE app_settings (
  farm_id TEXT NOT NULL REFERENCES farms(id),
  key VARCHAR(50) NOT NULL,
  value TEXT,
  updated_at datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (farm_id, key)
);
```

Note: `updated_at` is nullable (no NOT NULL) -- matching actual schema. Uses `datetime` (not `TIMESTAMP`) for consistency with actual.

### `audit_log` (7 existing + 1 new column)

```sql
CREATE TABLE audit_log (
  id varchar(36) PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  user_id varchar(36) REFERENCES users(id),
  action varchar(50) NOT NULL,
  entity_type varchar(50),
  entity_id varchar(36),
  old_values text,
  new_values text,
  created_at datetime DEFAULT CURRENT_TIMESTAMP
);
```

Note: `created_at` is nullable -- matching actual schema. Inline `REFERENCES` only (no separate `FOREIGN KEY` clause).
