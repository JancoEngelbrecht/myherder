const express = require('express')
const { randomUUID: uuidv4 } = require('crypto')
const Joi = require('joi')
const db = require('../config/database')
const authenticate = require('../middleware/auth')

const router = express.Router()
router.use(authenticate)

const PREG_CHECK_METHODS = ['manual', 'ultrasound', 'blood_test']

// Status transitions triggered by certain event types
const STATUS_TRANSITIONS = {
  preg_check_positive: 'pregnant',
  calving: 'active',
  preg_check_negative: 'active',
  abortion: 'active',
}

async function validEventTypes() {
  const rows = await db('breeding_event_types').select('code')
  return rows.map((r) => r.code)
}

const createSchema = Joi.object({
  cow_id: Joi.string().uuid().required(),
  event_type: Joi.string().required(),
  event_date: Joi.string().isoDate().required(),
  sire_id: Joi.string().uuid().allow(null, '').default(null),
  semen_id: Joi.string().max(100).allow(null, '').default(null),
  inseminator: Joi.string().max(100).allow(null, '').default(null),
  heat_signs: Joi.array().items(Joi.string()).allow(null).default(null),
  preg_check_method: Joi.string().valid(...PREG_CHECK_METHODS).allow(null).default(null),
  calving_details: Joi.object({
    calf_sex: Joi.string().valid('male', 'female').allow(null),
    calf_tag_number: Joi.string().max(50).allow(null, ''),
    calf_weight: Joi.number().min(0).max(999).allow(null),
    complications: Joi.string().max(2000).allow(null, ''),
  }).allow(null).default(null),
  cost: Joi.number().precision(2).min(0).allow(null).default(null),
  notes: Joi.string().max(2000).allow(null, '').default(null),
})

// ── Auto-date calculation ─────────────────────────────────────────────────────

function calcDates(eventType, eventDate) {
  const base = new Date(eventDate)
  const addDays = (n) => {
    const d = new Date(base)
    d.setDate(d.getDate() + n)
    return d.toISOString().slice(0, 10)
  }

  if (['heat_observed', 'ai_insemination', 'bull_service'].includes(eventType)) {
    const result = {
      expected_next_heat: addDays(21),
      expected_preg_check: addDays(35),
      expected_calving: null,
      expected_dry_off: null,
    }

    if (['ai_insemination', 'bull_service'].includes(eventType)) {
      const calvingDate = new Date(base)
      calvingDate.setDate(calvingDate.getDate() + 283)
      const dryOffDate = new Date(calvingDate)
      dryOffDate.setDate(dryOffDate.getDate() - 60)
      result.expected_calving = calvingDate.toISOString().slice(0, 10)
      result.expected_dry_off = dryOffDate.toISOString().slice(0, 10)
    }

    return result
  }

  return {
    expected_next_heat: null,
    expected_preg_check: null,
    expected_calving: null,
    expected_dry_off: null,
  }
}

// ── Query helpers ─────────────────────────────────────────────────────────────

function breedingQuery() {
  return db('breeding_events as be')
    .join('cows as c', 'be.cow_id', 'c.id')
    .leftJoin('cows as sire', 'be.sire_id', 'sire.id')
    .leftJoin('users as u', 'be.recorded_by', 'u.id')
    .whereNull('c.deleted_at')
    .select(
      'be.*',
      'c.tag_number',
      'c.name as cow_name',
      'c.status as cow_status',
      'sire.tag_number as sire_tag',
      'sire.name as sire_name',
      'u.full_name as recorded_by_name',
    )
}

function parseJsonFields(row) {
  if (!row) return row
  if (row.heat_signs && typeof row.heat_signs === 'string') {
    try { row.heat_signs = JSON.parse(row.heat_signs) } catch { row.heat_signs = null }
  }
  if (row.calving_details && typeof row.calving_details === 'string') {
    try { row.calving_details = JSON.parse(row.calving_details) } catch { row.calving_details = null }
  }
  return row
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/breeding-events/upcoming — events with alert dates in the next 14 days
router.get('/upcoming', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const in7  = new Date(Date.now() + 7  * 86400000).toISOString().slice(0, 10)
    const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)

    // Latest event per cow that has the relevant auto-date set
    const [heatsRaw, calvingsRaw, pregChecksRaw] = await Promise.all([
      breedingQuery()
        .whereNotNull('be.expected_next_heat')
        .where('be.expected_next_heat', '>=', today)
        .where('be.expected_next_heat', '<=', in7)
        .orderBy('be.expected_next_heat', 'asc'),

      breedingQuery()
        .whereNotNull('be.expected_calving')
        .where('be.expected_calving', '>=', today)
        .where('be.expected_calving', '<=', in14)
        .orderBy('be.expected_calving', 'asc'),

      breedingQuery()
        .whereNotNull('be.expected_preg_check')
        .where('be.expected_preg_check', '>=', today)
        .where('be.expected_preg_check', '<=', in7)
        .orderBy('be.expected_preg_check', 'asc'),
    ])

    // Deduplicate: keep only the latest event per cow for each category
    const latestPerCow = (rows, dateField) => {
      const map = {}
      for (const row of rows) {
        if (!map[row.cow_id] || row.event_date > map[row.cow_id].event_date) {
          map[row.cow_id] = row
        }
      }
      return Object.values(map).sort((a, b) => a[dateField].localeCompare(b[dateField]))
    }

    res.json({
      heats: latestPerCow(heatsRaw, 'expected_next_heat').map(parseJsonFields),
      calvings: latestPerCow(calvingsRaw, 'expected_calving').map(parseJsonFields),
      pregChecks: latestPerCow(pregChecksRaw, 'expected_preg_check').map(parseJsonFields),
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/breeding-events?cow_id=X&event_type=X&limit=N
router.get('/', async (req, res, next) => {
  try {
    const { cow_id, event_type, limit } = req.query

    if (event_type) {
      const validTypes = await validEventTypes()
      if (!validTypes.includes(event_type)) {
        return res.status(400).json({ error: 'Invalid event_type' })
      }
    }

    const query = breedingQuery().orderBy('be.event_date', 'desc')
    if (cow_id) query.where('be.cow_id', cow_id)
    if (event_type) query.where('be.event_type', event_type)
    if (limit) query.limit(Number(limit))

    const rows = await query
    res.json(rows.map(parseJsonFields))
  } catch (err) {
    next(err)
  }
})

// GET /api/breeding-events/:id
router.get('/:id', async (req, res, next) => {
  try {
    const row = await breedingQuery().where('be.id', req.params.id).first()
    if (!row) return res.status(404).json({ error: 'Breeding event not found' })
    res.json(parseJsonFields(row))
  } catch (err) {
    next(err)
  }
})

// POST /api/breeding-events
router.post('/', async (req, res, next) => {
  try {
    const { error, value } = createSchema.validate(req.body)
    if (error) return res.status(400).json({ error: error.details[0].message })

    const validTypes = await validEventTypes()
    if (!validTypes.includes(value.event_type)) {
      return res.status(400).json({ error: `Invalid event_type: ${value.event_type}` })
    }

    const cow = await db('cows').where({ id: value.cow_id }).whereNull('deleted_at').first()
    if (!cow) return res.status(404).json({ error: 'Cow not found' })
    if (cow.sex === 'male') return res.status(400).json({ error: 'Cannot log breeding events for a male animal' })

    if (value.sire_id) {
      const sire = await db('cows').where({ id: value.sire_id }).whereNull('deleted_at').first()
      if (!sire) return res.status(404).json({ error: 'Sire not found' })
    }

    const autoDates = calcDates(value.event_type, value.event_date)
    const id = uuidv4()
    const now = new Date().toISOString()

    await db('breeding_events').insert({
      id,
      cow_id: value.cow_id,
      event_type: value.event_type,
      event_date: value.event_date,
      sire_id: value.sire_id || null,
      semen_id: value.semen_id || null,
      inseminator: value.inseminator || null,
      heat_signs: value.heat_signs ? JSON.stringify(value.heat_signs) : null,
      preg_check_method: value.preg_check_method || null,
      calving_details: value.calving_details ? JSON.stringify(value.calving_details) : null,
      cost: value.cost ?? null,
      notes: value.notes || null,
      ...autoDates,
      recorded_by: req.user.id,
      created_at: now,
      updated_at: now,
    })

    // Auto-update cow status based on event type
    const newStatus = STATUS_TRANSITIONS[value.event_type]
    if (newStatus) {
      await db('cows').where({ id: value.cow_id }).update({ status: newStatus, updated_at: now })
    }

    const created = await breedingQuery().where('be.id', id).first()
    res.status(201).json(parseJsonFields(created))
  } catch (err) {
    next(err)
  }
})

// PATCH /api/breeding-events/:id — admin only
router.patch('/:id', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })

    const existing = await db('breeding_events').where({ id: req.params.id }).first()
    if (!existing) return res.status(404).json({ error: 'Breeding event not found' })

    const updateSchema = Joi.object({
      event_type: Joi.string().optional(),
      event_date: Joi.string().isoDate().optional(),
      sire_id: Joi.string().uuid().allow(null, '').optional(),
      semen_id: Joi.string().max(100).allow(null, '').optional(),
      inseminator: Joi.string().max(100).allow(null, '').optional(),
      preg_check_method: Joi.string().valid(...PREG_CHECK_METHODS).allow(null).optional(),
      calving_details: Joi.object({
        calf_sex: Joi.string().valid('male', 'female').allow(null),
        calf_tag_number: Joi.string().max(50).allow(null, ''),
        calf_weight: Joi.number().min(0).max(999).allow(null),
        complications: Joi.string().max(2000).allow(null, ''),
      }).allow(null).optional(),
      cost: Joi.number().precision(2).min(0).allow(null).optional(),
      notes: Joi.string().max(2000).allow(null, '').optional(),
    })

    const { error, value } = updateSchema.validate(req.body)
    if (error) return res.status(400).json({ error: error.details[0].message })

    if (value.event_type) {
      const validTypes = await validEventTypes()
      if (!validTypes.includes(value.event_type)) {
        return res.status(400).json({ error: `Invalid event_type: ${value.event_type}` })
      }
    }

    const eventType = value.event_type ?? existing.event_type
    const eventDate = value.event_date ?? existing.event_date
    const autoDates = calcDates(eventType, eventDate)

    const now = new Date().toISOString()
    const updates = { updated_at: now, ...autoDates }

    if (value.event_type !== undefined) updates.event_type = value.event_type
    if (value.event_date !== undefined) updates.event_date = value.event_date
    if ('sire_id' in value) updates.sire_id = value.sire_id || null
    if ('semen_id' in value) updates.semen_id = value.semen_id || null
    if ('inseminator' in value) updates.inseminator = value.inseminator || null
    if ('preg_check_method' in value) updates.preg_check_method = value.preg_check_method || null
    if ('calving_details' in value) updates.calving_details = value.calving_details ? JSON.stringify(value.calving_details) : null
    if ('cost' in value) updates.cost = value.cost ?? null
    if ('notes' in value) updates.notes = value.notes || null

    await db('breeding_events').where({ id: req.params.id }).update(updates)

    // Re-apply status transition if event_type changed
    if (value.event_type) {
      const newStatus = STATUS_TRANSITIONS[value.event_type]
      if (newStatus) {
        await db('cows').where({ id: existing.cow_id }).update({ status: newStatus, updated_at: now })
      }
    }

    const updated = await breedingQuery().where('be.id', req.params.id).first()
    res.json(parseJsonFields(updated))
  } catch (err) {
    next(err)
  }
})

// DELETE /api/breeding-events/:id — admin only
router.delete('/:id', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })

    const existing = await db('breeding_events').where({ id: req.params.id }).first()
    if (!existing) return res.status(404).json({ error: 'Breeding event not found' })

    await db('breeding_events').where({ id: req.params.id }).delete()
    res.json({ message: 'Breeding event deleted' })
  } catch (err) {
    next(err)
  }
})

module.exports = router
