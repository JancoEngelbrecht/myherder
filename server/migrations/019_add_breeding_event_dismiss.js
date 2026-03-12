const { randomUUID: uuidv4 } = require('crypto')

exports.up = async function (knex) {
  await knex.schema.alterTable('breeding_events', (t) => {
    t.timestamp('dismissed_at').nullable()
    t.string('dismissed_by', 36).nullable().references('id').inTable('users')
    t.string('dismiss_reason', 500).nullable()
  })

  // Insert dry_off event type
  const now = knex.fn.now()
  await knex('breeding_event_types').insert({
    id: uuidv4(),
    code: 'dry_off',
    name: 'Dry Off',
    emoji: '🌿',
    is_active: true,
    sort_order: 7,
    created_at: now,
    updated_at: now,
  })
}

exports.down = async function (knex) {
  await knex.schema.alterTable('breeding_events', (t) => {
    t.dropColumn('dismissed_at')
    t.dropColumn('dismissed_by')
    t.dropColumn('dismiss_reason')
  })

  await knex('breeding_event_types').where('code', 'dry_off').del()
}
