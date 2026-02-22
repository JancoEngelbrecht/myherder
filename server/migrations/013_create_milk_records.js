exports.up = function (knex) {
  return knex.schema.createTable('milk_records', (t) => {
    t.string('id', 36).primary()
    t.string('cow_id', 36).notNullable().references('id').inTable('cows')
    t.string('recorded_by', 36).notNullable().references('id').inTable('users')
    t.enum('session', ['morning', 'afternoon', 'evening']).notNullable()
    t.decimal('litres', 6, 2).notNullable()
    t.date('recording_date').notNullable()
    t.boolean('milk_discarded').notNullable().defaultTo(false)
    t.string('discard_reason', 255).nullable()
    t.text('notes').nullable()
    t.timestamp('created_at').defaultTo(knex.fn.now())
    t.timestamp('updated_at').defaultTo(knex.fn.now())
    t.timestamp('synced_at').nullable()
    t.unique(['cow_id', 'session', 'recording_date'])
  })
}

exports.down = function (knex) {
  return knex.schema.dropTable('milk_records')
}
