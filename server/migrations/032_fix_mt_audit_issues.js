/**
 * Migration 032: Fix multi-tenancy audit issues
 *
 * 1. Add farm_id column to sync_log (was missing — all logSync calls silently failed)
 * 2. Make users.farm_id nullable to support super_admin with farm_id = NULL
 *
 * SQLite requires table recreation for altering NOT NULL → NULL.
 */

exports.config = { transaction: false }

exports.up = async function (knex) {
  const isSQLite = knex.client.config.client === 'better-sqlite3'

  if (isSQLite) {
    // 1. Add farm_id to sync_log (simple ALTER — new column is nullable)
    await knex.raw('ALTER TABLE sync_log ADD COLUMN farm_id TEXT NULL REFERENCES farms(id)')
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_sync_log_farm_id ON sync_log(farm_id)')

    // 2. Recreate users table with farm_id nullable
    await knex.raw('PRAGMA foreign_keys = OFF')
    await knex.raw('BEGIN')
    try {
      await knex.raw(`CREATE TABLE users_new (
  id char(36) PRIMARY KEY,
  farm_id TEXT NULL REFERENCES farms(id),
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
  totp_secret TEXT NULL,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  recovery_codes TEXT NULL,
  UNIQUE(farm_id, username)
)`)

      const cols = [
        'id',
        'farm_id',
        'username',
        'pin_hash',
        'password_hash',
        'full_name',
        'role',
        'permissions',
        'language',
        'is_active',
        'failed_attempts',
        'locked_until',
        'created_at',
        'updated_at',
        'deleted_at',
        'token_version',
        'totp_secret',
        'totp_enabled',
        'recovery_codes',
      ].join(', ')

      await knex.raw(`INSERT INTO users_new (${cols}) SELECT ${cols} FROM users`)
      await knex.raw('DROP TABLE users')
      await knex.raw('ALTER TABLE users_new RENAME TO users')
      await knex.raw('CREATE INDEX idx_users_updated_at ON users(updated_at)')
      await knex.raw('CREATE INDEX idx_users_farm_id ON users(farm_id)')
      await knex.raw('COMMIT')
    } catch (err) {
      await knex.raw('ROLLBACK')
      throw err
    }
    await knex.raw('PRAGMA foreign_keys = ON')
  } else {
    // MySQL
    await knex.schema.alterTable('sync_log', (t) => {
      t.string('farm_id', 36).nullable().references('id').inTable('farms')
      t.index('farm_id', 'idx_sync_log_farm_id')
    })

    await knex.schema.alterTable('users', (t) => {
      t.string('farm_id', 36).nullable().alter()
    })
  }
}

exports.down = async function (knex) {
  const isSQLite = knex.client.config.client === 'better-sqlite3'

  if (isSQLite) {
    // Remove farm_id from sync_log
    await knex.raw('DROP INDEX IF EXISTS idx_sync_log_farm_id')
    // SQLite doesn't support DROP COLUMN before 3.35 — but sync_log is low-risk, just leave the column

    // Recreate users with farm_id NOT NULL
    await knex.raw('PRAGMA foreign_keys = OFF')
    await knex.raw('BEGIN')
    try {
      await knex.raw(`CREATE TABLE users_new (
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
  totp_secret TEXT NULL,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  recovery_codes TEXT NULL,
  UNIQUE(farm_id, username)
)`)

      const cols = [
        'id',
        'farm_id',
        'username',
        'pin_hash',
        'password_hash',
        'full_name',
        'role',
        'permissions',
        'language',
        'is_active',
        'failed_attempts',
        'locked_until',
        'created_at',
        'updated_at',
        'deleted_at',
        'token_version',
        'totp_secret',
        'totp_enabled',
        'recovery_codes',
      ].join(', ')

      await knex.raw(`INSERT INTO users_new (${cols}) SELECT ${cols} FROM users`)
      await knex.raw('DROP TABLE users')
      await knex.raw('ALTER TABLE users_new RENAME TO users')
      await knex.raw('CREATE INDEX idx_users_updated_at ON users(updated_at)')
      await knex.raw('CREATE INDEX idx_users_farm_id ON users(farm_id)')
      await knex.raw('COMMIT')
    } catch (err) {
      await knex.raw('ROLLBACK')
      throw err
    }
    await knex.raw('PRAGMA foreign_keys = ON')
  } else {
    await knex.schema.alterTable('sync_log', (t) => {
      t.dropIndex('farm_id', 'idx_sync_log_farm_id')
      t.dropColumn('farm_id')
    })

    await knex.schema.alterTable('users', (t) => {
      t.string('farm_id', 36).notNullable().alter()
    })
  }
}
