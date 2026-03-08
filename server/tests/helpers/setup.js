const bcrypt = require('bcryptjs')
const { randomUUID } = require('crypto')
const jwt = require('jsonwebtoken')
const { jwtSecret } = require('../../config/env')

// Fixed UUIDs so tokens can reference them without a DB lookup
const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
const WORKER_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'
const DEFAULT_FARM_ID = '00000000-0000-4000-a000-000000000099'

const ADMIN_PASSWORD = 'admin123'
const WORKER_PIN = '1234'

const ALL_PERMISSIONS = [
  'can_manage_cows', 'can_manage_medications',
  'can_record_milk', 'can_log_issues', 'can_log_treatments',
  'can_log_breeding', 'can_view_analytics',
]

// Seed the two base users required by every test suite.
// Uses cost-factor 4 (min valid) for fast hashing in tests.
async function seedUsers(db) {
  // Ensure default farm exists (idempotent for test re-runs)
  // Migration 030 may have already created this farm with code 'DEFAULT' — upsert to 'TEST'
  await db.raw(
    `INSERT OR IGNORE INTO farms (id, name, code, slug, is_active) VALUES (?, 'Test Farm', 'TEST', 'test', 1)`,
    [DEFAULT_FARM_ID]
  )
  await db('farms').where({ id: DEFAULT_FARM_ID }).update({ code: 'TEST', name: 'Test Farm' })

  await db('users').insert([
    {
      id: ADMIN_ID,
      farm_id: DEFAULT_FARM_ID,
      username: 'test_admin',
      full_name: 'Test Admin',
      role: 'admin',
      password_hash: bcrypt.hashSync(ADMIN_PASSWORD, 4),
      permissions: JSON.stringify([]),
      language: 'en',
      is_active: true,
      failed_attempts: 0,
    },
    {
      id: WORKER_ID,
      farm_id: DEFAULT_FARM_ID,
      username: 'test_worker',
      full_name: 'Test Worker',
      role: 'worker',
      pin_hash: bcrypt.hashSync(WORKER_PIN, 4),
      permissions: JSON.stringify(ALL_PERMISSIONS),
      language: 'en',
      is_active: true,
      failed_attempts: 0,
    },
  ])
}

// ── Multi-tenant test helpers ──────────────────────────────────

async function seedFarm(db, code, name) {
  const id = randomUUID()
  await db('farms').insert({
    id,
    name: name || `Farm ${code}`,
    code: code.toUpperCase(),
    slug: code.toLowerCase(),
    is_active: true,
    created_at: new Date().toISOString(),
  })
  return id
}

async function seedFarmUser(db, farmId, { username = 'admin', password, pin, role = 'admin', permissions } = {}) {
  const id = randomUUID()
  const row = {
    id,
    farm_id: farmId,
    username,
    full_name: `${role === 'admin' ? 'Admin' : 'Worker'} ${username}`,
    role,
    // Admins bypass permission checks in middleware; permissions: [] is the correct default
    permissions: JSON.stringify(permissions ?? (role === 'admin' ? [] : ALL_PERMISSIONS)),
    language: 'en',
    is_active: true,
    failed_attempts: 0,
    token_version: 0,
  }
  if (password) row.password_hash = bcrypt.hashSync(password, 4)
  if (pin) row.pin_hash = bcrypt.hashSync(pin, 4)
  await db('users').insert(row)
  return id
}

function tokenForFarm(farmId, userId, { role = 'admin', permissions, username = 'test', tokenVersion = 0 } = {}) {
  const payload = {
    id: userId,
    farm_id: farmId,
    username,
    full_name: `Test ${role}`,
    role,
    permissions: permissions ?? (role === 'admin' ? [] : ALL_PERMISSIONS),
    language: 'en',
    token_version: tokenVersion,
  }
  return `Bearer ${jwt.sign(payload, jwtSecret, { expiresIn: '1h' })}`
}

async function seedCow(db, farmId, overrides = {}) {
  const id = randomUUID()
  await db('cows').insert({
    id,
    farm_id: farmId,
    tag_number: `TAG-${id.slice(0, 8)}`,
    name: 'Test Cow',
    sex: 'female',
    status: 'active',
    dob: '2022-01-01',
    ...overrides,
  })
  return id
}

module.exports = {
  ADMIN_ID, WORKER_ID, DEFAULT_FARM_ID, ADMIN_PASSWORD, WORKER_PIN, seedUsers,
  seedFarm, seedFarmUser, tokenForFarm, seedCow, ALL_PERMISSIONS,
}
