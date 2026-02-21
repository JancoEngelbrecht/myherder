exports.up = function (knex) {
  return knex.schema.createTable('medications', (t) => {
    t.string('id', 36).primary()
    t.string('name', 100).notNullable()
    t.string('active_ingredient', 100)
    t.integer('withdrawal_milk_hours').notNullable().defaultTo(0)
    t.integer('withdrawal_meat_days').notNullable().defaultTo(0)
    t.string('default_dosage', 100)
    t.string('unit', 20)
    t.text('notes')
    t.boolean('is_active').notNullable().defaultTo(true)
    t.timestamp('created_at').defaultTo(knex.fn.now())
    t.timestamp('updated_at').defaultTo(knex.fn.now())
  })
}

exports.down = function (knex) {
  return knex.schema.dropTable('medications')
}
