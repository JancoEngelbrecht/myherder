const express = require('express')
const db = require('../config/database')
const authenticate = require('../middleware/auth')
const { requireAdmin } = require('../middleware/authorize')
const tenantScope = require('../middleware/tenantScope')

const router = express.Router()
router.use(authenticate)
router.use(requireAdmin)
router.use(tenantScope)

// ── Helpers ──────────────────────────────────────────────────

function sanitizeUsers(rows) {
  return rows.map(
    ({ password_hash: _pw, pin_hash: _pin, totp_secret: _ts, recovery_codes: _rc, ...rest }) => rest
  )
}

// ── Routes ───────────────────────────────────────────────────

// GET /api/export — admin only; full JSON dump of all tables
router.get('/', async (req, res, next) => {
  try {
    const [
      users,
      animals,
      healthIssues,
      treatments,
      medications,
      milkRecords,
      breedingEvents,
      breedTypes,
      issueTypes,
      appSettings,
      featureFlags,
    ] = await Promise.all([
      db('users').where('farm_id', req.farmId).select('*'),
      db('animals').where('farm_id', req.farmId).select('*'),
      db('health_issues').where('farm_id', req.farmId).select('*'),
      db('treatments').where('farm_id', req.farmId).select('*'),
      db('medications').where('farm_id', req.farmId).select('*'),
      db('milk_records').where('farm_id', req.farmId).select('*'),
      db('breeding_events').where('farm_id', req.farmId).select('*'),
      db('breed_types').where('farm_id', req.farmId).select('*'),
      db('issue_type_definitions').where('farm_id', req.farmId).select('*'),
      db('app_settings').where('farm_id', req.farmId).select('*'),
      db('feature_flags').where('farm_id', req.farmId).select('*'),
    ])

    const dateStr = new Date().toISOString().slice(0, 10)

    const tables = {
      users: sanitizeUsers(users),
      animals,
      health_issues: healthIssues,
      treatments,
      medications,
      milk_records: milkRecords,
      breeding_events: breedingEvents,
      breed_types: breedTypes,
      issue_types: issueTypes,
      app_settings: appSettings,
      feature_flags: featureFlags,
    }

    const _meta = {
      exportedAt: new Date().toISOString(),
      totalRecords: Object.values(tables).reduce(
        (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
        0
      ),
    }

    res.set('Content-Type', 'application/json')
    res.set('Content-Disposition', `attachment; filename="myherder-export-${dateStr}.json"`)

    res.json({ _meta, tables })
  } catch (err) {
    next(err)
  }
})

module.exports = router
