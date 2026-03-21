const express = require('express')
const { randomUUID: uuidv4 } = require('crypto')
const Joi = require('joi')
const db = require('../config/database')
const authenticate = require('../middleware/auth')
const requireSuperAdmin = require('../middleware/requireSuperAdmin')
const { joiMsg, validateBody, validateQuery, toCode } = require('../helpers/constants')

const router = express.Router()
router.use(authenticate)
router.use(requireSuperAdmin)

// ── Validation ───────────────────────────────────────────────

const breedTypeSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  code: Joi.string().min(1).max(50),
  heat_cycle_days: Joi.number().integer().min(1).default(21),
  gestation_days: Joi.number().integer().min(1).default(283),
  preg_check_days: Joi.number().integer().min(1).default(35),
  voluntary_waiting_days: Joi.number().integer().min(0).default(50),
  dry_off_days: Joi.number().integer().min(0).default(60),
  calf_max_months: Joi.number().integer().min(1).default(6),
  heifer_min_months: Joi.number().integer().min(1).default(15),
  young_bull_min_months: Joi.number().integer().min(1).default(15),
  is_active: Joi.boolean().truthy(1).falsy(0).default(true),
  sort_order: Joi.number().integer().min(0).default(0),
})

const breedTypeUpdateSchema = Joi.object({
  name: Joi.string().min(1).max(100),
  heat_cycle_days: Joi.number().integer().min(1),
  gestation_days: Joi.number().integer().min(1),
  preg_check_days: Joi.number().integer().min(1),
  voluntary_waiting_days: Joi.number().integer().min(0),
  dry_off_days: Joi.number().integer().min(0),
  calf_max_months: Joi.number().integer().min(1),
  heifer_min_months: Joi.number().integer().min(1),
  young_bull_min_months: Joi.number().integer().min(1),
  is_active: Joi.boolean().truthy(1).falsy(0),
  sort_order: Joi.number().integer().min(0),
}).min(1)

const issueTypeSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  code: Joi.string().min(1).max(50),
  emoji: Joi.string().max(10).allow('', null),
  requires_teat_selection: Joi.boolean().truthy(1).falsy(0).default(false),
  is_active: Joi.boolean().truthy(1).falsy(0).default(true),
  sort_order: Joi.number().integer().min(0).default(0),
})

const issueTypeUpdateSchema = Joi.object({
  name: Joi.string().min(1).max(100),
  emoji: Joi.string().max(10).allow('', null),
  requires_teat_selection: Joi.boolean().truthy(1).falsy(0),
  is_active: Joi.boolean().truthy(1).falsy(0),
  sort_order: Joi.number().integer().min(0),
}).min(1)

const medicationSchema = Joi.object({
  name: Joi.string().max(100).required(),
  active_ingredient: Joi.string().max(100).allow('', null),
  withdrawal_milk_hours: Joi.number().integer().min(0).required(),
  withdrawal_milk_days: Joi.number().integer().min(0).default(0),
  withdrawal_meat_hours: Joi.number().integer().min(0).default(0),
  withdrawal_meat_days: Joi.number().integer().min(0).required(),
  default_dosage: Joi.alternatives().try(Joi.number().min(0), Joi.string().max(100)).allow(null),
  unit: Joi.string().max(20).allow('', null),
  notes: Joi.string().max(2000).allow('', null),
  is_active: Joi.boolean().truthy(1).falsy(0).default(true),
})

const medicationUpdateSchema = Joi.object({
  name: Joi.string().max(100),
  active_ingredient: Joi.string().max(100).allow('', null),
  withdrawal_milk_hours: Joi.number().integer().min(0),
  withdrawal_milk_days: Joi.number().integer().min(0),
  withdrawal_meat_hours: Joi.number().integer().min(0),
  withdrawal_meat_days: Joi.number().integer().min(0),
  default_dosage: Joi.alternatives().try(Joi.number().min(0), Joi.string().max(100)).allow(null),
  unit: Joi.string().max(20).allow('', null),
  notes: Joi.string().max(2000).allow('', null),
  is_active: Joi.boolean().truthy(1).falsy(0),
}).min(1)

const pushSchema = Joi.object({
  farm_ids: Joi.alternatives().try(
    Joi.string().valid('all'),
    Joi.array().items(Joi.string().uuid()).min(1)
  ).required(),
})

const listQuerySchema = Joi.object({
  all: Joi.string().valid('0', '1'),
})

// ── Helpers ──────────────────────────────────────────────────

// ── Entity config (DRY CRUD) ────────────────────────────────

const ENTITIES = {
  'breed-types': {
    table: 'default_breed_types',
    farmTable: 'breed_types',
    matchField: 'code',
    createSchema: breedTypeSchema,
    updateSchema: breedTypeUpdateSchema,
    label: 'Default breed type',
    autoCode: true,
    seedFields: (d) => ({
      code: d.code,
      name: d.name,
      heat_cycle_days: d.heat_cycle_days,
      gestation_days: d.gestation_days,
      preg_check_days: d.preg_check_days,
      voluntary_waiting_days: d.voluntary_waiting_days,
      dry_off_days: d.dry_off_days,
      calf_max_months: d.calf_max_months,
      heifer_min_months: d.heifer_min_months,
      young_bull_min_months: d.young_bull_min_months,
      sort_order: d.sort_order ?? 0,
    }),
  },
  'issue-types': {
    table: 'default_issue_types',
    farmTable: 'issue_type_definitions',
    matchField: 'code',
    createSchema: issueTypeSchema,
    updateSchema: issueTypeUpdateSchema,
    label: 'Default issue type',
    autoCode: true,
    seedFields: (d) => ({
      code: d.code,
      name: d.name,
      emoji: d.emoji,
      requires_teat_selection: d.requires_teat_selection,
      sort_order: d.sort_order ?? 0,
    }),
  },
  medications: {
    table: 'default_medications',
    farmTable: 'medications',
    matchField: 'name',
    createSchema: medicationSchema,
    updateSchema: medicationUpdateSchema,
    label: 'Default medication',
    autoCode: false,
    seedFields: (d) => ({
      name: d.name,
      active_ingredient: d.active_ingredient,
      withdrawal_milk_hours: d.withdrawal_milk_hours,
      withdrawal_milk_days: d.withdrawal_milk_days ?? 0,
      withdrawal_meat_hours: d.withdrawal_meat_hours ?? 0,
      withdrawal_meat_days: d.withdrawal_meat_days,
      default_dosage: d.default_dosage,
      unit: d.unit,
      notes: d.notes,
    }),
  },
}

// ── CRUD routes for each entity type ────────────────────────

for (const [slug, config] of Object.entries(ENTITIES)) {
  const { table, createSchema: cSchema, updateSchema: uSchema, label, autoCode } = config

  // GET /api/global-defaults/:type — list
  router.get(`/${slug}`, async (req, res, next) => {
    try {
      const { error: qError, value: q } = validateQuery(listQuerySchema, req.query)
      if (qError) return res.status(400).json({ error: joiMsg(qError) })

      const orderCol = slug === 'medications' ? 'name' : 'sort_order'
      const query = db(table)
        .where(q.all === '1' ? {} : { is_active: true })
        .orderBy(orderCol)

      res.json(await query)
    } catch (err) {
      next(err)
    }
  })

  // POST /api/global-defaults/:type — create
  router.post(`/${slug}`, async (req, res, next) => {
    try {
      const { error, value } = validateBody(cSchema, req.body)
      if (error) return res.status(400).json({ error: joiMsg(error) })

      if (autoCode && !value.code) {
        value.code = toCode(value.name)
        if (!value.code) return res.status(400).json({ error: 'Name must contain at least one letter or number' })
      }

      // Check uniqueness
      const matchField = autoCode ? 'code' : 'name'
      const matchValue = autoCode ? value.code : value.name
      const existing = await db(table).where(matchField, matchValue).first()
      if (existing) return res.status(409).json({ error: `${label} with this ${matchField} already exists` })

      const id = uuidv4()
      const now = new Date().toISOString()
      const record = { id, ...value, created_at: now, updated_at: now }
      await db(table).insert(record)

      res.status(201).json(record)
    } catch (err) {
      next(err)
    }
  })

  // PATCH /api/global-defaults/:type/:id — update
  router.patch(`/${slug}/:id`, async (req, res, next) => {
    try {
      const existing = await db(table).where('id', req.params.id).first()
      if (!existing) return res.status(404).json({ error: `${label} not found` })

      const { error, value } = validateBody(uSchema, req.body)
      if (error) return res.status(400).json({ error: joiMsg(error) })

      // Check name uniqueness if changing
      if (value.name && value.name !== existing.name) {
        const dup = await db(table).where('name', value.name).whereNot('id', existing.id).first()
        if (dup) return res.status(409).json({ error: `${label} with this name already exists` })
      }

      await db(table).where('id', existing.id).update({ ...value, updated_at: new Date().toISOString() })
      const updated = await db(table).where('id', existing.id).first()
      res.json(updated)
    } catch (err) {
      next(err)
    }
  })

  // DELETE /api/global-defaults/:type/:id — soft deactivate (default) or hard delete (?hard=1)
  router.delete(`/${slug}/:id`, async (req, res, next) => {
    try {
      const existing = await db(table).where('id', req.params.id).first()
      if (!existing) return res.status(404).json({ error: `${label} not found` })

      if (req.query.hard === '1') {
        await db(table).where('id', existing.id).del()
        return res.json({ deleted: true })
      }

      await db(table).where('id', existing.id).update({ is_active: false, updated_at: new Date().toISOString() })
      const updated = await db(table).where('id', existing.id).first()
      res.json(updated)
    } catch (err) {
      next(err)
    }
  })

  // POST /api/global-defaults/:type/push — push to farms
  // For breed-types: filters defaults by species and only pushes to matching farms.
  router.post(`/${slug}/push`, async (req, res, next) => {
    try {
      const { error, value } = validateBody(pushSchema, req.body)
      if (error) return res.status(400).json({ error: joiMsg(error) })

      const { farmTable, matchField, seedFields } = config

      // Get active defaults
      const defaults = await db(table).where('is_active', true)
      if (defaults.length === 0) return res.json({ pushed: 0, skipped: 0, farms_affected: 0 })

      // Get target farms
      let farmQuery = db('farms').where('is_active', true)
      if (value.farm_ids !== 'all') {
        farmQuery = farmQuery.whereIn('id', value.farm_ids)
      }
      const farms = await farmQuery.select('id')

      // For breed-types, build farm→species map to only push matching breeds
      let farmSpeciesMap = null
      if (slug === 'breed-types') {
        const fsRows = await db('farm_species')
          .whereIn('farm_id', farms.map((f) => f.id))
          .select('farm_id', 'species_id')
        farmSpeciesMap = {}
        for (const row of fsRows) farmSpeciesMap[row.farm_id] = row.species_id
      }

      let pushed = 0
      let skipped = 0
      const farmsAffected = new Set()
      const now = new Date().toISOString()

      // Bulk-fetch existing items for all target farms
      const farmIds = farms.map((f) => f.id)
      const allExisting = await db(farmTable).whereIn('farm_id', farmIds).select('farm_id', matchField)
      const existingByFarm = {}
      for (const row of allExisting) {
        ;(existingByFarm[row.farm_id] ||= new Set()).add(row[matchField])
      }

      for (const farm of farms) {
        const existingSet = existingByFarm[farm.id] || new Set()
        const farmSpeciesId = farmSpeciesMap ? farmSpeciesMap[farm.id] : null

        const toInsert = []
        for (const d of defaults) {
          // Species filter: skip breed defaults that don't match the farm's species
          if (farmSpeciesMap && d.species_id && farmSpeciesId && d.species_id !== farmSpeciesId) {
            skipped++
            continue
          }
          if (existingSet.has(d[matchField])) {
            skipped++
            continue
          }
          const seedData = seedFields(d)
          if (slug === 'breed-types' && d.species_id) seedData.species_id = d.species_id
          toInsert.push({
            id: uuidv4(),
            farm_id: farm.id,
            ...seedData,
            is_active: true,
            created_at: now,
            updated_at: now,
          })
        }

        if (toInsert.length > 0) {
          await db.transaction(async (trx) => {
            await trx(farmTable).insert(toInsert)
          })
          pushed += toInsert.length
          farmsAffected.add(farm.id)
        }
      }

      res.json({ pushed, skipped, farms_affected: farmsAffected.size })
    } catch (err) {
      next(err)
    }
  })
}

module.exports = router
