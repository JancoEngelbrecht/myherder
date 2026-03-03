const express = require('express')
const { randomUUID: uuidv4 } = require('crypto')
const Joi = require('joi')
const bcrypt = require('bcryptjs')
const db = require('../config/database')
const authenticate = require('../middleware/auth')
const { requireAdmin } = require('../middleware/authorize')
const { logAudit } = require('../services/auditService')

const router = express.Router()
router.use(authenticate)
router.use(requireAdmin)

// ── Validation ───────────────────────────────────────────────

const BCRYPT_ROUNDS = 12

const ALL_PERMISSIONS = [
  'can_manage_cows',
  'can_log_issues',
  'can_log_treatments',
  'can_log_breeding',
  'can_record_milk',
  'can_view_analytics',
  'can_manage_users',
  'can_manage_medications',
]

const createSchema = Joi.object({
  username: Joi.string().max(50).required(),
  full_name: Joi.string().max(100).required(),
  role: Joi.string().valid('admin', 'worker').required(),
  language: Joi.string().valid('en', 'af').default('en'),
  permissions: Joi.array().items(Joi.string().valid(...ALL_PERMISSIONS)).default([]),
  password: Joi.string().min(6).max(128).when('role', {
    is: 'admin',
    then: Joi.required(),
    otherwise: Joi.forbidden(),
  }),
  pin: Joi.string().pattern(/^\d{4}$/).when('role', {
    is: 'worker',
    then: Joi.required(),
    otherwise: Joi.forbidden(),
  }),
})

const updateSchema = Joi.object({
  username: Joi.string().max(50),
  full_name: Joi.string().max(100),
  role: Joi.string().valid('admin', 'worker'),
  language: Joi.string().valid('en', 'af'),
  permissions: Joi.array().items(Joi.string().valid(...ALL_PERMISSIONS)),
  password: Joi.string().min(6).max(128),
  pin: Joi.string().pattern(/^\d{4}$/),
  is_active: Joi.boolean(),
}).min(1)

// ── Helpers ──────────────────────────────────────────────────

function sanitizeUser(row) {
  if (!row) return null
  const { password_hash: _pw, pin_hash: _pin, ...rest } = row
  let permissions = rest.permissions
  if (typeof permissions === 'string') {
    try { permissions = JSON.parse(permissions) } catch { permissions = [] }
  }
  return { ...rest, permissions }
}

// ── Routes ───────────────────────────────────────────────────

// GET /api/users — list all users; ?active=0|1 filter; excludes soft-deleted
router.get('/', async (req, res, next) => {
  try {
    const query = db('users').whereNull('deleted_at').orderBy('full_name')

    if (req.query.active_only === '1' || req.query.active === '1') {
      query.where({ is_active: true })
    } else if (req.query.active === '0') {
      query.where({ is_active: false })
    }

    const rows = await query
    res.json(rows.map(sanitizeUser))
  } catch (err) {
    next(err)
  }
})

// GET /api/users/:id — single user detail
router.get('/:id', async (req, res, next) => {
  try {
    const row = await db('users').where({ id: req.params.id }).first()
    if (!row) return res.status(404).json({ error: 'User not found' })
    res.json(sanitizeUser(row))
  } catch (err) {
    next(err)
  }
})

// POST /api/users — create user
router.post('/', async (req, res, next) => {
  try {
    const { error, value } = createSchema.validate(req.body)
    if (error) return res.status(400).json({ error: error.details[0].message.replace(/['"]/g, '') })

    // Check username uniqueness (ignore soft-deleted users)
    const existing = await db('users').where({ username: value.username }).whereNull('deleted_at').first()
    if (existing) return res.status(409).json({ error: 'Username already exists' })

    const id = uuidv4()
    const now = new Date().toISOString()

    const record = {
      id,
      username: value.username,
      full_name: value.full_name,
      role: value.role,
      language: value.language,
      permissions: JSON.stringify(value.role === 'admin' ? ALL_PERMISSIONS : value.permissions),
      is_active: true,
      failed_attempts: 0,
      created_at: now,
      updated_at: now,
    }

    if (value.password) {
      record.password_hash = await bcrypt.hash(value.password, BCRYPT_ROUNDS)
    }
    if (value.pin) {
      record.pin_hash = await bcrypt.hash(value.pin, BCRYPT_ROUNDS)
    }

    await db('users').insert(record)
    const created = await db('users').where({ id }).first()
    const sanitized = sanitizeUser(created)
    logAudit({ userId: req.user.id, action: 'create', entityType: 'user', entityId: id, newValues: sanitized })
    res.status(201).json(sanitized)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/users/:id — update user
router.patch('/:id', async (req, res, next) => {
  try {
    const row = await db('users').where({ id: req.params.id }).first()
    if (!row) return res.status(404).json({ error: 'User not found' })

    const { error, value } = updateSchema.validate(req.body)
    if (error) return res.status(400).json({ error: error.details[0].message.replace(/['"]/g, '') })

    // Block changing own role
    if (value.role && req.params.id === req.user.id && value.role !== row.role) {
      return res.status(403).json({ error: 'Cannot change your own role' })
    }

    // Check username uniqueness if changing (ignore soft-deleted users)
    if (value.username && value.username !== row.username) {
      const existing = await db('users').where({ username: value.username }).whereNull('deleted_at').first()
      if (existing) return res.status(409).json({ error: 'Username already exists' })
    }

    const update = { updated_at: new Date().toISOString() }

    if (value.username !== undefined) update.username = value.username
    if (value.full_name !== undefined) update.full_name = value.full_name
    if (value.role !== undefined) update.role = value.role
    if (value.language !== undefined) update.language = value.language
    if (value.is_active !== undefined) update.is_active = value.is_active

    if (value.permissions !== undefined) {
      // Admin auto-gets all permissions
      const effectiveRole = value.role || row.role
      update.permissions = JSON.stringify(
        effectiveRole === 'admin' ? ALL_PERMISSIONS : value.permissions
      )
    }

    if (value.password) {
      update.password_hash = await bcrypt.hash(value.password, BCRYPT_ROUNDS)
    }
    if (value.pin) {
      update.pin_hash = await bcrypt.hash(value.pin, BCRYPT_ROUNDS)
    }

    const oldSanitized = sanitizeUser(row)
    await db('users').where({ id: req.params.id }).update(update)
    const updated = await db('users').where({ id: req.params.id }).first()
    const newSanitized = sanitizeUser(updated)
    logAudit({ userId: req.user.id, action: 'update', entityType: 'user', entityId: req.params.id, oldValues: oldSanitized, newValues: newSanitized })
    res.json(newSanitized)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/users/:id — soft deactivate (set is_active = false)
// DELETE /api/users/:id?permanent=true — soft delete (set deleted_at, row kept for FK integrity)
router.delete('/:id', async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(403).json({ error: 'Cannot delete your own account' })
    }

    const row = await db('users').where({ id: req.params.id }).first()
    if (!row) return res.status(404).json({ error: 'User not found' })

    if (req.query.permanent === 'true') {
      // Soft delete — mark deleted_at, deactivate, row stays for FK joins
      const now = new Date().toISOString()
      await db('users').where({ id: req.params.id }).update({
        deleted_at: now,
        is_active: false,
        updated_at: now,
      })

      logAudit({ userId: req.user.id, action: 'delete', entityType: 'user', entityId: req.params.id, oldValues: sanitizeUser(row) })
      return res.json({ message: 'User deleted' })
    }

    // Soft deactivate (toggle)
    await db('users').where({ id: req.params.id }).update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })

    logAudit({ userId: req.user.id, action: 'deactivate', entityType: 'user', entityId: req.params.id, oldValues: sanitizeUser(row) })
    res.json({ message: 'User deactivated' })
  } catch (err) {
    next(err)
  }
})

module.exports = router
