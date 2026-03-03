const express = require('express');
const db = require('../config/database');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');

const router = express.Router();
router.use(auth);
router.use(authorize('can_view_analytics'));

// ── Helpers ───────────────────────────────────────────────

/** Round to 2 decimal places — prevents floating-point display artifacts */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Local-date string YYYY-MM-DD (avoids UTC shift from toISOString) */
function localDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Default date range: last 12 months */
function defaultRange(from, to) {
  const end = to || localDate(new Date());
  const start = from || (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 12);
    return localDate(d);
  })();
  // endTs includes end-of-day for timestamp column comparisons
  return { start, end, endTs: end + 'T23:59:59' };
}

/** Milliseconds per day */
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const RECURRENCE_WINDOW_DAYS = 60;
const PREDICTION_MONTHS = 2;

/** SQLite-compatible month extraction: YYYY-MM — returns raw SQL string */
function monthExpr(col) {
  return `substr(${col}, 1, 7)`;
}

// ── Shared Helpers ────────────────────────────────────────

/** Fetch issue_type_definitions → { code: { code, name, emoji } } map */
async function getIssueTypeDefMap() {
  const defs = await db('issue_type_definitions')
    .select('code', 'name', 'emoji');
  const map = {};
  for (const d of defs) map[d.code] = d;
  return map;
}

/** Safely JSON-parse the issue_types column, returning an array of codes (or []) */
function parseIssueCodes(raw) {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

// ── Routes ────────────────────────────────────────────────

// GET /api/analytics/daily-kpis
router.get('/daily-kpis', async (req, res, next) => {
  try {
    const today = localDate(new Date());
    const sevenAgo = new Date();
    sevenAgo.setDate(sevenAgo.getDate() - 7);
    const sevenAgoStr = localDate(sevenAgo);

    // Litres milked today
    const milkToday = await db('milk_records')
      .where('recording_date', today)
      .sum('litres as total')
      .first();
    const litres_today = round2(Number(milkToday?.total) || 0);

    // 7-day average daily litres
    const milk7d = await db('milk_records')
      .where('recording_date', '>=', sevenAgoStr)
      .where('recording_date', '<', today)
      .sum('litres as total')
      .first();
    const litres_7day_avg = round2((Number(milk7d?.total) || 0) / 7);

    // Cows milked today
    const cowsToday = await db('milk_records')
      .where('recording_date', today)
      .countDistinct('cow_id as count')
      .first();
    const cows_milked_today = Number(cowsToday?.count) || 0;

    // Expected milkable cows (active/pregnant females, not dry)
    const expected = await db('cows')
      .whereNull('deleted_at')
      .where('sex', 'female')
      .whereIn('status', ['active', 'pregnant'])
      .where('is_dry', false)
      .count('* as count')
      .first();
    const cows_expected = Number(expected?.count) || 0;

    // Active health issues
    const healthOpen = await db('health_issues')
      .whereIn('status', ['open', 'treating'])
      .count('* as count')
      .first();
    const active_health_issues = Number(healthOpen?.count) || 0;

    // Breeding actions due (overdue or due today, not dismissed)
    const breedingDue = await db('breeding_events')
      .whereNull('dismissed_at')
      .where(function () {
        this.where('expected_next_heat', '<=', today)
          .orWhere('expected_preg_check', '<=', today)
          .orWhere('expected_calving', '<=', today)
          .orWhere('expected_dry_off', '<=', today);
      })
      .count('* as count')
      .first();
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
    const cows = await db('cows')
      .whereNull('deleted_at')
      .select('id', 'sex', 'status', 'is_dry');

    // by_status breakdown
    const statusMap = {};
    let males = 0;
    let females = 0;
    let milking_count = 0;
    let dry_count = 0;
    const femaleIds = [];

    for (const cow of cows) {
      statusMap[cow.status] = (statusMap[cow.status] || 0) + 1;

      if (cow.sex === 'male') {
        males++;
      } else {
        females++;
        femaleIds.push(cow.id);
        if (cow.is_dry === 1 || cow.status === 'dry') {
          dry_count++;
        } else if (['active', 'pregnant', 'sick'].includes(cow.status)) {
          milking_count++;
        }
      }
    }

    const by_status = Object.entries(statusMap).map(([status, count]) => ({ status, count }));
    const total = cows.length;

    // Heifer count: females with zero calving events, excluding sold/dead
    let heifer_count = 0;
    if (femaleIds.length > 0) {
      const cowsWithCalvings = await db('breeding_events')
        .whereIn('cow_id', femaleIds)
        .where('event_type', 'calving')
        .distinct('cow_id')
        .pluck('cow_id');

      const calvingSet = new Set(cowsWithCalvings);
      for (const cow of cows) {
        if (cow.sex === 'female' && !['sold', 'dead'].includes(cow.status) && !calvingSet.has(cow.id)) {
          heifer_count++;
        }
      }
    }

    const replacement_rate = milking_count > 0 ? round2((heifer_count / milking_count) * 100) : 0;

    res.json({ total, by_status, milking_count, dry_count, heifer_count, males, females, replacement_rate });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/unhealthiest
router.get('/unhealthiest', async (req, res, next) => {
  try {
    const { start, endTs } = defaultRange(req.query.from, req.query.to);

    const rows = await db('health_issues as h')
      .join('cows as c', 'h.cow_id', 'c.id')
      .whereNull('c.deleted_at')
      .whereBetween('h.observed_at', [start, endTs])
      .select(
        'c.id',
        'c.tag_number',
        'c.name',
        'c.sex'
      )
      .count('h.id as issue_count')
      .groupBy('c.id', 'c.tag_number', 'c.name', 'c.sex')
      .orderBy('issue_count', 'desc')
      .limit(10);

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/milk-trends
router.get('/milk-trends', async (req, res, next) => {
  try {
    const { start, end } = defaultRange(req.query.from, req.query.to);

    const rows = await db('milk_records')
      .whereBetween('recording_date', [start, end])
      .select(db.raw(`${monthExpr('recording_date')} as month`))
      .sum('litres as total_litres')
      .count('* as record_count')
      .groupByRaw(monthExpr('recording_date'))
      .orderBy('month');

    // Calculate avg_per_cow for each month
    const months = await Promise.all(rows.map(async (row) => {
      const cowCount = await db('milk_records')
        .whereBetween('recording_date', [start, end])
        .whereRaw(`${monthExpr('recording_date')} = ?`, [row.month])
        .countDistinct('cow_id as count')
        .first();
      const numCows = Number(cowCount?.count) || 1;
      return {
        month: row.month,
        total_litres: round2(Number(row.total_litres) || 0),
        record_count: row.record_count,
        avg_per_cow: round2((Number(row.total_litres) || 0) / numCows),
      };
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
      days_recorded: r.days_recorded,
      avg_daily_litres: r.days_recorded > 0
        ? round2((Number(r.total_litres) || 0) / r.days_recorded)
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
      discard_count: r.discard_count,
    }));

    const total_discarded = round2(months.reduce((sum, m) => sum + m.discarded_litres, 0));

    res.json({ months, total_discarded });
  } catch (err) {
    next(err);
  }
});

/**
 * Count services (inseminations) for a preg_check_positive event within its breeding cycle.
 * Returns the service count (0 if no services found).
 */
async function countServicesForPregCheck(check) {
  const lastReset = await db('breeding_events')
    .where('cow_id', check.cow_id)
    .where('event_date', '<', check.event_date)
    .whereIn('event_type', ['calving', 'abortion'])
    .orderBy('event_date', 'desc')
    .first();

  const serviceQuery = db('breeding_events')
    .where('cow_id', check.cow_id)
    .where('event_date', '<=', check.event_date)
    .whereIn('event_type', ['ai_insemination', 'bull_service']);

  if (lastReset) {
    serviceQuery.where('event_date', '>', lastReset.event_date);
  }

  const serviceRow = await serviceQuery.count('* as count').first();
  return Number(serviceRow?.count) || 0;
}

// GET /api/analytics/breeding-overview
router.get('/breeding-overview', async (req, res, next) => {
  try {
    const { start, endTs } = defaultRange(req.query.from, req.query.to);

    // Count pregnant cows (status = pregnant) — current herd snapshot
    const pregnantRow = await db('cows')
      .whereNull('deleted_at')
      .where('status', 'pregnant')
      .count('* as count')
      .first();
    const pregnant_count = Number(pregnantRow?.count || 0);

    // ── Repro status categories (current herd snapshot) ──────────
    // All active females (base population)
    const activeFemales = await db('cows')
      .whereNull('deleted_at')
      .where('sex', 'female')
      .whereIn('status', ['active', 'pregnant', 'dry'])
      .select('id', 'status', 'is_dry');

    const femaleIds = activeFemales.map(c => c.id);

    // Pregnant = status pregnant
    const pregnantIds = new Set(activeFemales.filter(c => c.status === 'pregnant').map(c => c.id));

    // Dry = status dry OR is_dry true (exclude pregnant)
    const dryIds = new Set(
      activeFemales
        .filter(c => !pregnantIds.has(c.id) && (c.status === 'dry' || c.is_dry))
        .map(c => c.id)
    );

    // Bred awaiting check = has insemination but no preg_check after latest insemination
    const bredAwaitingIds = new Set();
    if (femaleIds.length > 0) {
      const bredRows = await db('breeding_events as latest_ins')
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
        .groupBy('latest_ins.cow_id');

      for (const row of bredRows) {
        if (!pregnantIds.has(row.cow_id) && !dryIds.has(row.cow_id)) {
          bredAwaitingIds.add(row.cow_id);
        }
      }
    }

    // Heifer not bred = active females with zero breeding events ever
    const heiferNotBredIds = new Set();
    if (femaleIds.length > 0) {
      const cowsWithEvents = await db('breeding_events')
        .whereIn('cow_id', femaleIds)
        .select('cow_id')
        .groupBy('cow_id');
      const cowsWithEventsSet = new Set(cowsWithEvents.map(r => r.cow_id));

      for (const cow of activeFemales) {
        if (!pregnantIds.has(cow.id) && !dryIds.has(cow.id) &&
            !bredAwaitingIds.has(cow.id) && !cowsWithEventsSet.has(cow.id)) {
          heiferNotBredIds.add(cow.id);
        }
      }
    }

    // Not pregnant = remaining active females
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

    // ── Abortion count in date range ─────────────────────────────
    const abortionRow = await db('breeding_events')
      .where('event_type', 'abortion')
      .whereBetween('event_date', [start, endTs])
      .count('* as count')
      .first();
    const abortion_count = Number(abortionRow?.count) || 0;

    // ── Pregnancy rate: preg_check_positive / eligible females × 100 ──
    const pregPositiveRow = await db('breeding_events')
      .where('event_type', 'preg_check_positive')
      .whereBetween('event_date', [start, endTs])
      .count('* as count')
      .first();
    const pregPositiveCount = Number(pregPositiveRow?.count) || 0;
    const eligibleFemales = activeFemales.length;
    const pregnancy_rate = eligibleFemales > 0
      ? round2((pregPositiveCount / eligibleFemales) * 100)
      : null;

    // ── Expected calvings per month (next 6 months) ──────────────
    const today = new Date();
    const sixMonthsLater = new Date();
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
    const todayStr = localDate(today);
    const futureStr = localDate(sixMonthsLater);

    const calvingRows = await db('breeding_events')
      .whereNotNull('expected_calving')
      .whereBetween('expected_calving', [todayStr, futureStr])
      .whereNull('dismissed_at')
      .select(db.raw(`${monthExpr('expected_calving')} as month`))
      .count('* as count')
      .groupByRaw(monthExpr('expected_calving'))
      .orderBy('month');

    const calvings_by_month = calvingRows.map(r => ({
      month: r.month,
      count: r.count,
    }));

    // ── Avg services per conception (scoped to from/to) ──────────
    const positiveChecks = await db('breeding_events')
      .where('event_type', 'preg_check_positive')
      .whereBetween('event_date', [start, endTs])
      .select('id', 'cow_id', 'event_date');

    let totalServices = 0;
    let conceptionCount = 0;

    for (const check of positiveChecks) {
      const services = await countServicesForPregCheck(check);
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

    // Monthly insemination counts
    const insRows = await db('breeding_events')
      .whereIn('event_type', ['ai_insemination', 'bull_service'])
      .whereBetween('event_date', [start, endTs])
      .select(db.raw(`${monthExpr('event_date')} as month`))
      .count('* as count')
      .groupByRaw(monthExpr('event_date'))
      .orderBy('month');

    // Monthly conception counts (preg_check_positive)
    const conRows = await db('breeding_events')
      .where('event_type', 'preg_check_positive')
      .whereBetween('event_date', [start, endTs])
      .select(db.raw(`${monthExpr('event_date')} as month`))
      .count('* as count')
      .groupByRaw(monthExpr('event_date'))
      .orderBy('month');

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
      treatment_count: r.treatment_count,
    }));

    const grand_total = round2(months.reduce((sum, m) => sum + m.total_cost, 0));

    res.json({ months, grand_total });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/seasonal-prediction
router.get('/seasonal-prediction', async (req, res, next) => {
  try {
    // Get all health issues with their issue types (JSON array) and observed_at month
    const issues = await db('health_issues')
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

    const totalYears = yearsSet.size || 1;

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
      days_recorded: r.days_recorded,
      avg_daily_litres: r.days_recorded > 0
        ? round2((Number(r.total_litres) || 0) / r.days_recorded)
        : 0,
    }));

    res.json(result);
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

    // Fetch all calving and preg_check_positive events in the window, joined with cows
    const calvings = await db('breeding_events as be')
      .join('cows as c', 'be.cow_id', 'c.id')
      .whereNull('c.deleted_at')
      .where('be.event_type', 'calving')
      .whereBetween('be.event_date', [start, endTs])
      .select('be.cow_id', 'be.event_date', 'c.tag_number', 'c.name')
      .orderBy(['be.cow_id', 'be.event_date']);

    const pregChecks = await db('breeding_events')
      .where('event_type', 'preg_check_positive')
      .whereBetween('event_date', [start, endTs])
      .select('cow_id', 'event_date')
      .orderBy(['cow_id', 'event_date']);

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

// GET /api/analytics/conception-rate
router.get('/conception-rate', async (req, res, next) => {
  try {
    const { start, endTs } = defaultRange(req.query.from, req.query.to);

    const positiveChecks = await db('breeding_events')
      .where('event_type', 'preg_check_positive')
      .whereBetween('event_date', [start, endTs])
      .select('id', 'cow_id', 'event_date');

    let total_first_services = 0;
    let first_service_conceptions = 0;
    const monthlyData = {}; // { 'YYYY-MM': { total, conceptions } }

    for (const check of positiveChecks) {
      const services = await countServicesForPregCheck(check);
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

// GET /api/analytics/issue-frequency
router.get('/issue-frequency', async (req, res, next) => {
  try {
    const { start, endTs } = defaultRange(req.query.from, req.query.to);

    const issues = await db('health_issues')
      .whereBetween('observed_at', [start, endTs])
      .select('issue_types', 'observed_at');

    const defMap = await getIssueTypeDefMap();

    // Accumulate totals per code and per month-per-code
    const totalCounts = {};   // { code: count }
    const monthCounts = {};   // { 'YYYY-MM': { code: count } }

    for (const issue of issues) {
      if (!issue.observed_at) continue;
      const month = issue.observed_at.slice(0, 7);
      const codes = parseIssueCodes(issue.issue_types);

      for (const code of codes) {
        totalCounts[code] = (totalCounts[code] || 0) + 1;

        if (!monthCounts[month]) monthCounts[month] = {};
        monthCounts[month][code] = (monthCounts[month][code] || 0) + 1;
      }
    }

    const by_type = Object.entries(totalCounts)
      .map(([code, count]) => ({
        code,
        name: defMap[code]?.name || code,
        emoji: defMap[code]?.emoji || '',
        count,
      }))
      .sort((a, b) => b.count - a.count);

    const by_month = Object.entries(monthCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, counts]) => ({ month, counts }));

    res.json({ by_type, by_month });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/mastitis-rate
router.get('/mastitis-rate', async (req, res, next) => {
  try {
    const { start, endTs } = defaultRange(req.query.from, req.query.to);

    // Current herd size — single snapshot count of non-deleted cows
    const herdRow = await db('cows')
      .whereNull('deleted_at')
      .count('* as count')
      .first();
    const herd_size = Number(herdRow?.count) || 0;

    const rows = await db('health_issues')
      .whereBetween('observed_at', [start, endTs])
      .where('issue_types', 'like', '%"mastitis"%')
      .select(db.raw(`${monthExpr('observed_at')} as month`))
      .count('* as cases')
      .groupByRaw(monthExpr('observed_at'))
      .orderBy('month');

    const months = rows.map(r => {
      const cases = Number(r.cases) || 0;
      const rate = herd_size > 0
        ? round2((cases / herd_size) * 100)
        : 0;
      return { month: r.month, rate, cases, herd_size };
    });

    const avg_rate = months.length > 0
      ? round2(months.reduce((sum, m) => sum + m.rate, 0) / months.length)
      : 0;

    res.json({ months, avg_rate });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/withdrawal-days
router.get('/withdrawal-days', async (req, res, next) => {
  try {
    const { start, endTs } = defaultRange(req.query.from, req.query.to);

    const rows = await db('treatments')
      .whereBetween('treatment_date', [start, endTs])
      .whereNotNull('withdrawal_end_milk')
      .select(
        db.raw(`${monthExpr('treatment_date')} as month`),
        'treatment_date',
        'withdrawal_end_milk',
        'cow_id'
      )
      .orderBy('month');

    // Accumulate per-month totals in JS (avoids SQLite date arithmetic limitations)
    const monthMap = {};  // { 'YYYY-MM': { total_withdrawal_days, cow_ids: Set } }

    for (const row of rows) {
      const month = row.month;
      const treatDate = new Date(row.treatment_date);
      const endDate = new Date(row.withdrawal_end_milk);
      const days = Math.ceil((endDate - treatDate) / MS_PER_DAY);
      if (days <= 0) continue;

      if (!monthMap[month]) {
        monthMap[month] = { total_withdrawal_days: 0, cow_ids: new Set() };
      }
      monthMap[month].total_withdrawal_days += days;
      monthMap[month].cow_ids.add(row.cow_id);
    }

    const months = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        total_withdrawal_days: data.total_withdrawal_days,
        cows_affected: data.cow_ids.size,
      }));

    const grand_total_days = months.reduce((sum, m) => sum + m.total_withdrawal_days, 0);

    res.json({ months, grand_total_days });
  } catch (err) {
    next(err);
  }
});

// ── Age Distribution ──────────────────────────────────────

// GET /api/analytics/age-distribution
router.get('/age-distribution', async (req, res, next) => {
  try {
    const today = new Date();
    const rows = await db('cows')
      .whereNull('deleted_at')
      .select('dob', 'sex');

    const ORDER = ['0-1yr', '1-2yr', '2-5yr', '5-8yr', '8+yr', 'Unknown'];
    const counts = Object.fromEntries(ORDER.map(l => [l, { count: 0, males: 0, females: 0 }]));
    let males = 0;
    let females = 0;

    for (const row of rows) {
      const isMale = row.sex === 'male';
      if (isMale) males++;
      else females++;

      let bracket;
      if (!row.dob) {
        bracket = 'Unknown';
      } else {
        const dob = new Date(row.dob);
        const ageYears = (today - dob) / (MS_PER_DAY * 365.25);
        if (ageYears < 1)      bracket = '0-1yr';
        else if (ageYears < 2) bracket = '1-2yr';
        else if (ageYears < 5) bracket = '2-5yr';
        else if (ageYears < 8) bracket = '5-8yr';
        else                   bracket = '8+yr';
      }
      counts[bracket].count++;
      if (isMale) counts[bracket].males++;
      else counts[bracket].females++;
    }

    const brackets = ORDER.map(label => ({ label, ...counts[label] }));
    const total = rows.length;

    res.json({ brackets, total, males, females });
  } catch (err) {
    next(err);
  }
});

// ── Breed Composition ─────────────────────────────────────

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

// ── Mortality Rate ────────────────────────────────────────

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
        'status'
      );

    const monthMap = {};
    for (const row of rows) {
      if (!monthMap[row.month]) {
        monthMap[row.month] = { sold: 0, dead: 0 };
      }
      monthMap[row.month][row.status]++;
    }

    const months = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        sold: data.sold,
        dead: data.dead,
        rate_pct: herdSize > 0
          ? round2(((data.sold + data.dead) / herdSize) * 100)
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

// ── Herd Turnover ─────────────────────────────────────────

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

// ── Herd Size Trend ───────────────────────────────────────

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

// ── Health Resolution Stats ───────────────────────────────

// GET /api/analytics/health-resolution-stats
router.get('/health-resolution-stats', async (req, res, next) => {
  try {
    const { start, endTs } = defaultRange(req.query.from, req.query.to);

    const issues = await db('health_issues')
      .whereBetween('observed_at', [start, endTs])
      .select('id', 'cow_id', 'issue_types', 'status', 'observed_at', 'resolved_at');

    const defMap = await getIssueTypeDefMap();

    // Herd size snapshot for incidence calculation
    const herdRow = await db('cows').whereNull('deleted_at').count('* as count').first();
    const herdSize = Number(herdRow?.count) || 0;

    // Pre-parse issue codes and index by cow_id to avoid O(n²) re-parsing
    const parsed = issues.map(i => ({
      ...i,
      _codes: parseIssueCodes(i.issue_types),
      _observedMs: new Date(i.observed_at).getTime(),
    }));
    const byCow = {};
    for (const p of parsed) {
      if (!byCow[p.cow_id]) byCow[p.cow_id] = [];
      byCow[p.cow_id].push(p);
    }

    const total_issues = parsed.length;
    const resolved = parsed.filter(i => i.status === 'resolved' && i.resolved_at);
    const resolved_count = resolved.length;
    const cure_rate = total_issues > 0 ? round2((resolved_count / total_issues) * 100) : 0;

    // Avg days to resolve
    let totalDays = 0;
    for (const r of resolved) {
      totalDays += (new Date(r.resolved_at).getTime() - r._observedMs) / MS_PER_DAY;
    }
    const avg_days_to_resolve = resolved_count > 0 ? round2(totalDays / resolved_count) : 0;

    // Recurrence: resolved issue where same cow+type recurs within 60 days of resolved_at
    let recurred = 0;
    for (const r of resolved) {
      const resolvedMs = new Date(r.resolved_at).getTime();
      const windowEnd = resolvedMs + RECURRENCE_WINDOW_DAYS * MS_PER_DAY;
      const cowIssues = byCow[r.cow_id] || [];
      const hasRecurrence = cowIssues.some(other =>
        other.id !== r.id &&
        other._observedMs > resolvedMs &&
        other._observedMs <= windowEnd &&
        other._codes.some(c => r._codes.includes(c))
      );
      if (hasRecurrence) recurred++;
    }
    const recurrence_rate = resolved_count > 0 ? round2((recurred / resolved_count) * 100) : 0;

    // Top 3 incidence rates: cases per code / (herdSize * months_in_range) * 100
    const codeCounts = {};
    for (const issue of parsed) {
      for (const code of issue._codes) {
        codeCounts[code] = (codeCounts[code] || 0) + 1;
      }
    }
    const startDate = new Date(start);
    const endDate = new Date(endTs);
    const monthsInRange = Math.max(1,
      (endDate.getFullYear() - startDate.getFullYear()) * 12 +
      (endDate.getMonth() - startDate.getMonth()) + 1
    );

    const top_incidence = Object.entries(codeCounts)
      .map(([code, count]) => ({
        code,
        name: defMap[code]?.name || code,
        emoji: defMap[code]?.emoji || '',
        rate: herdSize > 0 ? round2((count / (herdSize * monthsInRange)) * 100) : 0,
      }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 3);

    res.json({
      total_issues,
      resolved_count,
      cure_rate,
      avg_days_to_resolve,
      recurrence_rate,
      top_incidence,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/health-resolution-by-type
router.get('/health-resolution-by-type', async (req, res, next) => {
  try {
    const { start, endTs } = defaultRange(req.query.from, req.query.to);

    const resolved = await db('health_issues')
      .whereBetween('observed_at', [start, endTs])
      .where('status', 'resolved')
      .whereNotNull('resolved_at')
      .select('issue_types', 'observed_at', 'resolved_at');

    const defMap = await getIssueTypeDefMap();

    // Accumulate total days + count per issue type code
    const byCode = {}; // { code: { totalDays, count } }
    for (const issue of resolved) {
      const days = (new Date(issue.resolved_at) - new Date(issue.observed_at)) / MS_PER_DAY;
      for (const code of parseIssueCodes(issue.issue_types)) {
        if (!byCode[code]) byCode[code] = { totalDays: 0, count: 0 };
        byCode[code].totalDays += days;
        byCode[code].count++;
      }
    }

    const by_type = Object.entries(byCode)
      .map(([code, { totalDays, count }]) => ({
        code,
        name: defMap[code]?.name || code,
        emoji: defMap[code]?.emoji || '',
        avg_days: round2(totalDays / count),
        count,
      }))
      .sort((a, b) => b.avg_days - a.avg_days);

    res.json({ by_type });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/health-recurrence
router.get('/health-recurrence', async (req, res, next) => {
  try {
    const { start, endTs } = defaultRange(req.query.from, req.query.to);

    const rawIssues = await db('health_issues')
      .whereBetween('observed_at', [start, endTs])
      .select('id', 'cow_id', 'issue_types', 'status', 'observed_at', 'resolved_at');

    const defMap = await getIssueTypeDefMap();

    // Pre-parse codes + index by cow to avoid O(n²) re-parsing
    const issues = rawIssues.map(i => ({
      ...i,
      _codes: parseIssueCodes(i.issue_types),
      _observedMs: new Date(i.observed_at).getTime(),
    }));
    const byCowIdx = {};
    for (const p of issues) {
      if (!byCowIdx[p.cow_id]) byCowIdx[p.cow_id] = [];
      byCowIdx[p.cow_id].push(p);
    }

    const resolved = issues.filter(i => i.status === 'resolved' && i.resolved_at);

    // Per code: count resolved and how many recurred within 60 days
    const byCode = {}; // { code: { resolved: 0, recurred: 0 } }
    for (const r of resolved) {
      const resolvedMs = new Date(r.resolved_at).getTime();
      const windowEnd = resolvedMs + RECURRENCE_WINDOW_DAYS * MS_PER_DAY;
      const cowIssues = byCowIdx[r.cow_id] || [];

      for (const code of r._codes) {
        if (!byCode[code]) byCode[code] = { resolved: 0, recurred: 0 };
        byCode[code].resolved++;

        const hasRecurrence = cowIssues.some(other =>
          other.id !== r.id &&
          other._observedMs > resolvedMs &&
          other._observedMs <= windowEnd &&
          other._codes.includes(code)
        );
        if (hasRecurrence) byCode[code].recurred++;
      }
    }

    const by_type = Object.entries(byCode)
      .map(([code, { resolved: resolvedCount, recurred }]) => ({
        code,
        name: defMap[code]?.name || code,
        emoji: defMap[code]?.emoji || '',
        rate: resolvedCount > 0 ? round2((recurred / resolvedCount) * 100) : 0,
        resolved_count: resolvedCount,
        recurred_count: recurred,
      }))
      .sort((a, b) => b.rate - a.rate);

    res.json({ by_type });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/health-cure-rate-trend
router.get('/health-cure-rate-trend', async (req, res, next) => {
  try {
    const { start, endTs } = defaultRange(req.query.from, req.query.to);

    const issues = await db('health_issues')
      .whereBetween('observed_at', [start, endTs])
      .select('observed_at', 'status', 'resolved_at');

    // Group by month
    const monthMap = {}; // { 'YYYY-MM': { total, resolved } }
    for (const issue of issues) {
      if (!issue.observed_at) continue;
      const month = issue.observed_at.slice(0, 7);
      if (!monthMap[month]) monthMap[month] = { total: 0, resolved: 0 };
      monthMap[month].total++;
      if (issue.status === 'resolved' && issue.resolved_at) {
        monthMap[month].resolved++;
      }
    }

    const months = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { total, resolved }]) => ({
        month,
        total,
        resolved,
        rate: total > 0 ? round2((resolved / total) * 100) : 0,
      }));

    res.json({ months });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/slowest-to-resolve
router.get('/slowest-to-resolve', async (req, res, next) => {
  try {
    const { start, endTs } = defaultRange(req.query.from, req.query.to);

    const rows = await db('health_issues as h')
      .join('cows as c', 'h.cow_id', 'c.id')
      .whereNull('c.deleted_at')
      .whereBetween('h.observed_at', [start, endTs])
      .where('h.status', 'resolved')
      .whereNotNull('h.resolved_at')
      .select('c.id', 'c.tag_number', 'c.name', 'h.observed_at', 'h.resolved_at');

    // Accumulate per cow
    const byCow = {};
    for (const row of rows) {
      const days = (new Date(row.resolved_at) - new Date(row.observed_at)) / MS_PER_DAY;
      if (!byCow[row.id]) {
        byCow[row.id] = { tag_number: row.tag_number, name: row.name, totalDays: 0, count: 0 };
      }
      byCow[row.id].totalDays += days;
      byCow[row.id].count++;
    }

    const result = Object.entries(byCow)
      .map(([id, { tag_number, name, totalDays, count }]) => ({
        id,
        tag_number,
        name,
        avg_days: round2(totalDays / count),
        issue_count: count,
      }))
      .sort((a, b) => b.avg_days - a.avg_days)
      .slice(0, 10);

    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
