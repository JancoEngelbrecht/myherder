const express = require('express');
const db = require('../../config/database');
const { round2, defaultRange, monthExpr } = require('./helpers');

const router = express.Router();

// GET /api/analytics/milk-trends
router.get('/milk-trends', async (req, res, next) => {
  try {
    const { start, end } = defaultRange(req.query.from, req.query.to);

    const rows = await db('milk_records')
      .join('cows', 'milk_records.cow_id', 'cows.id')
      .whereNull('cows.deleted_at')
      .whereBetween('recording_date', [start, end])
      .select(db.raw(`${monthExpr('recording_date')} as month`))
      .sum('litres as total_litres')
      .count('* as record_count')
      .countDistinct('cow_id as cow_count')
      .groupByRaw(monthExpr('recording_date'))
      .orderBy('month');

    const months = rows.map(row => ({
      month: row.month,
      total_litres: round2(Number(row.total_litres) || 0),
      record_count: Number(row.record_count),
      avg_per_cow: round2((Number(row.total_litres) || 0) / (Number(row.cow_count) || 1)),
    }));

    res.json({ months });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/top-producers
router.get('/top-producers', async (req, res, next) => {
  try {
    const { start, end } = defaultRange(req.query.from, req.query.to);

    const rows = await db('milk_records as m')
      .join('cows as c', 'm.cow_id', 'c.id')
      .whereNull('c.deleted_at')
      .whereBetween('m.recording_date', [start, end])
      .select(
        'c.id',
        'c.tag_number',
        'c.name'
      )
      .sum('m.litres as total_litres')
      .countDistinct('m.recording_date as days_recorded')
      .groupBy('c.id', 'c.tag_number', 'c.name')
      .orderBy('total_litres', 'desc')
      .limit(10);

    const result = rows.map(r => ({
      id: r.id,
      tag_number: r.tag_number,
      name: r.name,
      total_litres: round2(Number(r.total_litres) || 0),
      days_recorded: Number(r.days_recorded),
      avg_daily_litres: Number(r.days_recorded) > 0
        ? round2((Number(r.total_litres) || 0) / Number(r.days_recorded))
        : 0,
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/wasted-milk
router.get('/wasted-milk', async (req, res, next) => {
  try {
    const { start, end } = defaultRange(req.query.from, req.query.to);

    const rows = await db('milk_records')
      .whereBetween('recording_date', [start, end])
      .where('milk_discarded', true)
      .select(db.raw(`${monthExpr('recording_date')} as month`))
      .sum('litres as discarded_litres')
      .count('* as discard_count')
      .groupByRaw(monthExpr('recording_date'))
      .orderBy('month');

    const months = rows.map(r => ({
      month: r.month,
      discarded_litres: round2(Number(r.discarded_litres) || 0),
      discard_count: Number(r.discard_count),
    }));

    const total_discarded = round2(months.reduce((sum, m) => sum + m.discarded_litres, 0));

    res.json({ months, total_discarded });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/treatment-costs
router.get('/treatment-costs', async (req, res, next) => {
  try {
    const { start, endTs } = defaultRange(req.query.from, req.query.to);

    const rows = await db('treatments')
      .whereBetween('treatment_date', [start, endTs])
      .select(db.raw(`${monthExpr('treatment_date')} as month`))
      .sum('cost as total_cost')
      .count('* as treatment_count')
      .groupByRaw(monthExpr('treatment_date'))
      .orderBy('month');

    const months = rows.map(r => ({
      month: r.month,
      total_cost: round2(Number(r.total_cost) || 0),
      treatment_count: Number(r.treatment_count),
    }));

    const grand_total = round2(months.reduce((sum, m) => sum + m.total_cost, 0));

    res.json({ months, grand_total });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/litres-per-cow
router.get('/litres-per-cow', async (req, res, next) => {
  try {
    const { start, end } = defaultRange(req.query.from, req.query.to);

    const rows = await db('milk_records')
      .whereBetween('recording_date', [start, end])
      .select(db.raw(`${monthExpr('recording_date')} as month`))
      .sum('litres as total_litres')
      .countDistinct('cow_id as cow_count')
      .countDistinct('recording_date as day_count')
      .groupByRaw(monthExpr('recording_date'))
      .orderBy('month');

    const months = rows.map(r => {
      const totalLitres = Number(r.total_litres) || 0;
      const cowCount = Number(r.cow_count) || 1;
      const dayCount = Number(r.day_count) || 1;
      return {
        month: r.month,
        avg_litres_per_cow_per_day: round2(totalLitres / cowCount / dayCount),
        cow_count: Number(r.cow_count),
      };
    });

    res.json({ months });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/bottom-producers
router.get('/bottom-producers', async (req, res, next) => {
  try {
    const { start, end } = defaultRange(req.query.from, req.query.to);

    const rows = await db('milk_records as m')
      .join('cows as c', 'm.cow_id', 'c.id')
      .whereNull('c.deleted_at')
      .whereBetween('m.recording_date', [start, end])
      .select('c.id', 'c.tag_number', 'c.name')
      .sum('m.litres as total_litres')
      .countDistinct('m.recording_date as days_recorded')
      .groupBy('c.id', 'c.tag_number', 'c.name')
      .orderBy('total_litres', 'asc')
      .limit(10);

    const result = rows.map(r => ({
      id: r.id,
      tag_number: r.tag_number,
      name: r.name,
      total_litres: round2(Number(r.total_litres) || 0),
      days_recorded: Number(r.days_recorded),
      avg_daily_litres: Number(r.days_recorded) > 0
        ? round2((Number(r.total_litres) || 0) / Number(r.days_recorded))
        : 0,
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
