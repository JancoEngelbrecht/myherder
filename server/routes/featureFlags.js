const express = require('express')
const Joi = require('joi')
const db = require('../config/database')
const authenticate = require('../middleware/auth')
const { requireAdmin } = require('../middleware/authorize')
const { joiMsg } = require('../helpers/constants')

const router = express.Router()
router.use(authenticate)

// ── Validation ───────────────────────────────────────────────────────────────

const updateSchema = Joi.object({
  breeding: Joi.boolean(),
  milkRecording: Joi.boolean(),
  healthIssues: Joi.boolean(),
  treatments: Joi.boolean(),
  analytics: Joi.boolean(),
}).min(1)

// ── Helpers ──────────────────────────────────────────────────────────────────

// DB key (snake_case) ↔ API key (camelCase) mapping
const KEY_MAP = {
  breeding: 'breeding',
  milk_recording: 'milkRecording',
  health_issues: 'healthIssues',
  treatments: 'treatments',
  analytics: 'analytics',
}
const REVERSE_MAP = Object.fromEntries(
  Object.entries(KEY_MAP).map(([db, api]) => [api, db]),
)

async function getAllFlags() {
  const rows = await db('feature_flags').select('key', 'enabled')
  const flags = {}
  for (const row of rows) {
    const apiKey = KEY_MAP[row.key]
    if (apiKey) flags[apiKey] = !!row.enabled
  }
  return flags
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /api/feature-flags — any authenticated user
router.get('/', async (_req, res, next) => {
  try {
    const flags = await getAllFlags()
    res.json(flags)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/feature-flags — admin only
router.patch('/', requireAdmin, async (req, res, next) => {
  try {
    const { error, value } = updateSchema.validate(req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    const now = new Date().toISOString()
    await db.transaction(async (trx) => {
      await Promise.all(Object.entries(value).map(([apiKey, enabled]) => {
        const dbKey = REVERSE_MAP[apiKey]
        if (dbKey) {
          return trx('feature_flags').where({ key: dbKey }).update({ enabled, updated_at: now })
        }
      }))
    })

    const flags = await getAllFlags()
    res.json(flags)
  } catch (err) {
    next(err)
  }
})

module.exports = router
