const { randomUUID: uuidv4 } = require('crypto')

// ── Default breed types (from migration 017) ────────────────────────────────

const DEFAULT_BREED_TYPES = [
  { code: 'holstein', name: 'Holstein', heat_cycle_days: 21, gestation_days: 280, preg_check_days: 35, voluntary_waiting_days: 50, dry_off_days: 60, calf_max_months: 6, heifer_min_months: 15, young_bull_min_months: 15, sort_order: 0 },
  { code: 'jersey', name: 'Jersey', heat_cycle_days: 21, gestation_days: 279, preg_check_days: 35, voluntary_waiting_days: 45, dry_off_days: 60, calf_max_months: 6, heifer_min_months: 14, young_bull_min_months: 15, sort_order: 1 },
  { code: 'ayrshire', name: 'Ayrshire', heat_cycle_days: 21, gestation_days: 279, preg_check_days: 35, voluntary_waiting_days: 45, dry_off_days: 60, calf_max_months: 6, heifer_min_months: 15, young_bull_min_months: 15, sort_order: 2 },
  { code: 'nguni', name: 'Nguni', heat_cycle_days: 21, gestation_days: 285, preg_check_days: 35, voluntary_waiting_days: 60, dry_off_days: 60, calf_max_months: 8, heifer_min_months: 18, young_bull_min_months: 15, sort_order: 3 },
  { code: 'brahman', name: 'Brahman', heat_cycle_days: 21, gestation_days: 292, preg_check_days: 35, voluntary_waiting_days: 60, dry_off_days: 60, calf_max_months: 8, heifer_min_months: 24, young_bull_min_months: 15, sort_order: 4 },
]

// ── Default issue types (from migration 012) ────────────────────────────────

const DEFAULT_ISSUE_TYPES = [
  { code: 'lameness', name: 'Lameness', emoji: '🦵', requires_teat_selection: false, sort_order: 0 },
  { code: 'mastitis', name: 'Mastitis', emoji: '🍼', requires_teat_selection: true, sort_order: 1 },
  { code: 'respiratory', name: 'Respiratory', emoji: '🫁', requires_teat_selection: false, sort_order: 2 },
  { code: 'digestive', name: 'Digestive', emoji: '🤢', requires_teat_selection: false, sort_order: 3 },
  { code: 'fever', name: 'Fever', emoji: '🌡️', requires_teat_selection: false, sort_order: 4 },
  { code: 'bad_milk', name: 'Bad Milk', emoji: '🥛', requires_teat_selection: true, sort_order: 5 },
  { code: 'eye', name: 'Eye', emoji: '👁️', requires_teat_selection: false, sort_order: 6 },
  { code: 'calving', name: 'Calving', emoji: '🐄', requires_teat_selection: false, sort_order: 7 },
  { code: 'other', name: 'Other', emoji: '❓', requires_teat_selection: false, sort_order: 8 },
]

// ── Default medications (from seed 002) ─────────────────────────────────────

const DEFAULT_MEDICATIONS = [
  { name: 'Penicillin G', active_ingredient: 'Benzylpenicillin', withdrawal_milk_hours: 72, withdrawal_meat_days: 10, default_dosage: '5ml', unit: 'ml', notes: 'Broad-spectrum antibiotic. Administer IM.' },
  { name: 'Oxytetracycline 200mg/ml', active_ingredient: 'Oxytetracycline', withdrawal_milk_hours: 96, withdrawal_meat_days: 28, default_dosage: '10ml', unit: 'ml', notes: 'Long-acting. For respiratory and systemic infections.' },
  { name: 'Flunixin Meglumine (Banamine)', active_ingredient: 'Flunixin', withdrawal_milk_hours: 36, withdrawal_meat_days: 4, default_dosage: '2ml', unit: 'ml', notes: 'NSAID. Anti-inflammatory and analgesic.' },
  { name: 'Mastitis Intramammary Tube', active_ingredient: 'Cloxacillin', withdrawal_milk_hours: 96, withdrawal_meat_days: 7, default_dosage: '1 tube', unit: 'tube', notes: 'For mastitis. Infuse directly into affected quarter after milking.' },
  { name: 'Vitamins B-complex', active_ingredient: 'B-vitamins', withdrawal_milk_hours: 0, withdrawal_meat_days: 0, default_dosage: '10ml', unit: 'ml', notes: 'No withdrawal period. General supplementation.' },
]

// ── Default feature flags ───────────────────────────────────────────────────

const DEFAULT_FLAGS = ['breeding', 'milk_recording', 'health_issues', 'treatments', 'analytics']

/**
 * Seed default reference data for a newly created farm.
 * Must be called within a transaction (trx) for atomicity.
 *
 * @param {string} farmId - The farm UUID
 * @param {string} farmName - The farm name (for app_settings)
 * @param {object} trx - Knex transaction object
 */
async function seedFarmDefaults(farmId, farmName, trx) {
  const now = new Date().toISOString()

  // 1. Breed types
  await trx('breed_types').insert(
    DEFAULT_BREED_TYPES.map((d) => ({
      id: uuidv4(),
      farm_id: farmId,
      ...d,
      is_active: true,
      created_at: now,
      updated_at: now,
    }))
  )

  // 2. Issue types
  await trx('issue_type_definitions').insert(
    DEFAULT_ISSUE_TYPES.map((d) => ({
      id: uuidv4(),
      farm_id: farmId,
      ...d,
      is_active: true,
      created_at: now,
      updated_at: now,
    }))
  )

  // 3. Medications
  await trx('medications').insert(
    DEFAULT_MEDICATIONS.map((d) => ({
      id: uuidv4(),
      farm_id: farmId,
      ...d,
      is_active: true,
      created_at: now,
      updated_at: now,
    }))
  )

  // 4. Feature flags (all enabled)
  await trx('feature_flags').insert(
    DEFAULT_FLAGS.map((key) => ({ farm_id: farmId, key, enabled: true }))
  )

  // 5. App settings
  await trx('app_settings').insert([
    { farm_id: farmId, key: 'farm_name', value: farmName },
    { farm_id: farmId, key: 'default_language', value: 'en' },
  ])
}

module.exports = { seedFarmDefaults }
