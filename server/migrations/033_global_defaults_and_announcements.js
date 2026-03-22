const { randomUUID } = require('crypto')

// ── Default data (same as farmSeedService.js) ──────────────────────

const DEFAULT_BREED_TYPES = [
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

const DEFAULT_ISSUE_TYPES = [
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

const DEFAULT_MEDICATIONS = [
  {
    name: 'Penicillin G',
    active_ingredient: 'Benzylpenicillin',
    withdrawal_milk_hours: 72,
    withdrawal_meat_days: 10,
    default_dosage: '5ml',
    unit: 'ml',
    notes: 'Broad-spectrum antibiotic. Administer IM.',
  },
  {
    name: 'Oxytetracycline 200mg/ml',
    active_ingredient: 'Oxytetracycline',
    withdrawal_milk_hours: 96,
    withdrawal_meat_days: 28,
    default_dosage: '10ml',
    unit: 'ml',
    notes: 'Long-acting. For respiratory and systemic infections.',
  },
  {
    name: 'Flunixin Meglumine (Banamine)',
    active_ingredient: 'Flunixin',
    withdrawal_milk_hours: 36,
    withdrawal_meat_days: 4,
    default_dosage: '2ml',
    unit: 'ml',
    notes: 'NSAID. Anti-inflammatory and analgesic.',
  },
  {
    name: 'Mastitis Intramammary Tube',
    active_ingredient: 'Cloxacillin',
    withdrawal_milk_hours: 96,
    withdrawal_meat_days: 7,
    default_dosage: '1 tube',
    unit: 'tube',
    notes: 'For mastitis. Infuse directly into affected quarter after milking.',
  },
  {
    name: 'Vitamins B-complex',
    active_ingredient: 'B-vitamins',
    withdrawal_milk_hours: 0,
    withdrawal_meat_days: 0,
    default_dosage: '10ml',
    unit: 'ml',
    notes: 'No withdrawal period. General supplementation.',
  },
]

exports.up = async function (knex) {
  const isSQLite = knex.client.config.client === 'better-sqlite3'
  const now = knex.fn.now()

  // ── default_breed_types ──────────────────────────────────────
  await knex.schema.createTable('default_breed_types', (t) => {
    t.string('id', 36).primary()
    t.string('code', 50).notNullable().unique()
    t.string('name', 100).notNullable().unique()
    t.integer('heat_cycle_days').defaultTo(21)
    t.integer('gestation_days').defaultTo(283)
    t.integer('preg_check_days').defaultTo(35)
    t.integer('voluntary_waiting_days').defaultTo(50)
    t.integer('dry_off_days').defaultTo(60)
    t.integer('calf_max_months').defaultTo(6)
    t.integer('heifer_min_months').defaultTo(15)
    t.integer('young_bull_min_months').defaultTo(15)
    t.boolean('is_active').defaultTo(true)
    t.integer('sort_order').defaultTo(0)
    t.timestamp('created_at').defaultTo(knex.fn.now())
    t.timestamp('updated_at').defaultTo(knex.fn.now())
  })

  // ── default_issue_types ──────────────────────────────────────
  await knex.schema.createTable('default_issue_types', (t) => {
    t.string('id', 36).primary()
    t.string('code', 50).notNullable().unique()
    t.string('name', 100).notNullable().unique()
    const emojiCol = t.string('emoji', 10)
    if (!isSQLite) emojiCol.collate('utf8mb4_unicode_ci')
    t.boolean('requires_teat_selection').defaultTo(false)
    t.boolean('is_active').defaultTo(true)
    t.integer('sort_order').defaultTo(0)
    t.timestamp('created_at').defaultTo(knex.fn.now())
    t.timestamp('updated_at').defaultTo(knex.fn.now())
  })

  // ── default_medications ──────────────────────────────────────
  await knex.schema.createTable('default_medications', (t) => {
    t.string('id', 36).primary()
    t.string('name', 100).notNullable().unique()
    t.string('active_ingredient', 100)
    t.integer('withdrawal_milk_hours').notNullable().defaultTo(0)
    t.integer('withdrawal_milk_days').defaultTo(0)
    t.integer('withdrawal_meat_hours').defaultTo(0)
    t.integer('withdrawal_meat_days').notNullable().defaultTo(0)
    t.string('default_dosage', 100)
    t.string('unit', 20)
    t.text('notes')
    t.boolean('is_active').defaultTo(true)
    t.timestamp('created_at').defaultTo(knex.fn.now())
    t.timestamp('updated_at').defaultTo(knex.fn.now())
  })

  // ── system_announcements ─────────────────────────────────────
  await knex.schema.createTable('system_announcements', (t) => {
    t.string('id', 36).primary()
    t.string('type', 20).notNullable().defaultTo('info')
    t.string('title', 255).notNullable()
    t.text('message')
    t.timestamp('starts_at')
    t.timestamp('expires_at')
    t.boolean('is_active').defaultTo(true)
    t.string('created_by', 36).notNullable()
    t.timestamp('created_at').defaultTo(knex.fn.now())
    t.timestamp('updated_at').defaultTo(knex.fn.now())

    if (!isSQLite) {
      t.foreign('created_by').references('users.id')
    }
  })

  // ── announcement_dismissals ──────────────────────────────────
  await knex.schema.createTable('announcement_dismissals', (t) => {
    t.string('announcement_id', 36).notNullable()
    t.string('user_id', 36).notNullable()
    t.timestamp('dismissed_at').defaultTo(knex.fn.now())
    t.primary(['announcement_id', 'user_id'])

    if (!isSQLite) {
      t.foreign('announcement_id').references('system_announcements.id')
      t.foreign('user_id').references('users.id')
    }
  })

  // ── Seed default data ────────────────────────────────────────
  await knex('default_breed_types').insert(
    DEFAULT_BREED_TYPES.map((d) => ({
      id: randomUUID(),
      ...d,
      is_active: true,
      created_at: now,
      updated_at: now,
    }))
  )

  await knex('default_issue_types').insert(
    DEFAULT_ISSUE_TYPES.map((d) => ({
      id: randomUUID(),
      ...d,
      is_active: true,
      created_at: now,
      updated_at: now,
    }))
  )

  await knex('default_medications').insert(
    DEFAULT_MEDICATIONS.map((d) => ({
      id: randomUUID(),
      ...d,
      withdrawal_milk_days: 0,
      withdrawal_meat_hours: 0,
      is_active: true,
      created_at: now,
      updated_at: now,
    }))
  )
}

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('announcement_dismissals')
  await knex.schema.dropTableIfExists('system_announcements')
  await knex.schema.dropTableIfExists('default_medications')
  await knex.schema.dropTableIfExists('default_issue_types')
  await knex.schema.dropTableIfExists('default_breed_types')
}
