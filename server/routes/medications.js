const express = require('express')
const { randomUUID: uuidv4 } = require('crypto')
const Joi = require('joi')
const db = require('../config/database')
const authenticate = require('../middleware/auth')
const authorize = require('../middleware/authorize')
const tenantScope = require('../middleware/tenantScope')
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

const schema = Joi.object({
  name: Joi.string().max(100).required(),
  active_ingredient: Joi.string().max(100).allow('', null),
  withdrawal_milk_hours: Joi.number().integer().min(0).required(),
  withdrawal_milk_days: Joi.number().integer().min(0).default(0),
  withdrawal_meat_hours: Joi.number().integer().min(0).default(0),
  withdrawal_meat_days: Joi.number().integer().min(0).required(),
  default_dosage: Joi.number().precision(4).min(0).allow(null),
  unit: Joi.string().max(20).allow('', null),
  notes: Joi.string().max(2000).allow('', null),
  is_active: Joi.boolean().truthy(1).falsy(0).default(true),
})

const medicationQuerySchema = Joi.object({
  all: Joi.string().valid('0', '1'),
  search: Joi.string().max(100).allow(''),
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(MAX_PAGE_SIZE),
})

// GET /api/medications — active only by default; pass ?all=1 for all
router.get('/', authorize('can_log_treatments'), async (req, res, next) => {
  try {
    const { error: qError, value: q } = validateQuery(medicationQuerySchema, req.query)
    if (qError) return res.status(400).json({ error: joiMsg(qError) })

    const query = db('medications')
      .where('farm_id', req.farmId)
      .where(q.all === '1' ? {} : { is_active: true })
      .orderBy('name')

    if (q.search) {
      const s = `%${String(q.search).slice(0, MAX_SEARCH_LENGTH)}%`
      query.where(function () {
        this.where('name', 'like', s).orWhere('active_ingredient', 'like', s)
      })
    }

    if (q.page !== undefined) {
      const { limit, offset } = parsePagination(q, { defaultLimit: DEFAULT_PAGE_SIZE })

      const [[{ count: total }], rows] = await Promise.all([
        query.clone().count('* as count'),
        query.limit(limit).offset(offset),
      ])

      res.set('X-Total-Count', String(total))
      res.json(rows)
    } else {
      const rows = await query
      res.set('X-Total-Count', String(rows.length))
      res.json(rows)
    }
  } catch (err) {
    next(err)
  }
})

// GET /api/medications/:id
router.get('/:id', authorize('can_log_treatments'), async (req, res, next) => {
  try {
    const row = await db('medications')
      .where({ id: req.params.id })
      .where('farm_id', req.farmId)
      .first()
    if (!row) return res.status(404).json({ error: 'Medication not found' })
    res.json(row)
  } catch (err) {
    next(err)
  }
})

// POST /api/medications — admin only
router.post('/', authorize('can_manage_medications'), async (req, res, next) => {
  try {
    const { error, value } = validateBody(schema, req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    const id = uuidv4()
    const now = new Date().toISOString()
    const record = { id, farm_id: req.user.farm_id, ...value, created_at: now, updated_at: now }
    await db('medications').insert(record)
    // Coerce booleans to 0/1 to match SQLite's stored representation
    const response = { ...record }
    if (response.is_active !== undefined) response.is_active = response.is_active ? 1 : 0
    await logAudit({
      farmId: req.user.farm_id,
      userId: req.user.id,
      action: 'create',
      entityType: 'medication',
      entityId: id,
      newValues: response,
    })
    res.status(201).json(response)
  } catch (err) {
    next(err)
  }
})

// PUT /api/medications/:id — admin only
router.put('/:id', authorize('can_manage_medications'), async (req, res, next) => {
  try {
    const existing = await db('medications')
      .where({ id: req.params.id })
      .where('farm_id', req.farmId)
      .first()
    if (!existing) return res.status(404).json({ error: 'Medication not found' })

    const { error, value } = validateBody(schema, req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    const now = new Date().toISOString()
    await db('medications')
      .where({ id: req.params.id })
      .where('farm_id', req.farmId)
      .update({ ...value, updated_at: now })
    const updated = await db('medications')
      .where({ id: req.params.id })
      .where('farm_id', req.farmId)
      .first()
    await logAudit({
      farmId: req.user.farm_id,
      userId: req.user.id,
      action: 'update',
      entityType: 'medication',
      entityId: req.params.id,
      oldValues: existing,
      newValues: updated,
    })
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/medications/:id — soft-delete (deactivate), admin only
router.delete('/:id', authorize('can_manage_medications'), async (req, res, next) => {
  try {
    const existing = await db('medications')
      .where({ id: req.params.id })
      .where('farm_id', req.farmId)
      .first()
    if (!existing) return res.status(404).json({ error: 'Medication not found' })

    const now = new Date().toISOString()
    await db('medications')
      .where({ id: req.params.id })
      .where('farm_id', req.farmId)
      .update({ is_active: false, updated_at: now })
    const updated = await db('medications')
      .where({ id: req.params.id })
      .where('farm_id', req.farmId)
      .first()
    await logAudit({
      farmId: req.user.farm_id,
      userId: req.user.id,
      action: 'deactivate',
      entityType: 'medication',
      entityId: req.params.id,
      oldValues: existing,
      newValues: updated,
    })
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

module.exports = router
