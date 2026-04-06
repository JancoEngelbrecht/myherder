/**
 * Migration 038: Rename cows → animals
 *
 * - Renames the `cows` table to `animals`
 * - Renames `cow_id` → `animal_id` in treatments, health_issues, milk_records, breeding_events
 * - Renames `cow_name` → `animal_name` in milk_records (joined alias only — no persisted column)
 * - Updates `can_manage_cows` → `can_manage_animals` in users.permissions JSON
 *
 * SQLite: uses ALTER TABLE RENAME TABLE and ALTER TABLE RENAME COLUMN (3.25+/3.26+).
 * better-sqlite3 ships SQLite 3.45+, so both are safe.
 * MySQL: same SQL via knex.schema.table renameColumn.
 *
 * The down() migration reverses all changes.
 */

exports.up = async function (knex) {
  const isSQLite = knex.client.config.client === 'better-sqlite3'

  // ── 1. Rename cows → animals ───────────────────────────────────────────
  await knex.schema.renameTable('cows', 'animals')

  // ── 2. Rename cow_id → animal_id in dependent tables ──────────────────
  //
  // SQLite 3.26+ supports RENAME COLUMN. MySQL and Knex's renameColumn() also
  // handle this correctly. We use raw SQL for SQLite to be explicit.

  if (isSQLite) {
    await knex.raw('ALTER TABLE treatments RENAME COLUMN cow_id TO animal_id')
    await knex.raw('ALTER TABLE health_issues RENAME COLUMN cow_id TO animal_id')
    await knex.raw('ALTER TABLE milk_records RENAME COLUMN cow_id TO animal_id')
    await knex.raw('ALTER TABLE breeding_events RENAME COLUMN cow_id TO animal_id')
  } else {
    // MySQL: knex schema renameColumn handles the full CHANGE COLUMN syntax
    await knex.schema.alterTable('treatments', (t) => {
      t.renameColumn('cow_id', 'animal_id')
    })
    await knex.schema.alterTable('health_issues', (t) => {
      t.renameColumn('cow_id', 'animal_id')
    })
    await knex.schema.alterTable('milk_records', (t) => {
      t.renameColumn('cow_id', 'animal_id')
    })
    await knex.schema.alterTable('breeding_events', (t) => {
      t.renameColumn('cow_id', 'animal_id')
    })
  }

  // ── 3. Rewrite users.permissions JSON ────────────────────────────────
  // Replace "can_manage_cows" with "can_manage_animals" in every user's
  // permissions array. Each row is a JSON array string. Guard every parse.

  const users = await knex('users').select('id', 'permissions')
  for (const user of users) {
    let perms
    try {
      perms = JSON.parse(user.permissions || '[]')
    } catch {
      // Malformed JSON — skip this row silently to avoid blocking migration
      continue
    }
    if (!Array.isArray(perms)) continue
    const idx = perms.indexOf('can_manage_cows')
    if (idx === -1) continue
    perms[idx] = 'can_manage_animals'
    await knex('users')
      .where({ id: user.id })
      .update({ permissions: JSON.stringify(perms) })
  }
}

exports.down = async function (knex) {
  const isSQLite = knex.client.config.client === 'better-sqlite3'

  // ── 1. Revert users.permissions JSON ─────────────────────────────────
  const users = await knex('users').select('id', 'permissions')
  for (const user of users) {
    let perms
    try {
      perms = JSON.parse(user.permissions || '[]')
    } catch {
      continue
    }
    if (!Array.isArray(perms)) continue
    const idx = perms.indexOf('can_manage_animals')
    if (idx === -1) continue
    perms[idx] = 'can_manage_cows'
    await knex('users')
      .where({ id: user.id })
      .update({ permissions: JSON.stringify(perms) })
  }

  // ── 2. Rename animal_id → cow_id in dependent tables ─────────────────
  if (isSQLite) {
    await knex.raw('ALTER TABLE breeding_events RENAME COLUMN animal_id TO cow_id')
    await knex.raw('ALTER TABLE milk_records RENAME COLUMN animal_id TO cow_id')
    await knex.raw('ALTER TABLE health_issues RENAME COLUMN animal_id TO cow_id')
    await knex.raw('ALTER TABLE treatments RENAME COLUMN animal_id TO cow_id')
  } else {
    await knex.schema.alterTable('breeding_events', (t) => {
      t.renameColumn('animal_id', 'cow_id')
    })
    await knex.schema.alterTable('milk_records', (t) => {
      t.renameColumn('animal_id', 'cow_id')
    })
    await knex.schema.alterTable('health_issues', (t) => {
      t.renameColumn('animal_id', 'cow_id')
    })
    await knex.schema.alterTable('treatments', (t) => {
      t.renameColumn('animal_id', 'cow_id')
    })
  }

  // ── 3. Rename animals → cows ──────────────────────────────────────────
  await knex.schema.renameTable('animals', 'cows')
}
