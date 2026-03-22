exports.up = function (knex) {
  return knex.schema.createTable('breeding_events', (t) => {
    t.string('id', 36).primary()
    t.string('cow_id', 36).notNullable().references('id').inTable('cows')
    t.enum('event_type', [
      'heat_observed',
      'ai_insemination',
      'bull_service',
      'preg_check_positive',
      'preg_check_negative',
      'calving',
      'abortion',
    ]).notNullable()
    t.timestamp('event_date').notNullable()
    t.string('sire_id', 36).nullable().references('id').inTable('cows')
    t.string('semen_id', 100).nullable()
    t.string('inseminator', 100).nullable()
    t.text('heat_signs').nullable() // JSON string
    t.enum('preg_check_method', ['manual', 'ultrasound', 'blood_test']).nullable()
    t.text('calving_details').nullable() // JSON string
    t.decimal('cost', 10, 2).nullable()
    t.date('expected_next_heat').nullable()
    t.date('expected_preg_check').nullable()
    t.date('expected_calving').nullable()
    t.date('expected_dry_off').nullable()
    t.text('notes').nullable()
    t.string('recorded_by', 36).nullable().references('id').inTable('users')
    t.timestamp('created_at').defaultTo(knex.fn.now())
    t.timestamp('updated_at').defaultTo(knex.fn.now())
    t.timestamp('synced_at').nullable()

    t.index('cow_id')
    t.index('event_type')
    t.index('expected_calving')
    t.index('expected_next_heat')
  })
}

exports.down = function (knex) {
  return knex.schema.dropTable('breeding_events')
}
