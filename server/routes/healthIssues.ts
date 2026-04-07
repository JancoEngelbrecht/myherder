const express = require('express')
const { randomUUID: uuidv4 } = require('crypto')
const Joi = require('joi')
const db = require('../config/database')
const authenticate = require('../middleware/auth')
const tenantScope = require('../middleware/tenantScope')
const authorize = require('../middleware/authorize')
const { requireAdmin } = authorize
const {
  MAX_SEARCH_LENGTH,
  MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  parsePagination,
  joiMsg,
  validateBody,
  validateQuery,
} = require('../helpers/constants')
const { logAudit } = require('../services/auditService')

const router = express.Router()
router.use(authenticate)
router.use(tenantScope)

const TEAT_POSITIONS = ['front_left', 'front_right', 'rear_left', 'rear_right']

const createSchema = Joi.object({
  animal_id: Joi.string().uuid().required(),
  issue_types: Joi.array().items(Joi.string().min(1).max(50)).min(1).required(),
  severity: Joi.string().valid('low', 'medium', 'high').default('medium'),
  affected_teats: Joi.array()
    .items(Joi.string().valid(...TEAT_POSITIONS))
    .allow(null),
  description: Joi.string().max(2000).allow('', null),
  observed_at: Joi.string().isoDate().required(),
})

const statusSchema = Joi.object({
  status: Joi.string().valid('open', 'treating', 'resolved').required(),
})

// Base query with joined animal + user names
function issueQuery(farmId) {
  return db('health_issues as h')
    .where('h.farm_id', farmId)
    .join('animals as c', 'h.animal_id', 'c.id')
    .join('users as u', 'h.reported_by', 'u.id')
    .whereNull('c.deleted_at')
    .select('h.*', 'c.tag_number', 'c.name as animal_name', 'u.full_name as reported_by_name')
}

// Parse JSON columns from string (SQLite stores JSON as text)
function parseRow(row) {
  if (!row) return row
  if (typeof row.affected_teats === 'string') {
    try {
      row.affected_teats = JSON.parse(row.affected_teats)
    } catch {
      row.affected_teats = []
    }
  }
  if (typeof row.issue_types === 'string') {
    try {
      row.issue_types = JSON.parse(row.issue_types)
    } catch {
      row.issue_types = []
    }
  }
  return row
}

const issueQuerySchema = Joi.object({
  animal_id: Joi.string().uuid(),
  status: Joi.string().valid('open', 'treating', 'resolved'),
  search: Joi.string().max(100).allow(''),
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(MAX_PAGE_SIZE),
})

// GET /api/health-issues
router.get('/', authorize('can_log_issues'), async (req, res, next) => {
  try {
    const { error: qError, value: q } = validateQuery(issueQuerySchema, req.query)
    if (qError) return res.status(400).json({ error: joiMsg(qError) })

    const query = issueQuery(req.farmId).orderBy('h.observed_at', 'desc')
    if (q.animal_id) query.where('h.animal_id', q.animal_id)
    if (q.status) query.where('h.status', q.status)
    if (q.search) {
      const s = `%${String(q.search).slice(0, MAX_SEARCH_LENGTH)}%`
      query.where(function () {
        this.where('c.tag_number', 'like', s).orWhere('c.name', 'like', s)
      })
    }

    if (q.page !== undefined) {
      const { limit, offset } = parsePagination(q, { defaultLimit: DEFAULT_PAGE_SIZE })

      const [[{ count: total }], rows] = await Promise.all([
        query.clone().count('h.id as count'),
        query.limit(limit).offset(offset),
      ])

      res.set('X-Total-Count', String(total))
      res.json(rows.map(parseRow))
    } else {
      const rows = await query
      res.set('X-Total-Count', String(rows.length))
      res.json(rows.map(parseRow))
    }
  } catch (err) {
    next(err)
  }
})

// GET /api/health-issues/:id
router.get('/:id', authorize('can_log_issues'), async (req, res, next) => {
  try {
    const row = await issueQuery(req.farmId).where('h.id', req.params.id).first()
    if (!row) return res.status(404).json({ error: 'Health issue not found' })
    res.json(parseRow(row))
  } catch (err) {
    next(err)
  }
})

// POST /api/health-issues
router.post('/', authorize('can_log_issues'), async (req, res, next) => {
  try {
    const { error, value } = validateBody(createSchema, req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    const animal = await db('animals')
      .where({ id: value.animal_id })
      .where('farm_id', req.farmId)
      .whereNull('deleted_at')
      .first()
    if (!animal) return res.status(404).json({ error: 'Animal not found' })

    const id = uuidv4()
    const now = new Date().toISOString()

    await db('health_issues').insert({
      id,
      farm_id: req.user.farm_id,
      animal_id: value.animal_id,
      reported_by: req.user.id,
      issue_types: JSON.stringify(value.issue_types),
      severity: value.severity,
      affected_teats: value.affected_teats?.length ? JSON.stringify(value.affected_teats) : null,
      description: value.description || null,
      observed_at: value.observed_at,
      status: 'open',
      created_at: now,
      updated_at: now,
    })

    const created = await issueQuery(req.farmId).where('h.id', id).first()
    await logAudit({
      farmId: req.user.farm_id,
      userId: req.user.id,
      action: 'create',
      entityType: 'health_issue',
      entityId: id,
      newValues: created,
    })
    res.status(201).json(parseRow(created))
  } catch (err) {
    next(err)
  }
})

// PATCH /api/health-issues/:id/status
router.patch('/:id/status', authorize('can_log_issues'), async (req, res, next) => {
  try {
    const { error, value } = validateBody(statusSchema, req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    const existing = await db('health_issues')
      .where({ id: req.params.id })
      .where('farm_id', req.farmId)
      .first()
    if (!existing) return res.status(404).json({ error: 'Health issue not found' })

    const now = new Date().toISOString()
    const update = { status: value.status, updated_at: now }
    if (value.status === 'resolved' && !existing.resolved_at) {
      update.resolved_at = now
    }

    await db('health_issues')
      .where({ id: req.params.id })
      .where('farm_id', req.farmId)
      .update(update)

    const updated = await issueQuery(req.farmId).where('h.id', req.params.id).first()
    await logAudit({
      farmId: req.user.farm_id,
      userId: req.user.id,
      action: 'status_change',
      entityType: 'health_issue',
      entityId: req.params.id,
      oldValues: { status: existing.status },
      newValues: { status: value.status },
    })
    res.json(parseRow(updated))
  } catch (err) {
    next(err)
  }
})

// DELETE /api/health-issues/:id — admin only
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const existing = await db('health_issues')
      .where({ id: req.params.id })
      .where('farm_id', req.farmId)
      .first()
    if (!existing) return res.status(404).json({ error: 'Health issue not found' })

    const linked = await db('treatments')
      .where('farm_id', req.farmId)
      .where('health_issue_id', req.params.id)
      .count('* as count')
      .first()
    if (Number(linked.count) > 0) {
      return res.status(409).json({ error: 'Cannot delete: issue has linked treatments' })
    }

    await db.transaction(async (trx) => {
      await trx('health_issue_comments').where({ health_issue_id: req.params.id }).delete()
      await trx('health_issues').where({ id: req.params.id }).where('farm_id', req.farmId).delete()
    })
    await logAudit({
      farmId: req.user.farm_id,
      userId: req.user.id,
      action: 'delete',
      entityType: 'health_issue',
      entityId: req.params.id,
      oldValues: existing,
    })
    res.json({ message: 'Health issue deleted' })
  } catch (err) {
    next(err)
  }
})

// --- Comments ---

const commentSchema = Joi.object({
  comment: Joi.string().min(1).max(2000).required(),
})

// GET /api/health-issues/:id/comments
router.get('/:id/comments', authorize('can_log_issues'), async (req, res, next) => {
  try {
    const rows = await db('health_issue_comments as c')
      .where('c.farm_id', req.farmId)
      .join('users as u', 'c.user_id', 'u.id')
      .where('c.health_issue_id', req.params.id)
      .orderBy('c.created_at', 'asc')
      .select('c.*', 'u.full_name as author_name')
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

// POST /api/health-issues/:id/comments
router.post('/:id/comments', authorize('can_log_issues'), async (req, res, next) => {
  try {
    const { error, value } = validateBody(commentSchema, req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    const issue = await db('health_issues')
      .where({ id: req.params.id })
      .where('farm_id', req.farmId)
      .first()
    if (!issue) return res.status(404).json({ error: 'Health issue not found' })

    const id = uuidv4()
    const now = new Date().toISOString()
    await db('health_issue_comments').insert({
      id,
      farm_id: req.user.farm_id,
      health_issue_id: req.params.id,
      user_id: req.user.id,
      comment: value.comment,
      created_at: now,
      updated_at: now,
    })

    const created = await db('health_issue_comments as c')
      .join('users as u', 'c.user_id', 'u.id')
      .where('c.id', id)
      .where('c.farm_id', req.farmId)
      .select('c.*', 'u.full_name as author_name')
      .first()
    res.status(201).json(created)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/health-issues/:id/comments/:commentId — admin only
router.delete('/:id/comments/:commentId', requireAdmin, async (req, res, next) => {
  try {
    const existing = await db('health_issue_comments')
      .where({ id: req.params.commentId, health_issue_id: req.params.id })
      .where('farm_id', req.farmId)
      .first()
    if (!existing) return res.status(404).json({ error: 'Comment not found' })

    await db('health_issue_comments')
      .where({ id: req.params.commentId })
      .where('farm_id', req.farmId)
      .delete()
    res.json({ message: 'Comment deleted' })
  } catch (err) {
    next(err)
  }
})

module.exports = router
