const express = require('express')
const Joi = require('joi')
const jwt = require('jsonwebtoken')
const db = require('../config/database')
const { jwtSecret } = require('../config/env')
const authenticate = require('../middleware/auth')
const { requireAdmin } = require('../middleware/authorize')
const tenantScope = require('../middleware/tenantScope')
const { logAudit } = require('../services/auditService')
const { joiMsg, validateBody } = require('../helpers/constants')

const router = express.Router()

// ── Validation ───────────────────────────────────────────────

const VALID_KEYS = ['farm_name', 'default_language', 'milk_price_per_litre']
const PUBLIC_KEYS = ['farm_name', 'default_language']

const patchSchema = Joi.object(
  Object.fromEntries(VALID_KEYS.map((k) => [k, Joi.string().max(255)]))
).min(1)

// ── Helpers ──────────────────────────────────────────────────

async function getSettingsObject(farmId) {
  const query = db('app_settings').select('key', 'value')
  if (farmId) query.where('farm_id', farmId)
  const rows = await query
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

// ── Routes ───────────────────────────────────────────────────

// GET /api/settings — public (no auth required, used on login page for farm name)
// Scoping priority: 1) JWT farm_id (authenticated users), 2) ?farm_code query param (login page)
router.get('/', async (req, res, next) => {
  try {
    let farmId = null

    // Try to extract farm_id from JWT if present (authenticated callers)
    const header = req.headers.authorization
    if (header && header.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(header.slice(7), jwtSecret)
        if (decoded.farm_id) farmId = decoded.farm_id
      } catch {
        // Invalid token — fall through to farm_code lookup
      }
    }

    // Fall back to farm_code query param (login page)
    if (!farmId && req.query.farm_code) {
      const farm = await db('farms')
        .where({ code: String(req.query.farm_code).toUpperCase(), is_active: true })
        .first()
      if (farm) farmId = farm.id
    }

    // No farm context — return empty settings (super-admin without farm, or unauthenticated without farm_code)
    if (!farmId) return res.json({})

    const keys = [...PUBLIC_KEYS, 'milk_price_per_litre']
    const settings = await getSettingsObject(farmId)
    const result = {}
    for (const k of keys) {
      if (k in settings) result[k] = settings[k]
    }
    res.json(result)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/settings — admin only; upserts settings
router.patch('/', authenticate, tenantScope, requireAdmin, async (req, res, next) => {
  try {
    const { error, value } = validateBody(patchSchema, req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    const oldSettings = await getSettingsObject(req.farmId)
    const now = new Date().toISOString()

    await db.transaction(async (trx) => {
      for (const [key, val] of Object.entries(value)) {
        const existing = await trx('app_settings').where({ key, farm_id: req.farmId }).first()
        if (existing) {
          await trx('app_settings')
            .where({ key, farm_id: req.farmId })
            .update({ value: val, updated_at: now })
        } else {
          await trx('app_settings').insert({
            key,
            value: val,
            farm_id: req.farmId,
            updated_at: now,
          })
        }
      }
    })

    const settings = await getSettingsObject(req.farmId)
    await logAudit({
      farmId: req.farmId,
      userId: req.user.id,
      action: 'update',
      entityType: 'setting',
      entityId: 'app_settings',
      oldValues: oldSettings,
      newValues: settings,
    })
    res.json(settings)
  } catch (err) {
    next(err)
  }
})

module.exports = router
