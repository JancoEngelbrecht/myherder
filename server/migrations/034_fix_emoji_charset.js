/**
 * Migration 034: Fix emoji charset for MySQL/MariaDB
 *
 * On cPanel the database may have been created with utf8 (utf8mb3) as the
 * default charset. MariaDB silently truncates 4-byte emoji characters when
 * inserting into a utf8mb3 column, causing ER_TRUNCATED_WRONG_VALUE_FOR_FIELD
 * and breaking farm creation via seedFarmDefaults().
 *
 * This migration converts every tenant-data table to utf8mb4_unicode_ci so
 * that emoji columns and user-generated text are stored correctly.
 *
 * SQLite handles all Unicode natively — no-op on SQLite.
 */

const TABLES = [
  'cows',
  'health_issues',
  'health_issue_comments',
  'treatments',
  'medications',
  'breeding_events',
  'breed_types',
  'issue_type_definitions',
  'milk_records',
  'users',
  'audit_log',
  'system_announcements',
  'farms',
  'app_settings',
  'feature_flags',
  'sync_log',
]

exports.up = async function (knex) {
  const isSQLite = knex.client.config.client === 'better-sqlite3'
  if (isSQLite) return

  for (const table of TABLES) {
    await knex.raw(
      `ALTER TABLE \`${table}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    )
  }
}

exports.down = async function (knex) {
  const isSQLite = knex.client.config.client === 'better-sqlite3'
  if (isSQLite) return

  for (const table of TABLES) {
    await knex.raw(
      `ALTER TABLE \`${table}\` CONVERT TO CHARACTER SET utf8 COLLATE utf8_unicode_ci`
    )
  }
}
