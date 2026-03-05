const Joi = require('joi');
const db = require('../../config/database');
const { ISO_DATE_RE, joiMsg, MS_PER_DAY } = require('../../helpers/constants');

/** Round to 2 decimal places — prevents floating-point display artifacts */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Local-date string YYYY-MM-DD (avoids UTC shift from toISOString) */
function localDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Joi schema for analytics date range query params */
const dateRangeSchema = Joi.object({
  from: Joi.string().pattern(ISO_DATE_RE).allow(''),
  to: Joi.string().pattern(ISO_DATE_RE).allow(''),
}).unknown(true);

/** Default date range: last 12 months. Throws 400 if from/to are malformed. */
function defaultRange(from, to) {
  const { error } = dateRangeSchema.validate({ from, to });
  if (error) {
    const err = new Error(joiMsg(error));
    err.status = 400;
    throw err;
  }

  const end = to || localDate(new Date());
  const start = from || (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 12);
    return localDate(d);
  })();
  // endTs includes end-of-day for timestamp column comparisons
  return { start, end, endTs: end + 'T23:59:59' };
}

const RECURRENCE_WINDOW_DAYS = 60;
const PREDICTION_MONTHS = 2;

/** SQLite-compatible month extraction: YYYY-MM — returns raw SQL string */
function monthExpr(col) {
  return `substr(${col}, 1, 7)`;
}

/** Fetch issue_type_definitions → { code: { code, name, emoji } } map (60-second TTL cache) */
let _issueTypeDefCache = null;
let _issueTypeDefExpiry = 0;
let _issueTypeDefPromise = null;

async function getIssueTypeDefMap() {
  if (Date.now() < _issueTypeDefExpiry) return _issueTypeDefCache;
  if (_issueTypeDefPromise) return _issueTypeDefPromise;
  _issueTypeDefPromise = (async () => {
    const defs = await db('issue_type_definitions').select('code', 'name', 'emoji');
    const map = {};
    for (const d of defs) map[d.code] = d;
    _issueTypeDefCache = map;
    _issueTypeDefExpiry = Date.now() + 60_000;
    _issueTypeDefPromise = null;
    return map;
  })();
  return _issueTypeDefPromise;
}

/** Safely JSON-parse the issue_types column, returning an array of codes (or []) */
function parseIssueCodes(raw) {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

/**
 * Batch-compute service counts for an array of preg-check-positive events.
 * Returns a Map<checkId, serviceCount> — replaces the per-check N+1 pattern.
 */
async function batchCountServices(positiveChecks) {
  const result = new Map();
  if (!positiveChecks.length) return result;

  const cowIds = [...new Set(positiveChecks.map(c => c.cow_id))];

  // Bulk-fetch all calving/abortion (reset) events for these cows
  const resets = await db('breeding_events')
    .whereIn('cow_id', cowIds)
    .whereIn('event_type', ['calving', 'abortion'])
    .select('cow_id', 'event_date')
    .orderBy('event_date', 'desc');

  // Build lookup: cow_id → sorted reset dates (desc)
  const resetMap = {};
  for (const r of resets) {
    (resetMap[r.cow_id] ??= []).push(r.event_date);
  }

  // Bulk-fetch all insemination/bull_service events for these cows
  const services = await db('breeding_events')
    .whereIn('cow_id', cowIds)
    .whereIn('event_type', ['ai_insemination', 'bull_service'])
    .select('cow_id', 'event_date');

  // Build lookup: cow_id → service dates array
  const serviceMap = {};
  for (const s of services) {
    (serviceMap[s.cow_id] ??= []).push(s.event_date);
  }

  // Compute per check in memory
  for (const check of positiveChecks) {
    const cowResets = resetMap[check.cow_id] || [];
    // Find last reset before this check's date
    const lastReset = cowResets.find(d => d < check.event_date) || null;

    const cowServices = serviceMap[check.cow_id] || [];
    const count = cowServices.filter(d =>
      d <= check.event_date && (!lastReset || d > lastReset)
    ).length;

    result.set(check.id, count);
  }

  return result;
}

module.exports = {
  round2,
  localDate,
  defaultRange,
  MS_PER_DAY,
  RECURRENCE_WINDOW_DAYS,
  PREDICTION_MONTHS,
  monthExpr,
  getIssueTypeDefMap,
  parseIssueCodes,
  batchCountServices,
};
