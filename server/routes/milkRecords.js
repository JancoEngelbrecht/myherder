const express = require('express')
const { randomUUID: uuidv4 } = require('crypto')
const Joi = require('joi')
const db = require('../config/database')
const authenticate = require('../middleware/auth')
const authorize = require('../middleware/authorize')
const { requireAdmin } = authorize
const { ISO_DATE_RE, joiMsg, validateBody, validateQuery } = require('../helpers/constants')
const { logAudit } = require('../services/auditService')

const router = express.Router()
router.use(authenticate)

const VALID_SESSIONS = ['morning', 'afternoon', 'evening']
const VALID_SORT_FIELDS = ['recording_date', 'litres', 'tag_number']
const VALID_ORDERS = ['asc', 'desc']

// ── Validation ──────────────────────────────────────────────────────────────

const querySchema = Joi.object({
  date: Joi.string().pattern(ISO_DATE_RE),
  from: Joi.string().pattern(ISO_DATE_RE),
  to: Joi.string().pattern(ISO_DATE_RE),
  session: Joi.string().valid(...VALID_SESSIONS),
  cow_id: Joi.string().uuid(),
  recorded_by: Joi.string().uuid(),
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
  sort: Joi.string().valid(...VALID_SORT_FIELDS),
  order: Joi.string().valid(...VALID_ORDERS),
})

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

// ── Helpers ─────────────────────────────────────────────────────────────────

function applyFilters(query, params) {
  const { date, from, to, session, cow_id, recorded_by } = params
  if (date) query.where('mr.recording_date', date)
  if (from) query.where('mr.recording_date', '>=', from)
  if (to) query.where('mr.recording_date', '<=', to)
  if (session) query.where('mr.session', session)
  if (cow_id) query.where('mr.cow_id', cow_id)
  if (recorded_by) query.where('mr.recorded_by', recorded_by)
}

const SORT_COLUMN_MAP = {
  recording_date: 'mr.recording_date',
  litres: 'mr.litres',
  tag_number: 'c.tag_number',
}

// ── Routes ──────────────────────────────────────────────────────────────────

// GET /api/milk-records
// Legacy: ?date&session&cow_id → plain array
// Enhanced: ?from&to&recorded_by&page&limit&sort&order → { data, total }
router.get('/', async (req, res, next) => {
  try {
    const { error, value } = validateQuery(querySchema, req.query)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    const paginated = value.page != null || value.limit != null
    const sortCol = SORT_COLUMN_MAP[value.sort || 'recording_date']
    const order = value.order || 'desc'

    const query = milkQuery().orderBy(sortCol, order)
    applyFilters(query, value)

    if (!paginated) {
      // Legacy mode: default sort by tag_number asc for recording page
      query.clear('order').orderBy('c.tag_number', 'asc')
      return res.json(await query)
    }

    const page = value.page || 1
    const limit = value.limit || 25

    // Count total matching rows
    const countQuery = db('milk_records as mr')
      .join('cows as c', 'mr.cow_id', 'c.id')
      .whereNull('c.deleted_at')
    applyFilters(countQuery, value)

    const [[{ cnt }], data] = await Promise.all([
      countQuery.count('mr.id as cnt'),
      query.limit(limit).offset((page - 1) * limit),
    ])
    res.json({ data, total: Number(cnt) })
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
      .select(
        'mr.session',
        db.raw('SUM(mr.litres) as total'),
        db.raw('COUNT(*) as count'),
        db.raw('SUM(CASE WHEN mr.milk_discarded = 1 THEN mr.litres ELSE 0 END) as discarded'),
      )
      .groupBy('mr.session')

    const round = (n) => Math.round(n * 100) / 100
    const empty = () => ({ total: 0, discarded: 0, count: 0 })
    const summary = { morning: empty(), afternoon: empty(), evening: empty(), day: empty() }

    for (const row of rows) {
      const total = Number(row.total) || 0
      const discarded = Number(row.discarded) || 0
      const count = Number(row.count) || 0
      summary[row.session] = { total: round(total), discarded: round(discarded), count }
      summary.day.total += total
      summary.day.discarded += discarded
      summary.day.count += count
    }

    summary.day.total = round(summary.day.total)
    summary.day.discarded = round(summary.day.discarded)

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
router.post('/', authorize('can_record_milk'), async (req, res, next) => {
  try {
    const { error, value } = validateBody(createSchema, req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })

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
    await logAudit({ userId: req.user.id, action: 'create', entityType: 'milk_record', entityId: id, newValues: created })
    res.status(201).json(created)
  } catch (err) {
    next(err)
  }
})

// PUT /api/milk-records/:id
router.put('/:id', authorize('can_record_milk'), async (req, res, next) => {
  try {
    const { error, value } = validateBody(updateSchema, req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })

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
    await logAudit({ userId: req.user.id, action: 'update', entityType: 'milk_record', entityId: req.params.id, oldValues: existing, newValues: updated })
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/milk-records/:id — admin only
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {

    const existing = await db('milk_records').where({ id: req.params.id }).first()
    if (!existing) return res.status(404).json({ error: 'Milk record not found' })

    await db('milk_records').where({ id: req.params.id }).delete()
    await logAudit({ userId: req.user.id, action: 'delete', entityType: 'milk_record', entityId: req.params.id, oldValues: existing })
    res.json({ message: 'Milk record deleted' })
  } catch (err) {
    next(err)
  }
})

module.exports = router
