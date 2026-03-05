/**
 * Add indexes on updated_at for all entity tables used by sync pull.
 * Incremental sync queries WHERE updated_at > ? on every pull cycle.
 */
exports.up = async function (knex) {
  const tables = [
    'cows',
    'milk_records',
    'breeding_events',
    'health_issues',
    'treatments',
    'medications',
    'breed_types',
    'issue_type_definitions',
  ]

  for (const table of tables) {
    const hasIndex = await knex.schema.hasTable(table)
    if (hasIndex) {
      await knex.schema.alterTable(table, (t) => {
        t.index('updated_at', `idx_${table}_updated_at`)
      })
    }
  }
}

exports.down = async function (knex) {
  const tables = [
    'cows',
    'milk_records',
    'breeding_events',
    'health_issues',
    'treatments',
    'medications',
    'breed_types',
    'issue_type_definitions',
  ]

  for (const table of tables) {
    const hasIndex = await knex.schema.hasTable(table)
    if (hasIndex) {
      await knex.schema.alterTable(table, (t) => {
        t.dropIndex('updated_at', `idx_${table}_updated_at`)
      })
    }
  }
}
