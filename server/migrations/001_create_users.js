exports.up = function (knex) {
  return knex.schema.createTable('users', (table) => {
    table.uuid('id').primary()
    table.string('username').unique().notNullable()
    table.string('pin_hash')
    table.string('password_hash')
    table.string('full_name').notNullable()
    table.enum('role', ['admin', 'worker']).notNullable().defaultTo('worker')
    table.json('permissions').defaultTo('[]')
    table.string('language').defaultTo('en')
    table.boolean('is_active').defaultTo(true)
    table.integer('failed_attempts').defaultTo(0)
    table.timestamp('locked_until')
    table.timestamps(true, true)
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('users')
}
