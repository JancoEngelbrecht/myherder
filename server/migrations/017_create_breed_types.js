const { randomUUID: uuidv4 } = require('crypto')

const DEFAULTS = [
  {
    code: 'holstein',
    name: 'Holstein',
    heat_cycle_days: 21,
    gestation_days: 280,
    preg_check_days: 35,
    voluntary_waiting_days: 50,
    dry_off_days: 60,
    calf_max_months: 6,
    heifer_min_months: 15,
    young_bull_min_months: 15,
    sort_order: 0,
  },
  {
    code: 'jersey',
    name: 'Jersey',
    heat_cycle_days: 21,
    gestation_days: 279,
    preg_check_days: 35,
    voluntary_waiting_days: 45,
    dry_off_days: 60,
    calf_max_months: 6,
    heifer_min_months: 14,
    young_bull_min_months: 15,
    sort_order: 1,
  },
  {
    code: 'ayrshire',
    name: 'Ayrshire',
    heat_cycle_days: 21,
    gestation_days: 279,
    preg_check_days: 35,
    voluntary_waiting_days: 45,
    dry_off_days: 60,
    calf_max_months: 6,
    heifer_min_months: 15,
    young_bull_min_months: 15,
    sort_order: 2,
  },
  {
    code: 'nguni',
    name: 'Nguni',
    heat_cycle_days: 21,
    gestation_days: 285,
    preg_check_days: 35,
    voluntary_waiting_days: 60,
    dry_off_days: 60,
    calf_max_months: 8,
    heifer_min_months: 18,
    young_bull_min_months: 15,
    sort_order: 3,
  },
  {
    code: 'brahman',
    name: 'Brahman',
    heat_cycle_days: 21,
    gestation_days: 292,
    preg_check_days: 35,
    voluntary_waiting_days: 60,
    dry_off_days: 60,
    calf_max_months: 8,
    heifer_min_months: 24,
    young_bull_min_months: 15,
    sort_order: 4,
  },
]

exports.up = async function (knex) {
  await knex.schema.createTable('breed_types', (t) => {
    t.string('id', 36).primary()
    t.string('code', 50).notNullable().unique()
    t.string('name', 100).notNullable()
    t.integer('heat_cycle_days').notNullable().defaultTo(21)
    t.integer('gestation_days').notNullable().defaultTo(283)
    t.integer('preg_check_days').notNullable().defaultTo(35)
    t.integer('voluntary_waiting_days').notNullable().defaultTo(45)
    t.integer('dry_off_days').notNullable().defaultTo(60)
    t.integer('calf_max_months').notNullable().defaultTo(6)
    t.integer('heifer_min_months').notNullable().defaultTo(15)
    t.integer('young_bull_min_months').notNullable().defaultTo(15)
    t.boolean('is_active').notNullable().defaultTo(true)
    t.integer('sort_order').notNullable().defaultTo(0)
    t.timestamps(false, true)
  })

  const now = knex.fn.now()
  await knex('breed_types').insert(
    DEFAULTS.map((d) => ({
      id: uuidv4(),
      ...d,
      is_active: true,
      created_at: now,
      updated_at: now,
    })),
  )
}

exports.down = async function (knex) {
  await knex.schema.dropTable('breed_types')
}
