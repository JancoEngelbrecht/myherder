const express = require('express');
const db = require('../../config/database');
const { round2, localDate } = require('./helpers');

const router = express.Router();

// GET /api/analytics/daily-kpis
router.get('/daily-kpis', async (req, res, next) => {
  try {
    const today = localDate(new Date());
    const sevenAgo = new Date();
    sevenAgo.setDate(sevenAgo.getDate() - 7);
    const sevenAgoStr = localDate(sevenAgo);

    const farmId = req.farmId;
    const [milkToday, milk7d, cowsToday, expected, healthOpen, breedingDue] = await Promise.all([
      db('milk_records').where('farm_id', farmId).where('recording_date', today).sum('litres as total').first(),
      db('milk_records').where('farm_id', farmId).where('recording_date', '>=', sevenAgoStr).where('recording_date', '<', today).sum('litres as total').first(),
      db('milk_records').where('farm_id', farmId).where('recording_date', today).countDistinct('cow_id as count').first(),
      db('cows').where('farm_id', farmId).whereNull('deleted_at').where('sex', 'female').whereIn('status', ['active', 'pregnant']).count('* as count').first(),
      db('health_issues').where('farm_id', farmId).whereIn('status', ['open', 'treating']).count('* as count').first(),
      db('breeding_events').where('farm_id', farmId).whereNull('dismissed_at').where(function () {
        this.where('expected_next_heat', '<=', today)
          .orWhere('expected_preg_check', '<=', today)
          .orWhere('expected_calving', '<=', today)
          .orWhere('expected_dry_off', '<=', today);
      }).count('* as count').first(),
    ]);

    const litres_today = round2(Number(milkToday?.total) || 0);
    const litres_7day_avg = round2((Number(milk7d?.total) || 0) / 7);
    const cows_milked_today = Number(cowsToday?.count) || 0;
    const cows_expected = Number(expected?.count) || 0;
    const active_health_issues = Number(healthOpen?.count) || 0;
    const breeding_actions_due = Number(breedingDue?.count) || 0;

    res.json({
      litres_today,
      litres_7day_avg,
      cows_milked_today,
      cows_expected,
      active_health_issues,
      breeding_actions_due,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/herd-summary
router.get('/herd-summary', async (req, res, next) => {
  try {
    const farmId = req.farmId;
    // Run aggregation and status breakdown in parallel
    const [[summary], statusRows] = await Promise.all([
      db('cows')
        .where('farm_id', farmId)
        .whereNull('deleted_at')
        .select(
          db.raw('COUNT(*) as total'),
          db.raw("SUM(CASE WHEN sex = 'male' THEN 1 ELSE 0 END) as males"),
          db.raw("SUM(CASE WHEN sex = 'female' THEN 1 ELSE 0 END) as females"),
          db.raw("SUM(CASE WHEN sex = 'female' AND status = 'dry' THEN 1 ELSE 0 END) as dry_count"),
          db.raw("SUM(CASE WHEN sex = 'female' AND status IN ('active','pregnant','sick') THEN 1 ELSE 0 END) as milking_count"),
          db.raw("SUM(CASE WHEN life_phase_override = 'heifer' THEN 1 ELSE 0 END) as heifer_count"),
        ),
      db('cows')
        .where('farm_id', farmId)
        .whereNull('deleted_at')
        .select('status')
        .count('* as count')
        .groupBy('status'),
    ]);

    const total = Number(summary.total) || 0;
    const males = Number(summary.males) || 0;
    const females = Number(summary.females) || 0;
    const dry_count = Number(summary.dry_count) || 0;
    const milking_count = Number(summary.milking_count) || 0;
    const heifer_count = Number(summary.heifer_count) || 0;

    const by_status = statusRows.map(r => ({ status: r.status, count: Number(r.count) }));

    const replacement_rate = milking_count > 0 ? round2((heifer_count / milking_count) * 100) : 0;

    res.json({ total, by_status, milking_count, dry_count, heifer_count, males, females, replacement_rate });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
