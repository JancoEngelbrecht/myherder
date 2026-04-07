const express = require('express')
const Joi = require('joi')
const rateLimit = require('express-rate-limit')
const authenticate = require('../middleware/auth')
const tenantScope = require('../middleware/tenantScope')
const db = require('../config/database')
const { processChange, pullData, logSync } = require('../services/syncService')
const { joiMsg, validateBody, validateQuery } = require('../helpers/constants')

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
            'animals',
            'cows', // backward compat alias — accept for 1 release cycle
            'medications',
            'treatments',
            'healthIssues',
            'milkRecords',
            'breedingEvents',
            'breedTypes',
            'issueTypes'
          )
          .required(),
        action: Joi.string().valid('create', 'update', 'delete').required(),
        id: Joi.string().uuid().required(),
        data: Joi.object().allow(null),
        updatedAt: Joi.string().isoDate().allow(null),
      })
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
router.post('/push', syncPushLimiter, authenticate, tenantScope, async (req, res, next) => {
  try {
    const { error, value } = validateBody(pushSchema, req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    const { deviceId, changes } = value

    // Transaction ensures partial writes are rolled back if an uncaught error
    // crashes the loop. Individual item errors (permissions, conflicts, not-found)
    // are caught by processChange and do NOT cause rollback — partial success is by design.
    const results = await db.transaction(async (trx) => {
      const batchResults = []
      for (const change of changes) {
        const result = await processChange(
          change.entityType,
          change.action,
          change.id,
          change.data,
          change.updatedAt,
          req.user,
          trx
        )
        batchResults.push(result)
      }
      return batchResults
    })

    // Determine overall status
    const errorCount = results.filter((r) => r.status === 'error').length
    let status = 'success'
    if (errorCount === changes.length) status = 'failed'
    else if (errorCount > 0) status = 'partial'

    try {
      await logSync(req.user.id, deviceId, 'push', changes.length, status, null, req.farmId)
    } catch (e) {
      console.error('[sync] logSync failed:', e.message)
    }

    res.json({ results })
  } catch (err) {
    next(err)
  }
})

// GET /api/sync/pull — pull server data to client
router.get('/pull', authenticate, tenantScope, async (req, res, next) => {
  try {
    const { error, value } = validateQuery(pullQuerySchema, req.query)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    const data = await pullData(value.since, value.full === '1', req.farmId, req.user)

    // Count total records for logging
    const totalRecords = Object.entries(data)
      .filter(([key]) => key !== 'syncedAt' && key !== 'deleted')
      .reduce((sum, [, records]) => sum + (Array.isArray(records) ? records.length : 0), 0)

    const deviceId = value.deviceId || 'unknown'
    try {
      await logSync(req.user.id, deviceId, 'pull', totalRecords, 'success', null, req.farmId)
    } catch (e) {
      console.error('[sync] logSync failed:', e.message)
    }

    res.json(data)
  } catch (err) {
    next(err)
  }
})

module.exports = router
