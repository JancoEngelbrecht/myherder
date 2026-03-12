/**
 * Migration 034: Fix emoji charset for MySQL/MariaDB
 *
 * On cPanel the database may have been created with utf8 (utf8mb3) as the
 * default charset. 4-byte emoji characters (used in issue_type_definitions)
 * cannot be stored in utf8mb3 columns, causing ER_TRUNCATED_WRONG_VALUE_FOR_FIELD
 * and breaking farm creation via seedFarmDefaults().
 *
 * This migration changes the emoji column on issue_type_definitions (and the
 * global default_issue_types table) to utf8mb4. Only these columns need the
 * fix — other tables don't store emoji.
 *
 * SQLite handles all Unicode natively — no-op on SQLite.
 */

exports.up = async function (knex) {
  const isSQLite = knex.client.config.client === 'better-sqlite3'
  if (isSQLite) return

  await knex.raw(
    "ALTER TABLE `issue_type_definitions` MODIFY COLUMN `emoji` VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '❓'"
  )
  await knex.raw(
    "ALTER TABLE `default_issue_types` MODIFY COLUMN `emoji` VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
  )
}

exports.down = async function (knex) {
  const isSQLite = knex.client.config.client === 'better-sqlite3'
  if (isSQLite) return

  await knex.raw(
    "ALTER TABLE `issue_type_definitions` MODIFY COLUMN `emoji` VARCHAR(10) NOT NULL DEFAULT '❓'"
  )
  await knex.raw(
    "ALTER TABLE `default_issue_types` MODIFY COLUMN `emoji` VARCHAR(10)"
  )
}
