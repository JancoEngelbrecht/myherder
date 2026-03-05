// ── Shared constants and utility helpers ────────────────────────────────────
// Single source of truth for values duplicated across route files.

/** ISO date pattern: YYYY-MM-DD with strict end-of-string anchor */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Derive a URL-safe code slug from a name string.
 * Lowercases, replaces non-alphanumeric runs with underscores, trims
 * leading/trailing underscores, and caps at 50 characters.
 */
function toCode(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50)
}

/** Default number of items per page */
const DEFAULT_PAGE_SIZE = 25

/** Maximum allowed page size */
const MAX_PAGE_SIZE = 100

/** Maximum length allowed for user-supplied search strings */
const MAX_SEARCH_LENGTH = 100

/**
 * Parse pagination query params into { page, limit, offset }.
 * Clamps page ≥ 1, limit between 1 and MAX_PAGE_SIZE.
 *
 * @param {object} query - req.query (or any object with page/limit)
 * @param {{ defaultLimit?: number }} [defaults]
 * @returns {{ page: number, limit: number, offset: number }}
 */
function parsePagination(query, defaults = {}) {
  const defaultLimit = defaults.defaultLimit ?? DEFAULT_PAGE_SIZE
  const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1)
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(String(query.limit ?? String(defaultLimit)), 10) || defaultLimit))
  const offset = (page - 1) * limit
  return { page, limit, offset }
}

/** Milliseconds per day */
const MS_PER_DAY = 1000 * 60 * 60 * 24

/** All valid cow status values */
const COW_STATUSES = ['active', 'dry', 'pregnant', 'sick', 'sold', 'dead']

/** Extract a clean error message from a Joi validation error */
function joiMsg(error) {
  return error.details[0].message.replace(/['"]/g, '')
}

module.exports = {
  ISO_DATE_RE,
  toCode,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_SEARCH_LENGTH,
  parsePagination,
  MS_PER_DAY,
  COW_STATUSES,
  joiMsg,
}
