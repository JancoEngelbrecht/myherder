exports.up = function (knex) {
  return knex.schema.createTable('treatments', (t) => {
    t.string('id', 36).primary()
    t.string('cow_id', 36).notNullable().references('id').inTable('cows')
    t.string('medication_id', 36).notNullable().references('id').inTable('medications')
    t.string('administered_by', 36).notNullable().references('id').inTable('users')
    t.string('dosage', 50)
    t.decimal('cost', 10, 2)
    t.datetime('treatment_date').notNullable()
    t.datetime('withdrawal_end_milk')
    t.datetime('withdrawal_end_meat')
    t.boolean('is_vet_visit').notNullable().defaultTo(false)
    t.string('vet_name', 100)
    t.text('notes')
    t.timestamp('created_at').defaultTo(knex.fn.now())
    t.timestamp('updated_at').defaultTo(knex.fn.now())
    t.timestamp('synced_at').nullable()
  })
}

exports.down = function (knex) {
  return knex.schema.dropTable('treatments')
}
