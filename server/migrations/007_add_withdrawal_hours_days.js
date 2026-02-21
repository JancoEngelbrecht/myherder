exports.up = function (knex) {
  return knex.schema.alterTable('medications', (t) => {
    t.integer('withdrawal_milk_days').notNullable().defaultTo(0).after('withdrawal_milk_hours')
    t.integer('withdrawal_meat_hours').notNullable().defaultTo(0).after('withdrawal_meat_days')
  })
}

exports.down = function (knex) {
  return knex.schema.alterTable('medications', (t) => {
    t.dropColumn('withdrawal_milk_days')
    t.dropColumn('withdrawal_meat_hours')
  })
}
