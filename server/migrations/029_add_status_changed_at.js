exports.up = async function (knex) {
  await knex.schema.alterTable('cows', (table) => {
    table.timestamp('status_changed_at').nullable()
  })

  // Backfill: for dead/sold cows, set status_changed_at = updated_at
  await knex('cows')
    .whereIn('status', ['dead', 'sold'])
    .update({ status_changed_at: knex.raw('updated_at') })
}

exports.down = async function (knex) {
  await knex.schema.alterTable('cows', (table) => {
    table.dropColumn('status_changed_at')
  })
}
