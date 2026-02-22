exports.up = function (knex) {
  return knex.schema.table('milk_records', (t) => {
    t.string('session_time', 5).nullable() // "HH:MM" — actual milking time
  })
}

exports.down = function (knex) {
  return knex.schema.table('milk_records', (t) => {
    t.dropColumn('session_time')
  })
}
