const express = require('express')
const db = require('../../config/database')
const { round2, defaultRange, monthExpr, concatExpr } = require('./helpers')

const router = express.Router()

// GET /api/analytics/milk-trends
router.get('/milk-trends', async (req, res, next) => {
  try {
    const { start, end } = defaultRange(req.query.from, req.query.to)

    const rows = await db('milk_records')
      .where('milk_records.farm_id', req.farmId)
      .join('animals', 'milk_records.animal_id', 'animals.id')
      .whereNull('animals.deleted_at')
      .whereBetween('recording_date', [start, end])
      .select(db.raw(`${monthExpr('recording_date')} as month`))
      .sum('litres as total_litres')
      .count('* as record_count')
      .countDistinct('animal_id as animal_count')
      .groupByRaw(monthExpr('recording_date'))
      .orderBy('month')

    const months = rows.map((row) => ({
      month: row.month,
      total_litres: round2(Number(row.total_litres) || 0),
      record_count: Number(row.record_count),
      avg_per_cow: round2((Number(row.total_litres) || 0) / (Number(row.animal_count) || 1)),
    }))

    res.json({ months })
  } catch (err) {
    next(err)
  }
})

// GET /api/analytics/top-producers
router.get('/top-producers', async (req, res, next) => {
  try {
    const { start, end } = defaultRange(req.query.from, req.query.to)

    const rows = await db('milk_records as m')
      .where('m.farm_id', req.farmId)
      .join('animals as c', 'm.animal_id', 'c.id')
      .whereNull('c.deleted_at')
      .whereBetween('m.recording_date', [start, end])
      .select('c.id', 'c.tag_number', 'c.name')
      .sum('m.litres as total_litres')
      .countDistinct('m.recording_date as days_recorded')
      .groupBy('c.id', 'c.tag_number', 'c.name')
      .havingRaw('COUNT(DISTINCT m.recording_date) >= 3')
      .orderByRaw('(SUM(m.litres) / COUNT(DISTINCT m.recording_date)) DESC')
      .limit(10)

    const result = rows.map((r) => ({
      id: r.id,
      tag_number: r.tag_number,
      name: r.name,
      total_litres: round2(Number(r.total_litres) || 0),
      days_recorded: Number(r.days_recorded),
      avg_daily_litres:
        Number(r.days_recorded) > 0
          ? round2((Number(r.total_litres) || 0) / Number(r.days_recorded))
          : 0,
    }))

    res.json(result)
  } catch (err) {
    next(err)
  }
})

// GET /api/analytics/wasted-milk
router.get('/wasted-milk', async (req, res, next) => {
  try {
    const { start, end } = defaultRange(req.query.from, req.query.to)

    const rows = await db('milk_records')
      .where('farm_id', req.farmId)
      .whereBetween('recording_date', [start, end])
      .where('milk_discarded', true)
      .select(db.raw(`${monthExpr('recording_date')} as month`))
      .sum('litres as discarded_litres')
      .count('* as discard_count')
      .groupByRaw(monthExpr('recording_date'))
      .orderBy('month')

    const months = rows.map((r) => ({
      month: r.month,
      discarded_litres: round2(Number(r.discarded_litres) || 0),
      discard_count: Number(r.discard_count),
    }))

    const total_discarded = round2(months.reduce((sum, m) => sum + m.discarded_litres, 0))

    res.json({ months, total_discarded })
  } catch (err) {
    next(err)
  }
})

// GET /api/analytics/treatment-costs
router.get('/treatment-costs', async (req, res, next) => {
  try {
    const { start, endTs } = defaultRange(req.query.from, req.query.to)

    const rows = await db('treatments')
      .where('farm_id', req.farmId)
      .whereBetween('treatment_date', [start, endTs])
      .select(db.raw(`${monthExpr('treatment_date')} as month`))
      .sum('cost as total_cost')
      .count('* as treatment_count')
      .groupByRaw(monthExpr('treatment_date'))
      .orderBy('month')

    const months = rows.map((r) => ({
      month: r.month,
      total_cost: round2(Number(r.total_cost) || 0),
      treatment_count: Number(r.treatment_count),
    }))

    const grand_total = round2(months.reduce((sum, m) => sum + m.total_cost, 0))

    res.json({ months, grand_total })
  } catch (err) {
    next(err)
  }
})

// GET /api/analytics/litres-per-cow
router.get('/litres-per-cow', async (req, res, next) => {
  try {
    const { start, end } = defaultRange(req.query.from, req.query.to)

    // Count distinct (animal_id, recording_date) pairs as animal-days for accurate per-animal-per-day avg
    const rows = await db('milk_records')
      .where('farm_id', req.farmId)
      .whereBetween('recording_date', [start, end])
      .select(
        db.raw(`${monthExpr('recording_date')} as month`),
        db.raw('SUM(litres) as total_litres'),
        db.raw('COUNT(DISTINCT animal_id) as animal_count'),
        db.raw(
          `COUNT(DISTINCT (${concatExpr('animal_id', "'-'", 'recording_date')})) as animal_days`
        )
      )
      .groupByRaw(monthExpr('recording_date'))
      .orderBy('month')

    const months = rows.map((r) => {
      const totalLitres = Number(r.total_litres) || 0
      const animalDays = Number(r.animal_days) || 1
      return {
        month: r.month,
        avg_litres_per_cow_per_day: round2(totalLitres / animalDays),
        cow_count: Number(r.animal_count),
      }
    })

    res.json({ months })
  } catch (err) {
    next(err)
  }
})

// GET /api/analytics/bottom-producers
router.get('/bottom-producers', async (req, res, next) => {
  try {
    const { start, end } = defaultRange(req.query.from, req.query.to)

    const rows = await db('milk_records as m')
      .where('m.farm_id', req.farmId)
      .join('animals as c', 'm.animal_id', 'c.id')
      .whereNull('c.deleted_at')
      .whereBetween('m.recording_date', [start, end])
      .select('c.id', 'c.tag_number', 'c.name')
      .sum('m.litres as total_litres')
      .countDistinct('m.recording_date as days_recorded')
      .groupBy('c.id', 'c.tag_number', 'c.name')
      .havingRaw('COUNT(DISTINCT m.recording_date) >= 3')
      .orderByRaw('(SUM(m.litres) / COUNT(DISTINCT m.recording_date)) ASC')
      .limit(10)

    const result = rows.map((r) => ({
      id: r.id,
      tag_number: r.tag_number,
      name: r.name,
      total_litres: round2(Number(r.total_litres) || 0),
      days_recorded: Number(r.days_recorded),
      avg_daily_litres:
        Number(r.days_recorded) > 0
          ? round2((Number(r.total_litres) || 0) / Number(r.days_recorded))
          : 0,
    }))

    res.json(result)
  } catch (err) {
    next(err)
  }
})

module.exports = router
