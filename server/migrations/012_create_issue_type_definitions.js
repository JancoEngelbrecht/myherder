const { randomUUID: uuidv4 } = require('crypto')

const DEFAULTS = [
  {
    code: 'lameness',
    name: 'Lameness',
    emoji: '🦵',
    requires_teat_selection: false,
    sort_order: 0,
  },
  { code: 'mastitis', name: 'Mastitis', emoji: '🍼', requires_teat_selection: true, sort_order: 1 },
  {
    code: 'respiratory',
    name: 'Respiratory',
    emoji: '🫁',
    requires_teat_selection: false,
    sort_order: 2,
  },
  {
    code: 'digestive',
    name: 'Digestive',
    emoji: '🤢',
    requires_teat_selection: false,
    sort_order: 3,
  },
  { code: 'fever', name: 'Fever', emoji: '🌡️', requires_teat_selection: false, sort_order: 4 },
  { code: 'bad_milk', name: 'Bad Milk', emoji: '🥛', requires_teat_selection: true, sort_order: 5 },
  { code: 'eye', name: 'Eye', emoji: '👁️', requires_teat_selection: false, sort_order: 6 },
  { code: 'calving', name: 'Calving', emoji: '🐄', requires_teat_selection: false, sort_order: 7 },
  { code: 'other', name: 'Other', emoji: '❓', requires_teat_selection: false, sort_order: 8 },
]

exports.up = async function (knex) {
  await knex.schema.createTable('issue_type_definitions', (t) => {
    t.uuid('id').primary()
    t.string('code', 50).notNullable().unique()
    t.string('name', 100).notNullable()
    t.string('emoji', 10).notNullable().defaultTo('❓')
    t.boolean('requires_teat_selection').notNullable().defaultTo(false)
    t.boolean('is_active').notNullable().defaultTo(true)
    t.integer('sort_order').notNullable().defaultTo(0)
    t.timestamps(false, true)
  })

  const now = knex.fn.now()
  await knex('issue_type_definitions').insert(
    DEFAULTS.map((d) => ({
      id: uuidv4(),
      code: d.code,
      name: d.name,
      emoji: d.emoji,
      requires_teat_selection: d.requires_teat_selection,
      is_active: true,
      sort_order: d.sort_order,
      created_at: now,
      updated_at: now,
    }))
  )
}

exports.down = async function (knex) {
  await knex.schema.dropTable('issue_type_definitions')
}
