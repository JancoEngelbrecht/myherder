const express = require('express')
const fs = require('fs')
const { execFile } = require('child_process')
const { promisify } = require('util')
const db = require('../config/database')
const { isProduction } = require('../config/env')
const { getStats } = require('../helpers/requestStats')
const authenticate = require('../middleware/auth')
const requireSuperAdmin = require('../middleware/requireSuperAdmin')

const execFileAsync = promisify(execFile)

const router = express.Router()
router.use(authenticate)
router.use(requireSuperAdmin)

// ── Helpers ──────────────────────────────────────────────────

function getMemory() {
  const mem = process.memoryUsage()
  const toMb = (bytes) => Math.round((bytes / 1024 / 1024) * 10) / 10
  return {
    rss_mb: toMb(mem.rss),
    heap_used_mb: toMb(mem.heapUsed),
    heap_total_mb: toMb(mem.heapTotal),
  }
}

function getMemoryStatus(rssMb) {
  if (rssMb > 1024) return 'red'
  if (rssMb > 512) return 'yellow'
  return 'green'
}

async function getDisk() {
  // df --output= is GNU coreutils only (Linux); macOS BSD df uses different flags
  if (process.platform !== 'linux') return null

  try {
    const { stdout } = await execFileAsync('df', ['-BM', '--output=size,used,avail,pcent', '/'], {
      timeout: 2000,
    })
    const lines = stdout.trim().split('\n')
    if (lines.length < 2) return null
    const parts = lines[1].trim().split(/\s+/)
    if (parts.length < 4) return null
    return {
      total_gb: Math.round((parseInt(parts[0], 10) / 1024) * 100) / 100,
      used_gb: Math.round((parseInt(parts[1], 10) / 1024) * 100) / 100,
      available_gb: Math.round((parseInt(parts[2], 10) / 1024) * 100) / 100,
      used_pct: parseInt(parts[3].replace('%', ''), 10),
    }
  } catch {
    return null
  }
}

function getDiskStatus(disk) {
  if (!disk) return 'unknown'
  if (disk.used_pct > 85) return 'red'
  if (disk.used_pct > 70) return 'yellow'
  return 'green'
}

async function getDbSize() {
  // Use environment to determine DB type — avoids accessing Knex internals
  if (!isProduction) {
    // SQLite in dev/test
    try {
      const config = require('../../knexfile')
      const env = process.env.NODE_ENV || 'development'
      const filename = config[env]?.connection?.filename
      if (!filename || filename === ':memory:') {
        return { size_mb: 0, tables: [] }
      }
      const stat = fs.statSync(filename)
      const sizeMb = Math.round((stat.size / 1024 / 1024) * 100) / 100
      return { size_mb: sizeMb, tables: [] }
    } catch {
      return null
    }
  }

  // MySQL in production — query information_schema
  try {
    const dbName = process.env.DB_NAME
    if (!dbName) return null
    const result = await db.raw(
      `SELECT table_name, table_rows, ROUND(data_length / 1024 / 1024, 2) AS size_mb
       FROM information_schema.TABLES
       WHERE table_schema = ?
       ORDER BY data_length DESC
       LIMIT 100`,
      [dbName]
    )
    // MySQL2 db.raw() returns [rows, fields] — destructure safely
    const [tableRows] = result
    const tables = tableRows.map((r) => ({
      name: r.table_name || r.TABLE_NAME,
      rows: Number(r.table_rows || r.TABLE_ROWS || 0),
      size_mb: Number(r.size_mb || r.SIZE_MB || 0),
    }))
    const totalMb = tables.reduce((sum, t) => sum + t.size_mb, 0)
    return {
      size_mb: Math.round(totalMb * 100) / 100,
      tables,
    }
  } catch {
    return null
  }
}

function getResponseStatus(avgMs) {
  if (avgMs > 500) return 'red'
  if (avgMs > 200) return 'yellow'
  return 'green'
}

function getErrorStatus(errorRatePct) {
  if (errorRatePct > 5) return 'red'
  if (errorRatePct > 1) return 'yellow'
  return 'green'
}

// ── Routes ──────────────────────────────────────────────────

// GET /api/system/health — operational metrics snapshot
router.get('/health', async (_req, res, next) => {
  try {
    const memory = getMemory()
    const [disk, database] = await Promise.all([getDisk(), getDbSize()])
    const requests = getStats()

    const thresholds = {
      memory_status: getMemoryStatus(memory.rss_mb),
      disk_status: getDiskStatus(disk),
      response_status: getResponseStatus(requests.avg_response_ms),
      error_status: getErrorStatus(requests.error_rate_5xx_pct),
    }

    res.json({
      node_version: process.version,
      uptime_seconds: Math.floor(process.uptime()),
      memory,
      disk,
      database,
      requests,
      thresholds,
    })
  } catch (err) {
    next(err)
  }
})

module.exports = router
