const jwt = require('jsonwebtoken')
const { jwtSecret } = require('../../config/env')
const { ADMIN_ID, WORKER_ID } = require('./setup')

// Generate a Bearer token for the admin user (matches ADMIN_ID seeded by seedUsers)
function adminToken() {
  const payload = {
    id: ADMIN_ID,
    username: 'test_admin',
    full_name: 'Test Admin',
    role: 'admin',
    permissions: [],
    language: 'en',
  }
  return `Bearer ${jwt.sign(payload, jwtSecret, { expiresIn: '1h' })}`
}

// Generate a Bearer token for the worker user (matches WORKER_ID seeded by seedUsers)
function workerToken() {
  const payload = {
    id: WORKER_ID,
    username: 'test_worker',
    full_name: 'Test Worker',
    role: 'worker',
    permissions: [
      'can_manage_cows', 'can_manage_medications',
      'can_record_milk', 'can_log_issues', 'can_log_treatments',
      'can_log_breeding', 'can_view_analytics',
    ],
    language: 'en',
  }
  return `Bearer ${jwt.sign(payload, jwtSecret, { expiresIn: '1h' })}`
}

module.exports = { adminToken, workerToken }
