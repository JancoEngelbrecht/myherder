const express = require('express')
const { randomUUID: uuidv4 } = require('crypto')
const Joi = require('joi')
const db = require('../config/database')
const authenticate = require('../middleware/auth')

const router = express.Router()
router.use(authenticate)

const VALID_SESSIONS = ['morning', 'afternoon', 'evening']
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const createSchema = Joi.object({
  cow_id: Joi.string().uuid().required(),
  session: Joi.string().valid(...VALID_SESSIONS).required(),
  litres: Joi.number().precision(2).min(0).max(999.99).required(),
  recording_date: Joi.string().isoDate().required(),
  session_time: Joi.string().pattern(/^\d{2}:\d{2}$/).allow(null, '').default(null),
  milk_discarded: Joi.boolean().default(false),
  discard_reason: Joi.string().max(255).allow('', null),
  notes: Joi.string().max(2000).allow('', null),
})

const updateSchema = Joi.object({
  litres: Joi.number().precision(2).min(0).max(999.99),
  milk_discarded: Joi.boolean(),
  discard_reason: Joi.string().max(255).allow('', null),
  notes: Joi.string().max(2000).allow('', null),
})

function milkQuery() {
  return db('milk_records as mr')
    .join('cows as c', 'mr.cow_id', 'c.id')
    .join('users as u', 'mr.recorded_by', 'u.id')
    .whereNull('c.deleted_at')
    .select(
      'mr.*',
      'c.tag_number',
      'c.name as cow_name',
      'c.status as cow_status',
      'u.full_name as recorded_by_name',
    )
}

// GET /api/milk-records?date=YYYY-MM-DD&session=morning&cow_id=X
router.get('/', async (req, res, next) => {
  try {
    const { date, session, cow_id } = req.query

    if (date && !ISO_DATE_RE.test(date)) {
      return res.status(400).json({ error: 'Invalid date format — expected YYYY-MM-DD' })
    }
    if (session && !VALID_SESSIONS.includes(session)) {
      return res.status(400).json({ error: 'Invalid session — must be morning, afternoon or evening' })
    }

    const query = milkQuery().orderBy('c.tag_number', 'asc')
    if (date) query.where('mr.recording_date', date)
    if (session) query.where('mr.session', session)
    if (cow_id) query.where('mr.cow_id', cow_id)
    res.json(await query)
  } catch (err) {
    next(err)
  }
})

// GET /api/milk-records/summary?date=YYYY-MM-DD
router.get('/summary', async (req, res, next) => {
  try {
    const { date } = req.query
    if (!date) return res.status(400).json({ error: 'date query param required' })
    if (!ISO_DATE_RE.test(date)) return res.status(400).json({ error: 'Invalid date format — expected YYYY-MM-DD' })

    const rows = await db('milk_records as mr')
      .join('cows as c', 'mr.cow_id', 'c.id')
      .whereNull('c.deleted_at')
      .where('mr.recording_date', date)
      .select('mr.session', 'mr.litres', 'mr.milk_discarded')

    const empty = () => ({ total: 0, discarded: 0, count: 0 })
    const summary = { morning: empty(), afternoon: empty(), evening: empty(), day: empty() }

    for (const row of rows) {
      const litres = Number(row.litres)
      const s = summary[row.session]
      s.total += litres
      s.count++
      if (row.milk_discarded) s.discarded += litres
      summary.day.total += litres
      summary.day.count++
      if (row.milk_discarded) summary.day.discarded += litres
    }

    for (const key of Object.keys(summary)) {
      summary[key].total = Math.round(summary[key].total * 100) / 100
      summary[key].discarded = Math.round(summary[key].discarded * 100) / 100
    }

    res.json({ date, sessions: summary })
  } catch (err) {
    next(err)
  }
})

// GET /api/milk-records/:id
router.get('/:id', async (req, res, next) => {
  try {
    const row = await milkQuery().where('mr.id', req.params.id).first()
    if (!row) return res.status(404).json({ error: 'Milk record not found' })
    res.json(row)
  } catch (err) {
    next(err)
  }
})

// POST /api/milk-records
router.post('/', async (req, res, next) => {
  try {
    const { error, value } = createSchema.validate(req.body)
    if (error) return res.status(400).json({ error: error.details[0].message.replace(/['"]/g, '') })

    const cow = await db('cows').where({ id: value.cow_id }).whereNull('deleted_at').first()
    if (!cow) return res.status(404).json({ error: 'Cow not found' })
    if (cow.sex === 'male') return res.status(400).json({ error: 'Cannot record milk for a male animal' })

    // Check unique constraint before insert to return a clean 409
    const existing = await db('milk_records').where({
      cow_id: value.cow_id,
      session: value.session,
      recording_date: value.recording_date,
    }).first()
    if (existing) return res.status(409).json({ error: 'Record already exists for this cow/session/date', id: existing.id })

    // Auto-flag withdrawal — compute once, reuse for discard reason
    const now = new Date().toISOString()
    if (!value.milk_discarded) {
      const withdrawal = await db('treatments')
        .where('cow_id', value.cow_id)
        .where('withdrawal_end_milk', '>', now)
        .orderBy('withdrawal_end_milk', 'desc')
        .first()
      if (withdrawal) {
        value.milk_discarded = true
        value.discard_reason = value.discard_reason
          || `Medication withdrawal until ${withdrawal.withdrawal_end_milk.slice(0, 10)}`
      }
    }

    const id = uuidv4()

    await db('milk_records').insert({
      id,
      cow_id: value.cow_id,
      recorded_by: req.user.id,
      session: value.session,
      litres: Math.round(Number(value.litres) * 100) / 100,
      recording_date: value.recording_date,
      session_time: value.session_time || null,
      milk_discarded: value.milk_discarded,
      discard_reason: value.discard_reason || null,
      notes: value.notes || null,
      created_at: now,
      updated_at: now,
    })

    const created = await milkQuery().where('mr.id', id).first()
    res.status(201).json(created)
  } catch (err) {
    next(err)
  }
})

// PUT /api/milk-records/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { error, value } = updateSchema.validate(req.body)
    if (error) return res.status(400).json({ error: error.details[0].message.replace(/['"]/g, '') })

    const existing = await db('milk_records').where({ id: req.params.id }).first()
    if (!existing) return res.status(404).json({ error: 'Milk record not found' })

    if (req.user.role !== 'admin' && existing.recorded_by !== req.user.id) {
      return res.status(403).json({ error: 'Not authorised to edit this record' })
    }

    // Re-check withdrawal: if cow is still on withdrawal, discard flag cannot be removed
    if (value.milk_discarded === false) {
      const now = new Date().toISOString()
      const activeWithdrawal = await db('treatments')
        .where('cow_id', existing.cow_id)
        .where('withdrawal_end_milk', '>', now)
        .first()
      if (activeWithdrawal) {
        value.milk_discarded = true
        value.discard_reason = value.discard_reason
          || `Medication withdrawal until ${activeWithdrawal.withdrawal_end_milk.slice(0, 10)}`
      }
    }

    if (value.litres !== undefined) {
      value.litres = Math.round(Number(value.litres) * 100) / 100
    }

    await db('milk_records').where({ id: req.params.id }).update({
      ...value,
      updated_at: new Date().toISOString(),
    })

    const updated = await milkQuery().where('mr.id', req.params.id).first()
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/milk-records/:id — admin only
router.delete('/:id', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })

    const existing = await db('milk_records').where({ id: req.params.id }).first()
    if (!existing) return res.status(404).json({ error: 'Milk record not found' })

    await db('milk_records').where({ id: req.params.id }).delete()
    res.json({ message: 'Milk record deleted' })
  } catch (err) {
    next(err)
  }
})

module.exports = router
