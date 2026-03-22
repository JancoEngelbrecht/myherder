const { randomUUID: uuidv4 } = require('crypto')

// ── Hardcoded fallback defaults (used when global tables are empty) ──
// These are cattle-only defaults. Sheep defaults live in global default_* tables
// (seeded by migration 035). Fallbacks have no species_id — they are only used
// when the global tables are empty (fresh DB with no migration 033+ data).

const FALLBACK_BREED_TYPES = [
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

const FALLBACK_ISSUE_TYPES = [
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

const FALLBACK_MEDICATIONS = [
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

const DEFAULT_FLAGS = ['breeding', 'milk_recording', 'health_issues', 'treatments', 'analytics']

// Flags to disable for non-dairy species
const NON_DAIRY_DISABLED_FLAGS = ['milk_recording']

/**
 * Seed default reference data for a newly created farm.
 * Reads from global default_* tables; falls back to hardcoded arrays if empty.
 * Must be called within a transaction (trx) for atomicity.
 *
 * @param {string} farmId - The farm UUID
 * @param {string} farmName - The farm name (for app_settings)
 * @param {object} trx - Knex transaction object
 * @param {object} [options] - Optional species config
 * @param {string} [options.speciesId] - Species UUID to filter defaults by. If omitted, seeds all defaults (backward compat).
 */
async function seedFarmDefaults(farmId, farmName, trx, options = {}) {
  const now = trx.fn.now()
  let { speciesId } = options

  // Default to cattle species if no speciesId provided (backward compat).
  // The species table may not exist yet (pre-migration-035), so guard the lookup.
  let speciesRow = null
  if (!speciesId) {
    try {
      speciesRow = await trx('species').where('code', 'cattle').first()
      if (speciesRow) speciesId = speciesRow.id
    } catch (err) {
      // Only suppress "table doesn't exist" errors (pre-migration-035 DB)
      const msg = (err.message || '').toLowerCase()
      const isTableMissing =
        msg.includes('no such table') ||
        msg.includes("doesn't exist") ||
        err.code === 'ER_NO_SUCH_TABLE'
      if (!isTableMissing) throw err
    }
  }

  // 1. Breed types — read from global defaults, fallback to hardcoded
  let breedQuery = trx('default_breed_types').where('is_active', true).orderBy('sort_order')
  if (speciesId) breedQuery = breedQuery.where('species_id', speciesId)
  let breedDefaults = await breedQuery
  if (breedDefaults.length === 0) breedDefaults = FALLBACK_BREED_TYPES

  await trx('breed_types').insert(
    breedDefaults.map((d) => ({
      id: uuidv4(),
      farm_id: farmId,
      code: d.code,
      name: d.name,
      species_id: d.species_id || speciesId || null,
      heat_cycle_days: d.heat_cycle_days,
      gestation_days: d.gestation_days,
      preg_check_days: d.preg_check_days,
      voluntary_waiting_days: d.voluntary_waiting_days,
      dry_off_days: d.dry_off_days,
      calf_max_months: d.calf_max_months,
      heifer_min_months: d.heifer_min_months,
      young_bull_min_months: d.young_bull_min_months,
      sort_order: d.sort_order ?? 0,
      is_active: true,
      created_at: now,
      updated_at: now,
    }))
  )

  // 2. Issue types — read from global defaults, fallback to hardcoded
  // Issue types and medications are not species-scoped in the DB yet,
  // so we seed all of them regardless of species. Farm admins can
  // deactivate irrelevant ones (e.g. Mastitis for sheep farms).
  let issueDefaults = await trx('default_issue_types')
    .where('is_active', true)
    .orderBy('sort_order')
  if (issueDefaults.length === 0) issueDefaults = FALLBACK_ISSUE_TYPES

  await trx('issue_type_definitions').insert(
    issueDefaults.map((d) => ({
      id: uuidv4(),
      farm_id: farmId,
      code: d.code,
      name: d.name,
      emoji: d.emoji,
      requires_teat_selection: d.requires_teat_selection,
      sort_order: d.sort_order ?? 0,
      is_active: true,
      created_at: now,
      updated_at: now,
    }))
  )

  // 3. Medications — read from global defaults, fallback to hardcoded
  let medDefaults = await trx('default_medications').where('is_active', true)
  if (medDefaults.length === 0) medDefaults = FALLBACK_MEDICATIONS

  await trx('medications').insert(
    medDefaults.map((d) => ({
      id: uuidv4(),
      farm_id: farmId,
      name: d.name,
      active_ingredient: d.active_ingredient,
      withdrawal_milk_hours: d.withdrawal_milk_hours,
      withdrawal_milk_days: d.withdrawal_milk_days ?? 0,
      withdrawal_meat_hours: d.withdrawal_meat_hours ?? 0,
      withdrawal_meat_days: d.withdrawal_meat_days,
      default_dosage: d.default_dosage,
      unit: d.unit,
      notes: d.notes,
      is_active: true,
      created_at: now,
      updated_at: now,
    }))
  )

  // 4. Feature flags
  // Determine if this is a dairy species (has dry_off in its event types)
  let isDairy = true
  if (speciesId) {
    // Reuse speciesRow if already fetched, otherwise look up once
    const species =
      speciesRow && speciesRow.id === speciesId
        ? speciesRow
        : await trx('species').where('id', speciesId).first()
    if (species && species.config) {
      try {
        const config = JSON.parse(species.config)
        isDairy = (config.event_types || []).includes('dry_off')
      } catch {
        /* fallback to dairy */
      }
    }
  }

  await trx('feature_flags').insert(
    DEFAULT_FLAGS.map((key) => ({
      farm_id: farmId,
      key,
      enabled: isDairy ? true : !NON_DAIRY_DISABLED_FLAGS.includes(key),
    }))
  )

  // 5. App settings
  await trx('app_settings').insert([
    { farm_id: farmId, key: 'farm_name', value: farmName },
    { farm_id: farmId, key: 'default_language', value: 'en' },
  ])

  // 6. Farm-species association (if speciesId provided)
  if (speciesId) {
    // Use INSERT OR IGNORE pattern to avoid duplicate if already inserted
    const existing = await trx('farm_species')
      .where({ farm_id: farmId, species_id: speciesId })
      .first()
    if (!existing) {
      await trx('farm_species').insert({ farm_id: farmId, species_id: speciesId })
    }
  }
}

module.exports = { seedFarmDefaults }
