const express = require('express')
const db = require('../../config/database')
const { formatDate } = require('../../services/reportService')
const { generateReport } = require('./shared')

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
  const endTs = to + 'T23:59:59'

  // Per-cow aggregation via SQL — avoids loading all raw records into memory
  const cowRows = await db('milk_records as mr')
    .join('cows as c', 'mr.cow_id', 'c.id')
    .whereBetween('mr.recording_date', [from, endTs])
    .whereNull('c.deleted_at')
    .select(
      'mr.cow_id',
      'c.tag_number',
      'c.name as cow_name',
      db.raw('SUM(mr.litres) as total_litres'),
      db.raw('COUNT(DISTINCT mr.recording_date) as days_recorded'),
      db.raw("SUM(CASE WHEN mr.session = 'morning' THEN mr.litres ELSE 0 END) as morning_total"),
      db.raw("SUM(CASE WHEN mr.session = 'morning' THEN 1 ELSE 0 END) as morning_count"),
      db.raw("SUM(CASE WHEN mr.session = 'afternoon' THEN mr.litres ELSE 0 END) as afternoon_total"),
      db.raw("SUM(CASE WHEN mr.session = 'afternoon' THEN 1 ELSE 0 END) as afternoon_count"),
      db.raw("SUM(CASE WHEN mr.session = 'evening' THEN mr.litres ELSE 0 END) as evening_total"),
      db.raw("SUM(CASE WHEN mr.session = 'evening' THEN 1 ELSE 0 END) as evening_count"),
    )
    .groupBy('mr.cow_id')
    .orderBy('total_litres', 'desc')

  const sessionAvg = (total, count) =>
    Number(count) > 0 ? (Number(total) / Number(count)).toFixed(2) : '—'

  const rows = cowRows.map((r) => {
    const totalLitres = Number(r.total_litres) || 0
    const daysRecorded = Number(r.days_recorded) || 0
    return {
      tag_number: r.tag_number,
      cow_name: r.cow_name || '—',
      total_litres: totalLitres.toFixed(2),
      days_recorded: daysRecorded,
      avg_daily: daysRecorded > 0 ? (totalLitres / daysRecorded).toFixed(2) : '—',
      morning_avg: sessionAvg(r.morning_total, r.morning_count),
      afternoon_avg: sessionAvg(r.afternoon_total, r.afternoon_count),
      evening_avg: sessionAvg(r.evening_total, r.evening_count),
    }
  })

  // Herd summary: total litres, mean of per-cow avg daily (same semantics as original)
  let herdTotal = 0
  let avgDailySum = 0
  let avgDailyCount = 0
  for (const r of cowRows) {
    const totalLitres = Number(r.total_litres) || 0
    const daysRecorded = Number(r.days_recorded) || 0
    herdTotal += totalLitres
    if (daysRecorded > 0) { avgDailySum += totalLitres / daysRecorded; avgDailyCount++ }
  }
  const herdAvgDaily = avgDailyCount > 0 ? (avgDailySum / avgDailyCount).toFixed(2) : '0.00'

  // Session herd averages: avg litres per record across all cows (matches original sum/count)
  const herdMorningTotal = cowRows.reduce((s, r) => s + Number(r.morning_total), 0)
  const herdMorningCount = cowRows.reduce((s, r) => s + Number(r.morning_count), 0)
  const herdAfternoonTotal = cowRows.reduce((s, r) => s + Number(r.afternoon_total), 0)
  const herdAfternoonCount = cowRows.reduce((s, r) => s + Number(r.afternoon_count), 0)
  const herdEveningTotal = cowRows.reduce((s, r) => s + Number(r.evening_total), 0)
  const herdEveningCount = cowRows.reduce((s, r) => s + Number(r.evening_count), 0)

  return {
    rows,
    summaryRow: {
      tag_number: 'TOTAL',
      total_litres: herdTotal.toFixed(2),
      days_recorded: `${cowRows.length} cows`,
      avg_daily: herdAvgDaily,
      morning_avg: sessionAvg(herdMorningTotal, herdMorningCount),
      afternoon_avg: sessionAvg(herdAfternoonTotal, herdAfternoonCount),
      evening_avg: sessionAvg(herdEveningTotal, herdEveningCount),
    },
  }
}

router.get('/milk-production', (req, res, next) => {
  generateReport(req, res, next, {
    title: 'Milk Production Report',
    sheetName: 'Milk Production',
    slug: 'milk-production',
    columns: milkProductionColumns,
    getData: getMilkProductionData,
  })
})

module.exports = router
