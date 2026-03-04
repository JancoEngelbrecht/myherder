const express = require('express');
const db = require('../../config/database');
const {
  round2, defaultRange, monthExpr,
  MS_PER_DAY, RECURRENCE_WINDOW_DAYS,
  getIssueTypeDefMap, parseIssueCodes,
} = require('./helpers');

const router = express.Router();

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

    const rows = await db('health_issues')
      .whereBetween('observed_at', [start, endTs])
      .whereNotNull('observed_at')
      .select(
        db.raw(`${monthExpr('observed_at')} as month`),
        db.raw('COUNT(*) as total'),
        db.raw("SUM(CASE WHEN status = 'resolved' AND resolved_at IS NOT NULL THEN 1 ELSE 0 END) as resolved"),
      )
      .groupByRaw(monthExpr('observed_at'))
      .orderBy('month');

    const months = rows.map(row => ({
      month: row.month,
      total: Number(row.total),
      resolved: Number(row.resolved),
      rate: Number(row.total) > 0 ? round2((Number(row.resolved) / Number(row.total)) * 100) : 0,
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
      .select(
        'c.id',
        'c.tag_number',
        'c.name',
        db.raw('AVG(julianday(h.resolved_at) - julianday(h.observed_at)) as avg_days'),
        db.raw('COUNT(h.id) as issue_count'),
      )
      .groupBy('c.id', 'c.tag_number', 'c.name')
      .orderBy('avg_days', 'desc')
      .limit(10);

    const result = rows.map(r => ({
      id: r.id,
      tag_number: r.tag_number,
      name: r.name,
      avg_days: round2(Number(r.avg_days) || 0),
      issue_count: Number(r.issue_count),
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
