// @ts-nocheck
const express = require('express')
const { randomUUID: uuidv4 } = require('crypto')
const Joi = require('joi')
const bcrypt = require('bcryptjs')
const db = require('../config/database')
const authenticate = require('../middleware/auth')
const { requireAdmin } = require('../middleware/authorize')
const tenantScope = require('../middleware/tenantScope')
const { logAudit } = require('../services/auditService')
const { joiMsg, validateBody, validateQuery } = require('../helpers/constants')

const router = express.Router()
router.use(authenticate)
router.use(tenantScope)
router.use(requireAdmin)

// ── Validation ───────────────────────────────────────────────

const BCRYPT_ROUNDS = 12

const ALL_PERMISSIONS = [
  'can_manage_animals',
  'can_manage_medications',
  'can_log_issues',
  'can_log_treatments',
  'can_log_breeding',
  'can_record_milk',
  'can_view_analytics',
]

const createSchema = Joi.object({
  username: Joi.string().max(50).required(),
  full_name: Joi.string().max(100).required(),
  role: Joi.string().valid('admin', 'worker').required(),
  language: Joi.string().valid('en', 'af').default('en'),
  permissions: Joi.array()
    .items(Joi.string().valid(...ALL_PERMISSIONS))
    .default([]),
  password: Joi.string().min(6).max(128).when('role', {
    is: 'admin',
    then: Joi.required(),
    otherwise: Joi.forbidden(),
  }),
  pin: Joi.string()
    .pattern(/^\d{4}$/)
    .when('role', {
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
  is_active: Joi.boolean().truthy(1).falsy(0),
}).min(1)

const usersQuerySchema = Joi.object({
  active_only: Joi.string().valid('0', '1'),
  active: Joi.string().valid('0', '1'),
})

// ── Helpers ──────────────────────────────────────────────────

// Super-admin can operate on users across farms; farm-scoped admin must match farm_id
function scopeToFarm(query, req) {
  if (req.user.role !== 'super_admin') query.where('users.farm_id', req.farmId)
  return query
}

function sanitizeUser(row) {
  if (!row) return null
  const { password_hash: _pw, pin_hash: _pin, totp_secret: _ts, recovery_codes: _rc, ...rest } = row
  let permissions = rest.permissions
  if (typeof permissions === 'string') {
    try {
      permissions = JSON.parse(permissions)
    } catch {
      permissions = []
    }
  }
  return { ...rest, permissions }
}

// ── Routes ───────────────────────────────────────────────────

// GET /api/users — list all users; ?active=0|1 filter; excludes soft-deleted
router.get('/', async (req, res, next) => {
  try {
    const { error: qError, value: qValue } = validateQuery(usersQuerySchema, req.query)
    if (qError) return res.status(400).json({ error: joiMsg(qError) })

    const query = scopeToFarm(db('users'), req).whereNull('deleted_at').orderBy('full_name')

    if (qValue.active_only === '1' || qValue.active === '1') {
      query.where({ is_active: true })
    } else if (qValue.active === '0') {
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
    const row = await scopeToFarm(db('users').where({ id: req.params.id }), req)
      .whereNull('deleted_at')
      .first()
    if (!row) return res.status(404).json({ error: 'User not found' })
    res.json(sanitizeUser(row))
  } catch (err) {
    next(err)
  }
})

// POST /api/users — create user (reactivates inactive user if username matches)
router.post('/', async (req, res, next) => {
  try {
    const { error, value } = validateBody(createSchema, req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    // Check username uniqueness within the same farm (include soft-deleted to avoid DB constraint clash)
    const existing = await scopeToFarm(db('users').where({ username: value.username }), req).first()

    // If username exists but is inactive or soft-deleted, reactivate + update instead of rejecting
    if (existing && (!existing.is_active || existing.deleted_at)) {
      const now = new Date().toISOString()
      const update = {
        full_name: value.full_name,
        role: value.role,
        language: value.language,
        permissions: JSON.stringify(value.role === 'admin' ? ALL_PERMISSIONS : value.permissions),
        is_active: 1,
        failed_attempts: 0,
        deleted_at: null,
        updated_at: now,
      }

      if (value.password) {
        update.password_hash = await bcrypt.hash(value.password, BCRYPT_ROUNDS)
      }
      if (value.pin) {
        update.pin_hash = await bcrypt.hash(value.pin, BCRYPT_ROUNDS)
      }

      const oldSanitized = sanitizeUser(existing)
      await scopeToFarm(db('users').where({ id: existing.id }), req).update(update)
      const updated = await scopeToFarm(db('users').where({ id: existing.id }), req).first()
      const newSanitized = sanitizeUser(updated)
      await logAudit({
        farmId: req.farmId,
        userId: req.user.id,
        action: 'reactivate',
        entityType: 'user',
        entityId: existing.id,
        oldValues: oldSanitized,
        newValues: newSanitized,
      })
      return res.status(200).json({ ...newSanitized, reactivated: true })
    }

    if (existing) return res.status(409).json({ error: 'Username already exists' })

    const id = uuidv4()
    const now = new Date().toISOString()

    const record = {
      id,
      farm_id: req.farmId,
      username: value.username,
      full_name: value.full_name,
      role: value.role,
      language: value.language,
      permissions: JSON.stringify(value.role === 'admin' ? ALL_PERMISSIONS : value.permissions),
      is_active: 1,
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
    const sanitized = sanitizeUser(record)
    await logAudit({
      farmId: req.farmId,
      userId: req.user.id,
      action: 'create',
      entityType: 'user',
      entityId: id,
      newValues: sanitized,
    })
    res.status(201).json(sanitized)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/users/:id — update user
router.patch('/:id', async (req, res, next) => {
  try {
    const row = await scopeToFarm(db('users').where({ id: req.params.id }), req)
      .whereNull('deleted_at')
      .first()
    if (!row) return res.status(404).json({ error: 'User not found' })

    const { error, value } = validateBody(updateSchema, req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    // Block changing own role
    if (value.role && req.params.id === req.user.id && value.role !== row.role) {
      return res.status(403).json({ error: 'Cannot change your own role' })
    }

    // Check username uniqueness within the same farm if changing (include soft-deleted to avoid DB constraint clash)
    if (value.username && value.username !== row.username) {
      const existing = await scopeToFarm(
        db('users').where({ username: value.username }),
        req
      ).first()
      if (existing) return res.status(409).json({ error: 'Username already exists' })
    }

    const update = { updated_at: new Date().toISOString() }

    if (value.username !== undefined) update.username = value.username
    if (value.full_name !== undefined) update.full_name = value.full_name
    if (value.role !== undefined) update.role = value.role
    if (value.language !== undefined) update.language = value.language
    if (value.is_active !== undefined) update.is_active = value.is_active

    if (value.permissions !== undefined || value.role !== undefined) {
      // Recalculate permissions when role or permissions change
      const effectiveRole = value.role || row.role
      const effectivePerms =
        value.permissions ??
        (typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions || [])
      update.permissions = JSON.stringify(
        effectiveRole === 'admin' ? ALL_PERMISSIONS : effectivePerms
      )
    }

    if (value.password) {
      update.password_hash = await bcrypt.hash(value.password, BCRYPT_ROUNDS)
    }
    if (value.pin) {
      update.pin_hash = await bcrypt.hash(value.pin, BCRYPT_ROUNDS)
    }

    const oldSanitized = sanitizeUser(row)
    await scopeToFarm(db('users').where({ id: req.params.id }), req).update(update)
    const updated = await scopeToFarm(db('users').where({ id: req.params.id }), req).first()
    const newSanitized = sanitizeUser(updated)
    await logAudit({
      farmId: row.farm_id,
      userId: req.user.id,
      action: 'update',
      entityType: 'user',
      entityId: req.params.id,
      oldValues: oldSanitized,
      newValues: newSanitized,
    })
    res.json(newSanitized)
  } catch (err) {
    next(err)
  }
})

// POST /api/users/:id/revoke-sessions — bump token_version to invalidate all tokens
router.post('/:id/revoke-sessions', async (req, res, next) => {
  try {
    const row = await scopeToFarm(db('users').where({ id: req.params.id }), req)
      .whereNull('deleted_at')
      .first()
    if (!row) return res.status(404).json({ error: 'User not found' })

    // Atomic increment to avoid race conditions on concurrent revokes
    await scopeToFarm(db('users').where({ id: req.params.id }), req).update({
      token_version: db.raw('token_version + 1'),
      updated_at: new Date().toISOString(),
    })

    const updated = await scopeToFarm(db('users').where({ id: req.params.id }), req)
      .select('token_version')
      .first()
    if (!updated) return res.status(404).json({ error: 'User not found' })
    await logAudit({
      farmId: row.farm_id,
      userId: req.user.id,
      action: 'revoke_sessions',
      entityType: 'user',
      entityId: req.params.id,
      newValues: { token_version: updated.token_version },
    })
    res.json({ revoked: true, new_version: updated.token_version })
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

    const row = await scopeToFarm(db('users').where({ id: req.params.id }), req)
      .whereNull('deleted_at')
      .first()
    if (!row) return res.status(404).json({ error: 'User not found' })

    if (req.query.permanent === 'true') {
      // Soft delete — mark deleted_at, deactivate, row stays for FK joins
      const now = new Date().toISOString()
      await scopeToFarm(db('users').where({ id: req.params.id }), req).update({
        deleted_at: now,
        is_active: false,
        updated_at: now,
      })

      await logAudit({
        farmId: row.farm_id,
        userId: req.user.id,
        action: 'delete',
        entityType: 'user',
        entityId: req.params.id,
        oldValues: sanitizeUser(row),
      })
      return res.json({ message: 'User deleted' })
    }

    // Soft deactivate (toggle)
    await scopeToFarm(db('users').where({ id: req.params.id }), req).update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })

    await logAudit({
      farmId: row.farm_id,
      userId: req.user.id,
      action: 'deactivate',
      entityType: 'user',
      entityId: req.params.id,
      oldValues: sanitizeUser(row),
    })
    res.json({ message: 'User deactivated' })
  } catch (err) {
    next(err)
  }
})

module.exports = router
