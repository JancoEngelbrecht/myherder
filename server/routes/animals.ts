// @ts-nocheck
const express = require('express')
const Joi = require('joi')
const { randomUUID: uuidv4 } = require('crypto')
const db = require('../config/database')
const auth = require('../middleware/auth')
const tenantScope = require('../middleware/tenantScope')
const authorize = require('../middleware/authorize')
const { requireAdmin } = authorize
const { logAudit } = require('../services/auditService')
const {
  ISO_DATE_RE,
  MAX_SEARCH_LENGTH,
  MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  parsePagination,
  ANIMAL_STATUSES,
  joiMsg,
  validateBody,
  validateQuery,
} = require('../helpers/constants')
const { isMySQL } = require('./analytics/helpers')

const router = express.Router()
router.use(auth)
router.use(tenantScope)

// ── Validation schemas ──────────────────────────────────────────

const batchSchema = Joi.object({
  defaults: Joi.object({
    sex: Joi.string().valid('female', 'male').required(),
    status: Joi.string()
      .valid(...ANIMAL_STATUSES)
      .default('active'),
    breed_type_id: Joi.string().max(36).allow(null, ''),
    life_phase_override: Joi.string()
      .valid('calf', 'heifer', 'cow', 'young_bull', 'bull', 'lamb', 'ewe', 'ram')
      .allow(null, ''),
  }).required(),
  tags: Joi.array().items(Joi.string().max(50).required()).min(1).max(500).required(),
})

const batchDeleteSchema = Joi.object({
  ids: Joi.array().items(Joi.string().uuid().required()).min(1).max(500).required(),
})

const animalSchema = Joi.object({
  tag_number: Joi.string().max(50).required(),
  name: Joi.string().max(100).allow('', null),
  dob: Joi.string().pattern(ISO_DATE_RE).allow('', null),
  breed: Joi.string().max(100).allow('', null),
  breed_type_id: Joi.string().max(36).allow(null, ''),
  sex: Joi.string().valid('female', 'male').default('female'),
  status: Joi.string()
    .valid(...ANIMAL_STATUSES)
    .default('active'),
  sire_id: Joi.string().uuid().allow(null),
  dam_id: Joi.string().uuid().allow(null),
  is_external: Joi.boolean().default(false),
  purpose: Joi.string().valid('natural_service', 'ai_semen_donor', 'both').allow(null, ''),
  life_phase_override: Joi.string()
    .valid('calf', 'heifer', 'cow', 'young_bull', 'bull', 'lamb', 'ewe', 'ram')
    .allow(null, ''),
  birth_event_id: Joi.string().uuid().allow(null, ''),
  notes: Joi.string().max(2000).allow('', null),
})

const animalUpdateSchema = animalSchema.fork('tag_number', (s) => s.optional())

const animalQuerySchema = Joi.object({
  search: Joi.string().max(100).allow(''),
  status: Joi.string().valid(...ANIMAL_STATUSES),
  sex: Joi.string().valid('female', 'male'),
  breed_type_id: Joi.string().max(36),
  life_phase: Joi.string().valid(
    'calf',
    'heifer',
    'cow',
    'young_bull',
    'bull',
    'lamb',
    'ewe',
    'ram'
  ),
  species_id: Joi.string().uuid(),
  birth_event_id: Joi.string().uuid(),
  pregnant: Joi.string().valid('0', '1', 'true', 'false'),
  dim_min: Joi.number().integer().min(0),
  dim_max: Joi.number().integer().min(0),
  calving_after: Joi.string().pattern(ISO_DATE_RE),
  calving_before: Joi.string().pattern(ISO_DATE_RE),
  yield_min: Joi.number().min(0),
  yield_max: Joi.number().min(0),
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(MAX_PAGE_SIZE),
  sort: Joi.string().valid('tag_number', 'name', 'dob', 'status'),
  order: Joi.string().valid('asc', 'desc'),
})

// ── Helpers ─────────────────────────────────────────────────────

async function findAnimalOrFail(id, farmId) {
  const animal = await db('animals')
    .where({ id })
    .where('farm_id', farmId)
    .whereNull('deleted_at')
    .first()
  if (!animal) {
    const err = new Error('Animal not found')
    err.status = 404
    throw err
  }
  return animal
}

// Build a tag suffix that frees the original slot while guaranteeing
// uniqueness across concurrent batches and historical deletes.
// 8 hex chars = ~4B combos, collision-proof even when Date.now() repeats.
function deletedTag(originalTag) {
  return `${originalTag}__del_${Date.now()}_${uuidv4().slice(0, 8)}`
}

// ── Routes ──────────────────────────────────────────────────────

// ── Life-phase SQL CASE expression ───
// Mirrors client-side computeLifePhase() logic using breed-specific thresholds
// Species-aware: uses lamb/ewe/ram for sheep, calf/heifer/cow/young_bull/bull for cattle
// Portable: uses DATEDIFF on MySQL, julianday on SQLite
function lifePhaseSql() {
  const ageMonths = isMySQL()
    ? 'DATEDIFF(NOW(), c.dob) / 30.44'
    : "(julianday('now') - julianday(c.dob)) / 30.44"
  return `CASE
    WHEN c.life_phase_override IS NOT NULL THEN c.life_phase_override
    WHEN sp.code = 'sheep' THEN CASE
      WHEN c.dob IS NULL AND c.sex = 'male' THEN 'ram'
      WHEN c.dob IS NULL THEN 'ewe'
      WHEN c.sex = 'male' AND ${ageMonths} < COALESCE(bt.calf_max_months, 6) THEN 'lamb'
      WHEN c.sex = 'male' AND ${ageMonths} < COALESCE(bt.young_bull_min_months, 12) THEN 'ram'
      WHEN c.sex = 'male' THEN 'ram'
      WHEN ${ageMonths} < COALESCE(bt.calf_max_months, 6) THEN 'lamb'
      WHEN ${ageMonths} < COALESCE(bt.heifer_min_months, 12) THEN 'ewe'
      ELSE 'ewe'
    END
    ELSE CASE
      WHEN c.dob IS NULL AND c.sex = 'male' THEN 'bull'
      WHEN c.dob IS NULL THEN 'cow'
      WHEN c.sex = 'male' AND ${ageMonths} < COALESCE(bt.calf_max_months, 6) THEN 'calf'
      WHEN c.sex = 'male' AND ${ageMonths} < COALESCE(bt.young_bull_min_months, 15) THEN 'young_bull'
      WHEN c.sex = 'male' THEN 'bull'
      WHEN ${ageMonths} < COALESCE(bt.calf_max_months, 6) THEN 'calf'
      WHEN ${ageMonths} < COALESCE(bt.heifer_min_months, 15) THEN 'heifer'
      ELSE 'cow'
    END
  END`
}

// ── Last calving date subquery (plain string) ───
const LAST_CALVING_SQL = `(
    SELECT MAX(be.event_date)
    FROM breeding_events be
    WHERE be.animal_id = c.id AND be.event_type IN ('calving', 'lambing') AND be.farm_id = c.farm_id
  )`

// GET /api/animals
router.get('/', async (req, res, next) => {
  try {
    const { error: qError, value: q } = validateQuery(animalQuerySchema, req.query)
    if (qError) return res.status(400).json({ error: joiMsg(qError) })

    const query = db('animals as c')
      .where('c.farm_id', req.farmId)
      .leftJoin('breed_types as bt', 'c.breed_type_id', 'bt.id')
      .leftJoin('species as sp', 'c.species_id', 'sp.id')
      .select(
        'c.*',
        'bt.name as breed_type_name',
        'bt.code as breed_type_code',
        db.raw(`${LAST_CALVING_SQL} as last_calving_date`)
      )
      .whereNull('c.deleted_at')

    // Search with input length guard
    if (q.search) {
      const search = String(q.search).slice(0, MAX_SEARCH_LENGTH)
      const s = `%${search}%`
      query.where(function () {
        this.where('c.tag_number', 'like', s).orWhere('c.name', 'like', s)
      })
    }

    if (q.status) query.where('c.status', q.status)
    if (q.sex) query.where('c.sex', q.sex)
    if (q.species_id) query.where('c.species_id', q.species_id)
    if (q.birth_event_id) query.where('c.birth_event_id', q.birth_event_id)

    // Breed filter: match by code to handle cross-farm breed_type_id mismatches
    // (animals may reference breed types seeded under a different farm_id)
    if (q.breed_type_id) {
      const selectedBt = await db('breed_types').where('id', q.breed_type_id).select('code').first()
      if (selectedBt) {
        const matchingIds = await db('breed_types').where('code', selectedBt.code).pluck('id')
        query.whereIn('c.breed_type_id', matchingIds)
      } else {
        query.where('c.breed_type_id', q.breed_type_id)
      }
    }

    // Life phase filter (SQL-computed from dob/sex/breed thresholds)
    if (q.life_phase) {
      query.whereRaw(`(${lifePhaseSql()}) = ?`, [q.life_phase])
    }

    // Pregnant filter (uses animal.status which is updated by breeding events)
    if (q.pregnant !== undefined) {
      if (q.pregnant === 'true' || q.pregnant === '1') {
        query.where('c.status', 'pregnant')
      } else {
        query.whereNot('c.status', 'pregnant')
      }
    }

    // Days in Milk range (days since last calving)
    if (q.dim_min !== undefined || q.dim_max !== undefined) {
      const dimExpr = isMySQL()
        ? `DATEDIFF(NOW(), ${LAST_CALVING_SQL})`
        : `julianday('now') - julianday(${LAST_CALVING_SQL})`
      if (q.dim_min !== undefined) {
        const dimMin = parseInt(String(q.dim_min), 10)
        if (!isNaN(dimMin) && dimMin >= 0) {
          query.whereRaw(`${dimExpr} >= ?`, [dimMin])
        }
      }
      if (q.dim_max !== undefined) {
        const dimMax = parseInt(String(q.dim_max), 10)
        if (!isNaN(dimMax) && dimMax >= 0) {
          query.whereRaw(`${dimExpr} <= ?`, [dimMax])
        }
      }
    }

    // Last calving date range
    if (q.calving_after) query.whereRaw(`${LAST_CALVING_SQL} >= ?`, [q.calving_after])
    if (q.calving_before) query.whereRaw(`${LAST_CALVING_SQL} <= ?`, [q.calving_before])

    // Average daily milk yield range (last 7 days)
    if (q.yield_min !== undefined || q.yield_max !== undefined) {
      const sevenDaysAgo = isMySQL() ? 'DATE_SUB(NOW(), INTERVAL 7 DAY)' : "date('now', '-7 days')"
      const yieldSub = `(
        SELECT AVG(daily_total) FROM (
          SELECT mr.recording_date, SUM(mr.litres) as daily_total
          FROM milk_records mr
          WHERE mr.animal_id = c.id AND mr.farm_id = c.farm_id
            AND mr.recording_date >= ${sevenDaysAgo}
          GROUP BY mr.recording_date
        ) AS daily_yields
      )`
      if (q.yield_min !== undefined) {
        const yMin = parseFloat(String(q.yield_min))
        if (!isNaN(yMin) && yMin >= 0) query.whereRaw(`${yieldSub} >= ?`, [yMin])
      }
      if (q.yield_max !== undefined) {
        const yMax = parseFloat(String(q.yield_max))
        if (!isNaN(yMax) && yMax >= 0) query.whereRaw(`${yieldSub} <= ?`, [yMax])
      }
    }

    const sortMap = { tag_number: 'c.tag_number', name: 'c.name', dob: 'c.dob', status: 'c.status' }
    const sortCol = sortMap[String(q.sort)] || 'c.tag_number'
    const sortOrder = q.order === 'desc' ? 'desc' : 'asc'

    // When page/limit not provided, return all animals (used by MilkRecordingView etc.)
    const paginated = q.page !== undefined || q.limit !== undefined

    if (paginated) {
      const { limit, offset } = parsePagination(q, { defaultLimit: DEFAULT_PAGE_SIZE })
      const [countRow, animals] = await Promise.all([
        query.clone().clearSelect().clearOrder().count('* as count').first(),
        query.orderBy(sortCol, sortOrder).limit(limit).offset(offset),
      ])
      const total = Number(countRow?.count ?? 0)
      res.set('X-Total-Count', String(total))
      res.json(animals)
    } else {
      const animals = await query.orderBy(sortCol, sortOrder)
      res.set('X-Total-Count', String(animals.length))
      res.json(animals)
    }
  } catch (err) {
    // Temporary: surface SQL error details for debugging
    if (err.sqlMessage || err.code) {
      console.error(
        'GET /api/animals SQL error:',
        err.sqlMessage || err.message,
        'code:',
        err.code,
        'query:',
        req.query
      )
      return res.status(500).json({ error: err.sqlMessage || err.message })
    }
    next(err)
  }
})

// GET /api/animals/:id
router.get('/:id', async (req, res, next) => {
  try {
    // Single query with LEFT JOINs to resolve sire/dam names
    const animal = await db('animals as c')
      .where('c.id', req.params.id)
      .where('c.farm_id', req.farmId)
      .whereNull('c.deleted_at')
      .leftJoin('animals as sire', 'c.sire_id', 'sire.id')
      .leftJoin('animals as dam', 'c.dam_id', 'dam.id')
      .leftJoin('breed_types as bt', 'c.breed_type_id', 'bt.id')
      .leftJoin('species as sp', 'c.species_id', 'sp.id')
      .select(
        'c.*',
        db.raw('COALESCE(sire.name, sire.tag_number) as sire_name'),
        db.raw('COALESCE(dam.name, dam.tag_number) as dam_name'),
        'bt.name as breed_type_name',
        'bt.code as breed_type_code',
        'sp.code as species_code'
      )
      .first()

    if (!animal) {
      return res.status(404).json({ error: 'Animal not found' })
    }

    res.json(animal)
  } catch (err) {
    next(err)
  }
})

// POST /api/animals
router.post('/', authorize('can_manage_animals'), async (req, res, next) => {
  try {
    const { error, value } = validateBody(animalSchema, req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    // Auto-set species_id from breed_type if not already set
    if (!value.species_id && value.breed_type_id) {
      const bt = await db('breed_types')
        .where('id', value.breed_type_id)
        .where('farm_id', req.farmId)
        .select('species_id')
        .first()
      if (bt && bt.species_id) value.species_id = bt.species_id
    }
    // Fallback: use farm's species
    if (!value.species_id) {
      const fs = await db('farm_species').where('farm_id', req.farmId).first()
      if (fs) value.species_id = fs.species_id
    }

    const now = new Date().toISOString()
    const animal = {
      id: uuidv4(),
      ...value,
      farm_id: req.user.farm_id,
      created_by: req.user.id,
      created_at: now,
      updated_at: now,
    }
    await db('animals').insert(animal)

    // Coerce booleans to 0/1 to match SQLite's stored representation
    const response = { ...animal }
    if (response.is_external !== undefined) response.is_external = response.is_external ? 1 : 0
    await logAudit({
      farmId: req.user.farm_id,
      userId: req.user.id,
      action: 'create',
      entityType: 'animal',
      entityId: animal.id,
      newValues: response,
    })
    res.status(201).json(response)
  } catch (err) {
    // Unique constraint errors are handled centrally by errorHandler
    next(err)
  }
})

// POST /api/animals/batch — create up to 500 animals in one transaction
router.post('/batch', authorize('can_manage_animals'), async (req, res, next) => {
  try {
    const { error, value } = batchSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    })
    if (error) return res.status(400).json({ error: joiMsg(error) })

    const { defaults, tags } = value

    // Phase 1: dedupe within the submitted tags array
    const unique = new Set(tags)
    if (unique.size !== tags.length) {
      const seen = new Set()
      const duplicates = tags.filter((t) => {
        if (seen.has(t)) return true
        seen.add(t)
        return false
      })
      return res.status(400).json({
        error: {
          code: 'DUPLICATE_TAGS',
          message: 'Duplicate tag numbers within batch',
          details: [...new Set(duplicates)],
        },
      })
    }

    // Phase 2: check for tags that already exist in this farm
    const existingRows = await db('animals')
      .where('farm_id', req.farmId)
      .whereIn('tag_number', tags)
      .whereNull('deleted_at')
      .pluck('tag_number')

    if (existingRows.length > 0) {
      return res.status(409).json({
        error: {
          code: 'TAGS_EXIST',
          message: 'Some tag numbers already exist in this farm',
          details: existingRows,
        },
      })
    }

    // Phase 3: resolve species_id once from breed_type_id (scoped to farm)
    let speciesId = null
    if (defaults.breed_type_id) {
      const bt = await db('breed_types')
        .where('id', defaults.breed_type_id)
        .where('farm_id', req.farmId)
        .select('species_id')
        .first()
      if (bt && bt.species_id) speciesId = bt.species_id
    }
    if (!speciesId) {
      const fs = await db('farm_species').where('farm_id', req.farmId).first()
      if (fs) speciesId = fs.species_id
    }

    // Phase 4: build rows and insert in one transaction
    const now = new Date().toISOString()
    const rows = tags.map((tag) => ({
      id: uuidv4(),
      farm_id: req.farmId,
      tag_number: tag,
      sex: defaults.sex,
      status: defaults.status,
      breed_type_id: defaults.breed_type_id || null,
      species_id: speciesId,
      life_phase_override: defaults.life_phase_override || null,
      created_by: req.user.id,
      created_at: now,
      updated_at: now,
    }))

    await db.transaction(async (trx) => {
      await trx('animals').insert(rows)
    })

    // Phase 5: audit log — best-effort, post-commit (matches existing pattern)
    for (const row of rows) {
      await logAudit({
        farmId: req.user.farm_id,
        userId: req.user.id,
        action: 'create',
        entityType: 'animal',
        entityId: row.id,
        newValues: row,
      })
    }

    res.status(201).json({ created: rows.length, animals: rows })
  } catch (err) {
    next(err)
  }
})

// POST /api/animals/batch-delete — soft-delete multiple animals, admin only
router.post('/batch-delete', requireAdmin, async (req, res, next) => {
  try {
    const { error, value } = batchDeleteSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    })
    if (error) return res.status(400).json({ error: joiMsg(error) })

    const { ids } = value

    // Verify all IDs belong to this farm and are not already deleted
    const validRows = await db('animals')
      .where('farm_id', req.farmId)
      .whereIn('id', ids)
      .whereNull('deleted_at')
      .select('id', 'tag_number')

    if (validRows.length !== ids.length) {
      return res.status(404).json({
        error: {
          code: 'ANIMALS_NOT_FOUND',
          message: 'One or more animal IDs were not found or already deleted',
        },
      })
    }

    const deletedAt = new Date().toISOString()

    // Sort by id to acquire row locks in a deterministic order —
    // prevents deadlocks under concurrent batch-deletes on MySQL.
    const orderedRows = [...validRows].sort((a, b) => a.id.localeCompare(b.id))

    await db.transaction(async (trx) => {
      for (const row of orderedRows) {
        await trx('animals')
          .where({ id: row.id })
          .where('farm_id', req.farmId)
          .update({ deleted_at: deletedAt, tag_number: deletedTag(row.tag_number) })
      }
    })

    // Audit log — best-effort, post-commit
    for (const row of orderedRows) {
      await logAudit({
        farmId: req.user.farm_id,
        userId: req.user.id,
        action: 'delete',
        entityType: 'animal',
        entityId: row.id,
        oldValues: row,
      })
    }

    res.json({ deleted: ids.length })
  } catch (err) {
    next(err)
  }
})

// PUT /api/animals/:id
router.put('/:id', authorize('can_manage_animals'), async (req, res, next) => {
  try {
    const oldAnimal = await findAnimalOrFail(req.params.id, req.farmId)

    const { error, value } = validateBody(animalUpdateSchema, req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    // Sync species_id when breed_type_id changes
    if (value.breed_type_id && value.breed_type_id !== oldAnimal.breed_type_id) {
      const bt = await db('breed_types')
        .where('id', value.breed_type_id)
        .where('farm_id', req.farmId)
        .select('species_id')
        .first()
      if (bt && bt.species_id) value.species_id = bt.species_id
    }

    const now = new Date().toISOString()
    const updates = { ...value, updated_at: now }
    if (value.status && value.status !== oldAnimal.status) {
      updates.status_changed_at = now
    }
    await db('animals').where({ id: req.params.id }).where('farm_id', req.farmId).update(updates)

    const updated = await db('animals')
      .where({ id: req.params.id })
      .where('farm_id', req.farmId)
      .first()
    await logAudit({
      farmId: req.user.farm_id,
      userId: req.user.id,
      action: 'update',
      entityType: 'animal',
      entityId: req.params.id,
      oldValues: oldAnimal,
      newValues: updated,
    })
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/animals/:id — soft delete, admin only
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const animal = await findAnimalOrFail(req.params.id, req.farmId)

    const deletedAt = new Date().toISOString()

    await db('animals')
      .where({ id: req.params.id })
      .where('farm_id', req.farmId)
      .update({ deleted_at: deletedAt, tag_number: deletedTag(animal.tag_number) })

    await logAudit({
      farmId: req.user.farm_id,
      userId: req.user.id,
      action: 'delete',
      entityType: 'animal',
      entityId: req.params.id,
      oldValues: animal,
    })

    res.json({ message: 'Animal deleted' })
  } catch (err) {
    next(err)
  }
})

module.exports = router
