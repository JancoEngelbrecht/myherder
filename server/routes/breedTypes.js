const express = require('express')
const { randomUUID: uuidv4 } = require('crypto')
const Joi = require('joi')
const db = require('../config/database')
const authenticate = require('../middleware/auth')
const authorize = require('../middleware/authorize')

const router = express.Router()
router.use(authenticate)

// ── Validation ───────────────────────────────────────────────────────────────

const schema = Joi.object({
  name: Joi.string().max(100).required(),
  heat_cycle_days: Joi.number().integer().min(1).max(60).default(21),
  gestation_days: Joi.number().integer().min(200).max(400).default(283),
  preg_check_days: Joi.number().integer().min(14).max(90).default(35),
  voluntary_waiting_days: Joi.number().integer().min(0).max(120).default(45),
  dry_off_days: Joi.number().integer().min(0).max(120).default(60),
  calf_max_months: Joi.number().integer().min(1).max(24).default(6),
  heifer_min_months: Joi.number().integer().min(6).max(48).default(15),
  young_bull_min_months: Joi.number().integer().min(6).max(48).default(15),
  is_active: Joi.boolean().default(true),
  sort_order: Joi.number().integer().min(0).default(0),
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function toCode(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50)
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /api/breed-types — active only by default; ?all=1 for all
router.get('/', async (req, res, next) => {
  try {
    const query = db('breed_types')
      .where(req.query.all === '1' ? {} : { is_active: true })
      .orderBy('sort_order')
      .orderBy('name')

    const rows = await query
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

// POST /api/breed-types — admin only
router.post('/', authorize('admin'), async (req, res, next) => {
  try {
    const { error, value } = schema.validate(req.body)
    if (error) return res.status(400).json({ error: error.details[0].message.replace(/['"]/g, '') })

    const code = toCode(value.name)
    if (!code) return res.status(400).json({ error: 'Name produces an empty code' })

    const existing = await db('breed_types').where({ code }).first()
    if (existing) {
      return res.status(409).json({ error: `Breed type with code "${code}" already exists` })
    }

    const id = uuidv4()
    const now = new Date().toISOString()
    await db('breed_types').insert({ id, code, ...value, created_at: now, updated_at: now })
    const created = await db('breed_types').where({ id }).first()
    res.status(201).json(created)
  } catch (err) {
    next(err)
  }
})

// PUT /api/breed-types/:id — admin only (code is immutable)
router.put('/:id', authorize('admin'), async (req, res, next) => {
  try {
    const existing = await db('breed_types').where({ id: req.params.id }).first()
    if (!existing) return res.status(404).json({ error: 'Breed type not found' })

    const { error, value } = schema.validate(req.body)
    if (error) return res.status(400).json({ error: error.details[0].message.replace(/['"]/g, '') })

    const now = new Date().toISOString()
    await db('breed_types')
      .where({ id: req.params.id })
      .update({ ...value, updated_at: now })
    const updated = await db('breed_types').where({ id: req.params.id }).first()
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/breed-types/:id — admin only; blocked if cows reference this breed
router.delete('/:id', authorize('admin'), async (req, res, next) => {
  try {
    const existing = await db('breed_types').where({ id: req.params.id }).first()
    if (!existing) return res.status(404).json({ error: 'Breed type not found' })

    const usageResult = await db('cows')
      .where({ breed_type_id: req.params.id })
      .whereNull('deleted_at')
      .count('* as count')
      .first()

    const count = Number(usageResult?.count ?? 0)
    if (count > 0) {
      return res.status(409).json({
        error: `Cannot delete: this breed is assigned to ${count} cow(s). Deactivate it instead.`,
        count,
      })
    }

    await db('breed_types').where({ id: req.params.id }).delete()
    res.json({ message: 'Breed type deleted' })
  } catch (err) {
    next(err)
  }
})

module.exports = router
