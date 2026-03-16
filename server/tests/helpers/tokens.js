const jwt = require('jsonwebtoken')
const { jwtSecret } = require('../../config/env')
const { ADMIN_ID, WORKER_ID, DEFAULT_FARM_ID } = require('./setup')

// Generate a Bearer token for the admin user (matches ADMIN_ID seeded by seedUsers)
function adminToken() {
  const payload = {
    id: ADMIN_ID,
    farm_id: DEFAULT_FARM_ID,
    username: 'test_admin',
    full_name: 'Test Admin',
    role: 'admin',
    permissions: [],
    language: 'en',
    token_version: 0,
  }
  return `Bearer ${jwt.sign(payload, jwtSecret, { expiresIn: '1h' })}`
}

// Generate a Bearer token for the worker user (matches WORKER_ID seeded by seedUsers)
function workerToken() {
  const payload = {
    id: WORKER_ID,
    farm_id: DEFAULT_FARM_ID,
    username: 'test_worker',
    full_name: 'Test Worker',
    role: 'worker',
    permissions: [
      'can_manage_cows', 'can_manage_medications',
      'can_record_milk', 'can_log_issues', 'can_log_treatments',
      'can_log_breeding', 'can_view_analytics',
    ],
    language: 'en',
    token_version: 0,
  }
  return `Bearer ${jwt.sign(payload, jwtSecret, { expiresIn: '1h' })}`
}

const SUPER_ADMIN_ID = 'cccccccc-cccc-4ccc-cccc-cccccccccccc'

// Generate a Bearer token for a super-admin user (no farm context)
function superAdminToken() {
  const payload = {
    id: SUPER_ADMIN_ID,
    farm_id: null,
    username: 'super_admin',
    full_name: 'Super Admin',
    role: 'super_admin',
    permissions: [],
    language: 'en',
    token_version: 0,
  }
  return `Bearer ${jwt.sign(payload, jwtSecret, { expiresIn: '1h' })}`
}

// Generate a Bearer token for a worker with specific permissions only
function workerTokenWith(permissions = []) {
  const payload = {
    id: WORKER_ID,
    farm_id: DEFAULT_FARM_ID,
    username: 'test_worker',
    full_name: 'Test Worker',
    role: 'worker',
    permissions,
    language: 'en',
    token_version: 0,
  }
  return `Bearer ${jwt.sign(payload, jwtSecret, { expiresIn: '1h' })}`
}

module.exports = { adminToken, workerToken, workerTokenWith, superAdminToken, SUPER_ADMIN_ID }
