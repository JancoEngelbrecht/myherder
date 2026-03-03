const express = require('express')
const db = require('../config/database')
const authenticate = require('../middleware/auth')
const { requireAdmin } = require('../middleware/authorize')

const router = express.Router()
router.use(authenticate)
router.use(requireAdmin)

// ── Constants ────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 100
const MAX_FILTER_LENGTH = 100

// ── Routes ───────────────────────────────────────────────────

// GET /api/audit-log — paginated, filterable audit log
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1)
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(String(req.query.limit), 10) || DEFAULT_PAGE_SIZE))
    const offset = (page - 1) * limit

    const query = db('audit_log')
      .leftJoin('users', 'audit_log.user_id', 'users.id')
      .select(
        'audit_log.*',
        'users.username as user_username',
        'users.full_name as user_full_name',
      )

    // Filters
    if (req.query.entity_type) {
      query.where('audit_log.entity_type', String(req.query.entity_type).slice(0, MAX_FILTER_LENGTH))
    }
    if (req.query.entity_id) {
      query.where('audit_log.entity_id', String(req.query.entity_id).slice(0, MAX_FILTER_LENGTH))
    }
    if (req.query.user_id) {
      query.where('audit_log.user_id', String(req.query.user_id).slice(0, MAX_FILTER_LENGTH))
    }
    if (req.query.action) {
      query.where('audit_log.action', String(req.query.action).slice(0, MAX_FILTER_LENGTH))
    }
    if (req.query.from) {
      query.where('audit_log.created_at', '>=', String(req.query.from))
    }
    if (req.query.to) {
      query.where('audit_log.created_at', '<=', String(req.query.to))
    }

    const countQuery = query.clone().clearSelect().clearOrder().count('* as count').first()
    const [{ count: total }] = await db.raw(countQuery.toQuery())

    const rows = await query
      .orderBy('audit_log.created_at', 'desc')
      .limit(limit)
      .offset(offset)

    // Parse JSON fields
    const safeJsonParse = (str) => {
      try { return JSON.parse(str) } catch { return null }
    }
    const data = rows.map((row) => ({
      ...row,
      old_values: row.old_values ? safeJsonParse(row.old_values) : null,
      new_values: row.new_values ? safeJsonParse(row.new_values) : null,
    }))

    res.json({ data, total: Number(total) })
  } catch (err) {
    next(err)
  }
})

module.exports = router
