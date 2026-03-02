const bcrypt = require('bcryptjs')

// Fixed UUIDs so tokens can reference them without a DB lookup
const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
const WORKER_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'

const ADMIN_PASSWORD = 'admin123'
const WORKER_PIN = '1234'

// Seed the two base users required by every test suite.
// Uses cost-factor 4 (min valid) for fast hashing in tests.
async function seedUsers(db) {
  await db('users').insert([
    {
      id: ADMIN_ID,
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
      username: 'test_worker',
      full_name: 'Test Worker',
      role: 'worker',
      pin_hash: bcrypt.hashSync(WORKER_PIN, 4),
      permissions: JSON.stringify([
        'can_manage_cows', 'can_manage_medications',
        'can_record_milk', 'can_log_issues', 'can_log_treatments',
        'can_log_breeding', 'can_view_analytics',
      ]),
      language: 'en',
      is_active: true,
      failed_attempts: 0,
    },
  ])
}

module.exports = { ADMIN_ID, WORKER_ID, ADMIN_PASSWORD, WORKER_PIN, seedUsers }
