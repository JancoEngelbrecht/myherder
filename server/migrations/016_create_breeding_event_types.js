const { randomUUID: uuidv4 } = require('crypto')

const DEFAULTS = [
  { code: 'heat_observed', name: 'Heat Observed', emoji: '🔥', sort_order: 0 },
  { code: 'ai_insemination', name: 'AI Insemination', emoji: '🧬', sort_order: 1 },
  { code: 'bull_service', name: 'Bull Service', emoji: '🐂', sort_order: 2 },
  { code: 'preg_check_positive', name: 'Preg Check ✓', emoji: '✅', sort_order: 3 },
  { code: 'preg_check_negative', name: 'Preg Check ✗', emoji: '❌', sort_order: 4 },
  { code: 'calving', name: 'Calving', emoji: '🐮', sort_order: 5 },
  { code: 'abortion', name: 'Abortion', emoji: '⚠️', sort_order: 6 },
]

exports.up = async function (knex) {
  await knex.schema.createTable('breeding_event_types', (t) => {
    t.uuid('id').primary()
    t.string('code', 50).notNullable().unique()
    t.string('name', 100).notNullable()
    t.string('emoji', 10).notNullable().defaultTo('🐄')
    t.boolean('is_active').notNullable().defaultTo(true)
    t.integer('sort_order').notNullable().defaultTo(0)
    t.timestamps(false, true)
  })

  const now = knex.fn.now()
  await knex('breeding_event_types').insert(
    DEFAULTS.map((d) => ({
      id: uuidv4(),
      code: d.code,
      name: d.name,
      emoji: d.emoji,
      is_active: true,
      sort_order: d.sort_order,
      created_at: now,
      updated_at: now,
    }))
  )
}

exports.down = async function (knex) {
  await knex.schema.dropTable('breeding_event_types')
}
