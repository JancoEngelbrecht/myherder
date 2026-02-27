const express = require('express')
const { randomUUID: uuidv4 } = require('crypto')
const Joi = require('joi')
const db = require('../config/database')
const authenticate = require('../middleware/auth')
const authorize = require('../middleware/authorize')

const router = express.Router()
router.use(authenticate)

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
  is_active: Joi.boolean(),
})

const MAX_SEARCH_LENGTH = 100
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

// GET /api/medications — active only by default; pass ?all=1 for all
router.get('/', async (req, res, next) => {
  try {
    const query = db('medications')
      .where(req.query.all === '1' ? {} : { is_active: true })
      .orderBy('name')

    if (req.query.search) {
      const s = `%${String(req.query.search).slice(0, MAX_SEARCH_LENGTH)}%`
      query.where(function () {
        this.where('name', 'like', s).orWhere('active_ingredient', 'like', s)
      })
    }

    if (req.query.page !== undefined) {
      const page = Math.max(1, parseInt(String(req.query.page), 10) || 1)
      const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(String(req.query.limit), 10) || DEFAULT_PAGE_SIZE))
      const offset = (page - 1) * limit

      const [{ count: total }] = await query.clone().count('* as count')
      const rows = await query.limit(limit).offset(offset)

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
router.get('/:id', async (req, res, next) => {
  try {
    const row = await db('medications').where({ id: req.params.id }).first()
    if (!row) return res.status(404).json({ error: 'Medication not found' })
    res.json(row)
  } catch (err) {
    next(err)
  }
})

// POST /api/medications — admin only
router.post('/', authorize('can_manage_medications'), async (req, res, next) => {
  try {
    const { error, value } = schema.validate(req.body)
    if (error) return res.status(400).json({ error: error.details[0].message.replace(/['"]/g, '') })

    const id = uuidv4()
    const now = new Date().toISOString()
    await db('medications').insert({ id, ...value, created_at: now, updated_at: now })
    const created = await db('medications').where({ id }).first()
    res.status(201).json(created)
  } catch (err) {
    next(err)
  }
})

// PUT /api/medications/:id — admin only
router.put('/:id', authorize('can_manage_medications'), async (req, res, next) => {
  try {
    const existing = await db('medications').where({ id: req.params.id }).first()
    if (!existing) return res.status(404).json({ error: 'Medication not found' })

    const { error, value } = schema.validate(req.body)
    if (error) return res.status(400).json({ error: error.details[0].message.replace(/['"]/g, '') })

    const now = new Date().toISOString()
    await db('medications').where({ id: req.params.id }).update({ ...value, updated_at: now })
    const updated = await db('medications').where({ id: req.params.id }).first()
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/medications/:id — soft-delete (deactivate), admin only
router.delete('/:id', authorize('can_manage_medications'), async (req, res, next) => {
  try {
    const existing = await db('medications').where({ id: req.params.id }).first()
    if (!existing) return res.status(404).json({ error: 'Medication not found' })

    const now = new Date().toISOString()
    await db('medications').where({ id: req.params.id }).update({ is_active: false, updated_at: now })
    const updated = await db('medications').where({ id: req.params.id }).first()
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

module.exports = router
