const express = require('express')
const Joi = require('joi')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const rateLimit = require('express-rate-limit')
const { TOTP, Secret } = require('otpauth')
const db = require('../config/database')
const authenticate = require('../middleware/auth')
const { joiMsg, validateBody } = require('../helpers/constants')
const { logAudit } = require('../services/auditService')
const {
  jwtSecret,
  jwtExpiryPassword,
  jwtExpiryPin,
  loginRateLimitWindow,
  loginRateLimitMax,
  lockoutDuration,
  lockoutThreshold,
} = require('../config/env')

const router = express.Router()

// ── Validation schemas ──────────────────────────────────────────

const loginSchema = Joi.object({
  username: Joi.string().max(100).required(),
  password: Joi.string().max(128).required(),
  farm_code: Joi.string().max(20).uppercase().trim().allow('', null).optional(),
})

const pinLoginSchema = Joi.object({
  username: Joi.string().max(100).required(),
  pin: Joi.string()
    .pattern(/^\d{4}$/)
    .required(),
  farm_code: Joi.string()
    .max(20)
    .uppercase()
    .trim()
    .required()
    .messages({ 'any.required': 'Farm code is required for PIN login' }),
})

const verify2faSchema = Joi.object({
  code: Joi.string().min(6).max(20).required(),
})

// Pre-hashed dummy value for constant-time comparison when user not found
const DUMMY_HASH = '$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234'

const TEMP_TOKEN_EXPIRY = '10m'
const RECOVERY_CODE_COUNT = 8
const RECOVERY_CODE_LENGTH = 8

const loginLimiter = rateLimit({
  windowMs: loginRateLimitWindow,
  max: loginRateLimitMax,
  message: { error: 'Too many login attempts, try again later' },
})

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many refresh attempts, please try again later' },
})

const twoFactorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many 2FA attempts, please try again later' },
})

// ── Helpers ──────────────────────────────────────────────────────

function buildUserResponse(user) {
  let permissions = user.permissions
  if (typeof permissions === 'string') {
    try {
      permissions = JSON.parse(permissions)
    } catch {
      permissions = []
    }
  }
  const resp = {
    id: user.id,
    farm_id: user.farm_id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    permissions,
    language: user.language,
    token_version: user.token_version ?? 0,
  }
  // Include species_code when available (joined from farm_species + species)
  if (user.species_code) resp.species_code = user.species_code
  return resp
}

/** Enrich a user row with species_code from farm_species join. */
async function enrichWithSpecies(user) {
  if (!user?.farm_id) return user
  try {
    const fs = await db('farm_species')
      .join('species', 'species.id', 'farm_species.species_id')
      .where('farm_species.farm_id', user.farm_id)
      .select('species.code as species_code')
      .first()
    if (fs) user.species_code = fs.species_code
  } catch {
    // Non-critical — login proceeds without species enrichment
  }
  return user
}

function isLockedOut(user) {
  return user.locked_until && new Date(user.locked_until) > new Date()
}

async function checkAndApplyLockout(user, credentialValid) {
  if (!credentialValid) {
    const attempts = (user.failed_attempts || 0) + 1
    const update = { failed_attempts: attempts }
    if (attempts >= lockoutThreshold) {
      update.locked_until = new Date(Date.now() + lockoutDuration).toISOString()
    }
    await db('users').where({ id: user.id }).update(update)
    return true
  }
  await db('users').where({ id: user.id }).update({ failed_attempts: 0, locked_until: null })
  return false
}

async function resolveFarm(farmCode) {
  if (!farmCode) return null
  return db('farms').where('code', farmCode.toUpperCase()).where('is_active', true).first()
}

function issueTempToken(user) {
  return jwt.sign({ id: user.id, role: user.role, type: 'temp' }, jwtSecret, {
    expiresIn: TEMP_TOKEN_EXPIRY,
  })
}

function issueFullToken(userPayload, loginType) {
  const payload = { ...userPayload, login_type: loginType }
  const expiry = loginType === 'password' ? jwtExpiryPassword : jwtExpiryPin
  return jwt.sign(payload, jwtSecret, { expiresIn: expiry })
}

function verifyTempToken(req, res) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' })
    return null
  }
  try {
    const decoded = jwt.verify(header.slice(7), jwtSecret)
    if (decoded.type !== 'temp') {
      res.status(401).json({ error: 'Invalid token type' })
      return null
    }
    return decoded
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
    return null
  }
}

function generateRecoveryCodes() {
  const codes = []
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    codes.push(
      crypto
        .randomBytes(RECOVERY_CODE_LENGTH / 2 + 1)
        .toString('hex')
        .slice(0, RECOVERY_CODE_LENGTH)
        .toUpperCase()
    )
  }
  return codes
}

function createTOTP(secret, username) {
  return new TOTP({
    issuer: 'MyHerder',
    label: username,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  })
}

// ── POST /api/auth/login — password login ───────────────────────

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { error, value } = validateBody(loginSchema, req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })
    const { username, password, farm_code } = value

    let user

    if (farm_code) {
      const farm = await resolveFarm(farm_code)
      if (!farm) {
        await bcrypt.compare(password, DUMMY_HASH)
        return res.status(401).json({ error: 'Invalid farm code' })
      }
      user = await db('users').where({ farm_id: farm.id, username, is_active: true }).first()
    } else {
      // No farm code — super-admin login only
      user = await db('users').where({ role: 'super_admin', username, is_active: true }).first()
    }

    if (!user || !user.password_hash) {
      await bcrypt.compare(password, DUMMY_HASH)
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    if (isLockedOut(user)) {
      return res.status(423).json({ error: 'Account temporarily locked' })
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    await checkAndApplyLockout(user, valid)

    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    // Super-admin 2FA flow (skipped in development)
    if (user.role === 'super_admin' && process.env.NODE_ENV === 'production') {
      const tempToken = issueTempToken(user)
      if (!user.totp_enabled) {
        return res.json({ requires_totp_setup: true, temp_token: tempToken })
      }
      return res.json({ requires_2fa: true, temp_token: tempToken })
    }

    await enrichWithSpecies(user)
    const userPayload = buildUserResponse(user)
    const token = issueFullToken(userPayload, 'password')
    res.json({ token, user: userPayload })
  } catch (err) {
    next(err)
  }
})

// ── POST /api/auth/login-pin — PIN login ────────────────────────

router.post('/login-pin', loginLimiter, async (req, res, next) => {
  try {
    const { error, value } = validateBody(pinLoginSchema, req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })
    const { username, pin, farm_code } = value

    const farm = await resolveFarm(farm_code)
    if (!farm) {
      await bcrypt.compare(String(pin), DUMMY_HASH)
      return res.status(401).json({ error: 'Invalid farm code' })
    }

    const user = await db('users').where({ farm_id: farm.id, username, is_active: true }).first()

    if (!user || !user.pin_hash) {
      await bcrypt.compare(String(pin), DUMMY_HASH)
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    if (isLockedOut(user)) {
      return res.status(423).json({ error: 'Account temporarily locked' })
    }

    const valid = await bcrypt.compare(String(pin), user.pin_hash)
    await checkAndApplyLockout(user, valid)

    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    await enrichWithSpecies(user)
    const userPayload = buildUserResponse(user)
    const token = issueFullToken(userPayload, 'pin')
    res.json({ token, user: userPayload })
  } catch (err) {
    next(err)
  }
})

// ── POST /api/auth/setup-2fa — generate TOTP secret + recovery codes ────

router.post('/setup-2fa', twoFactorLimiter, async (req, res, next) => {
  try {
    const decoded = verifyTempToken(req, res)
    if (!decoded) return

    const user = await db('users').where({ id: decoded.id, is_active: true }).first()
    if (!user || user.role !== 'super_admin') {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    if (user.totp_enabled) {
      return res.status(409).json({ error: '2FA is already enabled' })
    }

    const secret = new Secret({ size: 20 })
    const totp = createTOTP(secret.base32, user.username)

    const plainCodes = generateRecoveryCodes()
    const hashedCodes = await Promise.all(plainCodes.map((code) => bcrypt.hash(code, 10)))

    await db('users')
      .where({ id: user.id })
      .update({
        totp_secret: secret.base32,
        recovery_codes: JSON.stringify(hashedCodes),
      })

    res.json({
      qr_uri: totp.toString(),
      secret: secret.base32,
      recovery_codes: plainCodes,
    })
  } catch (err) {
    next(err)
  }
})

// ── POST /api/auth/confirm-2fa — verify first TOTP code + enable 2FA ────

router.post('/confirm-2fa', twoFactorLimiter, async (req, res, next) => {
  try {
    const decoded = verifyTempToken(req, res)
    if (!decoded) return

    const { error, value } = validateBody(verify2faSchema, req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    const user = await db('users').where({ id: decoded.id, is_active: true }).first()
    if (!user || user.role !== 'super_admin' || !user.totp_secret) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const totp = createTOTP(user.totp_secret, user.username)
    const delta = totp.validate({ token: value.code, window: 1 })

    if (delta === null) {
      return res.status(401).json({ error: 'Invalid code' })
    }

    await db('users').where({ id: user.id }).update({ totp_enabled: true })

    const freshUser = await db('users').where({ id: user.id }).first()
    await enrichWithSpecies(freshUser)
    const userPayload = buildUserResponse(freshUser)
    const token = issueFullToken(userPayload, 'password')

    res.json({ token, user: userPayload })
  } catch (err) {
    next(err)
  }
})

// ── POST /api/auth/verify-2fa — verify TOTP code or recovery code ───────

router.post('/verify-2fa', twoFactorLimiter, async (req, res, next) => {
  try {
    const decoded = verifyTempToken(req, res)
    if (!decoded) return

    const { error, value } = validateBody(verify2faSchema, req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    const user = await db('users').where({ id: decoded.id, is_active: true }).first()
    if (!user || user.role !== 'super_admin' || !user.totp_secret) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    if (isLockedOut(user)) {
      return res.status(423).json({ error: 'Account temporarily locked' })
    }

    const { code } = value

    // Try TOTP first
    const totp = createTOTP(user.totp_secret, user.username)
    const delta = totp.validate({ token: code, window: 1 })

    if (delta !== null) {
      // Reset failed attempts on successful TOTP
      if (user.failed_attempts > 0) {
        await db('users').where({ id: user.id }).update({ failed_attempts: 0, locked_until: null })
      }
      await enrichWithSpecies(user)
      const userPayload = buildUserResponse(user)
      const token = issueFullToken(userPayload, 'password')
      return res.json({ token, user: userPayload })
    }

    // Try recovery codes
    let recoveryCodes
    try {
      recoveryCodes = JSON.parse(user.recovery_codes || '[]')
    } catch {
      recoveryCodes = []
    }

    let matchedIndex = -1
    for (let i = 0; i < recoveryCodes.length; i++) {
      const match = await bcrypt.compare(code.toUpperCase(), recoveryCodes[i])
      if (match) {
        matchedIndex = i
        break
      }
    }

    if (matchedIndex === -1) {
      // Increment failed attempts on invalid 2FA code
      const attempts = (user.failed_attempts || 0) + 1
      const update = { failed_attempts: attempts }
      if (attempts >= lockoutThreshold) {
        update.locked_until = new Date(Date.now() + lockoutDuration).toISOString()
      }
      await db('users').where({ id: user.id }).update(update)
      return res.status(401).json({ error: 'Invalid code' })
    }

    // Consume the recovery code atomically
    recoveryCodes.splice(matchedIndex, 1)
    await db('users')
      .where({ id: user.id })
      .update({
        recovery_codes: JSON.stringify(recoveryCodes),
        failed_attempts: 0,
        locked_until: null,
      })

    await enrichWithSpecies(user)
    const userPayload = buildUserResponse(user)
    const token = issueFullToken(userPayload, 'password')
    res.json({ token, user: userPayload })
  } catch (err) {
    next(err)
  }
})

// ── GET /api/auth/my-farms — list farms the current user is assigned to ──

router.get('/my-farms', authenticate, async (req, res, next) => {
  try {
    const currentFarmId = req.user.farm_id

    // Super-admin without farm context cannot use the farm switcher
    if (!currentFarmId) return res.json([])

    // Determine which farm group the current farm belongs to
    const currentMembership = await db('farm_group_members').where('farm_id', currentFarmId).first()

    // If the current farm is not in any group, no switching is allowed
    if (!currentMembership) return res.json([])

    // Get all farm_ids in the same group
    const groupMembers = await db('farm_group_members').where(
      'farm_group_id',
      currentMembership.farm_group_id
    )
    const groupFarmIds = groupMembers.map((m) => m.farm_id)

    // Find active user accounts for this username on farms within the group
    const users = await db('users')
      .where('username', req.user.username)
      .where('is_active', true)
      .whereNull('deleted_at')
      .whereNot('role', 'super_admin')
      .whereIn('farm_id', groupFarmIds)
      .select('farm_id')

    if (users.length === 0) return res.json([])

    const farmIds = users.map((u) => u.farm_id).filter(Boolean)

    const farms = await db('farms')
      .whereIn('farms.id', farmIds)
      .where('farms.is_active', true)
      .leftJoin('farm_species as fs', 'farms.id', 'fs.farm_id')
      .leftJoin('species as sp', 'fs.species_id', 'sp.id')
      .select(
        'farms.id',
        'farms.name',
        'farms.code',
        'sp.id as species_id',
        'sp.code as species_code',
        'sp.name as species_name'
      )
      .orderBy('farms.name')

    res.json(
      farms.map((f) => ({
        id: f.id,
        name: f.name,
        code: f.code,
        species: f.species_id
          ? { id: f.species_id, code: f.species_code, name: f.species_name }
          : null,
      }))
    )
  } catch (err) {
    next(err)
  }
})

// ── POST /api/auth/switch-farm/:farmId — switch to another assigned farm ──

router.post('/switch-farm/:farmId', authenticate, async (req, res, next) => {
  try {
    const targetFarmId = req.params.farmId
    const sourceFarmId = req.user.farm_id

    // Verify both farms are in the same farm group (DB-authoritative, cannot be spoofed)
    const [sourceMembership, targetMembership] = await Promise.all([
      db('farm_group_members').where('farm_id', sourceFarmId).first(),
      db('farm_group_members').where('farm_id', targetFarmId).first(),
    ])

    if (
      !sourceMembership ||
      !targetMembership ||
      sourceMembership.farm_group_id !== targetMembership.farm_group_id
    ) {
      return res.status(403).json({ error: 'Farms are not in the same group' })
    }

    // Verify user has an account on the target farm (same username)
    const targetUser = await db('users')
      .where({ farm_id: targetFarmId, username: req.user.username, is_active: true })
      .whereNull('deleted_at')
      .first()

    if (!targetUser) {
      return res.status(403).json({ error: 'You are not assigned to this farm' })
    }

    const farm = await db('farms').where({ id: targetFarmId, is_active: true }).first()
    if (!farm) {
      return res.status(404).json({ error: 'Farm not found or inactive' })
    }

    await enrichWithSpecies(targetUser)
    const userPayload = buildUserResponse(targetUser)
    const loginType = req.user.login_type || 'password'
    const token = issueFullToken(userPayload, loginType)

    // Audit log the farm switch (best-effort — won't block the response)
    await logAudit({
      farmId: targetFarmId,
      userId: req.user.id,
      action: 'switch_farm',
      entityType: 'farm',
      entityId: targetFarmId,
      oldValues: { from_farm_id: sourceFarmId },
      newValues: { to_farm_id: targetFarmId },
    })

    res.json({ token, user: userPayload, farm: { id: farm.id, name: farm.name, code: farm.code } })
  } catch (err) {
    next(err)
  }
})

// ── POST /api/auth/refresh — refresh JWT ────────────────────────

router.post('/refresh', refreshLimiter, async (req, res, next) => {
  try {
    const header = req.headers.authorization
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' })
    }

    let decoded
    try {
      decoded = jwt.verify(header.slice(7), jwtSecret)
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    if (decoded.type === 'temp') {
      return res.status(401).json({ error: 'Temporary tokens cannot be refreshed' })
    }

    const user = await db('users').where({ id: decoded.id, is_active: true }).first()
    if (!user) {
      return res.status(401).json({ error: 'User not found or inactive' })
    }

    if (typeof decoded.token_version !== 'number' || decoded.token_version !== user.token_version) {
      return res.status(401).json({ error: 'Token revoked' })
    }

    if (isLockedOut(user)) {
      return res.status(423).json({ error: 'Account temporarily locked' })
    }

    await enrichWithSpecies(user)
    const userPayload = buildUserResponse(user)
    const loginType = decoded.login_type || (decoded.role === 'admin' ? 'password' : 'pin')
    const token = issueFullToken(userPayload, loginType)

    res.json({ token, user: userPayload })
  } catch (err) {
    next(err)
  }
})

module.exports = router
