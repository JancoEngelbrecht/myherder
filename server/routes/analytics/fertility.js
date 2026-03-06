const express = require('express');
const db = require('../../config/database');
const {
  round2, localDate, defaultRange, monthExpr,
  MS_PER_DAY, PREDICTION_MONTHS,
  getIssueTypeDefMap, parseIssueCodes, batchCountServices,
} = require('./helpers');

const router = express.Router();

// GET /api/analytics/breeding-overview
router.get('/breeding-overview', async (req, res, next) => {
  try {
    const { start, endTs } = defaultRange(req.query.from, req.query.to);

    // ── Repro status categories (current herd snapshot) ──────────
    // All active females (base population)
    const activeFemales = await db('cows')
      .whereNull('deleted_at')
      .where('sex', 'female')
      .whereIn('status', ['active', 'pregnant', 'dry'])
      .select('id', 'status', 'is_dry');

    const femaleIds = activeFemales.map(c => c.id);

    // Derive pregnant count from activeFemales — avoids a redundant query
    const pregnant_count = activeFemales.filter(f => f.status === 'pregnant').length;

    // Pregnant = status pregnant
    const pregnantIds = new Set(activeFemales.filter(c => c.status === 'pregnant').map(c => c.id));

    // Dry = status dry OR is_dry true (exclude pregnant)
    const dryIds = new Set(
      activeFemales
        .filter(c => !pregnantIds.has(c.id) && (c.status === 'dry' || c.is_dry))
        .map(c => c.id)
    );

    // ── Run independent queries in parallel ─────────────────────
    const today = new Date();
    const sixMonthsLater = new Date();
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
    const todayStr = localDate(today);
    const futureStr = localDate(sixMonthsLater);

    const [bredRows, cowsWithEvents, abortionRow, pregPositiveRow, calvingRows, positiveChecks] =
      await Promise.all([
        // Bred awaiting check = has insemination but no preg_check after latest insemination
        femaleIds.length > 0
          ? db('breeding_events as latest_ins')
              .whereIn('latest_ins.cow_id', femaleIds)
              .whereIn('latest_ins.event_type', ['ai_insemination', 'bull_service'])
              .whereNotExists(function () {
                this.select(db.raw(1))
                  .from('breeding_events as pc')
                  .whereRaw('pc.cow_id = latest_ins.cow_id')
                  .whereIn('pc.event_type', ['preg_check_positive', 'preg_check_negative'])
                  .whereRaw('pc.event_date >= latest_ins.event_date');
              })
              .select('latest_ins.cow_id')
              .groupBy('latest_ins.cow_id')
          : Promise.resolve([]),
        // Heifer not bred = active females with zero breeding events ever
        femaleIds.length > 0
          ? db('breeding_events')
              .whereIn('cow_id', femaleIds)
              .select('cow_id')
              .groupBy('cow_id')
          : Promise.resolve([]),
        // Abortion count in date range
        db('breeding_events')
          .where('event_type', 'abortion')
          .whereBetween('event_date', [start, endTs])
          .count('* as count')
          .first(),
        // Distinct cows with positive preg check in date range
        db('breeding_events')
          .where('event_type', 'preg_check_positive')
          .whereBetween('event_date', [start, endTs])
          .countDistinct('cow_id as count')
          .first(),
        // Expected calvings per month (next 6 months)
        db('breeding_events')
          .whereNotNull('expected_calving')
          .whereBetween('expected_calving', [todayStr, futureStr])
          .whereNull('dismissed_at')
          .select(db.raw(`${monthExpr('expected_calving')} as month`))
          .count('* as count')
          .groupByRaw(monthExpr('expected_calving'))
          .orderBy('month'),
        // Positive checks for services per conception
        db('breeding_events')
          .where('event_type', 'preg_check_positive')
          .whereBetween('event_date', [start, endTs])
          .select('id', 'cow_id', 'event_date'),
      ]);

    // ── Derive repro status categories from parallel results ─────
    const bredAwaitingIds = new Set();
    for (const row of bredRows) {
      if (!pregnantIds.has(row.cow_id) && !dryIds.has(row.cow_id)) {
        bredAwaitingIds.add(row.cow_id);
      }
    }

    const heiferNotBredIds = new Set();
    const cowsWithEventsSet = new Set(cowsWithEvents.map(r => r.cow_id));
    for (const cow of activeFemales) {
      if (!pregnantIds.has(cow.id) && !dryIds.has(cow.id) &&
          !bredAwaitingIds.has(cow.id) && !cowsWithEventsSet.has(cow.id)) {
        heiferNotBredIds.add(cow.id);
      }
    }

    const not_pregnant_count = activeFemales.filter(c =>
      !pregnantIds.has(c.id) && !dryIds.has(c.id) &&
      !bredAwaitingIds.has(c.id) && !heiferNotBredIds.has(c.id)
    ).length;

    const repro_status = {
      pregnant: pregnantIds.size,
      not_pregnant: not_pregnant_count,
      bred_awaiting_check: bredAwaitingIds.size,
      dry: dryIds.size,
      heifer_not_bred: heiferNotBredIds.size,
    };

    const abortion_count = Number(abortionRow?.count) || 0;

    const pregPositiveCount = Number(pregPositiveRow?.count) || 0;
    const eligibleFemales = activeFemales.length;
    const pregnancy_rate = eligibleFemales > 0
      ? round2((pregPositiveCount / eligibleFemales) * 100)
      : null;

    const calvings_by_month = calvingRows.map(r => ({
      month: r.month,
      count: Number(r.count),
    }));

    const serviceCountMap = await batchCountServices(positiveChecks);

    let totalServices = 0;
    let conceptionCount = 0;

    for (const check of positiveChecks) {
      const services = serviceCountMap.get(check.id) || 0;
      if (services > 0) {
        totalServices += services;
        conceptionCount++;
      }
    }

    const avg_services_per_conception = conceptionCount > 0
      ? round2(totalServices / conceptionCount)
      : null;

    res.json({
      pregnant_count,
      not_pregnant_count,
      repro_status,
      abortion_count,
      pregnancy_rate,
      calvings_by_month,
      avg_services_per_conception,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/breeding-activity
router.get('/breeding-activity', async (req, res, next) => {
  try {
    const { start, endTs } = defaultRange(req.query.from, req.query.to);

    // Monthly insemination + conception counts (parallel)
    const [insRows, conRows] = await Promise.all([
      db('breeding_events')
        .whereIn('event_type', ['ai_insemination', 'bull_service'])
        .whereBetween('event_date', [start, endTs])
        .select(db.raw(`${monthExpr('event_date')} as month`))
        .count('* as count')
        .groupByRaw(monthExpr('event_date'))
        .orderBy('month'),
      db('breeding_events')
        .where('event_type', 'preg_check_positive')
        .whereBetween('event_date', [start, endTs])
        .select(db.raw(`${monthExpr('event_date')} as month`))
        .count('* as count')
        .groupByRaw(monthExpr('event_date'))
        .orderBy('month'),
    ]);

    // Merge into unified months array
    const insMap = {};
    for (const r of insRows) insMap[r.month] = Number(r.count);
    const conMap = {};
    for (const r of conRows) conMap[r.month] = Number(r.count);

    const allMonths = [...new Set([...Object.keys(insMap), ...Object.keys(conMap)])].sort();
    const months = allMonths.map(month => ({
      month,
      inseminations: insMap[month] || 0,
      conceptions: conMap[month] || 0,
    }));

    res.json({ months });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/conception-rate
router.get('/conception-rate', async (req, res, next) => {
  try {
    const { start, endTs } = defaultRange(req.query.from, req.query.to);

    const positiveChecks = await db('breeding_events')
      .where('event_type', 'preg_check_positive')
      .whereBetween('event_date', [start, endTs])
      .select('id', 'cow_id', 'event_date');

    const serviceCountMap = await batchCountServices(positiveChecks);

    let total_first_services = 0;
    let first_service_conceptions = 0;
    const monthlyData = {}; // { 'YYYY-MM': { total, conceptions } }

    for (const check of positiveChecks) {
      const services = serviceCountMap.get(check.id) || 0;
      if (services === 0) continue;

      const month = check.event_date.slice(0, 7);
      if (!monthlyData[month]) monthlyData[month] = { total: 0, conceptions: 0 };

      total_first_services++;
      monthlyData[month].total++;
      if (services === 1) {
        first_service_conceptions++;
        monthlyData[month].conceptions++;
      }
    }

    const first_service_rate = total_first_services > 0
      ? Math.round((first_service_conceptions / total_first_services) * 1000) / 10
      : null;

    const by_month = Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        rate: data.total > 0
          ? Math.round((data.conceptions / data.total) * 1000) / 10
          : 0,
        total: data.total,
        conceptions: data.conceptions,
      }));

    res.json({
      first_service_rate,
      total_first_services,
      first_service_conceptions,
      by_month,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/calving-interval
router.get('/calving-interval', async (req, res, next) => {
  try {
    const { start, endTs } = defaultRange(req.query.from, req.query.to);
    const rows = await db('breeding_events as be')
      .join('cows as c', 'be.cow_id', 'c.id')
      .whereNull('c.deleted_at')
      .where('be.event_type', 'calving')
      .whereBetween('be.event_date', [start, endTs])
      .select('be.cow_id', 'be.event_date', 'c.tag_number', 'c.name')
      .orderBy(['be.cow_id', 'be.event_date']);

    // Group calvings by cow
    const byCow = {};
    for (const row of rows) {
      if (!byCow[row.cow_id]) {
        byCow[row.cow_id] = { tag_number: row.tag_number, name: row.name, dates: [] };
      }
      byCow[row.cow_id].dates.push(row.event_date);
    }

    // Calculate per-cow average interval (only cows with 2+ calvings)
    const intervals = [];
    for (const [cow_id, cow] of Object.entries(byCow)) {
      if (cow.dates.length < 2) continue;
      let totalDays = 0;
      for (let i = 1; i < cow.dates.length; i++) {
        const diff = new Date(cow.dates[i]) - new Date(cow.dates[i - 1]);
        totalDays += Math.round(diff / MS_PER_DAY);
      }
      const interval_days = Math.round(totalDays / (cow.dates.length - 1));
      intervals.push({
        cow_id,
        tag_number: cow.tag_number,
        name: cow.name,
        interval_days,
        calving_count: cow.dates.length,
      });
    }

    const avg_calving_interval_days = intervals.length > 0
      ? Math.round(intervals.reduce((sum, r) => sum + r.interval_days, 0) / intervals.length)
      : null;

    res.json({
      avg_calving_interval_days,
      cow_count: intervals.length,
      intervals,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/days-open
router.get('/days-open', async (req, res, next) => {
  try {
    const { start, endTs } = defaultRange(req.query.from, req.query.to);

    // Fetch calvings and preg checks in parallel
    const [calvings, pregChecks] = await Promise.all([
      db('breeding_events as be')
        .join('cows as c', 'be.cow_id', 'c.id')
        .whereNull('c.deleted_at')
        .where('be.event_type', 'calving')
        .whereBetween('be.event_date', [start, endTs])
        .select('be.cow_id', 'be.event_date', 'c.tag_number', 'c.name')
        .orderBy(['be.cow_id', 'be.event_date']),
      db('breeding_events')
        .where('event_type', 'preg_check_positive')
        .whereBetween('event_date', [start, endTs])
        .select('cow_id', 'event_date')
        .orderBy(['cow_id', 'event_date']),
    ]);

    // Index preg checks by cow for fast lookup
    const pregByCow = {};
    for (const pc of pregChecks) {
      if (!pregByCow[pc.cow_id]) pregByCow[pc.cow_id] = [];
      pregByCow[pc.cow_id].push(pc.event_date);
    }

    // For each calving, find the next preg_check_positive for the same cow
    const seen = new Set(); // one record per calving event
    const records = [];

    for (const calving of calvings) {
      const checks = pregByCow[calving.cow_id] || [];
      const nextCheck = checks.find((d) => d > calving.event_date);
      if (!nextCheck) continue;

      // Deduplicate by calving event_date per cow
      const key = `${calving.cow_id}:${calving.event_date}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const days_open = Math.round(
        (new Date(nextCheck) - new Date(calving.event_date)) / MS_PER_DAY
      );
      records.push({
        cow_id: calving.cow_id,
        tag_number: calving.tag_number,
        name: calving.name,
        days_open,
      });
    }

    const avg_days_open = records.length > 0
      ? Math.round(records.reduce((sum, r) => sum + r.days_open, 0) / records.length)
      : null;

    res.json({
      avg_days_open,
      cow_count: records.length,
      records,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/seasonal-prediction
router.get('/seasonal-prediction', async (req, res, next) => {
  try {
    // Bound the query to 3 years of history to prevent unbounded full-table scans
    const THREE_YEARS_AGO = new Date();
    THREE_YEARS_AGO.setFullYear(THREE_YEARS_AGO.getFullYear() - 3);
    const lookbackStart = localDate(THREE_YEARS_AGO);

    const issues = await db('health_issues')
      .where('observed_at', '>=', lookbackStart)
      .select('issue_types', 'observed_at');

    // Build a map: { calendarMonth -> { issueCode -> count } }
    const monthCounts = {};  // e.g. { 3: { mastitis: 5, lameness: 2 } }
    const yearsSet = new Set();

    for (const issue of issues) {
      if (!issue.observed_at) continue;
      const date = new Date(issue.observed_at);
      const calMonth = date.getMonth() + 1; // 1-12
      const year = date.getFullYear();
      yearsSet.add(year);

      const codes = parseIssueCodes(issue.issue_types);
      if (!monthCounts[calMonth]) monthCounts[calMonth] = {};
      for (const code of codes) {
        monthCounts[calMonth][code] = (monthCounts[calMonth][code] || 0) + 1;
      }
    }

    // Cap years_of_data at 3 to match the lookback window
    const totalYears = Math.min(yearsSet.size || 1, 3);

    const defMap = await getIssueTypeDefMap();

    // Predict for the next 2 calendar months
    const now = new Date();
    const predictions = [];

    for (let offset = 1; offset <= PREDICTION_MONTHS; offset++) {
      const futureDate = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const calMonth = futureDate.getMonth() + 1;
      const monthName = futureDate.toLocaleString('en', { month: 'long' });
      const monthLabel = `${futureDate.getFullYear()}-${String(calMonth).padStart(2, '0')}`;

      const counts = monthCounts[calMonth] || {};
      const sorted = Object.entries(counts)
        .map(([code, count]) => ({
          type: defMap[code]?.name || code,
          code,
          emoji: defMap[code]?.emoji || '',
          historical_avg: round2(count / totalYears),
        }))
        .sort((a, b) => b.historical_avg - a.historical_avg)
        .slice(0, 3);

      predictions.push({
        month: monthLabel,
        month_name: monthName,
        issues: sorted,
      });
    }

    res.json({ predictions, years_of_data: totalYears });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
