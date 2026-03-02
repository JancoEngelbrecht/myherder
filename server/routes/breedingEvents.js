const express = require('express')
const { randomUUID: uuidv4 } = require('crypto')
const Joi = require('joi')
const db = require('../config/database')
const authenticate = require('../middleware/auth')
const authorize = require('../middleware/authorize')

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

// Fixed workflow event types — not configurable
const VALID_EVENT_TYPES = [
  'heat_observed', 'ai_insemination', 'bull_service',
  'preg_check_positive', 'preg_check_negative',
  'calving', 'abortion', 'dry_off',
]

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
  expected_calving: Joi.string().isoDate().allow(null, '').default(null),
  expected_dry_off: Joi.string().isoDate().allow(null, '').default(null),
})

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
  expected_calving: Joi.string().isoDate().allow(null, '').optional(),
  expected_dry_off: Joi.string().isoDate().allow(null, '').optional(),
})

// ── Auto-date calculation ─────────────────────────────────────────────────────

function calcDates(eventType, eventDate, breedTimings = {}) {
  const base = new Date(eventDate)
  const heatCycleDays = breedTimings.heat_cycle_days ?? 21
  const pregCheckDays = breedTimings.preg_check_days ?? 35
  const gestationDays = breedTimings.gestation_days ?? 283
  const dryOffDays = breedTimings.dry_off_days ?? 60

  const addDays = (n) => {
    const d = new Date(base)
    d.setDate(d.getDate() + n)
    return d.toISOString().slice(0, 10)
  }

  if (['heat_observed', 'ai_insemination', 'bull_service'].includes(eventType)) {
    const result = {
      expected_next_heat: addDays(heatCycleDays),
      expected_preg_check: addDays(pregCheckDays),
      expected_calving: null,
      expected_dry_off: null,
    }

    if (['ai_insemination', 'bull_service'].includes(eventType)) {
      const calvingDate = new Date(base)
      calvingDate.setDate(calvingDate.getDate() + gestationDays)
      const dryOffDate = new Date(calvingDate)
      dryOffDate.setDate(dryOffDate.getDate() - dryOffDays)
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

// Look up breed-specific timing values by breed_type_id.
// Returns the full breed_types row, or {} if no breed is assigned.
// Used by POST/PATCH handlers to pass breed timings into calcDates().
async function getBreedTimings(breedTypeId) {
  if (!breedTypeId) return {}
  const breed = await db('breed_types').where({ id: breedTypeId }).first()
  return breed || {}
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
// Returns: { heats, calvings, pregChecks, dryOffs, needsAttention }
// - heats/calvings/pregChecks/dryOffs: upcoming items within their lookahead window
// - needsAttention: overdue items from the past 30 days with is_overdue flag
// - All categories exclude dismissed events and deduplicate to latest event per cow
router.get('/upcoming', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const in7  = new Date(Date.now() + 7  * 86400000).toISOString().slice(0, 10)
    const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
    const past30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

    // Base query: join cow+sire+user, exclude dismissed events
    const baseQuery = () => breedingQuery().whereNull('be.dismissed_at')

    // Build a date-range query for a specific auto-date column.
    // extraFilters: optional callback to add category-specific conditions (e.g. dry-off checks cow status)
    function dateRangeQuery(dateCol, from, to, extraFilters) {
      const q = baseQuery()
        .whereNotNull(`be.${dateCol}`)
        .where(`be.${dateCol}`, '>=', from)
        .where(`be.${dateCol}`, '<=', to)
        .orderBy(`be.${dateCol}`, 'asc')
      if (extraFilters) extraFilters(q)
      return q
    }

    // Dry-off only applies to pregnant cows that aren't already dry
    const dryOffFilters = (q) => q.where('c.status', 'pregnant').where('c.is_dry', false)

    // Fetch upcoming + overdue for all categories in parallel
    const [
      heatsRaw, calvingsRaw, pregChecksRaw, dryOffsRaw,
      overdueHeats, overdueCalvings, overduePregChecks, overdueDryOffs,
    ] = await Promise.all([
      // Upcoming
      dateRangeQuery('expected_next_heat', today, in7),
      dateRangeQuery('expected_calving', today, in14),
      dateRangeQuery('expected_preg_check', today, in7),
      dateRangeQuery('expected_dry_off', today, in14, dryOffFilters),
      // Overdue (past 30 days, strictly before today)
      dateRangeQuery('expected_next_heat', past30, yesterday),
      dateRangeQuery('expected_calving', past30, yesterday),
      dateRangeQuery('expected_preg_check', past30, yesterday),
      dateRangeQuery('expected_dry_off', past30, yesterday, dryOffFilters),
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

    // Build needs-attention list: overdue items with alert metadata
    const toOverdueItems = (rows, alertType, dateField) =>
      latestPerCow(rows, dateField).map((row) => ({
        ...parseJsonFields(row),
        alert_type: alertType,
        alert_date: row[dateField],
        is_overdue: true,
      }))

    const needsAttention = [
      ...toOverdueItems(overdueHeats, 'heat', 'expected_next_heat'),
      ...toOverdueItems(overduePregChecks, 'preg_check', 'expected_preg_check'),
      ...toOverdueItems(overdueCalvings, 'calving', 'expected_calving'),
      ...toOverdueItems(overdueDryOffs, 'dry_off', 'expected_dry_off'),
    ].sort((a, b) => a.alert_date.localeCompare(b.alert_date))

    res.json({
      heats: latestPerCow(heatsRaw, 'expected_next_heat').map(parseJsonFields),
      calvings: latestPerCow(calvingsRaw, 'expected_calving').map(parseJsonFields),
      pregChecks: latestPerCow(pregChecksRaw, 'expected_preg_check').map(parseJsonFields),
      dryOffs: latestPerCow(dryOffsRaw, 'expected_dry_off').map(parseJsonFields),
      needsAttention,
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/breeding-events?cow_id=X&event_type=X&cow_status=X&date_from=X&date_to=X&page=N&limit=N
// - With cow_id: returns plain array (no pagination needed for per-cow views)
// - Without cow_id: returns { data: [...], total: N } with server-side pagination
// - event_type: single value or comma-separated (e.g. "ai_insemination,bull_service")
// - cow_status: 'active', 'pregnant', or 'dry' (dry filters on is_dry flag)
// - date_from / date_to: ISO date strings to filter event_date range
const VALID_COW_STATUSES = ['active', 'pregnant', 'dry']

router.get('/', async (req, res, next) => {
  try {
    const { cow_id, event_type, cow_status, date_from, date_to } = req.query
    const types = event_type ? event_type.split(',') : null

    // Validate event_type values
    if (types) {
      for (const t of types) {
        if (!VALID_EVENT_TYPES.includes(t)) {
          return res.status(400).json({ error: `Invalid event_type: ${t}` })
        }
      }
    }

    // Validate cow_status
    if (cow_status && !VALID_COW_STATUSES.includes(cow_status)) {
      return res.status(400).json({ error: `Invalid cow_status: ${cow_status}` })
    }

    const applyTypeFilter = (q) => { if (types) q.whereIn('be.event_type', types) }

    const applyFilters = (q) => {
      applyTypeFilter(q)
      if (cow_status === 'dry') {
        q.where('c.is_dry', true)
      } else if (cow_status) {
        q.where('c.status', cow_status)
      }
      if (date_from) q.where('be.event_date', '>=', date_from)
      if (date_to) q.where('be.event_date', '<=', date_to)
    }

    // Per-cow query: plain array, no pagination
    if (cow_id) {
      const query = breedingQuery().orderBy('be.event_date', 'desc').where('be.cow_id', cow_id)
      applyFilters(query)
      const rows = await query
      return res.json(rows.map(parseJsonFields))
    }

    // Global list: server-side pagination
    const page  = Math.max(1, parseInt(req.query.page)  || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20))
    const offset = (page - 1) * limit

    const [rows, [{ count }]] = await Promise.all([
      breedingQuery().modify(applyFilters).orderBy('be.event_date', 'desc').limit(limit).offset(offset),
      db('breeding_events as be')
        .join('cows as c', 'be.cow_id', 'c.id')
        .whereNull('c.deleted_at')
        .modify(applyFilters)
        .count('be.id as count'),
    ])

    res.json({ data: rows.map(parseJsonFields), total: Number(count) })
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
router.post('/', authorize('can_log_breeding'), async (req, res, next) => {
  try {
    const { error, value } = createSchema.validate(req.body)
    if (error) return res.status(400).json({ error: error.details[0].message.replace(/['"]/g, '') })

    const validTypes = VALID_EVENT_TYPES
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

    // Use cow's breed type for breed-specific date calculations
    const breedTimings = await getBreedTimings(cow.breed_type_id)
    const autoDates = calcDates(value.event_type, value.event_date, breedTimings)

    // Client-provided expected_calving/expected_dry_off override auto-calculated values
    // (used by preg_check_positive form where farmer can enter/override the calving date)
    if (value.expected_calving) {
      autoDates.expected_calving = value.expected_calving
      autoDates.expected_dry_off = value.expected_dry_off || null
    } else if (value.event_type === 'preg_check_positive' && !autoDates.expected_calving) {
      // Fallback: carry forward from the cow's latest insemination event
      const latestInsem = await db('breeding_events')
        .where({ cow_id: value.cow_id })
        .whereIn('event_type', ['ai_insemination', 'bull_service'])
        .whereNotNull('expected_calving')
        .orderBy('event_date', 'desc')
        .first()
      if (latestInsem) {
        autoDates.expected_calving = latestInsem.expected_calving
        autoDates.expected_dry_off = latestInsem.expected_dry_off
      }
    }
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

    // Build cow updates: status transition + dry flag changes in one write
    const cowUpdates = { updated_at: now }
    const newStatus = STATUS_TRANSITIONS[value.event_type]
    if (newStatus) cowUpdates.status = newStatus
    if (value.event_type === 'dry_off') cowUpdates.is_dry = true
    if (value.event_type === 'calving') cowUpdates.is_dry = false

    if (Object.keys(cowUpdates).length > 1) {
      await db('cows').where({ id: value.cow_id }).update(cowUpdates)
    }

    const created = await breedingQuery().where('be.id', id).first()
    res.status(201).json(parseJsonFields(created))
  } catch (err) {
    next(err)
  }
})

// PATCH /api/breeding-events/dismiss-batch — dismiss multiple events at once
// Must be defined before /:id to avoid Express matching "dismiss-batch" as :id
router.patch('/dismiss-batch', authorize('can_log_breeding'), async (req, res, next) => {
  try {
    const { ids, reason } = req.body
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids must be a non-empty array' })
    }
    if (ids.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 events per batch' })
    }

    const now = new Date().toISOString()
    const updated = await db('breeding_events')
      .whereIn('id', ids)
      .whereNull('dismissed_at')
      .update({
        dismissed_at: now,
        dismissed_by: req.user.id,
        dismiss_reason: reason || null,
        updated_at: now,
      })

    res.json({ dismissed: updated })
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

    const { error, value } = updateSchema.validate(req.body)
    if (error) return res.status(400).json({ error: error.details[0].message.replace(/['"]/g, '') })

    if (value.event_type) {
      const validTypes = VALID_EVENT_TYPES
      if (!validTypes.includes(value.event_type)) {
        return res.status(400).json({ error: `Invalid event_type: ${value.event_type}` })
      }
    }

    const eventType = value.event_type ?? existing.event_type
    const eventDate = value.event_date ?? existing.event_date
    const cow = await db('cows').where({ id: existing.cow_id }).first()
    const breedTimings = await getBreedTimings(cow?.breed_type_id)
    const autoDates = calcDates(eventType, eventDate, breedTimings)

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
    if ('expected_calving' in value) updates.expected_calving = value.expected_calving || null
    if ('expected_dry_off' in value) updates.expected_dry_off = value.expected_dry_off || null

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

// PATCH /api/breeding-events/:id/dismiss
router.patch('/:id/dismiss', authorize('can_log_breeding'), async (req, res, next) => {
  try {
    const existing = await db('breeding_events').where({ id: req.params.id }).first()
    if (!existing) return res.status(404).json({ error: 'Breeding event not found' })

    const now = new Date().toISOString()
    await db('breeding_events').where({ id: req.params.id }).update({
      dismissed_at: now,
      dismissed_by: req.user.id,
      dismiss_reason: req.body.reason || null,
      updated_at: now,
    })

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
