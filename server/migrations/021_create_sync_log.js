// Migration 021: Create sync_log table for tracking sync operations

exports.up = async function (knex) {
  await knex.schema.createTable('sync_log', (t) => {
    t.uuid('id').primary()
    t.uuid('user_id').notNullable().references('id').inTable('users')
    t.string('device_id', 36).notNullable()
    t.enu('action', ['push', 'pull']).notNullable()
    t.integer('records_count').notNullable().defaultTo(0)
    t.enu('status', ['success', 'partial', 'failed']).notNullable()
    t.text('error_message').nullable()
    t.timestamp('synced_at').notNullable().defaultTo(knex.fn.now())
  })
}

exports.down = async function (knex) {
  await knex.schema.dropTable('sync_log')
}
