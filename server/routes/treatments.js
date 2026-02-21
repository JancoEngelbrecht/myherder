const express = require('express')
const { randomUUID: uuidv4 } = require('crypto')
const Joi = require('joi')
const db = require('../config/database')
const authenticate = require('../middleware/auth')
const { calcWithdrawalDates } = require('../services/withdrawalService')

const router = express.Router()
router.use(authenticate)

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
function treatmentQuery() {
  return db('treatments as t')
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
      'u.full_name as administered_by_name',
    )
}

// Attach a `medications[]` array to each treatment row.
// Also replaces `medication_name` with the comma-joined list when multiple meds exist.
async function enrichWithMedications(rows) {
  if (!rows.length) return rows

  const ids = rows.map((r) => r.id)
  const medRows = await db('treatment_medications as tm')
    .join('medications as m', 'tm.medication_id', 'm.id')
    .whereIn('tm.treatment_id', ids)
    .select('tm.treatment_id', 'tm.medication_id', 'm.name as medication_name', 'tm.dosage')

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

// GET /api/treatments — list, optionally filtered by cow
router.get('/', async (req, res, next) => {
  try {
    const query = treatmentQuery().orderBy('t.treatment_date', 'desc')
    if (req.query.cow_id) query.where('t.cow_id', req.query.cow_id)
    res.json(await enrichWithMedications(await query))
  } catch (err) {
    next(err)
  }
})

// GET /api/treatments/withdrawal — one row per cow, latest milk withdrawal end date
router.get('/withdrawal', async (req, res, next) => {
  try {
    const now = new Date().toISOString()
    const rows = await treatmentQuery()
      .where('c.sex', 'female')
      .where('t.withdrawal_end_milk', '>', now)
      .orderBy('t.withdrawal_end_milk', 'asc')

    // Keep the treatment with the latest (worst) milk withdrawal end per cow
    const byCow = {}
    for (const row of rows) {
      if (!byCow[row.cow_id] || row.withdrawal_end_milk > byCow[row.cow_id].withdrawal_end_milk) {
        byCow[row.cow_id] = row
      }
    }
    res.json(await enrichWithMedications(Object.values(byCow)))
  } catch (err) {
    next(err)
  }
})

// GET /api/treatments/:id
router.get('/:id', async (req, res, next) => {
  try {
    const row = await treatmentQuery().where('t.id', req.params.id).first()
    if (!row) return res.status(404).json({ error: 'Treatment not found' })
    const [enriched] = await enrichWithMedications([row])
    res.json(enriched)
  } catch (err) {
    next(err)
  }
})

// POST /api/treatments
router.post('/', async (req, res, next) => {
  try {
    const { error, value } = schema.validate(req.body)
    if (error) return res.status(400).json({ error: error.details[0].message })

    const cow = await db('cows').where({ id: value.cow_id }).whereNull('deleted_at').first()
    if (!cow) return res.status(404).json({ error: 'Cow not found' })

    const isMale = cow.sex === 'male'

    // Validate all medications and compute max withdrawal dates across all of them
    let maxMilk = null
    let maxMeat = null
    const medRecords = []

    for (const item of value.medications) {
      const med = await db('medications').where({ id: item.medication_id, is_active: true }).first()
      if (!med) return res.status(404).json({ error: `Medication not found or inactive: ${item.medication_id}` })

      const { withdrawalEndMilk, withdrawalEndMeat } = calcWithdrawalDates(
        value.treatment_date,
        med.withdrawal_milk_hours,
        med.withdrawal_milk_days,
        med.withdrawal_meat_hours,
        med.withdrawal_meat_days,
      )
      if (!isMale && withdrawalEndMilk && (!maxMilk || withdrawalEndMilk > maxMilk)) maxMilk = withdrawalEndMilk
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

    const created = await treatmentQuery().where('t.id', id).first()
    const [enriched] = await enrichWithMedications([created])
    res.status(201).json(enriched)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/treatments/:id — admin only
router.delete('/:id', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })

    const existing = await db('treatments').where({ id: req.params.id }).first()
    if (!existing) return res.status(404).json({ error: 'Treatment not found' })

    // treatment_medications rows are removed by ON DELETE CASCADE
    await db('treatments').where({ id: req.params.id }).delete()
    res.json({ message: 'Treatment deleted' })
  } catch (err) {
    next(err)
  }
})

module.exports = router
