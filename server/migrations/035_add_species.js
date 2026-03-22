/**
 * Migration 035: Add species support
 *
 * Introduces the `species` table (cattle, sheep) with JSON config for
 * terminology, life phases, emoji, and breeding event types. Adds
 * `species_id` FK to breed_types, default_breed_types, and cows.
 * Adds `offspring_count` to breeding_events and `birth_event_id` to cows
 * for multiple-birth support.
 *
 * Backfills all existing data as cattle. Seeds sheep breed types,
 * issue types, and medications into global defaults.
 *
 * SQLite: ADD COLUMN works for nullable columns. The down() drops columns
 * using SQLite 3.35+ DROP COLUMN support (better-sqlite3 ships 3.45+).
 */

const { randomUUID } = require('crypto')

// ── Fixed species UUIDs (deterministic for backfill) ─────────────────────

const CATTLE_ID = '00000000-0000-4000-a000-000000000001'
const SHEEP_ID = '00000000-0000-4000-a000-000000000002'

// ── Species config JSON ──────────────────────────────────────────────────

const CATTLE_CONFIG = JSON.stringify({
  terminology: {
    singular: 'Cow',
    plural: 'Cows',
    maleSingular: 'Bull',
    femaleSingular: 'Cow',
    youngSingular: 'Calf',
    youngPlural: 'Calves',
    collectiveNoun: 'Herd',
    birthEvent: 'Calving',
    birthEventPast: 'Calved',
    maleService: 'Bull Service',
  },
  emoji: { female: '🐄', male: '🐂', young: '🐮' },
  life_phases: {
    female: [
      { code: 'calf', maxMonths: 6 },
      { code: 'heifer', minMonths: 6 },
      { code: 'cow', minMonths: 15 },
    ],
    male: [
      { code: 'calf', maxMonths: 6 },
      { code: 'young_bull', minMonths: 6 },
      { code: 'bull', minMonths: 15 },
    ],
  },
  event_types: [
    'heat_observed',
    'ai_insemination',
    'bull_service',
    'preg_check_positive',
    'preg_check_negative',
    'calving',
    'abortion',
    'dry_off',
  ],
  typical_multiple_births: 1,
  max_offspring: 2,
})

const SHEEP_CONFIG = JSON.stringify({
  terminology: {
    singular: 'Sheep',
    plural: 'Sheep',
    maleSingular: 'Ram',
    femaleSingular: 'Ewe',
    youngSingular: 'Lamb',
    youngPlural: 'Lambs',
    collectiveNoun: 'Flock',
    birthEvent: 'Lambing',
    birthEventPast: 'Lambed',
    maleService: 'Ram Service',
  },
  emoji: { female: '🐑', male: '🐏', young: '🐑' },
  life_phases: {
    female: [
      { code: 'lamb', maxMonths: 6 },
      { code: 'ewe', minMonths: 6 },
    ],
    male: [
      { code: 'lamb', maxMonths: 6 },
      { code: 'ram', minMonths: 6 },
    ],
  },
  event_types: [
    'heat_observed',
    'ai_insemination',
    'ram_service',
    'preg_check_positive',
    'preg_check_negative',
    'lambing',
    'abortion',
  ],
  typical_multiple_births: 2,
  max_offspring: 4,
})

// ── Sheep default data ───────────────────────────────────────────────────

const SHEEP_BREED_DEFAULTS = [
  {
    code: 'dorper',
    name: 'Dorper',
    heat_cycle_days: 17,
    gestation_days: 150,
    preg_check_days: 30,
    voluntary_waiting_days: 60,
    dry_off_days: 0,
    calf_max_months: 6,
    heifer_min_months: 8,
    young_bull_min_months: 8,
    sort_order: 10,
  },
  {
    code: 'meatmaster',
    name: 'Meatmaster',
    heat_cycle_days: 17,
    gestation_days: 150,
    preg_check_days: 30,
    voluntary_waiting_days: 60,
    dry_off_days: 0,
    calf_max_months: 6,
    heifer_min_months: 8,
    young_bull_min_months: 8,
    sort_order: 11,
  },
  {
    code: 'sa_mutton_merino',
    name: 'SA Mutton Merino',
    heat_cycle_days: 17,
    gestation_days: 150,
    preg_check_days: 30,
    voluntary_waiting_days: 60,
    dry_off_days: 0,
    calf_max_months: 6,
    heifer_min_months: 8,
    young_bull_min_months: 8,
    sort_order: 12,
  },
  {
    code: 'dohne_merino',
    name: 'Dohne Merino',
    heat_cycle_days: 17,
    gestation_days: 150,
    preg_check_days: 30,
    voluntary_waiting_days: 60,
    dry_off_days: 0,
    calf_max_months: 6,
    heifer_min_months: 8,
    young_bull_min_months: 8,
    sort_order: 13,
  },
]

const SHEEP_ISSUE_DEFAULTS = [
  {
    code: 'pulpy_kidney',
    name: 'Pulpy Kidney',
    emoji: '💉',
    requires_teat_selection: false,
    sort_order: 20,
  },
  {
    code: 'blue_tongue',
    name: 'Blue Tongue',
    emoji: '👅',
    requires_teat_selection: false,
    sort_order: 21,
  },
  {
    code: 'internal_parasites',
    name: 'Internal Parasites',
    emoji: '🪱',
    requires_teat_selection: false,
    sort_order: 22,
  },
  { code: 'orf', name: 'Orf', emoji: '🤕', requires_teat_selection: false, sort_order: 23 },
  {
    code: 'foot_rot',
    name: 'Foot Rot',
    emoji: '🦶',
    requires_teat_selection: false,
    sort_order: 24,
  },
]

const SHEEP_MEDICATION_DEFAULTS = [
  {
    name: 'Multivax P Plus',
    active_ingredient: 'Clostridial vaccine',
    withdrawal_milk_hours: 0,
    withdrawal_milk_days: 0,
    withdrawal_meat_hours: 0,
    withdrawal_meat_days: 21,
    default_dosage: '2ml',
    unit: 'ml',
    notes: 'Clostridial vaccine for sheep. Annual booster.',
  },
  {
    name: 'Dectomax Injectable',
    active_ingredient: 'Doramectin',
    withdrawal_milk_hours: 0,
    withdrawal_milk_days: 0,
    withdrawal_meat_hours: 0,
    withdrawal_meat_days: 35,
    default_dosage: '1ml/50kg',
    unit: 'ml',
    notes: 'Broad-spectrum parasiticide. Inject SC.',
  },
  {
    name: 'Ivermectin 1%',
    active_ingredient: 'Ivermectin',
    withdrawal_milk_hours: 0,
    withdrawal_milk_days: 0,
    withdrawal_meat_hours: 0,
    withdrawal_meat_days: 14,
    default_dosage: '1ml/50kg',
    unit: 'ml',
    notes: 'Internal and external parasite control. Inject SC.',
  },
]

// ── Migration ────────────────────────────────────────────────────────────

exports.up = async function (knex) {
  const isSQLite = knex.client.config.client === 'better-sqlite3'
  const now = knex.fn.now()

  // 1. Create species table
  await knex.schema.createTable('species', (t) => {
    t.string('id', 36).primary()
    t.string('code', 50).notNullable().unique()
    t.string('name', 100).notNullable()
    t.text('config') // JSON — terminology, life_phases, emoji, event_types
    t.boolean('is_active').defaultTo(true)
    t.integer('sort_order').defaultTo(0)
    t.timestamp('created_at').defaultTo(now)
    t.timestamp('updated_at').defaultTo(now)
  })

  // MySQL: ensure config column supports emoji in JSON
  if (!isSQLite) {
    await knex.raw(
      'ALTER TABLE `species` MODIFY COLUMN `config` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
    )
  }

  // 2. Create farm_species junction table (1:1 for now, junction for future multi-species)
  await knex.schema.createTable('farm_species', (t) => {
    t.string('farm_id', 36).notNullable()
    t.string('species_id', 36).notNullable()
    t.primary(['farm_id', 'species_id'])
    t.unique(['farm_id']) // Enforce 1 species per farm for now
    t.foreign('farm_id').references('farms.id')
    t.foreign('species_id').references('species.id')
  })

  // 3. Seed species rows
  await knex('species').insert([
    {
      id: CATTLE_ID,
      code: 'cattle',
      name: 'Cattle',
      config: CATTLE_CONFIG,
      is_active: true,
      sort_order: 0,
      created_at: now,
      updated_at: now,
    },
    {
      id: SHEEP_ID,
      code: 'sheep',
      name: 'Sheep',
      config: SHEEP_CONFIG,
      is_active: true,
      sort_order: 1,
      created_at: now,
      updated_at: now,
    },
  ])

  // 4. Add species_id to breed_types (nullable — backfill below)
  await knex.schema.alterTable('breed_types', (t) => {
    t.string('species_id', 36).nullable()
  })

  // 5. Add species_id to default_breed_types (nullable — backfill below)
  await knex.schema.alterTable('default_breed_types', (t) => {
    t.string('species_id', 36).nullable()
  })

  // 6. Add species_id + birth_event_id to cows (nullable)
  await knex.schema.alterTable('cows', (t) => {
    t.string('species_id', 36).nullable()
    t.string('birth_event_id', 36).nullable()
  })

  // 7. Add offspring_count to breeding_events
  await knex.schema.alterTable('breeding_events', (t) => {
    t.integer('offspring_count').defaultTo(1)
  })

  // 8. Backfill existing data as cattle
  await knex('breed_types').whereNull('species_id').update({ species_id: CATTLE_ID })
  await knex('default_breed_types').whereNull('species_id').update({ species_id: CATTLE_ID })
  await knex('cows').whereNull('species_id').update({ species_id: CATTLE_ID })

  // 9. Backfill farm_species for all existing farms
  const farms = await knex('farms').select('id')
  if (farms.length > 0) {
    await knex('farm_species').insert(farms.map((f) => ({ farm_id: f.id, species_id: CATTLE_ID })))
  }

  // 10. Seed sheep breed types into global defaults
  await knex('default_breed_types').insert(
    SHEEP_BREED_DEFAULTS.map((d) => ({
      id: randomUUID(),
      ...d,
      species_id: SHEEP_ID,
      is_active: true,
      created_at: now,
      updated_at: now,
    }))
  )

  // 11. Seed sheep issue types into global defaults
  // (emoji charset already handled by migration 034)
  await knex('default_issue_types').insert(
    SHEEP_ISSUE_DEFAULTS.map((d) => ({
      id: randomUUID(),
      ...d,
      is_active: true,
      created_at: now,
      updated_at: now,
    }))
  )

  // 12. Seed sheep medications into global defaults
  await knex('default_medications').insert(
    SHEEP_MEDICATION_DEFAULTS.map((d) => ({
      id: randomUUID(),
      ...d,
      is_active: true,
      created_at: now,
      updated_at: now,
    }))
  )

  // 13. Add FK constraints (after backfill so no constraint violations)
  // SQLite: ALTER TABLE ADD COLUMN doesn't support FK — FKs only enforced at INSERT/UPDATE
  // MySQL: add actual FK constraints
  if (!isSQLite) {
    await knex.raw(
      'ALTER TABLE `breed_types` ADD CONSTRAINT `breed_types_species_id_fk` FOREIGN KEY (`species_id`) REFERENCES `species`(`id`)'
    )
    await knex.raw(
      'ALTER TABLE `default_breed_types` ADD CONSTRAINT `default_breed_types_species_id_fk` FOREIGN KEY (`species_id`) REFERENCES `species`(`id`)'
    )
    await knex.raw(
      'ALTER TABLE `cows` ADD CONSTRAINT `cows_species_id_fk` FOREIGN KEY (`species_id`) REFERENCES `species`(`id`)'
    )
    await knex.raw(
      'ALTER TABLE `cows` ADD CONSTRAINT `cows_birth_event_id_fk` FOREIGN KEY (`birth_event_id`) REFERENCES `breeding_events`(`id`) ON DELETE SET NULL'
    )
  }
}

exports.down = async function (knex) {
  const isSQLite = knex.client.config.client === 'better-sqlite3'

  // Remove FK constraints on MySQL first
  if (!isSQLite) {
    // Wrap each in try-catch in case constraint doesn't exist
    for (const sql of [
      'ALTER TABLE `cows` DROP FOREIGN KEY `cows_birth_event_id_fk`',
      'ALTER TABLE `cows` DROP FOREIGN KEY `cows_species_id_fk`',
      'ALTER TABLE `default_breed_types` DROP FOREIGN KEY `default_breed_types_species_id_fk`',
      'ALTER TABLE `breed_types` DROP FOREIGN KEY `breed_types_species_id_fk`',
    ]) {
      try {
        await knex.raw(sql)
      } catch {
        /* constraint may not exist */
      }
    }
  }

  // Remove seeded sheep defaults (by species_id or known codes)
  const sheepBreedCodes = SHEEP_BREED_DEFAULTS.map((d) => d.code)
  const sheepIssueCodes = SHEEP_ISSUE_DEFAULTS.map((d) => d.code)
  const sheepMedNames = SHEEP_MEDICATION_DEFAULTS.map((d) => d.name)

  await knex('default_breed_types').whereIn('code', sheepBreedCodes).del()
  await knex('default_issue_types').whereIn('code', sheepIssueCodes).del()
  await knex('default_medications').whereIn('name', sheepMedNames).del()

  // Drop columns — SQLite 3.35+ supports DROP COLUMN (better-sqlite3 ships 3.45+)
  await knex.schema.alterTable('breeding_events', (t) => {
    t.dropColumn('offspring_count')
  })

  await knex.schema.alterTable('cows', (t) => {
    t.dropColumn('birth_event_id')
    t.dropColumn('species_id')
  })

  await knex.schema.alterTable('default_breed_types', (t) => {
    t.dropColumn('species_id')
  })

  await knex.schema.alterTable('breed_types', (t) => {
    t.dropColumn('species_id')
  })

  // Drop tables (farm_species first due to FK on species)
  await knex.schema.dropTableIfExists('farm_species')
  await knex.schema.dropTableIfExists('species')
}
