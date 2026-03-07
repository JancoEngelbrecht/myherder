const express = require('express')
const db = require('../../config/database')
const { formatDate } = require('../../services/reportService')
const { batchMedications, getIssueTypeMap, parseJsonColumn, MS_PER_DAY } = require('./helpers')

const router = express.Router()

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

router.get('/withdrawal-compliance', (req, res, next) => {
  const { generateReport } = require('./shared')
  generateReport(req, res, next, {
    title: 'Withdrawal Compliance Report',
    sheetName: 'Withdrawal Compliance',
    slug: 'withdrawal-compliance',
    columns: withdrawalColumns,
    getData: getWithdrawalData,
  })
})

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

router.get('/treatment-history', (req, res, next) => {
  const { generateReport } = require('./shared')
  generateReport(req, res, next, {
    title: 'Treatment History Report',
    sheetName: 'Treatment History',
    slug: 'treatment-history',
    columns: treatmentHistoryColumns,
    getData: getTreatmentHistoryData,
  })
})

module.exports = router
