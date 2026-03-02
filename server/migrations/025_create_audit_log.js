exports.up = function (knex) {
  return knex.schema.createTable('audit_log', (table) => {
    table.string('id', 36).primary()
    table.string('user_id', 36).references('id').inTable('users')
    table.string('action', 50).notNullable()
    table.string('entity_type', 50)
    table.string('entity_id', 36)
    table.text('old_values')
    table.text('new_values')
    table.timestamp('created_at').defaultTo(knex.fn.now())

    table.index(['entity_type', 'entity_id'])
    table.index('created_at')
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('audit_log')
}
