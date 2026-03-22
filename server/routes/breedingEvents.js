const express = require('express')
const { randomUUID: uuidv4 } = require('crypto')
const Joi = require('joi')
const db = require('../config/database')
const authenticate = require('../middleware/auth')
const authorize = require('../middleware/authorize')
const { requireAdmin } = authorize
const { calcDates, getBreedTimings } = require('../helpers/breedingCalc')
const { joiMsg, MS_PER_DAY, validateBody, validateQuery } = require('../helpers/constants')
const { logAudit } = require('../services/auditService')
const {
  STATUS_TRANSITIONS,
  VALID_EVENT_TYPES,
  BIRTH_EVENT_TYPES,
  createSchema,
  updateSchema,
  breedingQuerySchema,
} = require('../helpers/breedingSchemas')

const dismissBatchSchema = Joi.object({
  ids: Joi.array().items(Joi.string().uuid()).min(1).max(100).required(),
  reason: Joi.string().max(500).allow(null, '').optional(),
})

const dismissSchema = Joi.object({
  reason: Joi.string().max(500).allow(null, '').optional(),
})

const tenantScope = require('../middleware/tenantScope')

const router = express.Router()
router.use(authenticate)
router.use(tenantScope)

// ── Constants ─────────────────────────────────────────────────────────────────

const UPCOMING_HEAT_DAYS = 7
const UPCOMING_CALVING_DAYS = 14
const OVERDUE_LOOKBACK_DAYS = 30

// ── Query helpers ─────────────────────────────────────────────────────────────

function breedingQuery(farmId) {
  return db('breeding_events as be')
    .where('be.farm_id', farmId)
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
      'u.full_name as recorded_by_name'
    )
}

function parseJsonFields(row) {
  if (!row) return row
  if (row.heat_signs && typeof row.heat_signs === 'string') {
    try {
      row.heat_signs = JSON.parse(row.heat_signs)
    } catch {
      row.heat_signs = null
    }
  }
  if (row.calving_details && typeof row.calving_details === 'string') {
    try {
      row.calving_details = JSON.parse(row.calving_details)
    } catch {
      row.calving_details = null
    }
  }
  return row
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/breeding-events/upcoming — events with alert dates in the next 14 days
// Returns: { heats, calvings, pregChecks, dryOffs, needsAttention }
// - heats/calvings/pregChecks/dryOffs: upcoming items within their lookahead window
// - needsAttention: overdue items from the past 30 days with is_overdue flag
// - All categories exclude dismissed events and deduplicate to latest event per cow
router.get('/upcoming', authorize('can_log_breeding'), async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - MS_PER_DAY).toISOString().slice(0, 10)
    const heatDeadline = new Date(Date.now() + UPCOMING_HEAT_DAYS * MS_PER_DAY)
      .toISOString()
      .slice(0, 10)
    const calvingDeadline = new Date(Date.now() + UPCOMING_CALVING_DAYS * MS_PER_DAY)
      .toISOString()
      .slice(0, 10)
    const overdueCutoff = new Date(Date.now() - OVERDUE_LOOKBACK_DAYS * MS_PER_DAY)
      .toISOString()
      .slice(0, 10)

    // Base query: join cow+sire+user, exclude dismissed events
    const baseQuery = () => breedingQuery(req.farmId).whereNull('be.dismissed_at')

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
    const dryOffFilters = (q) => q.where('c.status', 'pregnant')

    // Fetch upcoming + overdue for all categories in parallel
    const [
      heatsRaw,
      calvingsRaw,
      pregChecksRaw,
      dryOffsRaw,
      overdueHeats,
      overdueCalvings,
      overduePregChecks,
      overdueDryOffs,
    ] = await Promise.all([
      // Upcoming
      dateRangeQuery('expected_next_heat', today, heatDeadline),
      dateRangeQuery('expected_calving', today, calvingDeadline),
      dateRangeQuery('expected_preg_check', today, heatDeadline),
      dateRangeQuery('expected_dry_off', today, calvingDeadline, dryOffFilters),
      // Overdue (past 30 days, strictly before today)
      dateRangeQuery('expected_next_heat', overdueCutoff, yesterday),
      dateRangeQuery('expected_calving', overdueCutoff, yesterday),
      dateRangeQuery('expected_preg_check', overdueCutoff, yesterday),
      dateRangeQuery('expected_dry_off', overdueCutoff, yesterday, dryOffFilters),
    ])

    // Deduplicate: keep only the latest event per cow for each category
    const latestPerCow = (rows, dateField) => {
      const map = {}
      for (const row of rows) {
        if (!map[row.cow_id] || row[dateField] > map[row.cow_id][dateField]) {
          map[row.cow_id] = row
        }
      }
      return Object.values(map).sort((a, b) =>
        String(a[dateField] ?? '').localeCompare(String(b[dateField] ?? ''))
      )
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
    ].sort((a, b) => String(a.alert_date ?? '').localeCompare(String(b.alert_date ?? '')))

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
// - With cow_id only (no page/limit): returns plain array (per-cow repro views)
// - With page/limit (with or without cow_id): returns { data: [...], total: N } with server-side pagination
// - event_type: single value or comma-separated (e.g. "ai_insemination,bull_service")
// - cow_status: 'active', 'pregnant', or 'dry'
// - date_from / date_to: ISO date strings to filter event_date range
router.get('/', authorize('can_log_breeding'), async (req, res, next) => {
  try {
    const { error: qError, value: qValue } = validateQuery(breedingQuerySchema, req.query)
    if (qError) return res.status(400).json({ error: joiMsg(qError) })

    const { cow_id, event_type, cow_status, date_from, date_to } = qValue
    const types = event_type ? event_type.split(',') : null

    // Validate event_type values
    if (types) {
      for (const t of types) {
        if (!VALID_EVENT_TYPES.includes(t)) {
          return res.status(400).json({ error: `Invalid event_type: ${t}` })
        }
      }
    }

    const applyTypeFilter = (q) => {
      if (types) q.whereIn('be.event_type', types)
    }

    const applyFilters = (q) => {
      applyTypeFilter(q)
      if (cow_status) {
        q.where('c.status', cow_status)
      }
      if (date_from) q.where('be.event_date', '>=', date_from)
      if (date_to) q.where('be.event_date', '<=', date_to)
    }

    // Per-cow query without pagination: plain array (used by CowReproView)
    if (cow_id && !qValue.page && !qValue.limit) {
      const query = breedingQuery(req.farmId)
        .orderBy('be.event_date', 'desc')
        .where('be.cow_id', cow_id)
      applyFilters(query)
      const rows = await query
      return res.json(rows.map(parseJsonFields))
    }

    // Paginated list (global or per-cow with page/limit)
    const page = Math.max(1, Number(qValue.page) || 1)
    const limit = Math.min(100, Math.max(1, Number(qValue.limit) || 20))
    const offset = (page - 1) * limit

    const applyAllFilters = (q) => {
      applyFilters(q)
      if (cow_id) q.where('be.cow_id', cow_id)
    }

    const [rows, [{ count }]] = await Promise.all([
      breedingQuery(req.farmId)
        .modify(applyAllFilters)
        .orderBy('be.event_date', 'desc')
        .limit(limit)
        .offset(offset),
      db('breeding_events as be')
        .where('be.farm_id', req.farmId)
        .join('cows as c', 'be.cow_id', 'c.id')
        .whereNull('c.deleted_at')
        .modify(applyAllFilters)
        .count('be.id as count'),
    ])

    res.json({ data: rows.map(parseJsonFields), total: Number(count) })
  } catch (err) {
    next(err)
  }
})

// GET /api/breeding-events/:id
router.get('/:id', authorize('can_log_breeding'), async (req, res, next) => {
  try {
    const row = await breedingQuery(req.farmId).where('be.id', req.params.id).first()
    if (!row) return res.status(404).json({ error: 'Breeding event not found' })

    const parsed = parseJsonFields(row)

    // For birth events, include count of registered offspring
    if (BIRTH_EVENT_TYPES.includes(row.event_type)) {
      const countResult = await db('cows')
        .where({ birth_event_id: row.id, farm_id: req.farmId })
        .whereNull('deleted_at')
        .count('* as count')
        .first()
      parsed.registered_offspring = Number(countResult?.count ?? 0)
    }

    res.json(parsed)
  } catch (err) {
    next(err)
  }
})

// POST /api/breeding-events
router.post('/', authorize('can_log_breeding'), async (req, res, next) => {
  try {
    const { error, value } = validateBody(createSchema, req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    const cow = await db('cows')
      .where({ id: value.cow_id })
      .where('farm_id', req.farmId)
      .whereNull('deleted_at')
      .first()
    if (!cow) return res.status(404).json({ error: 'Cow not found' })
    if (cow.sex === 'male')
      return res.status(400).json({ error: 'Cannot log breeding events for a male animal' })

    if (value.sire_id) {
      const sire = await db('cows')
        .where({ id: value.sire_id })
        .where('farm_id', req.farmId)
        .whereNull('deleted_at')
        .first()
      if (!sire) return res.status(404).json({ error: 'Sire not found' })
      if (sire.sex !== 'male') return res.status(400).json({ error: 'Sire must be a male animal' })
    }

    // Use cow's breed type for breed-specific date calculations
    const breedTimings = await getBreedTimings(cow.breed_type_id, req.farmId)
    const autoDates = calcDates(value.event_type, value.event_date, breedTimings)

    // Client-provided expected_calving/expected_dry_off override auto-calculated values
    // (used by preg_check_positive form where farmer can enter/override the calving date)
    if (value.expected_calving) {
      autoDates.expected_calving = value.expected_calving
      autoDates.expected_dry_off = value.expected_dry_off || null
    } else if (value.event_type === 'preg_check_positive' && !autoDates.expected_calving) {
      // Fallback: carry forward from the cow's latest insemination event
      const latestInsem = await db('breeding_events')
        .where('farm_id', req.farmId)
        .where({ cow_id: value.cow_id })
        .whereIn('event_type', ['ai_insemination', 'bull_service', 'ram_service'])
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
      farm_id: req.user.farm_id,
      cow_id: value.cow_id,
      event_type: value.event_type,
      event_date: value.event_date,
      sire_id: value.sire_id || null,
      semen_id: value.semen_id || null,
      inseminator: value.inseminator || null,
      heat_signs: value.heat_signs ? JSON.stringify(value.heat_signs) : null,
      preg_check_method: value.preg_check_method || null,
      calving_details: value.calving_details ? JSON.stringify(value.calving_details) : null,
      offspring_count: value.offspring_count ?? 1,
      cost: value.cost ?? null,
      notes: value.notes || null,
      ...autoDates,
      recorded_by: req.user.id,
      created_at: now,
      updated_at: now,
    })

    // Build cow updates: status transition in one write
    const cowUpdates = { updated_at: now }
    const newStatus = STATUS_TRANSITIONS[value.event_type]
    if (newStatus) cowUpdates.status = newStatus

    if (Object.keys(cowUpdates).length > 1) {
      await db('cows').where({ id: value.cow_id }).where('farm_id', req.farmId).update(cowUpdates)
    }

    const created = await breedingQuery(req.farmId).where('be.id', id).first()
    await logAudit({
      farmId: req.user.farm_id,
      userId: req.user.id,
      action: 'create',
      entityType: 'breeding_event',
      entityId: id,
      newValues: created,
    })
    res.status(201).json(parseJsonFields(created))
  } catch (err) {
    next(err)
  }
})

// PATCH /api/breeding-events/dismiss-batch — dismiss multiple events at once
// Must be defined before /:id to avoid Express matching "dismiss-batch" as :id
router.patch('/dismiss-batch', authorize('can_log_breeding'), async (req, res, next) => {
  try {
    const { error: batchError, value: batchValue } = validateBody(dismissBatchSchema, req.body)
    if (batchError) return res.status(400).json({ error: joiMsg(batchError) })

    const { ids, reason } = batchValue
    const now = new Date().toISOString()
    const dismissed = await db('breeding_events')
      .where('farm_id', req.farmId)
      .whereIn('id', ids)
      .whereNull('dismissed_at')
      .update({
        dismissed_at: now,
        dismissed_by: req.user.id,
        dismiss_reason: reason || null,
        updated_at: now,
      })

    await logAudit({
      farmId: req.user.farm_id,
      userId: req.user.id,
      action: 'dismiss',
      entityType: 'breeding_event',
      entityId: ids[0],
      newValues: { ids, reason: reason || null, dismissed_count: dismissed },
    })
    res.json({ dismissed })
  } catch (err) {
    next(err)
  }
})

// PATCH /api/breeding-events/:id — admin only
router.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    const existing = await db('breeding_events')
      .where({ id: req.params.id })
      .where('farm_id', req.farmId)
      .first()
    if (!existing) return res.status(404).json({ error: 'Breeding event not found' })

    const { error, value } = validateBody(updateSchema, req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    const eventType = value.event_type ?? existing.event_type
    const eventDate = value.event_date ?? existing.event_date
    const cow = await db('cows').where({ id: existing.cow_id }).where('farm_id', req.farmId).first()
    const breedTimings = await getBreedTimings(cow?.breed_type_id, req.farmId)
    const autoDates = calcDates(eventType, eventDate, breedTimings)

    const now = new Date().toISOString()
    const updates = { updated_at: now, ...autoDates }

    if (value.event_type !== undefined) updates.event_type = value.event_type
    if (value.event_date !== undefined) updates.event_date = value.event_date
    if ('sire_id' in value) updates.sire_id = value.sire_id || null
    if ('semen_id' in value) updates.semen_id = value.semen_id || null
    if ('inseminator' in value) updates.inseminator = value.inseminator || null
    if ('preg_check_method' in value) updates.preg_check_method = value.preg_check_method || null
    if ('calving_details' in value)
      updates.calving_details = value.calving_details ? JSON.stringify(value.calving_details) : null
    if ('cost' in value) updates.cost = value.cost ?? null
    if ('notes' in value) updates.notes = value.notes || null
    if ('expected_calving' in value) updates.expected_calving = value.expected_calving || null
    if ('expected_dry_off' in value) updates.expected_dry_off = value.expected_dry_off || null
    if ('offspring_count' in value) updates.offspring_count = value.offspring_count

    await db('breeding_events')
      .where({ id: req.params.id })
      .where('farm_id', req.farmId)
      .update(updates)

    // Re-apply status transition if event_type changed
    if (value.event_type) {
      const newStatus = STATUS_TRANSITIONS[value.event_type]
      if (newStatus) {
        await db('cows')
          .where({ id: existing.cow_id })
          .where('farm_id', req.farmId)
          .update({ status: newStatus, updated_at: now })
      }
    }

    const updated = await breedingQuery(req.farmId).where('be.id', req.params.id).first()
    await logAudit({
      farmId: req.user.farm_id,
      userId: req.user.id,
      action: 'update',
      entityType: 'breeding_event',
      entityId: req.params.id,
      oldValues: existing,
      newValues: updated,
    })
    res.json(parseJsonFields(updated))
  } catch (err) {
    next(err)
  }
})

// PATCH /api/breeding-events/:id/dismiss
router.patch('/:id/dismiss', authorize('can_log_breeding'), async (req, res, next) => {
  try {
    const { error: dError, value: dValue } = validateBody(dismissSchema, req.body)
    if (dError) return res.status(400).json({ error: joiMsg(dError) })

    const existing = await db('breeding_events')
      .where({ id: req.params.id })
      .where('farm_id', req.farmId)
      .first()
    if (!existing) return res.status(404).json({ error: 'Breeding event not found' })

    const now = new Date().toISOString()
    await db('breeding_events')
      .where({ id: req.params.id })
      .where('farm_id', req.farmId)
      .update({
        dismissed_at: now,
        dismissed_by: req.user.id,
        dismiss_reason: dValue.reason || null,
        updated_at: now,
      })

    const updated = await breedingQuery(req.farmId).where('be.id', req.params.id).first()
    await logAudit({
      farmId: req.user.farm_id,
      userId: req.user.id,
      action: 'dismiss',
      entityType: 'breeding_event',
      entityId: req.params.id,
      oldValues: { dismissed_at: existing.dismissed_at },
      newValues: { dismissed_at: now, reason: dValue.reason || null },
    })
    res.json(parseJsonFields(updated))
  } catch (err) {
    next(err)
  }
})

// DELETE /api/breeding-events/:id — admin only
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const existing = await db('breeding_events')
      .where({ id: req.params.id })
      .where('farm_id', req.farmId)
      .first()
    if (!existing) return res.status(404).json({ error: 'Breeding event not found' })

    await db('breeding_events').where({ id: req.params.id }).where('farm_id', req.farmId).delete()
    await logAudit({
      farmId: req.user.farm_id,
      userId: req.user.id,
      action: 'delete',
      entityType: 'breeding_event',
      entityId: req.params.id,
      oldValues: existing,
    })
    res.json({ message: 'Breeding event deleted' })
  } catch (err) {
    next(err)
  }
})

module.exports = router
