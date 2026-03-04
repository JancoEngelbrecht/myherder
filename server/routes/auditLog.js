const express = require('express')
const Joi = require('joi')
const db = require('../config/database')
const authenticate = require('../middleware/auth')
const { requireAdmin } = require('../middleware/authorize')

const router = express.Router()
router.use(authenticate)
router.use(requireAdmin)

// ── Constants ────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 100

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/
const auditQuerySchema = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
  entity_type: Joi.string().max(100),
  entity_id: Joi.string().max(100),
  user_id: Joi.string().max(100),
  action: Joi.string().max(100),
  from: Joi.string().pattern(ISO_DATE_RE),
  to: Joi.string().pattern(ISO_DATE_RE),
})

// ── Routes ───────────────────────────────────────────────────

// GET /api/audit-log — paginated, filterable audit log
router.get('/', async (req, res, next) => {
  try {
    const { error: qError } = auditQuerySchema.validate(req.query, { allowUnknown: false })
    if (qError) return res.status(400).json({ error: qError.details[0].message.replace(/['"]/g, '') })

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

    // Filters (Joi-validated above — no manual slicing needed)
    if (req.query.entity_type) {
      query.where('audit_log.entity_type', req.query.entity_type)
    }
    if (req.query.entity_id) {
      query.where('audit_log.entity_id', req.query.entity_id)
    }
    if (req.query.user_id) {
      query.where('audit_log.user_id', req.query.user_id)
    }
    if (req.query.action) {
      query.where('audit_log.action', req.query.action)
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
