const bcrypt = require('bcryptjs')
const { randomUUID } = require('crypto')

/**
 * Production seed — creates a single super_admin user.
 *
 * Required env vars:
 *   SUPER_ADMIN_PASSWORD — plaintext; will be bcrypt-hashed (cost 12) before storage. Must be set, min 12 chars.
 *   SUPER_ADMIN_USERNAME — optional, defaults to 'super_admin'
 *
 * Idempotent: skips if a super_admin user already exists.
 */
exports.seed = async function (knex) {
  const existing = await knex('users')
    .where({ role: 'super_admin' })
    .first()

  if (existing) {
    console.log('Super admin already exists — skipping seed.')
    return
  }

  const password = process.env.SUPER_ADMIN_PASSWORD
  if (!password) {
    throw new Error(
      'SUPER_ADMIN_PASSWORD env var is required for production seed. ' +
      'Set it before running: npx knex seed:run --env production'
    )
  }
  if (password.length < 12) {
    throw new Error('SUPER_ADMIN_PASSWORD must be at least 12 characters.')
  }

  const username = process.env.SUPER_ADMIN_USERNAME || 'super_admin'
  const now = knex.fn.now()

  await knex('users').insert({
    id: randomUUID(),
    farm_id: null,
    username,
    password_hash: await bcrypt.hash(password, 12),
    full_name: 'Super Admin',
    role: 'super_admin',
    permissions: JSON.stringify([]),
    language: 'en',
    is_active: true,
    failed_attempts: 0,
    token_version: 0,
    created_at: now,
    updated_at: now,
  })

  console.log(`Super admin user '${username}' created successfully.`)
}
