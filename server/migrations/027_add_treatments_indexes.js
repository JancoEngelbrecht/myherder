exports.up = function (knex) {
  return knex.schema
    .table('treatments', (table) => {
      table.index(['cow_id', 'withdrawal_end_milk'], 'idx_treatments_cow_withdrawal')
      table.index('treatment_date', 'idx_treatments_treatment_date')
    })
    .table('breeding_events', (table) => {
      table.index('event_date', 'idx_breeding_events_event_date')
    })
}

exports.down = function (knex) {
  return knex.schema
    .table('treatments', (table) => {
      table.dropIndex(['cow_id', 'withdrawal_end_milk'], 'idx_treatments_cow_withdrawal')
      table.dropIndex('treatment_date', 'idx_treatments_treatment_date')
    })
    .table('breeding_events', (table) => {
      table.dropIndex('event_date', 'idx_breeding_events_event_date')
    })
}
