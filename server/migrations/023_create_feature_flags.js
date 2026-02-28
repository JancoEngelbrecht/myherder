const DEFAULTS = ['breeding', 'milk_recording', 'health_issues', 'treatments', 'analytics']

exports.up = async function (knex) {
  await knex.schema.createTable('feature_flags', (t) => {
    t.string('key', 50).primary()
    t.boolean('enabled').notNullable().defaultTo(true)
    t.datetime('updated_at').defaultTo(knex.fn.now())
  })

  const now = new Date().toISOString()
  await knex('feature_flags').insert(
    DEFAULTS.map((key) => ({ key, enabled: true, updated_at: now })),
  )
}

exports.down = async function (knex) {
  await knex.schema.dropTable('feature_flags')
}
