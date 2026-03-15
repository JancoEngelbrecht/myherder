const express = require('express')
const db = require('../../config/database')
const { formatDate } = require('../../services/reportService')
const { batchMedications, getIssueTypeMap, parseJsonColumn } = require('./helpers')
const { generateReport } = require('./shared')

const router = express.Router()

// ── 1. Treatment History ────────────────────────────────────

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

async function getTreatmentHistoryData(from, to, farmId) {
  const treatments = await db('treatments as t')
    .join('cows as c', 't.cow_id', 'c.id')
    .join('users as u', 't.administered_by', 'u.id')
    .where('t.farm_id', farmId)
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

  const medsMap = await batchMedications(treatments.map((t) => t.id), farmId)

  const issueIds = treatments.map((t) => t.health_issue_id).filter(Boolean)
  const issueMap = {}
  if (issueIds.length) {
    const issueTypeMap = await getIssueTypeMap(farmId)
    const issues = await db('health_issues').where('farm_id', farmId).whereIn('id', issueIds).select('id', 'issue_types')
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
  generateReport(req, res, next, {
    title: 'Treatment History Report',
    sheetName: 'Treatment History',
    slug: 'treatment-history',
    columns: treatmentHistoryColumns,
    getData: getTreatmentHistoryData,
  })
})

module.exports = router
