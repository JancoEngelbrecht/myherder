exports.up = async function (knex) {
  await knex.schema.createTable('app_settings', (table) => {
    table.string('key', 50).primary()
    table.text('value')
    table.timestamp('updated_at').defaultTo(knex.fn.now())
  })

  // Seed default settings
  const now = knex.fn.now()
  await knex('app_settings').insert([
    { key: 'farm_name', value: 'MyHerder Farm', updated_at: now },
    { key: 'default_language', value: 'en', updated_at: now },
  ])
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('app_settings')
}
