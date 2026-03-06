const express = require('express')
const Joi = require('joi')
const db = require('../config/database')
const authenticate = require('../middleware/auth')
const { requireAdmin } = require('../middleware/authorize')
const { ISO_DATE_RE, parsePagination, joiMsg } = require('../helpers/constants')

const router = express.Router()
router.use(authenticate)
router.use(requireAdmin)

// ── Constants ────────────────────────────────────────────────

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
    if (qError) return res.status(400).json({ error: joiMsg(qError) })

    const { limit, offset } = parsePagination(req.query)

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
      query.where('audit_log.created_at', '<=', String(req.query.to) + 'T23:59:59')
    }

    const countResult = await query.clone().clearSelect().clearOrder().count('* as count').first()
    const total = Number(countResult.count)

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

    res.json({ data, total })
  } catch (err) {
    next(err)
  }
})

module.exports = router
