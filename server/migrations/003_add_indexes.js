exports.up = function (knex) {
  return knex.schema.alterTable('cows', (table) => {
    table.index('sire_id')
    table.index('dam_id')
    table.index('status')
    table.index('created_by')
    table.index('deleted_at')
  })
}

exports.down = function (knex) {
  return knex.schema.alterTable('cows', (table) => {
    table.dropIndex('sire_id')
    table.dropIndex('dam_id')
    table.dropIndex('status')
    table.dropIndex('created_by')
    table.dropIndex('deleted_at')
  })
}
