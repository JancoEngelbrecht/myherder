---
name: mysql-deployment-patterns
description: MySQL/MariaDB production patterns and cPanel/Passenger deployment. Covers charset handling, datetime gotchas, FK constraint workarounds, Passenger startup, production seeds, and environment configuration. Load when deploying to production, writing MySQL-specific migrations, or debugging MySQL compatibility issues.
---

# MySQL & Production Deployment Patterns

## 1. Charset & Emoji Support (utf8mb4)

### The problem
MySQL's default `utf8` charset only supports 3-byte characters. Emojis require 4 bytes (`utf8mb4`). Insert fails silently or throws `ER_TRUNCATED_WRONG_VALUE_FOR_FIELD`.

### Knexfile configuration
```js
// knexfile.js — production
production: {
  client: 'mysql2',
  connection: {
    charset: 'utf8mb4',  // CRITICAL: must be set at connection level
    // ... host, user, password, database
  },
  pool: { min: 0, max: 5 }  // min:0 prevents stale connections
}
```

### Migration: Adding utf8mb4 to specific columns
MySQL blocks `CONVERT TO CHARACTER SET` on tables with FK references — even with `FOREIGN_KEY_CHECKS=0`. Only `MODIFY COLUMN` the specific columns that need emoji support:

```js
exports.up = async function (knex) {
  const isSQLite = knex.client.config.client === 'better-sqlite3';
  if (isSQLite) return; // SQLite handles all Unicode natively

  const emojiColumns = [
    { table: 'issue_type_definitions', column: 'emoji', type: 'VARCHAR(10)' },
    { table: 'default_issue_types', column: 'emoji', type: 'VARCHAR(10)' },
  ];

  for (const { table, column, type } of emojiColumns) {
    const exists = await knex.schema.hasTable(table);
    if (exists) {
      await knex.raw(
        `ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ${type} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
    }
  }
};
```

**Anti-pattern — never do this:**
```js
// FAILS on tables with FK references
await knex.raw(`ALTER TABLE \`${table}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
```

### Creating tables with utf8mb4 collation
```js
// In migrations — use .collate() on specific columns
table.string('emoji', 10).collate('utf8mb4_unicode_ci');

// Or per-table (only works without FK references)
await knex.schema.createTable('my_table', (table) => {
  // ... columns ...
}).raw('DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
```

---

## 2. DateTime Handling

### `knex.fn.now()` vs `new Date().toISOString()`

MySQL strict mode rejects ISO 8601 strings (`2026-03-13T12:00:00.000Z`) for DATETIME columns. Always use `knex.fn.now()` for current timestamps:

```js
// CORRECT — works on both SQLite and MySQL
await db('items').insert({
  id: uuid(),
  created_at: knex.fn.now(),
  updated_at: knex.fn.now()
});

// WRONG — fails on MySQL strict mode
await db('items').insert({
  created_at: new Date().toISOString()  // Rejected by MySQL
});
```

### In migrations and seeds
```js
// Migrations
await knex('table').insert({ created_at: knex.fn.now() });

// Inside transactions — use trx.fn.now(), not knex.fn.now()
await knex.transaction(async (trx) => {
  await trx('table').insert({ created_at: trx.fn.now() });
});
```

### MySQL2 Date object coercion
MySQL2 driver returns `DATETIME`/`TIMESTAMP` columns as JavaScript `Date` objects, not strings. Guard string operations:

```js
// SAFE — handles both SQLite (string) and MySQL (Date object)
const dateStr = val instanceof Date ? val.toISOString() : String(val);
const month = dateStr.slice(0, 7); // "2026-03"
```

---

## 3. Foreign Key Constraint Workarounds

### Disabling FK checks for migrations
MySQL needs `SET FOREIGN_KEY_CHECKS = 0` for migrations that drop/recreate indexes on FK columns:

```js
exports.up = async function (knex) {
  const isSQLite = knex.client.config.client === 'better-sqlite3';

  if (isSQLite) {
    // SQLite path — PRAGMA foreign_keys = OFF (must be outside transaction)
    await knex.raw('PRAGMA foreign_keys = OFF');
    // ... table recreation ...
    await knex.raw('PRAGMA foreign_keys = ON');
  } else {
    // MySQL path — session-level FK disable
    await knex.raw('SET FOREIGN_KEY_CHECKS = 0');
    try {
      // ... ALTER TABLE, DROP INDEX, etc. ...
    } finally {
      await knex.raw('SET FOREIGN_KEY_CHECKS = 1');
    }
  }
};
```

### PRAGMA guards
SQLite PRAGMAs fail silently on MySQL but pollute logs. Guard them:
```js
const isSQLite = knex.client.config.client === 'better-sqlite3';
if (isSQLite) {
  await knex.raw('PRAGMA ignore_check_constraints = ON');
}
```

---

## 4. Passenger / cPanel Deployment

### Entry point
cPanel's Phusion Passenger requires the app to export without calling `listen()`:

```js
// app.js (root) — Passenger entry point
module.exports = require('./server/app');
```

Set "Application startup file" to `app.js` in cPanel's Node.js App Setup.

The regular `server/index.js` with `app.listen(PORT)` remains for direct `node server/index.js` execution.

### Static file serving with cache headers
```js
// server/app.js
app.use(express.static(path.join(__dirname, '../client/dist'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));
```

### client/dist in repo
cPanel shared hosting often cannot build the frontend (`nodevenv` redirects dependencies). Build locally and commit `client/dist/`:
```bash
cd client && npm run build
git add client/dist/
```

### Environment variables
cPanel sets env vars through the Node.js App Setup UI. Required for production:
```
NODE_ENV=production
DB_HOST=localhost
DB_USER=cpaneluser_dbuser
DB_PASSWORD=...
DB_NAME=cpaneluser_dbname
JWT_SECRET=<random 32+ char string>
PORT=3000  # Passenger manages this, but fallback for direct execution
```

---

## 5. Production Seed Strategy

### Separate seed directory
Production seeds live in `server/seeds/production/` — separate from dev/demo seeds:

```js
// knexfile.js
production: {
  seeds: { directory: './server/seeds/production' }
}
```

### Idempotent production seed
```js
// server/seeds/production/001_super_admin.js
exports.seed = async function (knex) {
  const existing = await knex('users').where({ role: 'super_admin' }).first();
  if (existing) return; // Idempotent — safe to re-run

  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!password) throw new Error('SUPER_ADMIN_PASSWORD env var required for initial seed');

  await knex('users').insert({
    id: uuid(),
    username: process.env.SUPER_ADMIN_USERNAME || 'super_admin',
    password_hash: await bcrypt.hash(password, 12), // Cost 12 for production
    role: 'super_admin',
    farm_id: null, // Super-admin has no farm context
    created_at: knex.fn.now(),
    updated_at: knex.fn.now()
  });
};
```

### First-deploy workflow
1. Create MySQL database in cPanel
2. Set environment variables (DB_*, JWT_SECRET, SUPER_ADMIN_PASSWORD)
3. `npx knex migrate:latest --env production`
4. `npx knex seed:run --env production` (creates super_admin)
5. Remove `SUPER_ADMIN_PASSWORD` from env (no longer needed)
6. Super-admin creates first farm via the app

---

## 6. MySQL vs SQLite Dialect Detection

```js
const isSQLite = knex.client.config.client === 'better-sqlite3';
// or for broader SQLite support:
const isSQLite = ['better-sqlite3', 'sqlite3'].includes(knex.client.config.client);
```

Use this pattern at the top of any migration or seed that has dialect-specific behavior.

---

## 7. Error Handling for Production

### MySQL error codes in responses
Include MySQL error codes for debugging (500 responses only):
```js
// server/middleware/errorHandler.js
if (err.code) {
  // Include DB error code (e.g., ER_DUP_ENTRY, ER_ROW_IS_REFERENCED_2)
  error.dbCode = err.code;
}
```

### Frontend error translation
Backend returns i18n keys as error messages. Frontend must translate them:
```js
import { extractApiError, resolveError } from '@/utils/apiError';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

try {
  await api.post('/resource', data);
} catch (err) {
  // extractApiError returns raw i18n key like "errors.network"
  // resolveError translates it, falls back to raw string if not an i18n key
  toast.error(resolveError(t, extractApiError(err)));
}
```

---

## 8. Connection Pool for Production

```js
// knexfile.js — production
pool: {
  min: 0,   // Let idle connections close (prevents PROTOCOL_CONNECTION_LOST)
  max: 5,   // Shared hosting — keep low (2GB RAM)
  acquireTimeoutMillis: 30000,
  idleTimeoutMillis: 30000
}
```

MySQL on shared hosting can kill idle connections. `min: 0` lets Knex recreate them on demand instead of holding stale connections that throw `PROTOCOL_CONNECTION_LOST`.
