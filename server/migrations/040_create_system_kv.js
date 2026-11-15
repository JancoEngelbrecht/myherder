// Migration 040: Create system_kv table for server-level, farm-agnostic key-value storage.
// Used by: errorHandler.ts (last_5xx_error persistence across Passenger restarts)
// Unlike app_settings, this table has no farm_id — it holds process/server-level state.

exports.up = async function (knex) {
  await knex.schema.createTable('system_kv', (table) => {
    table.string('key', 100).primary()
    table.text('value').nullable()
    table.timestamp('updated_at').defaultTo(knex.fn.now())
  })
}

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('system_kv')
}
