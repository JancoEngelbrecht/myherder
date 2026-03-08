const db = require('../../config/database')
const { MS_PER_DAY } = require('../../helpers/constants')

// ── Shared report helpers ─────────────────────────────────────

/**
 * Batch-fetch medications (primary + additional) for a list of treatment IDs.
 * Returns { [treatmentId]: [{ name, active_ingredient, dosage }] }
 */
async function batchMedications(treatmentIds, farmId) {
  if (!treatmentIds.length) return {}

  // Run both medication queries in parallel, scoped to the farm
  const [primary, extra] = await Promise.all([
    db('treatments as t')
      .join('medications as m', 't.medication_id', 'm.id')
      .where('t.farm_id', farmId)
      .whereIn('t.id', treatmentIds)
      .select('t.id as treatment_id', 'm.name', 'm.active_ingredient', 't.dosage'),
    db('treatment_medications as tm')
      .join('medications as m', 'tm.medication_id', 'm.id')
      .join('treatments as t', 'tm.treatment_id', 't.id')
      .where('t.farm_id', farmId)
      .whereIn('tm.treatment_id', treatmentIds)
      .select('tm.treatment_id', 'm.name', 'm.active_ingredient', 'tm.dosage'),
  ])

  const map = {}
  for (const row of primary) {
    ;(map[row.treatment_id] ??= []).push(row)
  }

  for (const row of extra) {
    const list = map[row.treatment_id] ??= []
    if (!list.some((r) => r.name === row.name)) list.push(row) // dedupe by name
  }

  return map
}

/**
 * Fetch issue type code→name mapping from the database, scoped to the farm.
 */
async function getIssueTypeMap(farmId) {
  const query = db('issue_type_definitions').select('code', 'name')
  query.where('farm_id', farmId)
  const types = await query
  const map = {}
  for (const t of types) map[t.code] = t.name
  return map
}

/**
 * Safely parse a JSON column value (stored as string in SQLite).
 */
function parseJsonColumn(val) {
  if (typeof val === 'string') {
    try { return JSON.parse(val) } catch { return [] }
  }
  return Array.isArray(val) ? val : []
}

module.exports = { batchMedications, getIssueTypeMap, parseJsonColumn, MS_PER_DAY }
