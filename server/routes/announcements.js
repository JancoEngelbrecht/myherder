const express = require('express')
const { randomUUID: uuidv4 } = require('crypto')
const Joi = require('joi')
const db = require('../config/database')
const authenticate = require('../middleware/auth')
const requireSuperAdmin = require('../middleware/requireSuperAdmin')
const { joiMsg, validateBody } = require('../helpers/constants')
const { logAudit } = require('../services/auditService')

const router = express.Router()

// ── Validation ───────────────────────────────────────────────

const VALID_TYPES = ['info', 'warning', 'maintenance']

const createSchema = Joi.object({
  type: Joi.string().valid(...VALID_TYPES).default('info'),
  title: Joi.string().min(1).max(255).required(),
  message: Joi.string().max(2000).allow('', null),
  starts_at: Joi.string().isoDate().allow(null),
  expires_at: Joi.string().isoDate().allow(null),
})

const updateSchema = Joi.object({
  type: Joi.string().valid(...VALID_TYPES),
  title: Joi.string().min(1).max(255),
  message: Joi.string().max(2000).allow('', null),
  starts_at: Joi.string().isoDate().allow(null),
  expires_at: Joi.string().isoDate().allow(null),
  is_active: Joi.boolean().truthy(1).falsy(0),
}).min(1)

// ── Public routes (no auth) ──────────────────────────────────

// GET /api/announcements/active — active, non-expired announcements
// Must be BEFORE /:id routes
router.get('/active', async (_req, res, next) => {
  try {
    const now = db.fn.now()
    const rows = await db('system_announcements')
      .where('is_active', true)
      .where(function () {
        this.whereNull('starts_at').orWhere('starts_at', '<=', now)
      })
      .where(function () {
        this.whereNull('expires_at').orWhere('expires_at', '>', now)
      })
      .orderBy('created_at', 'desc')

    res.json(rows)
  } catch (err) {
    next(err)
  }
})

// ── Super-admin routes ──────────────────────────────────────

// GET /api/announcements — all announcements (admin view)
router.get('/', authenticate, requireSuperAdmin, async (_req, res, next) => {
  try {
    const rows = await db('system_announcements').orderBy('created_at', 'desc')
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

// POST /api/announcements — create
router.post('/', authenticate, requireSuperAdmin, async (req, res, next) => {
  try {
    const { error, value } = validateBody(createSchema, req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    const id = uuidv4()
    const now = new Date().toISOString()
    const record = {
      id,
      ...value,
      is_active: true,
      created_by: req.user.id,
      created_at: now,
      updated_at: now,
    }
    await db('system_announcements').insert(record)

    res.status(201).json(record)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/announcements/:id — update
router.patch('/:id', authenticate, requireSuperAdmin, async (req, res, next) => {
  try {
    const existing = await db('system_announcements').where('id', req.params.id).first()
    if (!existing) return res.status(404).json({ error: 'Announcement not found' })

    const { error, value } = validateBody(updateSchema, req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    await db('system_announcements')
      .where('id', existing.id)
      .update({ ...value, updated_at: new Date().toISOString() })

    const updated = await db('system_announcements').where('id', existing.id).first()
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/announcements/:id — soft deactivate
router.delete('/:id', authenticate, requireSuperAdmin, async (req, res, next) => {
  try {
    const existing = await db('system_announcements').where('id', req.params.id).first()
    if (!existing) return res.status(404).json({ error: 'Announcement not found' })

    await db('system_announcements')
      .where('id', existing.id)
      .update({ is_active: false, updated_at: new Date().toISOString() })

    const updated = await db('system_announcements').where('id', existing.id).first()
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// POST /api/announcements/:id/permanent — hard delete (inactive or expired)
// Uses POST instead of DELETE because cPanel Passenger/LiteSpeed strips sub-paths on DELETE requests
router.post('/:id/permanent', authenticate, requireSuperAdmin, async (req, res, next) => {
  try {
    const existing = await db('system_announcements').where('id', req.params.id).first()
    if (!existing) return res.status(404).json({ error: 'Announcement not found' })
    const isExpired = existing.expires_at && new Date(existing.expires_at) < new Date()
    if (existing.is_active && !isExpired) return res.status(400).json({ error: 'Deactivate announcement before deleting permanently' })

    await db.transaction(async (trx) => {
      await trx('announcement_dismissals').where('announcement_id', existing.id).del()
      await trx('system_announcements').where('id', existing.id).del()
    })

    await logAudit({ farmId: null, userId: req.user.id, action: 'delete', entityType: 'announcement', entityId: existing.id, oldValues: existing })

    res.json({ deleted: true })
  } catch (err) {
    next(err)
  }
})

// POST /api/announcements/:id/dismiss — user dismissal
router.post('/:id/dismiss', authenticate, async (req, res, next) => {
  try {
    const ann = await db('system_announcements').where('id', req.params.id).first()
    if (!ann) return res.status(404).json({ error: 'Announcement not found' })

    // Upsert dismissal (ignore if already dismissed)
    await db('announcement_dismissals')
      .insert({ announcement_id: ann.id, user_id: req.user.id, dismissed_at: new Date().toISOString() })
      .onConflict(['announcement_id', 'user_id'])
      .ignore()

    res.json({ dismissed: true })
  } catch (err) {
    next(err)
  }
})

module.exports = router
