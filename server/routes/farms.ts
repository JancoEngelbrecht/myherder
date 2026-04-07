// @ts-nocheck
const express = require('express')
const { randomUUID: uuidv4 } = require('crypto')
const Joi = require('joi')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const db = require('../config/database')
const { jwtSecret } = require('../config/env')
const { logAudit } = require('../services/auditService')
const { seedFarmDefaults } = require('../services/farmSeedService')
const { joiMsg, validateBody, validateQuery } = require('../helpers/constants')

const authenticate = require('../middleware/auth')
const requireSuperAdmin = require('../middleware/requireSuperAdmin')

const router = express.Router()
router.use(authenticate)
router.use(requireSuperAdmin)

// ── Validation ───────────────────────────────────────────────

const BCRYPT_ROUNDS = 12

const createSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  code: Joi.string()
    .pattern(/^[A-Z0-9]{3,10}$/)
    .required()
    .messages({
      'string.pattern.base': 'Farm code must be 3-10 uppercase alphanumeric characters',
    }),
  admin_username: Joi.string().max(50).required(),
  admin_password: Joi.string().min(6).max(128).required(),
  admin_full_name: Joi.string().max(100).required(),
  species_code: Joi.string().max(50).default('cattle'),
})

const updateSchema = Joi.object({
  name: Joi.string().min(2).max(100),
  code: Joi.string()
    .pattern(/^[A-Z0-9]{3,10}$/)
    .messages({
      'string.pattern.base': 'Farm code must be 3-10 uppercase alphanumeric characters',
    }),
  is_active: Joi.boolean().truthy(1).falsy(0),
}).min(1)

const listQuerySchema = Joi.object({
  active: Joi.string().valid('0', '1'),
})

// ── Helpers ──────────────────────────────────────────────────

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

// GET /api/farms — list all farms with stats
router.get('/', async (req, res, next) => {
  try {
    const { error: qError, value: qValue } = validateQuery(listQuerySchema, req.query)
    if (qError) return res.status(400).json({ error: joiMsg(qError) })

    let query = db('farms')
      .leftJoin('farm_species as fs', 'farms.id', 'fs.farm_id')
      .leftJoin('species as sp', 'fs.species_id', 'sp.id')
      .select(
        'farms.*',
        'sp.id as species_id',
        'sp.code as species_code',
        'sp.name as species_name',
        db.raw(
          '(SELECT COUNT(*) FROM users WHERE users.farm_id = farms.id AND users.is_active = 1 AND users.deleted_at IS NULL) as user_count'
        ),
        db.raw(
          '(SELECT COUNT(*) FROM animals WHERE animals.farm_id = farms.id AND animals.deleted_at IS NULL) as animal_count'
        )
      )
      .orderBy('farms.name')

    if (qValue.active === '1') query = query.where('farms.is_active', true)
    else if (qValue.active === '0') query = query.where('farms.is_active', false)

    const farms = await query
    res.json(
      farms.map((f) => {
        const { species_id, species_code, species_name, ...rest } = f
        return {
          ...rest,
          species: species_id ? { id: species_id, code: species_code, name: species_name } : null,
          user_count: Number(f.user_count),
          animal_count: Number(f.animal_count),
        }
      })
    )
  } catch (err) {
    next(err)
  }
})

// ── Export helpers ────────────────────────────────────────────
const EXPORT_USER_FIELDS = [
  'id',
  'username',
  'full_name',
  'role',
  'permissions',
  'language',
  'is_active',
  'created_at',
]

function groupByFarm(rows) {
  const map = {}
  for (const row of rows) {
    ;(map[row.farm_id] ||= []).push(row)
  }
  return map
}

// GET /api/farms/export — cross-farm JSON export (bulk queries)
router.get('/export', async (req, res, next) => {
  try {
    const farms = await db('farms').where('is_active', true).orderBy('name')
    const farmIds = farms.map((f) => f.id)
    if (farmIds.length === 0)
      return res.json({
        _meta: { exported_at: new Date().toISOString(), farm_count: 0, total_records: 0 },
        farms: [],
      })

    const [
      users,
      animals,
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
      db('users').whereIn('farm_id', farmIds).select(EXPORT_USER_FIELDS),
      db('animals').whereIn('farm_id', farmIds),
      db('health_issues').whereIn('farm_id', farmIds),
      db('treatments').whereIn('farm_id', farmIds),
      db('medications').whereIn('farm_id', farmIds),
      db('milk_records').whereIn('farm_id', farmIds),
      db('breeding_events').whereIn('farm_id', farmIds),
      db('breed_types').whereIn('farm_id', farmIds),
      db('issue_type_definitions').whereIn('farm_id', farmIds),
      db('app_settings').whereIn('farm_id', farmIds),
      db('feature_flags').whereIn('farm_id', farmIds),
    ])

    const grouped = {
      users: groupByFarm(users),
      animals: groupByFarm(animals),
      health_issues: groupByFarm(healthIssues),
      treatments: groupByFarm(treatments),
      medications: groupByFarm(medications),
      milk_records: groupByFarm(milkRecords),
      breeding_events: groupByFarm(breedingEvents),
      breed_types: groupByFarm(breedTypes),
      issue_types: groupByFarm(issueTypes),
      app_settings: groupByFarm(appSettings),
      feature_flags: groupByFarm(featureFlags),
    }

    const farmData = farms.map((farm) => {
      const farmUsers = (grouped.users[farm.id] || []).map((u) => {
        let permissions = u.permissions
        if (typeof permissions === 'string') {
          try {
            permissions = JSON.parse(permissions)
          } catch {
            permissions = []
          }
        }
        return { ...u, permissions }
      })
      return {
        farm: { id: farm.id, name: farm.name, code: farm.code },
        users: farmUsers,
        animals: grouped.animals[farm.id] || [],
        health_issues: grouped.health_issues[farm.id] || [],
        treatments: grouped.treatments[farm.id] || [],
        medications: grouped.medications[farm.id] || [],
        milk_records: grouped.milk_records[farm.id] || [],
        breeding_events: grouped.breeding_events[farm.id] || [],
        breed_types: grouped.breed_types[farm.id] || [],
        issue_types: grouped.issue_types[farm.id] || [],
        app_settings: grouped.app_settings[farm.id] || [],
        feature_flags: grouped.feature_flags[farm.id] || [],
      }
    })

    const dateStr = new Date().toISOString().slice(0, 10)
    res.set('Content-Type', 'application/json')
    res.set('Content-Disposition', `attachment; filename="myherder-all-farms-${dateStr}.json"`)
    res.json({
      _meta: {
        exported_at: new Date().toISOString(),
        farm_count: farmData.length,
        total_records: farmData.reduce(
          (sum, f) =>
            sum + Object.values(f).reduce((s, v) => s + (Array.isArray(v) ? v.length : 0), 0),
          0
        ),
      },
      farms: farmData,
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/farms/stats — aggregate system stats
router.get('/stats', async (req, res, next) => {
  try {
    const [
      [{ count: totalFarms }],
      [{ count: activeFarms }],
      [{ count: totalUsers }],
      [{ count: activeUsers }],
      [{ count: totalAnimals }],
      [{ count: activeAnimals }],
    ] = await Promise.all([
      db('farms').count('* as count'),
      db('farms').where('is_active', true).count('* as count'),
      db('users').whereNull('deleted_at').count('* as count'),
      db('users').where('is_active', true).whereNull('deleted_at').count('* as count'),
      db('animals').whereNull('deleted_at').count('* as count'),
      db('animals').where('status', 'active').whereNull('deleted_at').count('* as count'),
    ])

    res.json({
      total_farms: Number(totalFarms),
      active_farms: Number(activeFarms),
      total_users: Number(totalUsers),
      active_users: Number(activeUsers),
      total_animals: Number(totalAnimals),
      active_animals: Number(activeAnimals),
    })
  } catch (err) {
    next(err)
  }
})

// ── Feature flag helpers ─────────────────────────────────────

const FLAG_KEY_MAP = {
  breeding: 'breeding',
  milk_recording: 'milkRecording',
  health_issues: 'healthIssues',
  treatments: 'treatments',
  analytics: 'analytics',
}
const FLAG_REVERSE_MAP = Object.fromEntries(
  Object.entries(FLAG_KEY_MAP).map(([dbKey, apiKey]) => [apiKey, dbKey])
)

async function getFarmFlags(farmId) {
  const rows = await db('feature_flags').where('farm_id', farmId).select('key', 'enabled')
  const flags = {}
  for (const row of rows) {
    const apiKey = FLAG_KEY_MAP[row.key]
    if (apiKey) flags[apiKey] = !!row.enabled
  }
  return flags
}

const flagUpdateSchema = Joi.object({
  breeding: Joi.boolean(),
  milkRecording: Joi.boolean(),
  healthIssues: Joi.boolean(),
  treatments: Joi.boolean(),
  analytics: Joi.boolean(),
}).min(1)

// GET /api/farms/:id — farm detail with user list + feature flags
router.get('/:id', async (req, res, next) => {
  try {
    const farm = await db('farms').where('id', req.params.id).first()
    if (!farm) return res.status(404).json({ error: 'Farm not found' })

    const [users, featureFlags, farmSpecies] = await Promise.all([
      db('users')
        .where({ farm_id: farm.id })
        .whereNull('deleted_at')
        .select('id', 'username', 'full_name', 'role', 'is_active', 'created_at')
        .orderBy('full_name'),
      getFarmFlags(farm.id),
      db('farm_species')
        .where('farm_species.farm_id', farm.id)
        .join('species', 'farm_species.species_id', 'species.id')
        .select('species.id', 'species.code', 'species.name')
        .first(),
    ])

    res.json({
      ...farm,
      species: farmSpecies || null,
      users: users.map(sanitizeUser),
      feature_flags: featureFlags,
    })
  } catch (err) {
    next(err)
  }
})

// PATCH /api/farms/:id/feature-flags — toggle feature flags for a farm
router.patch('/:id/feature-flags', async (req, res, next) => {
  try {
    const farm = await db('farms').where('id', req.params.id).first()
    if (!farm) return res.status(404).json({ error: 'Farm not found' })

    const { error, value } = validateBody(flagUpdateSchema, req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    const now = new Date().toISOString()
    const isSqlite = db.client.config.client === 'better-sqlite3'
    await db.transaction(async (trx) => {
      for (const [apiKey, enabled] of Object.entries(value)) {
        const dbKey = FLAG_REVERSE_MAP[apiKey]
        if (!dbKey) continue
        const updated = await trx('feature_flags')
          .where({ key: dbKey, farm_id: farm.id })
          .update({ enabled, updated_at: now })
        if (updated === 0) {
          // Row doesn't exist — insert it
          if (isSqlite) {
            await trx.raw(
              'INSERT OR IGNORE INTO feature_flags (farm_id, key, enabled, updated_at) VALUES (?, ?, ?, ?)',
              [farm.id, dbKey, enabled, now]
            )
          } else {
            await trx.raw(
              'INSERT INTO feature_flags (farm_id, `key`, enabled, updated_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), updated_at = VALUES(updated_at)',
              [farm.id, dbKey, enabled, now]
            )
          }
        }
      }
    })

    await logAudit({
      farmId: farm.id,
      userId: req.user.id,
      action: 'update',
      entityType: 'feature_flags',
      entityId: farm.id,
      newValues: value,
    })

    const flags = await getFarmFlags(farm.id)
    res.json(flags)
  } catch (err) {
    next(err)
  }
})

// POST /api/farms — create farm with admin user + seed defaults
router.post('/', async (req, res, next) => {
  try {
    const { error, value } = validateBody(createSchema, req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    // Check code uniqueness
    const existing = await db('farms').where('code', value.code).first()
    if (existing) return res.status(409).json({ error: 'Farm code already exists' })

    // Look up species by code
    const species = await db('species')
      .where('code', value.species_code)
      .where('is_active', true)
      .first()
    if (!species) return res.status(400).json({ error: `Unknown species: ${value.species_code}` })

    const farmId = uuidv4()
    const adminId = uuidv4()
    const now = db.fn.now()
    const slug = value.code.toLowerCase()

    await db.transaction(async (trx) => {
      // Create farm
      await trx('farms').insert({
        id: farmId,
        name: value.name,
        code: value.code,
        slug,
        is_active: true,
        created_at: now,
        updated_at: now,
      })

      // Create admin user
      const passwordHash = await bcrypt.hash(value.admin_password, BCRYPT_ROUNDS)
      await trx('users').insert({
        id: adminId,
        farm_id: farmId,
        username: value.admin_username,
        password_hash: passwordHash,
        full_name: value.admin_full_name,
        role: 'admin',
        permissions: JSON.stringify([
          'can_manage_animals',
          'can_manage_medications',
          'can_log_issues',
          'can_log_treatments',
          'can_log_breeding',
          'can_record_milk',
          'can_view_analytics',
        ]),
        language: 'en',
        is_active: true,
        failed_attempts: 0,
        created_at: now,
        updated_at: now,
      })

      // Seed default reference data (species-aware)
      await seedFarmDefaults(farmId, value.name, trx, { speciesId: species.id })
    })

    const farm = await db('farms').where('id', farmId).first()
    const adminUser = await db('users').where('id', adminId).first()

    await logAudit({
      farmId: farmId,
      userId: req.user.id,
      action: 'create',
      entityType: 'farm',
      entityId: farmId,
      newValues: { name: value.name, code: value.code },
    })

    res.status(201).json({ farm, admin_user: sanitizeUser(adminUser) })
  } catch (err) {
    next(err)
  }
})

// PATCH /api/farms/:id — update farm
router.patch('/:id', async (req, res, next) => {
  try {
    const farm = await db('farms').where('id', req.params.id).first()
    if (!farm) return res.status(404).json({ error: 'Farm not found' })

    const { error, value } = validateBody(updateSchema, req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    // Check code uniqueness if changing
    if (value.code && value.code !== farm.code) {
      const existing = await db('farms').where('code', value.code).whereNot('id', farm.id).first()
      if (existing) return res.status(409).json({ error: 'Farm code already exists' })
    }

    const update = { updated_at: new Date().toISOString() }
    if (value.name !== undefined) update.name = value.name
    if (value.code !== undefined) {
      update.code = value.code
      update.slug = value.code.toLowerCase()
    }
    if (value.is_active !== undefined) update.is_active = value.is_active

    await db('farms').where('id', farm.id).update(update)

    const updated = await db('farms').where('id', farm.id).first()
    await logAudit({
      farmId: farm.id,
      userId: req.user.id,
      action: 'update',
      entityType: 'farm',
      entityId: farm.id,
      oldValues: { name: farm.name, code: farm.code, is_active: farm.is_active },
      newValues: { name: updated.name, code: updated.code, is_active: updated.is_active },
    })

    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/farms/:id — permanently delete farm and all data
router.delete('/:id', async (req, res, next) => {
  try {
    const farm = await db('farms').where('id', req.params.id).first()
    if (!farm) return res.status(404).json({ error: 'Farm not found' })

    const isSQLite = !['mysql', 'mysql2'].includes(db.client.config.client)

    // MySQL: disable FK checks outside transaction to avoid issues on rollback
    if (!isSQLite) await db.raw('SET FOREIGN_KEY_CHECKS=0')
    try {
      await db.transaction(async (trx) => {
        // Guard: refuse to delete if super-admin users are assigned to this farm
        const superAdminCount = await trx('users')
          .where({ farm_id: farm.id, role: 'super_admin' })
          .count('* as c')
          .first()
        if (Number(superAdminCount.c) > 0) {
          throw Object.assign(
            new Error('Cannot delete farm with super-admin users. Reassign them first.'),
            { status: 409 }
          )
        }

        // Collect user IDs for announcement_dismissals cleanup (inside transaction for atomicity)
        const farmUserIds = await trx('users').where('farm_id', farm.id).pluck('id')

        // Delete in FK-safe order
        await trx('audit_log').where('farm_id', farm.id).del()
        // Two-pass sync_log: first by farm_id (post-032 rows), then by user_id (pre-032 NULL farm_id rows)
        await trx('sync_log').where('farm_id', farm.id).del()
        if (farmUserIds.length > 0) {
          await trx('sync_log').whereIn('user_id', farmUserIds).del()
          // announcement_dismissals must come before users (MySQL FK: user_id → users.id)
          await trx('announcement_dismissals').whereIn('user_id', farmUserIds).del()
        }
        await trx('health_issue_comments').where('farm_id', farm.id).del()
        await trx('treatments').where('farm_id', farm.id).del()
        await trx('milk_records').where('farm_id', farm.id).del()
        await trx('breeding_events').where('farm_id', farm.id).del()
        await trx('health_issues').where('farm_id', farm.id).del()
        await trx('animals').where('farm_id', farm.id).del()
        await trx('medications').where('farm_id', farm.id).del()
        await trx('breed_types').where('farm_id', farm.id).del()
        await trx('issue_type_definitions').where('farm_id', farm.id).del()
        await trx('feature_flags').where('farm_id', farm.id).del()
        await trx('app_settings').where('farm_id', farm.id).del()
        await trx('farm_species').where('farm_id', farm.id).del()
        // Remove from any farm group; auto-delete groups that fall below 2 members
        await trx('farm_group_members').where('farm_id', farm.id).del()
        const underMinGroups = await trx('farm_groups')
          .leftJoin('farm_group_members as m', 'farm_groups.id', 'm.farm_group_id')
          .groupBy('farm_groups.id')
          .havingRaw('COUNT(m.id) < 2')
          .select('farm_groups.id')
        if (underMinGroups.length > 0) {
          const groupIds = underMinGroups.map((g) => g.id)
          await trx('farm_group_members').whereIn('farm_group_id', groupIds).del()
          await trx('farm_groups').whereIn('id', groupIds).del()
        }
        // Silently preserves super_admin users — guaranteed zero by guard above
        await trx('users').where('farm_id', farm.id).whereNot('role', 'super_admin').del()
        await trx('farms').where('id', farm.id).del()
      })
    } finally {
      if (!isSQLite) await db.raw('SET FOREIGN_KEY_CHECKS=1')
    }

    // No audit_log entry — the farm and its log are gone
    res.json({ message: 'Farm permanently deleted' })
  } catch (err) {
    if (err.status === 409) return res.status(409).json({ error: err.message })
    next(err)
  }
})

// POST /api/farms/:id/enter — super-admin enters a farm context
router.post('/:id/enter', async (req, res, next) => {
  try {
    const farm = await db('farms').where('id', req.params.id).first()
    if (!farm) return res.status(404).json({ error: 'Farm not found' })

    // Allow entering inactive farms (for viewing/management)
    const user = await db('users').where({ id: req.user.id, is_active: true }).first()
    if (!user) return res.status(401).json({ error: 'User not found' })

    let permissions = user.permissions
    if (typeof permissions === 'string') {
      try {
        permissions = JSON.parse(permissions)
      } catch {
        permissions = []
      }
    }

    // Look up the farm's species
    const fs = await db('farm_species')
      .join('species', 'species.id', 'farm_species.species_id')
      .where('farm_species.farm_id', farm.id)
      .select('species.code as species_code')
      .first()

    const payload = {
      id: user.id,
      farm_id: farm.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      permissions,
      language: user.language,
      token_version: user.token_version ?? 0,
      login_type: 'password',
    }
    if (fs) payload.species_code = fs.species_code

    const token = jwt.sign(payload, jwtSecret, { expiresIn: '4h' })

    await logAudit({
      farmId: farm.id,
      userId: req.user.id,
      action: 'enter_farm',
      entityType: 'farm',
      entityId: farm.id,
    })

    res.json({ token, user: payload, farm: { id: farm.id, name: farm.name, code: farm.code } })
  } catch (err) {
    next(err)
  }
})

// POST /api/farms/:id/revoke-all-sessions — revoke all users' sessions for a farm
router.post('/:id/revoke-all-sessions', async (req, res, next) => {
  try {
    const farm = await db('farms').where('id', req.params.id).first()
    if (!farm) return res.status(404).json({ error: 'Farm not found' })

    const result = await db('users')
      .where({ farm_id: farm.id })
      .whereNull('deleted_at')
      .update({
        token_version: db.raw('token_version + 1'),
        updated_at: new Date().toISOString(),
      })

    await logAudit({
      farmId: farm.id,
      userId: req.user.id,
      action: 'revoke_all_sessions',
      entityType: 'farm',
      entityId: farm.id,
      newValues: { users_affected: result },
    })

    res.json({ revoked: true, users_affected: result })
  } catch (err) {
    next(err)
  }
})

module.exports = router
