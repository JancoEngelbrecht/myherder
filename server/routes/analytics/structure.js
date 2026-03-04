const express = require('express');
const db = require('../../config/database');
const { round2, localDate, defaultRange, monthExpr } = require('./helpers');

const router = express.Router();

// GET /api/analytics/age-distribution
router.get('/age-distribution', async (req, res, next) => {
  try {
    // SQL-computed age brackets using julianday for accurate year calculation
    const BRACKET_SQL = `CASE
      WHEN dob IS NULL THEN 'Unknown'
      WHEN (julianday('now') - julianday(dob)) / 365.25 < 1 THEN '0-1yr'
      WHEN (julianday('now') - julianday(dob)) / 365.25 < 2 THEN '1-2yr'
      WHEN (julianday('now') - julianday(dob)) / 365.25 < 5 THEN '2-5yr'
      WHEN (julianday('now') - julianday(dob)) / 365.25 < 8 THEN '5-8yr'
      ELSE '8+yr'
    END`;

    const rows = await db('cows')
      .whereNull('deleted_at')
      .select(
        db.raw(`${BRACKET_SQL} as bracket`),
        db.raw('COUNT(*) as count'),
        db.raw("SUM(CASE WHEN sex = 'male' THEN 1 ELSE 0 END) as males"),
        db.raw("SUM(CASE WHEN sex = 'female' THEN 1 ELSE 0 END) as females"),
      )
      .groupByRaw(BRACKET_SQL);

    // Merge SQL results into ordered bracket list (ensures all brackets present)
    const ORDER = ['0-1yr', '1-2yr', '2-5yr', '5-8yr', '8+yr', 'Unknown'];
    const rowMap = {};
    for (const r of rows) rowMap[r.bracket] = r;

    let totalMales = 0;
    let totalFemales = 0;
    const brackets = ORDER.map(label => {
      const r = rowMap[label];
      const m = Number(r?.males) || 0;
      const f = Number(r?.females) || 0;
      totalMales += m;
      totalFemales += f;
      return { label, count: Number(r?.count) || 0, males: m, females: f };
    });

    const total = brackets.reduce((sum, b) => sum + b.count, 0);

    res.json({ brackets, total, males: totalMales, females: totalFemales });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/breed-composition
router.get('/breed-composition', async (req, res, next) => {
  try {
    const rows = await db('cows')
      .whereNull('cows.deleted_at')
      .leftJoin('breed_types', 'cows.breed_type_id', 'breed_types.id')
      .select(
        db.raw("COALESCE(breed_types.name, 'Unassigned') as name"),
        'breed_types.code as code'
      )
      .count('cows.id as count')
      .groupBy('cows.breed_type_id')
      .orderBy('count', 'desc');

    const breeds = rows.map(r => ({
      name: r.name,
      code: r.code || null,
      count: Number(r.count),
    }));

    const total = breeds.reduce((sum, b) => sum + b.count, 0);

    res.json({ breeds, total });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/mortality-rate
router.get('/mortality-rate', async (req, res, next) => {
  try {
    const { start, endTs } = defaultRange(req.query.from, req.query.to);

    const [{ herd_size }] = await db('cows')
      .whereNull('deleted_at')
      .count('id as herd_size');

    const herdSize = Number(herd_size) || 0;

    const rows = await db('cows')
      .whereNull('deleted_at')
      .whereIn('status', ['sold', 'dead'])
      .whereBetween('updated_at', [start, endTs])
      .select(
        db.raw(`${monthExpr('updated_at')} as month`),
        db.raw("SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END) as sold"),
        db.raw("SUM(CASE WHEN status = 'dead' THEN 1 ELSE 0 END) as dead"),
      )
      .groupByRaw(monthExpr('updated_at'))
      .orderBy('month');

    const months = rows.map(row => ({
      month: row.month,
      sold: Number(row.sold) || 0,
      dead: Number(row.dead) || 0,
      rate_pct: herdSize > 0
        ? round2(((Number(row.sold) + Number(row.dead)) / herdSize) * 100)
        : 0,
    }));

    const total_lost = months.reduce((sum, m) => sum + m.sold + m.dead, 0);
    const avg_rate_pct = months.length > 0
      ? round2(months.reduce((sum, m) => sum + m.rate_pct, 0) / months.length)
      : 0;

    res.json({ months, total_lost, avg_rate_pct });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/herd-turnover
router.get('/herd-turnover', async (req, res, next) => {
  try {
    const { start, end } = defaultRange(req.query.from, req.query.to);

    // Additions: cows created within date range (non-deleted)
    const addedRows = await db('cows')
      .whereNull('deleted_at')
      .whereBetween('created_at', [start, end + 'T23:59:59'])
      .select(db.raw(`${monthExpr('created_at')} as month`))
      .count('id as additions')
      .groupByRaw(`${monthExpr('created_at')}`);

    // Removals: cows set to sold/dead within date range
    const removedRows = await db('cows')
      .whereIn('status', ['sold', 'dead'])
      .whereBetween('updated_at', [start, end + 'T23:59:59'])
      .select(db.raw(`${monthExpr('updated_at')} as month`))
      .count('id as removals')
      .groupByRaw(`${monthExpr('updated_at')}`);

    // Merge into single month map
    const monthMap = {};
    for (const row of addedRows) {
      if (!monthMap[row.month]) monthMap[row.month] = { additions: 0, removals: 0 };
      monthMap[row.month].additions = Number(row.additions);
    }
    for (const row of removedRows) {
      if (!monthMap[row.month]) monthMap[row.month] = { additions: 0, removals: 0 };
      monthMap[row.month].removals = Number(row.removals);
    }

    const months = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        additions: data.additions,
        removals: data.removals,
        net: data.additions - data.removals,
      }));

    const total_additions = months.reduce((sum, m) => sum + m.additions, 0);
    const total_removals = months.reduce((sum, m) => sum + m.removals, 0);

    res.json({ months, total_additions, total_removals });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/herd-size-trend
router.get('/herd-size-trend', async (req, res, next) => {
  try {
    const { start, end } = defaultRange(req.query.from, req.query.to);

    // Count cows added per month (using created_at as proxy for join date)
    const addedRows = await db('cows')
      .whereNull('deleted_at')
      .select(db.raw(`${monthExpr('created_at')} as month`))
      .count('id as added')
      .groupByRaw(`${monthExpr('created_at')}`)
      .orderBy('month');

    // Build a cumulative total up to and including each month
    let running = 0;
    const cumulativeMap = {};
    for (const row of addedRows) {
      running += Number(row.added);
      cumulativeMap[row.month] = running;
    }

    // Generate all months in the requested range and look up cumulative total
    const months = [];
    const cursor = new Date(start.slice(0, 7) + '-01');
    const endDate = new Date(end.slice(0, 7) + '-01');

    let lastKnown = 0;
    // Pre-populate lastKnown with any months before the range
    for (const [month, total] of Object.entries(cumulativeMap).sort()) {
      if (month < start.slice(0, 7)) {
        lastKnown = total;
      }
    }

    while (cursor <= endDate) {
      const label = localDate(cursor).slice(0, 7);
      if (cumulativeMap[label] !== undefined) {
        lastKnown = cumulativeMap[label];
      }
      months.push({ month: label, total: lastKnown });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    res.json({ months });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
