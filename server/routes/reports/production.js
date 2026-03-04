const express = require('express')
const db = require('../../config/database')
const { formatDate } = require('../../services/reportService')

const router = express.Router()

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

router.get('/discarded-milk', (req, res, next) => {
  const { generateReport } = require('./index')
  generateReport(req, res, next, {
    title: 'Discarded Milk Report',
    sheetName: 'Discarded Milk',
    slug: 'discarded-milk',
    columns: discardedMilkColumns,
    getData: getDiscardedMilkData,
  })
})

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

router.get('/milk-production', (req, res, next) => {
  const { generateReport } = require('./index')
  generateReport(req, res, next, {
    title: 'Milk Production Report',
    sheetName: 'Milk Production',
    slug: 'milk-production',
    columns: milkProductionColumns,
    getData: getMilkProductionData,
  })
})

module.exports = router
