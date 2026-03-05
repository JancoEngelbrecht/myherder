const express = require('express')
const db = require('../../config/database')
const { formatDate } = require('../../services/reportService')
const { batchMedications, getIssueTypeMap, parseJsonColumn, MS_PER_DAY } = require('./helpers')

const router = express.Router()

// ── 4. Medication Usage ─────────────────────────────────────

const medicationUsageColumns = [
  { header: 'Medication', key: 'name', width: 2 },
  { header: 'Active Ingredient', key: 'active_ingredient', width: 2 },
  { header: 'Times Used', key: 'times_used', width: 1 },
  { header: 'Total Cost', key: 'total_cost', width: 1.2 },
  { header: '% of Treatments', key: 'pct', width: 1.2 },
  { header: 'Avg Cost/Treatment', key: 'avg_cost', width: 1.3 },
]

async function getMedicationUsageData(from, to) {
  const treatments = await db('treatments as t')
    .join('cows as c', 't.cow_id', 'c.id')
    .whereNull('c.deleted_at')
    .where('t.treatment_date', '>=', from)
    .where('t.treatment_date', '<=', `${to} 23:59:59`)
    .select('t.id', 't.cost')

  const treatmentIds = treatments.map((t) => t.id)
  const costMap = Object.fromEntries(treatments.map((t) => [t.id, Number(t.cost) || 0]))

  const medsMap = await batchMedications(treatmentIds)

  const grouped = {}
  for (const [treatmentId, meds] of Object.entries(medsMap)) {
    const costShare = (costMap[treatmentId] || 0) / meds.length
    for (const med of meds) {
      const entry = grouped[med.name] ??= { name: med.name, active_ingredient: med.active_ingredient || '—', count: 0, totalCost: 0 }
      entry.count++
      entry.totalCost += costShare
    }
  }

  const total = Object.values(grouped).reduce((sum, g) => sum + g.count, 0)
  let grandCost = 0
  const result = Object.values(grouped)
    .sort((a, b) => b.count - a.count)
    .map((g) => {
      grandCost += g.totalCost
      return {
        name: g.name,
        active_ingredient: g.active_ingredient,
        times_used: g.count,
        total_cost: `R ${g.totalCost.toFixed(2)}`,
        pct: total ? `${((g.count / total) * 100).toFixed(1)}%` : '0%',
        avg_cost: g.count ? `R ${(g.totalCost / g.count).toFixed(2)}` : '—',
      }
    })

  return {
    rows: result,
    summaryRow: { name: 'TOTAL', times_used: total, total_cost: `R ${grandCost.toFixed(2)}` },
  }
}

router.get('/medication-usage', (req, res, next) => {
  const { generateReport } = require('./index')
  generateReport(req, res, next, {
    title: 'Medication Usage Report',
    sheetName: 'Medication Usage',
    slug: 'medication-usage',
    columns: medicationUsageColumns,
    getData: getMedicationUsageData,
  })
})

// ── 6. Breeding & Reproduction ──────────────────────────────

const breedingColumns = [
  { header: 'Date', key: 'date', width: 1.2 },
  { header: 'Tag #', key: 'tag_number', width: 1 },
  { header: 'Cow Name', key: 'cow_name', width: 1.2 },
  { header: 'Event Type', key: 'event_type', width: 1.5 },
  { header: 'Sire/Semen ID', key: 'sire_semen', width: 1.2 },
  { header: 'Inseminator', key: 'inseminator', width: 1.2 },
  { header: 'Cost', key: 'cost', width: 0.8 },
  { header: 'Preg Check Method', key: 'preg_method', width: 1.2 },
  { header: 'Notes', key: 'notes', width: 2 },
]

const EVENT_TYPE_LABELS = {
  heat_observed: 'Heat Observed',
  ai_insemination: 'AI Insemination',
  bull_service: 'Bull Service',
  preg_check_positive: 'Preg Check (+)',
  preg_check_negative: 'Preg Check (–)',
  calving: 'Calving',
  abortion: 'Abortion',
  dry_off: 'Dry Off',
}

async function getBreedingData(from, to) {
  const events = await db('breeding_events as be')
    .join('cows as c', 'be.cow_id', 'c.id')
    .leftJoin('users as u', 'be.recorded_by', 'u.id')
    .whereNull('c.deleted_at')
    .where('be.event_date', '>=', from)
    .where('be.event_date', '<=', `${to} 23:59:59`)
    .select(
      'be.event_date', 'be.event_type', 'be.semen_id', 'be.inseminator',
      'be.cost', 'be.preg_check_method', 'be.notes',
      'c.tag_number', 'c.name as cow_name',
    )
    .orderBy('be.event_date', 'asc')

  const typeCounts = {}
  const rows = events.map((e) => {
    typeCounts[e.event_type] = (typeCounts[e.event_type] || 0) + 1
    const cost = Number(e.cost) || 0
    return {
      date: formatDate(e.event_date),
      tag_number: e.tag_number,
      cow_name: e.cow_name || '—',
      event_type: EVENT_TYPE_LABELS[e.event_type] || e.event_type,
      sire_semen: e.semen_id || '—',
      inseminator: e.inseminator || '—',
      cost: cost ? `R ${cost.toFixed(2)}` : '—',
      preg_method: e.preg_check_method || '—',
      notes: e.notes || '—',
    }
  })

  const breakdown = Object.entries(typeCounts).map(([k, v]) => `${EVENT_TYPE_LABELS[k] || k}: ${v}`).join(', ')

  return {
    rows,
    summaryRow: { date: 'TOTAL', event_type: `${events.length} events`, notes: breakdown },
  }
}

router.get('/breeding', (req, res, next) => {
  const { generateReport } = require('./index')
  generateReport(req, res, next, {
    title: 'Breeding & Reproduction Report',
    sheetName: 'Breeding',
    slug: 'breeding',
    columns: breedingColumns,
    getData: getBreedingData,
  })
})

// ── 7. Herd Health Summary ──────────────────────────────────

const herdHealthColumns = [
  { header: 'Date Observed', key: 'date', width: 1.2 },
  { header: 'Tag #', key: 'tag_number', width: 1 },
  { header: 'Cow Name', key: 'cow_name', width: 1.2 },
  { header: 'Issue Type(s)', key: 'issue_types', width: 1.8 },
  { header: 'Severity', key: 'severity', width: 0.8 },
  { header: 'Status', key: 'status', width: 0.8 },
  { header: 'Resolved Date', key: 'resolved_at', width: 1.2 },
  { header: 'Days to Resolve', key: 'days_to_resolve', width: 1 },
  { header: 'Reported By', key: 'reported_by', width: 1.2 },
  { header: 'Treatment Count', key: 'treatment_count', width: 1 },
]

async function getHerdHealthData(from, to) {
  const issues = await db('health_issues as hi')
    .join('cows as c', 'hi.cow_id', 'c.id')
    .join('users as u', 'hi.reported_by', 'u.id')
    .whereNull('c.deleted_at')
    .where('hi.observed_at', '>=', from)
    .where('hi.observed_at', '<=', `${to} 23:59:59`)
    .select(
      'hi.id', 'hi.observed_at', 'hi.issue_types', 'hi.severity',
      'hi.status', 'hi.resolved_at',
      'c.tag_number', 'c.name as cow_name',
      'u.full_name as reported_by_name',
    )
    .orderBy('hi.observed_at', 'asc')

  if (!issues.length) {
    return { rows: [], summaryRow: { date: 'TOTAL', issue_types: '0 issues' } }
  }

  const issueTypeMap = await getIssueTypeMap()

  // Batch treatment counts per issue
  const issueIds = issues.map((i) => i.id)
  const treatCounts = await db('treatments')
    .whereIn('health_issue_id', issueIds)
    .select('health_issue_id')
    .count('* as cnt')
    .groupBy('health_issue_id')
  const treatMap = {}
  for (const tc of treatCounts) treatMap[tc.health_issue_id] = tc.cnt

  const severityCounts = { low: 0, medium: 0, high: 0 }
  let resolved = 0
  let totalDays = 0
  let daysCount = 0

  const rows = issues.map((i) => {
    const codes = parseJsonColumn(i.issue_types)
    const names = codes.map((c) => issueTypeMap[c] || c).join(', ')
    severityCounts[i.severity] = (severityCounts[i.severity] || 0) + 1

    let daysToResolve = '—'
    if (i.status === 'resolved' && i.resolved_at) {
      resolved++
      const days = Math.round((new Date(i.resolved_at) - new Date(i.observed_at)) / MS_PER_DAY)
      daysToResolve = days
      totalDays += days
      daysCount++
    }

    return {
      date: formatDate(i.observed_at),
      tag_number: i.tag_number,
      cow_name: i.cow_name || '—',
      issue_types: names || '—',
      severity: i.severity,
      status: i.status,
      resolved_at: i.resolved_at ? formatDate(i.resolved_at) : '—',
      days_to_resolve: daysToResolve,
      reported_by: i.reported_by_name,
      treatment_count: treatMap[i.id] || 0,
    }
  })

  const total = issues.length
  const resRate = total ? ((resolved / total) * 100).toFixed(1) : '0'
  const avgDays = daysCount ? (totalDays / daysCount).toFixed(1) : '—'
  const sevStr = `High: ${severityCounts.high}, Med: ${severityCounts.medium}, Low: ${severityCounts.low}`

  return {
    rows,
    summaryRow: {
      date: 'TOTAL',
      issue_types: `${total} issues`,
      severity: sevStr,
      status: `${resRate}% resolved`,
      days_to_resolve: `Avg: ${avgDays}`,
    },
  }
}

router.get('/herd-health', (req, res, next) => {
  const { generateReport } = require('./index')
  generateReport(req, res, next, {
    title: 'Herd Health Summary Report',
    sheetName: 'Herd Health',
    slug: 'herd-health',
    columns: herdHealthColumns,
    getData: getHerdHealthData,
  })
})

module.exports = router
