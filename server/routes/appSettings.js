const express = require('express')
const Joi = require('joi')
const db = require('../config/database')
const authenticate = require('../middleware/auth')
const { requireAdmin } = require('../middleware/authorize')
const { logAudit } = require('../services/auditService')

const router = express.Router()

// ── Validation ───────────────────────────────────────────────

const VALID_KEYS = ['farm_name', 'default_language', 'milk_price_per_litre']

const patchSchema = Joi.object(
  Object.fromEntries(VALID_KEYS.map((k) => [k, Joi.string().max(255)])),
).min(1)

// ── Helpers ──────────────────────────────────────────────────

async function getSettingsObject() {
  const rows = await db('app_settings').select('key', 'value')
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

// ── Routes ───────────────────────────────────────────────────

// GET /api/settings — public (no auth required, used on login page for farm name)
router.get('/', async (_req, res, next) => {
  try {
    const settings = await getSettingsObject()
    res.json(settings)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/settings — admin only; upserts settings
router.patch('/', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { error, value } = patchSchema.validate(req.body)
    if (error) return res.status(400).json({ error: error.details[0].message.replace(/['"]/g, '') })

    const oldSettings = await getSettingsObject()
    const now = new Date().toISOString()

    for (const [key, val] of Object.entries(value)) {
      const existing = await db('app_settings').where({ key }).first()
      if (existing) {
        await db('app_settings').where({ key }).update({ value: val, updated_at: now })
      } else {
        await db('app_settings').insert({ key, value: val, updated_at: now })
      }
    }

    const settings = await getSettingsObject()
    logAudit({ userId: req.user.id, action: 'update', entityType: 'setting', entityId: 'app_settings', oldValues: oldSettings, newValues: settings })
    res.json(settings)
  } catch (err) {
    next(err)
  }
})

module.exports = router
