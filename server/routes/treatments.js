const express = require('express')
const { randomUUID: uuidv4 } = require('crypto')
const Joi = require('joi')
const db = require('../config/database')
const authenticate = require('../middleware/auth')
const tenantScope = require('../middleware/tenantScope')
const authorize = require('../middleware/authorize')
const { requireAdmin } = authorize
const { calcWithdrawalDates } = require('../services/withdrawalService')
const { computeLifePhase, NON_MILKING_PHASES } = require('../helpers/lifePhase')
const { joiMsg, MAX_PAGE_SIZE, validateBody, validateQuery } = require('../helpers/constants')
const { logAudit } = require('../services/auditService')

const INACTIVE_STATUSES = new Set(['sold', 'dead'])

const router = express.Router()
router.use(authenticate)
router.use(tenantScope)

const schema = Joi.object({
  cow_id: Joi.string().uuid().required(),
  health_issue_id: Joi.string().uuid().allow(null),
  medications: Joi.array()
    .items(
      Joi.object({
        medication_id: Joi.string().uuid().required(),
        dosage: Joi.string().max(50).allow('', null),
      }),
    )
    .min(1)
    .required(),
  cost: Joi.number().precision(2).min(0).allow(null),
  treatment_date: Joi.string().isoDate().required(),
  is_vet_visit: Joi.boolean(),
  vet_name: Joi.string().max(100).allow('', null),
  notes: Joi.string().max(2000).allow('', null),
})

// Base query with all standard joins — used by every GET endpoint
function treatmentQuery(farmId) {
  return db('treatments as t')
    .where('t.farm_id', farmId)
    .join('medications as m', 't.medication_id', 'm.id')
    .join('cows as c', 't.cow_id', 'c.id')
    .join('users as u', 't.administered_by', 'u.id')
    .whereNull('c.deleted_at')
    .select(
      't.*',
      'm.name as medication_name',
      'm.withdrawal_milk_hours',
      'm.withdrawal_milk_days',
      'm.withdrawal_meat_hours',
      'm.withdrawal_meat_days',
      'c.tag_number',
      'c.name as cow_name',
      'c.sex',
      'u.full_name as administered_by_name',
    )
}

// Attach a `medications[]` array to each treatment row.
// Also replaces `medication_name` with the comma-joined list when multiple meds exist.
async function enrichWithMedications(rows, farmId) {
  if (!rows.length) return rows

  const ids = rows.map((r) => r.id)
  const query = db('treatment_medications as tm')
    .join('medications as m', 'tm.medication_id', 'm.id')
    .whereIn('tm.treatment_id', ids)
    .select('tm.treatment_id', 'tm.medication_id', 'm.name as medication_name', 'tm.dosage')
  if (farmId) {
    query.join('treatments as t', 'tm.treatment_id', 't.id').where('t.farm_id', farmId)
  }
  const medRows = await query

  const byTreatment = {}
  for (const row of medRows) {
    ;(byTreatment[row.treatment_id] ??= []).push({
      medication_id: row.medication_id,
      medication_name: row.medication_name,
      dosage: row.dosage,
    })
  }

  return rows.map((row) => {
    const meds = byTreatment[row.id] ?? []
    return {
      ...row,
      medications: meds,
      medication_name: meds.length ? meds.map((m) => m.medication_name).join(', ') : row.medication_name,
    }
  })
}

const VALID_SORT_COLS = ['treatment_date', 'cost', 'tag_number', 'cow_name']

const treatmentQuerySchema = Joi.object({
  cow_id: Joi.string().uuid(),
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(MAX_PAGE_SIZE),
  sort: Joi.string().valid(...VALID_SORT_COLS),
  order: Joi.string().valid('asc', 'desc'),
})

// GET /api/treatments — list, optionally filtered by cow
// Without page/limit: returns plain array (backward compatible)
// With page/limit: returns { data: [...], total: N }
router.get('/', async (req, res, next) => {
  try {
    const { error: qError, value: q } = validateQuery(treatmentQuerySchema, req.query)
    if (qError) return res.status(400).json({ error: joiMsg(qError) })

    const sortCol = q.sort || 'treatment_date'
    const sortDir = q.order || 'desc'
    // Map user-facing sort columns to their qualified names
    const colMap = {
      treatment_date: 't.treatment_date',
      cost: 't.cost',
      tag_number: 'c.tag_number',
      cow_name: 'c.name',
    }
    const orderCol = colMap[sortCol] || 't.treatment_date'

    const usePagination = q.page !== undefined && q.limit !== undefined

    if (usePagination) {
      const page = q.page
      const limit = q.limit
      const offset = (page - 1) * limit

      const countQuery = db('treatments as t')
        .where('t.farm_id', req.farmId)
        .join('cows as c', 't.cow_id', 'c.id')
        .whereNull('c.deleted_at')
      if (q.cow_id) countQuery.where('t.cow_id', q.cow_id)

      const dataQuery = treatmentQuery(req.farmId).orderBy(orderCol, sortDir).limit(limit).offset(offset)
      if (q.cow_id) dataQuery.where('t.cow_id', q.cow_id)

      const [[{ total }], rawRows] = await Promise.all([
        countQuery.count('t.id as total'),
        dataQuery,
      ])
      const rows = await enrichWithMedications(rawRows, req.farmId)
      return res.json({ data: rows, total: Number(total) })
    }

    const query = treatmentQuery(req.farmId).orderBy(orderCol, sortDir)
    if (q.cow_id) query.where('t.cow_id', q.cow_id)
    res.json(await enrichWithMedications(await query, req.farmId))
  } catch (err) {
    next(err)
  }
})

// GET /api/treatments/withdrawal — cows on active milk or meat withdrawal
router.get('/withdrawal', async (req, res, next) => {
  try {
    const now = new Date().toISOString()

    // Fetch all treatments with active milk or meat withdrawal
    // Inline join breed_types for life phase computation (not in treatmentQuery to keep it lean)
    const rows = await treatmentQuery(req.farmId)
      .leftJoin('breed_types as bt', 'c.breed_type_id', 'bt.id')
      .select('c.status', 'c.dob', 'c.life_phase_override', 'bt.calf_max_months', 'bt.heifer_min_months', 'bt.young_bull_min_months')
      .where(function () {
        this.where('t.withdrawal_end_milk', '>', now)
          .orWhere('t.withdrawal_end_meat', '>', now)
      })

    // Exclude sold/dead cows and null out milk withdrawal for non-milking life phases
    const filtered = []
    for (const row of rows) {
      if (INACTIVE_STATUSES.has(row.status)) continue
      const lifePhase = computeLifePhase(row, row)
      row.life_phase = lifePhase
      if (NON_MILKING_PHASES.has(lifePhase)) {
        row.withdrawal_end_milk = null
      }
      // After nulling milk, check if this row still has any active withdrawal
      if ((row.withdrawal_end_milk && row.withdrawal_end_milk > now) ||
          (row.withdrawal_end_meat && row.withdrawal_end_meat > now)) {
        filtered.push(row)
      }
    }

    // Aggregate per cow: keep the worst (latest) milk and meat end dates
    const byCow = {}
    for (const row of filtered) {
      const existing = byCow[row.cow_id]
      if (!existing) {
        byCow[row.cow_id] = { ...row }
        continue
      }
      // Keep the latest milk withdrawal end
      if (row.withdrawal_end_milk && (!existing.withdrawal_end_milk || row.withdrawal_end_milk > existing.withdrawal_end_milk)) {
        existing.withdrawal_end_milk = row.withdrawal_end_milk
        existing.medication_name = row.medication_name
        existing.treatment_date = row.treatment_date
      }
      // Keep the latest meat withdrawal end
      if (row.withdrawal_end_meat && (!existing.withdrawal_end_meat || row.withdrawal_end_meat > existing.withdrawal_end_meat)) {
        existing.withdrawal_end_meat = row.withdrawal_end_meat
      }
    }

    const result = Object.values(byCow)
    result.sort((a, b) => {
      const aEnd = String(a.withdrawal_end_milk || a.withdrawal_end_meat || '')
      const bEnd = String(b.withdrawal_end_milk || b.withdrawal_end_meat || '')
      return aEnd.localeCompare(bEnd)
    })

    res.json(result)
  } catch (err) {
    next(err)
  }
})

// GET /api/treatments/:id
router.get('/:id', async (req, res, next) => {
  try {
    const row = await treatmentQuery(req.farmId).where('t.id', req.params.id).first()
    if (!row) return res.status(404).json({ error: 'Treatment not found' })
    const [enriched] = await enrichWithMedications([row], req.farmId)
    res.json(enriched)
  } catch (err) {
    next(err)
  }
})

// POST /api/treatments
router.post('/', authorize('can_log_treatments'), async (req, res, next) => {
  try {
    const { error, value } = validateBody(schema, req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    const cow = await db('cows').where({ id: value.cow_id }).where('farm_id', req.farmId).whereNull('deleted_at').first()
    if (!cow) return res.status(404).json({ error: 'Cow not found' })

    const isMale = cow.sex === 'male'
    // Fetch breed type for life phase computation
    const breedType = cow.breed_type_id
      ? await db('breed_types').where('id', cow.breed_type_id).where('farm_id', req.farmId).first()
      : null
    const lifePhase = computeLifePhase(cow, breedType)
    const skipMilkWithdrawal = isMale || NON_MILKING_PHASES.has(lifePhase)

    // Batch-fetch all medications in a single query and build a lookup map
    const medIds = value.medications.map((item) => item.medication_id)
    const medRows = await db('medications').where('farm_id', req.farmId).whereIn('id', medIds).where('is_active', true)
    const medMap = new Map(medRows.map((m) => [m.id, m]))

    // Validate all IDs exist before inserting anything
    for (const item of value.medications) {
      if (!medMap.has(item.medication_id)) {
        return res.status(404).json({ error: `Medication not found or inactive: ${item.medication_id}` })
      }
    }

    // Compute max withdrawal dates across all medications
    let maxMilk = null
    let maxMeat = null
    const medRecords = []

    for (const item of value.medications) {
      const med = medMap.get(item.medication_id)

      const { withdrawalEndMilk, withdrawalEndMeat } = calcWithdrawalDates(
        value.treatment_date,
        med.withdrawal_milk_hours,
        med.withdrawal_milk_days,
        med.withdrawal_meat_hours,
        med.withdrawal_meat_days,
      )
      if (!skipMilkWithdrawal && withdrawalEndMilk && (!maxMilk || withdrawalEndMilk > maxMilk)) maxMilk = withdrawalEndMilk
      if (withdrawalEndMeat && (!maxMeat || withdrawalEndMeat > maxMeat)) maxMeat = withdrawalEndMeat

      medRecords.push({ med, dosage: item.dosage || null })
    }

    const id = uuidv4()
    const now = new Date().toISOString()
    const primary = medRecords[0]

    // Wrap both inserts in a transaction so we never get a treatment without its medications
    await db.transaction(async (trx) => {
      await trx('treatments').insert({
        id,
        farm_id: req.user.farm_id,
        cow_id: value.cow_id,
        health_issue_id: value.health_issue_id ?? null,
        // Keep medication_id pointing to the first medication — required by treatmentQuery JOIN
        medication_id: primary.med.id,
        administered_by: req.user.id,
        dosage: primary.dosage,
        cost: value.cost ?? null,
        treatment_date: value.treatment_date,
        withdrawal_end_milk: maxMilk?.toISOString() ?? null,
        withdrawal_end_meat: maxMeat?.toISOString() ?? null,
        is_vet_visit: value.is_vet_visit ?? false,
        vet_name: value.vet_name || null,
        notes: value.notes || null,
        created_at: now,
        updated_at: now,
      })

      for (const { med, dosage } of medRecords) {
        await trx('treatment_medications').insert({
          id: uuidv4(),
          treatment_id: id,
          medication_id: med.id,
          dosage,
        })
      }
    })

    const created = await treatmentQuery(req.farmId).where('t.id', id).first()
    const [enriched] = await enrichWithMedications([created], req.farmId)
    await logAudit({ farmId: req.user.farm_id, userId: req.user.id, action: 'create', entityType: 'treatment', entityId: id, newValues: created })
    res.status(201).json(enriched)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/treatments/:id — admin only
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {

    const existing = await db('treatments').where({ id: req.params.id }).where('farm_id', req.farmId).first()
    if (!existing) return res.status(404).json({ error: 'Treatment not found' })

    // treatment_medications rows are removed by ON DELETE CASCADE
    await db('treatments').where({ id: req.params.id }).where('farm_id', req.farmId).delete()
    await logAudit({ farmId: req.user.farm_id, userId: req.user.id, action: 'delete', entityType: 'treatment', entityId: req.params.id, oldValues: existing })
    res.json({ message: 'Treatment deleted' })
  } catch (err) {
    next(err)
  }
})

module.exports = router
