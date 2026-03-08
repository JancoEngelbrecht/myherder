/**
 * Migration 031: Add 2FA columns to users table
 *
 * Adds totp_secret, totp_enabled, and recovery_codes columns
 * for super-admin TOTP two-factor authentication.
 * All columns are nullable with defaults, so ALTER TABLE works on both SQLite and MySQL.
 */

exports.up = async function (knex) {
  await knex.schema.alterTable('users', (table) => {
    table.text('totp_secret').nullable().defaultTo(null)
    table.boolean('totp_enabled').notNullable().defaultTo(false)
    table.text('recovery_codes').nullable().defaultTo(null) // JSON array of bcrypt hashes
  })
}

exports.down = async function (knex) {
  const isSQLite = knex.client.config.client === 'better-sqlite3'

  if (isSQLite) {
    // SQLite doesn't support DROP COLUMN before 3.35.0 — use table recreation
    await knex.raw('PRAGMA foreign_keys = OFF')
    await knex.raw(`CREATE TABLE users_backup AS SELECT
      id, farm_id, username, pin_hash, password_hash, full_name,
      role, permissions, language, is_active, failed_attempts,
      locked_until, created_at, updated_at, deleted_at, token_version
    FROM users`)
    await knex.raw('DROP TABLE users')
    await knex.raw(`ALTER TABLE users_backup RENAME TO users`)
    await knex.raw('PRAGMA foreign_keys = ON')
  } else {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('totp_secret')
      table.dropColumn('totp_enabled')
      table.dropColumn('recovery_codes')
    })
  }
}
