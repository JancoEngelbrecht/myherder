const express = require('express')
const Joi = require('joi')
const rateLimit = require('express-rate-limit')
const authenticate = require('../middleware/auth')
const { processChange, pullData, logSync } = require('../services/syncService')
const { joiMsg } = require('../helpers/constants')

const router = express.Router()

const syncPushLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many sync pushes, please try again later' },
})

// ── Validation ──────────────────────────────────────────────────

const pushSchema = Joi.object({
  deviceId: Joi.string().uuid().required(),
  changes: Joi.array()
    .items(
      Joi.object({
        entityType: Joi.string()
          .valid(
            'cows',
            'medications',
            'treatments',
            'healthIssues',
            'milkRecords',
            'breedingEvents',
            'breedTypes',
            'issueTypes',
          )
          .required(),
        action: Joi.string().valid('create', 'update', 'delete').required(),
        id: Joi.string().uuid().required(),
        data: Joi.object().allow(null),
        updatedAt: Joi.string().isoDate().allow(null),
      }),
    )
    .min(1)
    .max(100)
    .required(),
})

const pullQuerySchema = Joi.object({
  since: Joi.string().isoDate().optional(),
  full: Joi.string().valid('1').optional(),
  deviceId: Joi.string().uuid().optional(),
})

// ── Routes ──────────────────────────────────────────────────────

// GET /api/sync/health — lightweight connectivity check (no auth)
router.get('/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() })
})

// POST /api/sync/push — push client changes to server
router.post('/push', syncPushLimiter, authenticate, async (req, res, next) => {
  try {
    const { error, value } = pushSchema.validate(req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    const { deviceId, changes } = value
    const results = []
    let errorCount = 0

    for (const change of changes) {
      const result = await processChange(
        change.entityType,
        change.action,
        change.id,
        change.data,
        change.updatedAt,
        req.user,
      )
      results.push(result)

      if (result.status === 'error') errorCount++
    }

    // Determine overall status
    let status = 'success'
    if (errorCount === changes.length) status = 'failed'
    else if (errorCount > 0) status = 'partial'

    try { await logSync(req.user.id, deviceId, 'push', changes.length, status) } catch (e) { console.error('[sync] logSync failed:', e.message) }

    res.json({ results })
  } catch (err) {
    next(err)
  }
})

// GET /api/sync/pull — pull server data to client
router.get('/pull', authenticate, async (req, res, next) => {
  try {
    const { error, value } = pullQuerySchema.validate(req.query)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    const data = await pullData(value.since, value.full === '1', req.user)

    // Count total records for logging
    const totalRecords = Object.entries(data)
      .filter(([key]) => key !== 'syncedAt' && key !== 'deleted')
      .reduce((sum, [, records]) => sum + (Array.isArray(records) ? records.length : 0), 0)

    const deviceId = value.deviceId || 'unknown'
    try { await logSync(req.user.id, deviceId, 'pull', totalRecords, 'success') } catch (e) { console.error('[sync] logSync failed:', e.message) }

    res.json(data)
  } catch (err) {
    next(err)
  }
})

module.exports = router
