const express = require('express')
const Joi = require('joi')
const db = require('../config/database')
const authenticate = require('../middleware/auth')
const { requireAdmin } = require('../middleware/authorize')
const tenantScope = require('../middleware/tenantScope')
const { ISO_DATE_RE, MAX_PAGE_SIZE, parsePagination, joiMsg, validateQuery } = require('../helpers/constants')

const router = express.Router()
router.use(authenticate)
router.use(requireAdmin)
router.use(tenantScope)

// ── Constants ────────────────────────────────────────────────

const auditQuerySchema = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(MAX_PAGE_SIZE),
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
    const { error: qError, value: q } = validateQuery(auditQuerySchema, req.query)
    if (qError) return res.status(400).json({ error: joiMsg(qError) })

    const { limit, offset } = parsePagination(q)

    const query = db('audit_log')
      .where('audit_log.farm_id', req.farmId)
      .leftJoin('users', 'audit_log.user_id', 'users.id')
      .select(
        'audit_log.*',
        'users.username as user_username',
        'users.full_name as user_full_name',
      )

    // Filters from validated query value
    if (q.entity_type) {
      query.where('audit_log.entity_type', q.entity_type)
    }
    if (q.entity_id) {
      query.where('audit_log.entity_id', q.entity_id)
    }
    if (q.user_id) {
      query.where('audit_log.user_id', q.user_id)
    }
    if (q.action) {
      query.where('audit_log.action', q.action)
    }
    if (q.from) {
      query.where('audit_log.created_at', '>=', q.from)
    }
    if (q.to) {
      query.where('audit_log.created_at', '<=', q.to + 'T23:59:59')
    }

    const [countResult, rows] = await Promise.all([
      query.clone().clearSelect().clearOrder().count('* as count').first(),
      query.orderBy('audit_log.created_at', 'desc').limit(limit).offset(offset),
    ])
    const total = Number(countResult.count)

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
