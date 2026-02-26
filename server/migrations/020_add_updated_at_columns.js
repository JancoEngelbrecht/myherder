// Migration 020: Ensure all entity tables have updated_at columns
// All tables already have updated_at via t.timestamps() — this is a safety net

const TABLES = [
  'cows',
  'medications',
  'treatments',
  'health_issues',
  'milk_records',
  'breeding_events',
  'breed_types',
  'issue_type_definitions',
  'breeding_event_types',
  'users',
]

exports.up = async function (knex) {
  for (const table of TABLES) {
    const hasCol = await knex.schema.hasColumn(table, 'updated_at')
    if (!hasCol) {
      await knex.schema.alterTable(table, (t) => {
        t.timestamp('updated_at').defaultTo(knex.fn.now())
      })
    }
  }
}

exports.down = async function () {
  // No-op — we don't want to remove updated_at columns that existed before this migration
}
