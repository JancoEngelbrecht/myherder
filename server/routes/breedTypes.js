const express = require('express')
const { randomUUID: uuidv4 } = require('crypto')
const Joi = require('joi')
const db = require('../config/database')
const authenticate = require('../middleware/auth')
const { requireAdmin } = require('../middleware/authorize')
const tenantScope = require('../middleware/tenantScope')
const { toCode, joiMsg, validateBody, validateQuery } = require('../helpers/constants')

const router = express.Router()
router.use(authenticate)
router.use(tenantScope)

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
  species_id: Joi.string().uuid().allow(null),
  is_active: Joi.boolean().truthy(1).falsy(0).default(true),
  sort_order: Joi.number().integer().min(0).default(0),
})

const breedTypeQuerySchema = Joi.object({
  all: Joi.string().valid('0', '1'),
  species_id: Joi.string().uuid(),
})

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /api/breed-types — active only by default; ?all=1 for all
router.get('/', async (req, res, next) => {
  try {
    const { error: qError } = validateQuery(breedTypeQuerySchema, req.query)
    if (qError) return res.status(400).json({ error: joiMsg(qError) })

    const showAll =
      req.query.all === '1' && (req.user.role === 'admin' || req.user.role === 'super_admin')
    const query = db('breed_types')
      .where('farm_id', req.farmId)
      .where(showAll ? {} : { is_active: true })
      .orderBy('sort_order')
      .orderBy('name')

    if (req.query.species_id) query.where('species_id', req.query.species_id)

    const rows = await query
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

// POST /api/breed-types — admin only
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { error, value } = validateBody(schema, req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    const code = toCode(value.name)
    if (!code) return res.status(400).json({ error: 'Name produces an empty code' })

    const existing = await db('breed_types').where({ code }).where('farm_id', req.farmId).first()
    if (existing) {
      return res.status(409).json({ error: `Breed type with code "${code}" already exists` })
    }

    // Auto-set species_id from farm's species if not provided
    if (!value.species_id) {
      const farmSpecies = await db('farm_species').where('farm_id', req.farmId).first()
      if (farmSpecies) value.species_id = farmSpecies.species_id
    }

    const id = uuidv4()
    const now = new Date().toISOString()
    const record = {
      id,
      farm_id: req.user.farm_id,
      code,
      ...value,
      created_at: now,
      updated_at: now,
    }
    await db('breed_types').insert(record)
    // Coerce booleans to 0/1 to match SQLite's stored representation
    res.status(201).json({ ...record, is_active: record.is_active ? 1 : 0 })
  } catch (err) {
    next(err)
  }
})

// PUT /api/breed-types/:id — admin only (code is immutable)
router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const existing = await db('breed_types')
      .where({ id: req.params.id })
      .where('farm_id', req.farmId)
      .first()
    if (!existing) return res.status(404).json({ error: 'Breed type not found' })

    const { error, value } = validateBody(schema, req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    const now = new Date().toISOString()
    await db('breed_types')
      .where({ id: req.params.id })
      .where('farm_id', req.farmId)
      .update({ ...value, updated_at: now })
    const updated = await db('breed_types')
      .where({ id: req.params.id })
      .where('farm_id', req.farmId)
      .first()
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/breed-types/:id — admin only; blocked if cows reference this breed
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const existing = await db('breed_types')
      .where({ id: req.params.id })
      .where('farm_id', req.farmId)
      .first()
    if (!existing) return res.status(404).json({ error: 'Breed type not found' })

    const usageResult = await db('animals')
      .where({ breed_type_id: req.params.id })
      .where('farm_id', req.farmId)
      .whereNull('deleted_at')
      .count('* as count')
      .first()

    const count = Number(usageResult?.count ?? 0)
    if (count > 0) {
      return res.status(409).json({
        error: `Cannot delete: this breed is assigned to ${count} animal(s). Deactivate it instead.`,
        count,
      })
    }

    await db('breed_types').where({ id: req.params.id }).where('farm_id', req.farmId).delete()
    res.json({ message: 'Breed type deleted' })
  } catch (err) {
    next(err)
  }
})

module.exports = router
