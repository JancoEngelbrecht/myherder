const express = require('express')
const Joi = require('joi')
const db = require('../config/database')
const authenticate = require('../middleware/auth')
const { requireAdmin } = require('../middleware/authorize')
const {
  getFarmName,
  formatDate,
  createPdfDocument,
  drawPdfTable,
  createExcelReport,
  sendFile,
} = require('../services/reportService')

const router = express.Router()
router.use(authenticate)
router.use(requireAdmin)

// ── Validation ──────────────────────────────────────────────

const querySchema = Joi.object({
  from: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  to: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  format: Joi.string().valid('pdf', 'xlsx').default('pdf'),
})

function validateQuery(req, res) {
  const { error, value } = querySchema.validate(req.query)
  if (error) {
    res.status(400).json({ error: error.details[0].message.replace(/['"]/g, '') })
    return null
  }
  return value
}

// ── Shared Report Generator ─────────────────────────────────

async function generateReport(req, res, next, { title, sheetName, slug, columns, getData }) {
  try {
    const params = validateQuery(req, res)
    if (!params) return

    const { from, to, format } = params
    const farmName = await getFarmName()
    const { rows, summaryRow } = await getData(from, to)

    const dateRange = { from, to }
    const generatedBy = req.user.full_name

    if (format === 'xlsx') {
      const buffer = await createExcelReport({
        title, sheetName, farmName, dateRange, generatedBy, columns, rows, summaryRow,
      })
      return sendFile(res, buffer, `${slug}-${from}-to-${to}`, 'xlsx')
    }

    const { doc, finalize } = createPdfDocument({ title, farmName, dateRange, generatedBy })
    drawPdfTable(doc, { columns, rows, summaryRow })
    const buffer = await finalize()
    sendFile(res, buffer, `${slug}-${from}-to-${to}`, 'pdf')
  } catch (err) {
    next(err)
  }
}

// ── Helpers ─────────────────────────────────────────────────

async function batchMedications(treatmentIds) {
  if (!treatmentIds.length) return {}

  // Primary medication from treatments.medication_id
  const primary = await db('treatments as t')
    .join('medications as m', 't.medication_id', 'm.id')
    .whereIn('t.id', treatmentIds)
    .select('t.id as treatment_id', 'm.name', 'm.active_ingredient', 't.dosage')

  const map = {}
  for (const row of primary) {
    ;(map[row.treatment_id] ??= []).push(row)
  }

  // Additional medications from treatment_medications junction table
  const extra = await db('treatment_medications as tm')
    .join('medications as m', 'tm.medication_id', 'm.id')
    .whereIn('tm.treatment_id', treatmentIds)
    .select('tm.treatment_id', 'm.name', 'm.active_ingredient', 'tm.dosage')

  for (const row of extra) {
    const list = map[row.treatment_id] ??= []
    // Avoid duplicating the primary medication
    if (!list.some((r) => r.name === row.name)) list.push(row)
  }

  return map
}

async function getIssueTypeMap() {
  const types = await db('issue_type_definitions').select('code', 'name')
  const map = {}
  for (const t of types) map[t.code] = t.name
  return map
}

function parseJsonColumn(val) {
  if (typeof val === 'string') {
    try { return JSON.parse(val) } catch { return [] }
  }
  return Array.isArray(val) ? val : []
}

// ── 1. Withdrawal Compliance ────────────────────────────────

const withdrawalColumns = [
  { header: 'Tag #', key: 'tag_number', width: 1 },
  { header: 'Cow Name', key: 'cow_name', width: 1.5 },
  { header: 'Treatment Date', key: 'treatment_date', width: 1.2 },
  { header: 'Medication(s)', key: 'medications', width: 2 },
  { header: 'Active Ingredient(s)', key: 'active_ingredients', width: 1.8 },
  { header: 'W/D End (Milk)', key: 'withdrawal_end_milk', width: 1.2 },
  { header: 'W/D End (Meat)', key: 'withdrawal_end_meat', width: 1.2 },
  { header: 'W/D Days', key: 'withdrawal_days', width: 0.8 },
  { header: 'Administered By', key: 'administered_by', width: 1.2 },
]

async function getWithdrawalData(from, to) {
  const treatments = await db('treatments as t')
    .join('cows as c', 't.cow_id', 'c.id')
    .join('users as u', 't.administered_by', 'u.id')
    .whereNull('c.deleted_at')
    .where('c.sex', 'female')
    .whereNotNull('t.withdrawal_end_milk')
    .where('t.withdrawal_end_milk', '>=', from)
    .where('t.treatment_date', '<=', `${to} 23:59:59`)
    .select(
      't.id', 't.cow_id', 't.treatment_date',
      't.withdrawal_end_milk', 't.withdrawal_end_meat',
      'c.tag_number', 'c.name as cow_name',
      'u.full_name as administered_by_name',
    )
    .orderBy('t.treatment_date', 'asc')

  if (!treatments.length) {
    return { rows: [], summaryRow: { tag_number: 'TOTAL', medications: '0 treatments' } }
  }

  const medsMap = await batchMedications(treatments.map((t) => t.id))
  const MS_PER_DAY = 86400000

  const rows = treatments.map((t) => {
    const meds = medsMap[t.id] || []
    const wdDays = t.withdrawal_end_milk
      ? Math.ceil((new Date(t.withdrawal_end_milk) - new Date(t.treatment_date)) / MS_PER_DAY)
      : 0

    return {
      tag_number: t.tag_number,
      cow_name: t.cow_name || '—',
      treatment_date: formatDate(t.treatment_date),
      medications: meds.map((m) => m.name).join(', ') || '—',
      active_ingredients: meds.map((m) => m.active_ingredient).filter(Boolean).join(', ') || '—',
      withdrawal_end_milk: t.withdrawal_end_milk ? formatDate(t.withdrawal_end_milk) : '—',
      withdrawal_end_meat: t.withdrawal_end_meat ? formatDate(t.withdrawal_end_meat) : '—',
      withdrawal_days: wdDays,
      administered_by: t.administered_by_name,
    }
  })

  return {
    rows,
    summaryRow: {
      tag_number: 'TOTAL',
      medications: `${treatments.length} treatments`,
    },
  }
}

router.get('/withdrawal-compliance', (req, res, next) =>
  generateReport(req, res, next, {
    title: 'Withdrawal Compliance Report',
    sheetName: 'Withdrawal Compliance',
    slug: 'withdrawal-compliance',
    columns: withdrawalColumns,
    getData: getWithdrawalData,
  }),
)

// ── 2. Treatment History ────────────────────────────────────

const treatmentHistoryColumns = [
  { header: 'Tag #', key: 'tag_number', width: 1 },
  { header: 'Cow Name', key: 'cow_name', width: 1.2 },
  { header: 'Treatment Date', key: 'treatment_date', width: 1.2 },
  { header: 'Medication(s)', key: 'medications', width: 1.8 },
  { header: 'Active Ingredient(s)', key: 'active_ingredients', width: 1.5 },
  { header: 'Dosage', key: 'dosage', width: 1 },
  { header: 'Cost', key: 'cost', width: 0.8 },
  { header: 'Vet Visit', key: 'vet_visit', width: 0.7 },
  { header: 'Vet Name', key: 'vet_name', width: 1 },
  { header: 'Administered By', key: 'administered_by', width: 1.2 },
  { header: 'Health Issue', key: 'health_issue', width: 1 },
  { header: 'Notes', key: 'notes', width: 1.5 },
]

async function getTreatmentHistoryData(from, to) {
  const treatments = await db('treatments as t')
    .join('cows as c', 't.cow_id', 'c.id')
    .join('users as u', 't.administered_by', 'u.id')
    .whereNull('c.deleted_at')
    .where('t.treatment_date', '>=', from)
    .where('t.treatment_date', '<=', `${to} 23:59:59`)
    .select(
      't.id', 't.treatment_date', 't.dosage', 't.cost',
      't.is_vet_visit', 't.vet_name', 't.notes', 't.health_issue_id',
      'c.tag_number', 'c.name as cow_name',
      'u.full_name as administered_by_name',
    )
    .orderBy('t.treatment_date', 'asc')

  if (!treatments.length) {
    return { rows: [], summaryRow: { tag_number: 'TOTAL', medications: '0 treatments', cost: 'R 0.00', vet_visit: '0 visits' } }
  }

  const medsMap = await batchMedications(treatments.map((t) => t.id))

  const issueIds = treatments.map((t) => t.health_issue_id).filter(Boolean)
  const issueMap = {}
  if (issueIds.length) {
    const issueTypeMap = await getIssueTypeMap()
    const issues = await db('health_issues').whereIn('id', issueIds).select('id', 'issue_types')
    for (const issue of issues) {
      const codes = parseJsonColumn(issue.issue_types)
      issueMap[issue.id] = codes.map((c) => issueTypeMap[c] || c).join(', ')
    }
  }

  let totalCost = 0
  let vetVisits = 0

  const rows = treatments.map((t) => {
    const meds = medsMap[t.id] || []
    const cost = Number(t.cost) || 0
    totalCost += cost
    if (t.is_vet_visit) vetVisits++

    return {
      tag_number: t.tag_number,
      cow_name: t.cow_name || '—',
      treatment_date: formatDate(t.treatment_date),
      medications: meds.map((m) => m.name).join(', ') || '—',
      active_ingredients: meds.map((m) => m.active_ingredient).filter(Boolean).join(', ') || '—',
      dosage: meds.map((m) => m.dosage).filter(Boolean).join(', ') || t.dosage || '—',
      cost: cost ? `R ${cost.toFixed(2)}` : '—',
      vet_visit: t.is_vet_visit ? 'Yes' : 'No',
      vet_name: t.vet_name || '—',
      administered_by: t.administered_by_name,
      health_issue: t.health_issue_id ? (issueMap[t.health_issue_id] || '—') : '—',
      notes: t.notes || '—',
    }
  })

  return {
    rows,
    summaryRow: {
      tag_number: 'TOTAL',
      medications: `${treatments.length} treatments`,
      cost: `R ${totalCost.toFixed(2)}`,
      vet_visit: `${vetVisits} visits`,
    },
  }
}

router.get('/treatment-history', (req, res, next) =>
  generateReport(req, res, next, {
    title: 'Treatment History Report',
    sheetName: 'Treatment History',
    slug: 'treatment-history',
    columns: treatmentHistoryColumns,
    getData: getTreatmentHistoryData,
  }),
)

// ── 3. Discarded Milk ───────────────────────────────────────

const discardedMilkColumns = [
  { header: 'Date', key: 'date', width: 1.2 },
  { header: 'Session', key: 'session', width: 0.8 },
  { header: 'Tag #', key: 'tag_number', width: 1 },
  { header: 'Cow Name', key: 'cow_name', width: 1.2 },
  { header: 'Litres', key: 'litres', width: 0.8 },
  { header: 'Reason', key: 'reason', width: 1.5 },
  { header: 'Recorded By', key: 'recorded_by', width: 1.2 },
  { header: 'Time', key: 'time', width: 0.7 },
  { header: 'Notes', key: 'notes', width: 2 },
]

async function getDiscardedMilkData(from, to) {
  const records = await db('milk_records as mr')
    .join('cows as c', 'mr.cow_id', 'c.id')
    .join('users as u', 'mr.recorded_by', 'u.id')
    .whereNull('c.deleted_at')
    .where('mr.milk_discarded', true)
    .where('mr.recording_date', '>=', from)
    .where('mr.recording_date', '<=', to)
    .select(
      'mr.recording_date', 'mr.session', 'mr.session_time', 'mr.litres',
      'mr.discard_reason', 'mr.notes',
      'c.tag_number', 'c.name as cow_name',
      'u.full_name as recorded_by_name',
    )
    .orderBy([{ column: 'mr.recording_date', order: 'asc' }, { column: 'mr.session' }])

  let totalLitres = 0
  const rows = records.map((r) => {
    const litres = Number(r.litres) || 0
    totalLitres += litres
    return {
      date: formatDate(r.recording_date),
      session: r.session,
      tag_number: r.tag_number,
      cow_name: r.cow_name || '—',
      litres: litres.toFixed(2),
      reason: r.discard_reason || '—',
      recorded_by: r.recorded_by_name,
      time: r.session_time || '—',
      notes: r.notes || '—',
    }
  })

  return {
    rows,
    summaryRow: { date: 'TOTAL', litres: totalLitres.toFixed(2), reason: `${records.length} records` },
  }
}

router.get('/discarded-milk', (req, res, next) =>
  generateReport(req, res, next, {
    title: 'Discarded Milk Report',
    sheetName: 'Discarded Milk',
    slug: 'discarded-milk',
    columns: discardedMilkColumns,
    getData: getDiscardedMilkData,
  }),
)

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
  // Get treatments in range
  const treatments = await db('treatments as t')
    .join('cows as c', 't.cow_id', 'c.id')
    .whereNull('c.deleted_at')
    .where('t.treatment_date', '>=', from)
    .where('t.treatment_date', '<=', `${to} 23:59:59`)
    .select('t.id', 't.cost')

  const treatmentIds = treatments.map((t) => t.id)
  const costMap = Object.fromEntries(treatments.map((t) => [t.id, Number(t.cost) || 0]))

  // Get medications from both sources (primary + junction table)
  const medsMap = await batchMedications(treatmentIds)

  // Group by medication name, splitting treatment cost evenly across its medications
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

router.get('/medication-usage', (req, res, next) =>
  generateReport(req, res, next, {
    title: 'Medication Usage Report',
    sheetName: 'Medication Usage',
    slug: 'medication-usage',
    columns: medicationUsageColumns,
    getData: getMedicationUsageData,
  }),
)

// ── 5. Milk Production ──────────────────────────────────────

const milkProductionColumns = [
  { header: 'Tag #', key: 'tag_number', width: 1 },
  { header: 'Cow Name', key: 'cow_name', width: 1.5 },
  { header: 'Total Litres', key: 'total_litres', width: 1.2 },
  { header: 'Days Recorded', key: 'days_recorded', width: 1.2 },
  { header: 'Avg Daily Litres', key: 'avg_daily', width: 1.3 },
  { header: 'Morning Avg', key: 'morning_avg', width: 1 },
  { header: 'Afternoon Avg', key: 'afternoon_avg', width: 1 },
  { header: 'Evening Avg', key: 'evening_avg', width: 1 },
]

async function getMilkProductionData(from, to) {
  const records = await db('milk_records as mr')
    .join('cows as c', 'mr.cow_id', 'c.id')
    .whereNull('c.deleted_at')
    .where('mr.recording_date', '>=', from)
    .where('mr.recording_date', '<=', to)
    .select('mr.cow_id', 'mr.recording_date', 'mr.session', 'mr.litres', 'c.tag_number', 'c.name as cow_name')
    .orderBy('c.tag_number')

  const grouped = {}
  let herdTotal = 0
  const allDates = new Set()
  const herdSession = { morning: { sum: 0, count: 0 }, afternoon: { sum: 0, count: 0 }, evening: { sum: 0, count: 0 } }

  for (const r of records) {
    const entry = grouped[r.cow_id] ??= {
      tag_number: r.tag_number, cow_name: r.cow_name || '—',
      total: 0, dates: new Set(),
      morning: { sum: 0, count: 0 }, afternoon: { sum: 0, count: 0 }, evening: { sum: 0, count: 0 },
    }
    const litres = Number(r.litres) || 0
    entry.total += litres
    entry.dates.add(r.recording_date)
    allDates.add(r.recording_date)
    if (entry[r.session]) {
      entry[r.session].sum += litres
      entry[r.session].count++
    }
    if (herdSession[r.session]) {
      herdSession[r.session].sum += litres
      herdSession[r.session].count++
    }
    herdTotal += litres
  }

  const cowList = Object.values(grouped).sort((a, b) => b.total - a.total)
  const rows = cowList.map((g) => {
    const days = g.dates.size
    const sessionAvg = (s) => s.count ? (s.sum / s.count).toFixed(2) : '—'
    return {
      tag_number: g.tag_number,
      cow_name: g.cow_name,
      total_litres: g.total.toFixed(2),
      days_recorded: days,
      avg_daily: days ? (g.total / days).toFixed(2) : '—',
      morning_avg: sessionAvg(g.morning),
      afternoon_avg: sessionAvg(g.afternoon),
      evening_avg: sessionAvg(g.evening),
    }
  })

  // Average of each cow's avg daily litres (what a typical cow produces per day)
  let avgDailySum = 0
  let avgDailyCount = 0
  for (const g of cowList) {
    const days = g.dates.size
    if (days) { avgDailySum += g.total / days; avgDailyCount++ }
  }
  const herdAvgDaily = avgDailyCount ? (avgDailySum / avgDailyCount).toFixed(2) : '0.00'
  const sessionTotalAvg = (s) => s.count ? (s.sum / s.count).toFixed(2) : '—'

  return {
    rows,
    summaryRow: {
      tag_number: 'TOTAL',
      total_litres: herdTotal.toFixed(2),
      days_recorded: `${cowList.length} cows`,
      avg_daily: herdAvgDaily,
      morning_avg: sessionTotalAvg(herdSession.morning),
      afternoon_avg: sessionTotalAvg(herdSession.afternoon),
      evening_avg: sessionTotalAvg(herdSession.evening),
    },
  }
}

router.get('/milk-production', (req, res, next) =>
  generateReport(req, res, next, {
    title: 'Milk Production Report',
    sheetName: 'Milk Production',
    slug: 'milk-production',
    columns: milkProductionColumns,
    getData: getMilkProductionData,
  }),
)

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

router.get('/breeding', (req, res, next) =>
  generateReport(req, res, next, {
    title: 'Breeding & Reproduction Report',
    sheetName: 'Breeding',
    slug: 'breeding',
    columns: breedingColumns,
    getData: getBreedingData,
  }),
)

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

  const MS_PER_DAY = 86400000

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

router.get('/herd-health', (req, res, next) =>
  generateReport(req, res, next, {
    title: 'Herd Health Summary Report',
    sheetName: 'Herd Health',
    slug: 'herd-health',
    columns: herdHealthColumns,
    getData: getHerdHealthData,
  }),
)

module.exports = router
