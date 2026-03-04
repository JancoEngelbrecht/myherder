const express = require('express')
const db = require('../config/database')
const authenticate = require('../middleware/auth')
const { requireAdmin } = require('../middleware/authorize')

const router = express.Router()
router.use(authenticate)
router.use(requireAdmin)

// ── Helpers ──────────────────────────────────────────────────

function sanitizeUsers(rows) {
  return rows.map(({ password_hash: _pw, pin_hash: _pin, ...rest }) => rest)
}

// ── Routes ───────────────────────────────────────────────────

// GET /api/export — admin only; full JSON dump of all tables
router.get('/', async (_req, res, next) => {
  try {
    const [
      users,
      cows,
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
      db('users').select('*'),
      db('cows').select('*'),
      db('health_issues').select('*'),
      db('treatments').select('*'),
      db('medications').select('*'),
      db('milk_records').select('*'),
      db('breeding_events').select('*'),
      db('breed_types').select('*'),
      db('issue_type_definitions').select('*'),
      db('app_settings').select('*'),
      db('feature_flags').select('*'),
    ])

    const dateStr = new Date().toISOString().slice(0, 10)

    const tables = {
      users: sanitizeUsers(users),
      cows,
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
      totalRecords: Object.values(tables).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0),
    }

    res.set('Content-Type', 'application/json')
    res.set('Content-Disposition', `attachment; filename="myherder-export-${dateStr}.json"`)

    res.json({ _meta, tables })
  } catch (err) {
    next(err)
  }
})

module.exports = router
