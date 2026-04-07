const Joi = require('joi')
const db = require('../../config/database')
const { ISO_DATE_RE, joiMsg, MS_PER_DAY } = require('../../helpers/constants')

/** Coerce a DB date/datetime value to a string (MySQL2 returns Date objects) */
function toStr(val) {
  if (val instanceof Date) return val.toISOString()
  return String(val ?? '')
}

/** Round to 2 decimal places — prevents floating-point display artifacts */
function round2(n) {
  return Math.round(n * 100) / 100
}

/** Local-date string YYYY-MM-DD (avoids UTC shift from toISOString) */
function localDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Joi schema for analytics date range query params */
const dateRangeSchema = Joi.object({
  from: Joi.string().pattern(ISO_DATE_RE).allow(''),
  to: Joi.string().pattern(ISO_DATE_RE).allow(''),
}).unknown(true)

/** Default date range: last 12 months. Throws 400 if from/to are malformed. */
function defaultRange(from, to) {
  const { error } = dateRangeSchema.validate({ from, to })
  if (error) {
    const err = new Error(joiMsg(error))
    err.status = 400
    throw err
  }

  const end = to || localDate(new Date())
  const start =
    from ||
    (() => {
      const d = new Date()
      d.setMonth(d.getMonth() - 12)
      return localDate(d)
    })()
  // endTs includes end-of-day for timestamp column comparisons
  return { start, end, endTs: end + 'T23:59:59' }
}

const RECURRENCE_WINDOW_DAYS = 60
const PREDICTION_MONTHS = 2

/** SQLite-compatible month extraction: YYYY-MM — returns raw SQL string */
function monthExpr(col) {
  return `substr(${col}, 1, 7)`
}

/** True when the knex instance is connected to MySQL/MariaDB */
function isMySQL() {
  const client = db.client.config.client
  return client === 'mysql' || client === 'mysql2'
}

/** Portable age-in-years expression: returns fractional years from a date column to now */
function ageYearsExpr(col) {
  return isMySQL()
    ? `DATEDIFF(NOW(), ${col}) / 365.25`
    : `(julianday('now') - julianday(${col})) / 365.25`
}

/** Portable day-diff expression: returns days between two date/datetime columns */
function dayDiffExpr(startCol, endCol) {
  return isMySQL()
    ? `DATEDIFF(${endCol}, ${startCol})`
    : `(julianday(${endCol}) - julianday(${startCol}))`
}

/** Portable string concatenation */
function concatExpr(...parts) {
  return isMySQL() ? `CONCAT(${parts.join(', ')})` : parts.join(' || ')
}

/** Fetch issue_type_definitions for a farm → { code: { code, name, emoji } } map */
async function getIssueTypeDefMap(farmId) {
  const defs = await db('issue_type_definitions')
    .where('farm_id', farmId)
    .select('code', 'name', 'emoji')
  const map = {}
  for (const d of defs) map[d.code] = d
  return map
}

/** Safely JSON-parse the issue_types column, returning an array of codes (or []) */
function parseIssueCodes(raw) {
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

/**
 * Batch-compute service counts for an array of preg-check-positive events.
 * Returns a Map<checkId, serviceCount> — replaces the per-check N+1 pattern.
 */
async function batchCountServices(positiveChecks, farmId) {
  const result = new Map()
  if (!positiveChecks.length) return result

  const animalIds = [...new Set(positiveChecks.map((c) => c.animal_id))]

  // Bulk-fetch all calving/abortion (reset) events for these animals
  const resets = await db('breeding_events')
    .where('farm_id', farmId)
    .whereIn('animal_id', animalIds)
    .whereIn('event_type', ['calving', 'abortion'])
    .select('animal_id', 'event_date')
    .orderBy('event_date', 'desc')

  // Build lookup: animal_id → sorted reset dates (desc)
  const resetMap = {}
  for (const r of resets) {
    ;(resetMap[r.animal_id] ??= []).push(r.event_date)
  }

  // Bulk-fetch all insemination/bull_service events for these animals
  const services = await db('breeding_events')
    .where('farm_id', farmId)
    .whereIn('animal_id', animalIds)
    .whereIn('event_type', ['ai_insemination', 'bull_service'])
    .select('animal_id', 'event_date')

  // Build lookup: animal_id → service dates array
  const serviceMap = {}
  for (const s of services) {
    ;(serviceMap[s.animal_id] ??= []).push(s.event_date)
  }

  // Compute per check in memory
  for (const check of positiveChecks) {
    const cowResets = resetMap[check.animal_id] || []
    // Find last reset before this check's date
    const lastReset = cowResets.find((d) => d < check.event_date) || null

    const cowServices = serviceMap[check.animal_id] || []
    const count = cowServices.filter(
      (d) => d <= check.event_date && (!lastReset || d > lastReset)
    ).length

    result.set(check.id, count)
  }

  return result
}

module.exports = {
  toStr,
  round2,
  localDate,
  defaultRange,
  isMySQL,
  MS_PER_DAY,
  RECURRENCE_WINDOW_DAYS,
  PREDICTION_MONTHS,
  monthExpr,
  ageYearsExpr,
  dayDiffExpr,
  concatExpr,
  getIssueTypeDefMap,
  parseIssueCodes,
  batchCountServices,
}
