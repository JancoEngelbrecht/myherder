---
name: knex-patterns
description: Knex.js migration, schema, and query patterns with dialect-specific gotchas. Covers SQLite (better-sqlite3) and MySQL2. Load when writing migrations, schema changes, or debugging Knex behavior. Source - official Knex docs (knexjs.org), better-sqlite3 docs (github.com/WiseLibs/better-sqlite3).
---

# Knex Patterns (SQLite + MySQL)

Official documentation references:
- Knex migrations: https://knexjs.org/guide/migrations.html
- Knex schema builder: https://knexjs.org/guide/schema-builder.html
- Knex configuration: https://knexjs.org/guide/#configuration-options
- better-sqlite3 API: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md

---

## 1. Migration Transaction Control

### Default behavior
Each migration runs inside a transaction by default.

### Per-migration opt-out
```js
exports.config = { transaction: false };
```
This disables Knex's transaction wrapping for this specific migration.

### Global opt-out
```js
// knexfile.js
migrations: { disableTransactions: true }
```

### When to opt out
**Always opt out for SQLite migrations that:**
- Use `PRAGMA` statements (silently ignored inside transactions)
- Drop columns (`.dropColumn()` uses table recreation internally)
- Change constraints, PKs, or column types
- Do any DDL that Knex emulates via temp table recreation

> **Official warning:** "Disabling / enabling foreign key checking has no effect within a transaction on sqlite3, so features such as `.dropColumn()` cannot be emulated correctly inside of a migration-level transaction (and can even cause data loss)."

---

## 2. SQLite Table Recreation

### Why it's needed
SQLite cannot:
- `ALTER COLUMN` (change type, nullability, default)
- `DROP COLUMN` (Knex emulates via recreation)
- Add/remove `NOT NULL` after creation
- Change `UNIQUE` or `CHECK` constraints
- Change primary key structure

The ONLY way is to recreate the table:
1. `CREATE TABLE new_table (... desired schema ...)`
2. `INSERT INTO new_table SELECT ... FROM old_table`
3. `DROP TABLE old_table`
4. `ALTER TABLE new_table RENAME TO old_table`
5. Re-create all indexes (they are dropped with the old table)

### What Knex does internally
For `.dropColumn()` and `.alter()`, Knex automatically:
```sql
PRAGMA table_info(`users`)
SAVEPOINT trx2;
SELECT type, sql FROM sqlite_master WHERE ...
RELEASE SAVEPOINT trx2;
PRAGMA foreign_keys
SAVEPOINT trx3;
CREATE TABLE `_knex_temp_alter439` (...)
INSERT INTO "_knex_temp_alter439" SELECT ... FROM "users"
DROP TABLE "users"
ALTER TABLE "_knex_temp_alter439" RENAME TO "users"
RELEASE SAVEPOINT trx3;
```

### Manual recreation pattern
When Knex's automatic recreation isn't sufficient (e.g., changing PKs, expanding CHECKs, adding farm-scoping columns):

```js
exports.config = { transaction: false };

exports.up = async function (knex) {
  await knex.raw('PRAGMA foreign_keys = OFF');
  await knex.raw('BEGIN');

  try {
    // 1. Create new table with desired schema
    await knex.raw(`CREATE TABLE users_new ( ... )`);

    // 2. Copy data (explicit column list — never SELECT *)
    const cols = 'id, username, email, created_at';
    await knex.raw(`INSERT INTO users_new (${cols}) SELECT ${cols} FROM users`);

    // 3. Swap
    await knex.raw('DROP TABLE users');
    await knex.raw('ALTER TABLE users_new RENAME TO users');

    // 4. Re-create ALL indexes (they died with the old table)
    await knex.raw('CREATE INDEX idx_users_email ON users(email)');
    await knex.raw('CREATE UNIQUE INDEX users_username_unique ON users(username)');

    await knex.raw('COMMIT');
  } catch (err) {
    await knex.raw('ROLLBACK');
    throw err;
  }

  await knex.raw('PRAGMA foreign_keys = ON');
};
```

### Critical: What gets lost during recreation
When you `DROP TABLE`, ALL of these are destroyed:
- Every index (named and auto-generated)
- Every UNIQUE constraint
- Every CHECK constraint
- Every FK definition
- Triggers (if any)

You MUST explicitly re-declare them all on the new table or after the rename.

---

## 3. PRAGMA Behavior

### Foreign keys
```sql
PRAGMA foreign_keys = OFF;  -- Disable FK enforcement
PRAGMA foreign_keys = ON;   -- Enable FK enforcement
```

**Gotcha:** `PRAGMA foreign_keys` is **silently ignored inside transactions**. It must be set outside any transaction (including Knex's automatic migration transaction).

**Gotcha:** Knex's `knexfile.js` does NOT enable foreign keys by default. To enable them on every connection:
```js
// knexfile.js
pool: {
  afterCreate: function (conn, done) {
    conn.pragma('foreign_keys = ON');
    done(null, conn);
  }
}
```
Without this hook, FK constraints are schema-only documentation — SQLite does not enforce them at runtime.

### better-sqlite3 PRAGMA API
```js
// Use .pragma() method, not prepared statements
db.pragma('cache_size = 32000');           // Set
db.pragma('cache_size', { simple: true }); // Get (returns scalar)
db.pragma('foreign_keys');                 // Get (returns array of rows)
```
The `.pragma()` method normalizes odd behavior that prepared statements may exhibit.

---

## 4. `knex.raw()` vs `knex.schema.raw()`

### `knex.raw(sql, [bindings])`
- Executes directly against the connection
- With `exports.config = { transaction: false }`, runs outside any transaction
- Use for: PRAGMA statements, manual BEGIN/COMMIT, any DDL that must bypass Knex's schema builder

### `knex.schema.raw(sql)`
- Runs inside the schema builder's transaction/savepoint context
- Chains with other schema builder calls
- Use for: DDL that should participate in Knex's managed transaction

### When to use which
| Scenario | Use |
|----------|-----|
| Setting PRAGMA | `knex.raw()` |
| Manual BEGIN/COMMIT | `knex.raw()` |
| Table recreation (manual) | `knex.raw()` |
| Adding a column in a standard migration | `knex.schema.alterTable()` |
| Raw DDL inside a schema chain | `knex.schema.raw()` |

---

## 5. Pool Configuration

### Defaults by dialect
| Dialect | Default min | Default max | Notes |
|---------|------------|-------------|-------|
| better-sqlite3 | 1 | 1 | Single connection (file-based constraint) |
| sqlite3 | 1 | 1 | Single connection (file-based constraint) |
| mysql / mysql2 | 2 | 10 | Knex recommends `min: 0` to avoid stale connections |
| pg | 2 | 10 | Same recommendation |

**Gotcha (SQLite):** All `knex.raw()` calls go to the same connection because pool = 1. This is why PRAGMA + BEGIN + DDL work correctly — they all execute on the same connection. Do NOT increase pool size for SQLite.

**Gotcha (MySQL/PG):** Default `min: 2` is for historical reasons. Knex docs recommend `min: 0` to let idle connections be destroyed.

### afterCreate hook
Runs once per newly created connection. Use for session-level settings:
```js
pool: {
  afterCreate: function (conn, done) {
    // SQLite: enable FK enforcement
    conn.pragma('foreign_keys = ON');
    done(null, conn);
    // MySQL: set session variables
    // conn.query("SET sql_mode='TRADITIONAL'", done);
  }
}
```

### acquireConnectionTimeout
Default: 60000ms. If pool is exhausted (all connections held by transactions), new queries wait this long before throwing. Common cause of timeout errors.

---

## 6. `.enu()` / `.enum()` — Dialect Differences

### SQLite
Generates a `CHECK` constraint:
```sql
CREATE TABLE users (
  role text CHECK (role IN ('admin', 'worker')) NOT NULL DEFAULT 'worker'
);
```

### MySQL
Generates a native `ENUM` column:
```sql
CREATE TABLE users (
  role ENUM('admin', 'worker') NOT NULL DEFAULT 'worker'
);
```

### PostgreSQL
Can generate native TYPE or CHECK depending on options:
```js
// Native enum (creates a TYPE)
table.enu('status', ['active', 'inactive'], {
  useNative: true,
  enumName: 'status_type'
});
// Generates: CREATE TYPE "status_type" AS ENUM ('active', 'inactive')
```

### Altering enums
**Knex provides NO way to alter enums after creation.** You must use raw SQL:
- **SQLite:** Recreate the table (CHECK constraint is baked into CREATE TABLE)
- **MySQL:** `ALTER TABLE users MODIFY COLUMN role ENUM('admin', 'worker', 'super_admin')`
- **PostgreSQL:** `ALTER TYPE status_type ADD VALUE 'new_value'`

---

## 7. Schema Builder Gotchas

### Nullability
- `.nullable()` is the **default** for most columns
- `.notNullable()` must be explicitly declared
- `.timestamps(true, true)` sets NOT NULL + DEFAULT CURRENT_TIMESTAMP (both args true)
- `.timestamps()` with no args creates nullable DATETIME columns without defaults

### `.increments()` and primary keys
- `.increments('id')` automatically creates a PRIMARY KEY
- To prevent: `table.increments('id', { primaryKey: false })`
- **SQLite gotcha:** `.increments()` in a composite primary key creates a UNIQUE index instead of a true PK

### Foreign keys — inline vs separate
```js
// Inline (preferred — single declaration)
table.integer('user_id').unsigned().references('users.id').onDelete('CASCADE');
// Or with explicit table:
table.integer('user_id').references('id').inTable('users').onDelete('CASCADE');

// Separate (alternative)
table.foreign('user_id').references('users.id').onDelete('CASCADE');
```
**Never use both** for the same column — creates redundant FK constraints.

### UNIQUE constraints
```js
// Single column
table.string('email').unique();

// Composite
table.unique(['email', 'account_id']);
```

### CHECK constraints (Knex 2.x+)
```js
table.check('age > 0');
table.checkPositive('age');                    // age > 0
table.checkIn('status', ['active', 'inactive']); // status IN (...)
table.checkBetween('age', [18, 65]);           // age BETWEEN 18 AND 65
```

### Indexes
```js
// Create
table.index('email');                          // auto-named
table.index('email', 'idx_user_email');        // custom name
table.index(['account_id', 'created_at']);     // composite

// Drop
table.dropIndex('email', 'idx_user_email');    // by name
```

---

## 8. better-sqlite3 Specific

### Transactions and async
> "Transaction functions do not work with async functions...transaction will already be committed before any async code executes."

This applies to better-sqlite3's native `.transaction()` method. Knex wraps this — `knex.transaction(async (trx) => { ... })` works correctly because Knex manages the transaction lifecycle differently.

### Timeout
Constructor option `timeout` (default: 5000ms) — milliseconds to wait on a locked database before throwing `SQLITE_BUSY`. Relevant when multiple processes access the same file.

### Forced rollbacks
SQLite may automatically rollback transactions due to:
- `ON CONFLICT` clauses
- `RAISE()` triggers
- `SQLITE_FULL` or `SQLITE_BUSY` errors

After catching errors inside a transaction, check `db.inTransaction` before continuing.

---

## 9. Dual-Dialect Migration Pattern

When writing migrations that must work on both SQLite and MySQL:

```js
exports.config = { transaction: false };

exports.up = async function (knex) {
  const isSQLite = knex.client.config.client === 'better-sqlite3';

  if (isSQLite) {
    // SQLite: table recreation approach
    await knex.raw('PRAGMA foreign_keys = OFF');
    await knex.raw('BEGIN');
    try {
      // ... CREATE new, INSERT SELECT, DROP old, RENAME new, re-create indexes ...
      await knex.raw('COMMIT');
    } catch (err) {
      await knex.raw('ROLLBACK');
      throw err;
    }
    await knex.raw('PRAGMA foreign_keys = ON');
  } else {
    // MySQL: standard ALTER TABLE
    await knex.schema.alterTable('users', (table) => {
      table.string('new_column').notNullable().defaultTo('');
    });
  }
};
```

### MySQL-specific capabilities (not available in SQLite)
- `ALTER TABLE ADD COLUMN` with NOT NULL (backfills with DEFAULT)
- `ALTER TABLE MODIFY COLUMN` (change type, nullability, default, ENUM values)
- `ALTER TABLE DROP COLUMN` (native, no table recreation)
- `ALTER TABLE DROP PRIMARY KEY, ADD PRIMARY KEY (...)` (change PK)
- `ALTER TABLE DROP INDEX, ADD UNIQUE INDEX (...)` (change constraints)
- `SET FOREIGN_KEY_CHECKS = 0/1` (disable/enable FK enforcement per session)

---

## 10. Query Patterns

### Raw queries with bindings
```js
// Positional bindings (? placeholders)
knex.raw('SELECT * FROM users WHERE id = ?', [userId])

// Named bindings
knex.raw('SELECT * FROM users WHERE id = :id', { id: userId })

// Array expansion in named bindings
knex.raw('SELECT * FROM users WHERE id IN :ids', { ids: [1, 2, 3] })
```
**Never** concatenate user input into raw SQL strings. Always use bindings.

### `.returning()` behavior
- **PostgreSQL:** Returns specified columns from INSERT/UPDATE/DELETE
- **MySQL:** Returns `insertId` only (no arbitrary column return)
- **SQLite (better-sqlite3):** Returns `lastInsertRowid` via `.returning('*')` but behavior varies

### `.first()` for single records
```js
const user = await knex('users').where({ id }).first();
// Returns object or undefined (not array)
```

### Aggregate gotchas
```js
// COUNT returns string in some drivers — always coerce
const { count } = await knex('users').count('* as count').first();
const total = Number(count); // Safe across all dialects
```

---

## 11. Migration Lock System

Knex uses a lock table (`knex_migrations_lock`) to prevent concurrent migration runs:
- Uses `SELECT ... FOR UPDATE` to prevent race conditions
- If process crashes during migration, lock must be manually released:
  ```bash
  npx knex migrate:unlock
  ```
- Lock table must have exactly one row or Knex throws "Migration table is already locked"

---

## 12. useNullAsDefault

```js
// knexfile.js
{ useNullAsDefault: true }
```
Required for SQLite. Without it, Knex throws warnings when inserting rows without specifying every column. This tells Knex to send `NULL` for unspecified columns.

**Gotcha:** This does NOT bypass `NOT NULL` constraints. SQLite enforces `NOT NULL` at the engine level even when Knex sends `NULL`. Every insert must explicitly include values for NOT NULL columns.
