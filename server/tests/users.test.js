const { randomUUID } = require('crypto')
const request = require('supertest')
const app = require('../app')
const db = require('../config/database')
const { ADMIN_ID, seedUsers } = require('./helpers/setup')
const { adminToken, workerToken } = require('./helpers/tokens')

beforeAll(async () => {
  await db.migrate.latest()
  await seedUsers(db)
})

afterAll(() => db.destroy())

// ─── Factory ───────────────────────────────────────────────────────────────────

function makeWorker(overrides = {}) {
  return {
    username: `worker_${randomUUID().slice(0, 8)}`,
    full_name: 'Test Worker',
    role: 'worker',
    pin: '5678',
    permissions: ['can_manage_cows'],
    ...overrides,
  }
}

function makeAdmin(overrides = {}) {
  return {
    username: `admin_${randomUUID().slice(0, 8)}`,
    full_name: 'Test Admin',
    role: 'admin',
    password: 'secret123',
    ...overrides,
  }
}

// ─── GET /api/users ──────────────────────────────────────────────────────────

describe('GET /api/users', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/users')
    expect(res.status).toBe(401)
  })

  it('returns 403 for a worker token', async () => {
    const res = await request(app).get('/api/users').set('Authorization', workerToken())
    expect(res.status).toBe(403)
  })

  it('returns all users for admin', async () => {
    const res = await request(app).get('/api/users').set('Authorization', adminToken())
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThanOrEqual(2)
  })

  it('strips password_hash and pin_hash from response', async () => {
    const res = await request(app).get('/api/users').set('Authorization', adminToken())
    for (const user of res.body) {
      expect(user.password_hash).toBeUndefined()
      expect(user.pin_hash).toBeUndefined()
    }
  })

  it('parses permissions JSON to array', async () => {
    const res = await request(app).get('/api/users').set('Authorization', adminToken())
    for (const user of res.body) {
      expect(Array.isArray(user.permissions)).toBe(true)
    }
  })

  it('filters by active=1', async () => {
    // Create and deactivate a user
    const create = await request(app)
      .post('/api/users')
      .set('Authorization', adminToken())
      .send(makeWorker({ username: `inactive_${randomUUID().slice(0, 6)}` }))
    await db('users').where({ id: create.body.id }).update({ is_active: false })

    const res = await request(app).get('/api/users?active=1').set('Authorization', adminToken())
    const ids = res.body.map((u) => u.id)
    expect(ids).not.toContain(create.body.id)
  })

  it('filters by active=0', async () => {
    // Create and deactivate a user
    const create = await request(app)
      .post('/api/users')
      .set('Authorization', adminToken())
      .send(makeWorker({ username: `inact0_${randomUUID().slice(0, 6)}` }))
    await db('users').where({ id: create.body.id }).update({ is_active: false })

    const res = await request(app).get('/api/users?active=0').set('Authorization', adminToken())
    const ids = res.body.map((u) => u.id)
    expect(ids).toContain(create.body.id)
  })
})

// ─── GET /api/users/:id ─────────────────────────────────────────────────────

describe('GET /api/users/:id', () => {
  it('returns a single user', async () => {
    const res = await request(app)
      .get(`/api/users/${ADMIN_ID}`)
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
    expect(res.body.username).toBe('test_admin')
    expect(res.body.password_hash).toBeUndefined()
  })

  it('returns 404 for nonexistent id', async () => {
    const res = await request(app)
      .get(`/api/users/${randomUUID()}`)
      .set('Authorization', adminToken())
    expect(res.status).toBe(404)
  })
})

// ─── POST /api/users ────────────────────────────────────────────────────────

describe('POST /api/users', () => {
  it('creates a worker with PIN', async () => {
    const data = makeWorker()
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', adminToken())
      .send(data)

    expect(res.status).toBe(201)
    expect(res.body.username).toBe(data.username)
    expect(res.body.role).toBe('worker')
    expect(res.body.password_hash).toBeUndefined()
    expect(res.body.pin_hash).toBeUndefined()
    expect(Array.isArray(res.body.permissions)).toBe(true)
    expect(res.body.permissions).toContain('can_manage_cows')
  })

  it('creates an admin with password', async () => {
    const data = makeAdmin()
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', adminToken())
      .send(data)

    expect(res.status).toBe(201)
    expect(res.body.role).toBe('admin')
  })

  it('returns 400 when admin has no password', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', adminToken())
      .send({ username: 'nopw', full_name: 'No PW', role: 'admin' })

    expect(res.status).toBe(400)
  })

  it('returns 400 when worker has no PIN', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', adminToken())
      .send({ username: 'nopin', full_name: 'No PIN', role: 'worker' })

    expect(res.status).toBe(400)
  })

  it('returns 400 when worker sends password instead of pin', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', adminToken())
      .send({ username: 'badworker', full_name: 'Bad', role: 'worker', password: 'secret' })

    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid PIN format', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', adminToken())
      .send({ username: 'badpin', full_name: 'Bad', role: 'worker', pin: 'abc' })

    expect(res.status).toBe(400)
  })

  it('returns 400 for a 5-digit PIN (must be exactly 4)', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', adminToken())
      .send({ username: 'pin5', full_name: 'Five', role: 'worker', pin: '12345' })

    expect(res.status).toBe(400)
  })

  it('returns 409 for duplicate username', async () => {
    const data = makeWorker()
    await request(app).post('/api/users').set('Authorization', adminToken()).send(data)
    const res = await request(app).post('/api/users').set('Authorization', adminToken()).send(data)

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/already exists/i)
  })

  it('returns 403 for a worker token', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', workerToken())
      .send(makeWorker())

    expect(res.status).toBe(403)
  })

  it('admin users auto-get all permissions', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', adminToken())
      .send(makeAdmin())

    expect(res.status).toBe(201)
    expect(res.body.permissions).toContain('can_manage_cows')
    expect(res.body.permissions).toContain('can_view_analytics')
    expect(res.body.permissions).not.toContain('can_manage_users')
    expect(res.body.permissions).toContain('can_manage_medications')
  })
})

// ─── PATCH /api/users/:id ───────────────────────────────────────────────────

describe('PATCH /api/users/:id', () => {
  let userId

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', adminToken())
      .send(makeWorker({ username: `patchme_${randomUUID().slice(0, 6)}` }))
    userId = res.body.id
  })

  it('updates full_name', async () => {
    const res = await request(app)
      .patch(`/api/users/${userId}`)
      .set('Authorization', adminToken())
      .send({ full_name: 'Updated Name' })

    expect(res.status).toBe(200)
    expect(res.body.full_name).toBe('Updated Name')
  })

  it('updates permissions', async () => {
    const res = await request(app)
      .patch(`/api/users/${userId}`)
      .set('Authorization', adminToken())
      .send({ permissions: ['can_log_issues', 'can_log_treatments'] })

    expect(res.status).toBe(200)
    expect(res.body.permissions).toEqual(['can_log_issues', 'can_log_treatments'])
  })

  it('returns 409 for duplicate username', async () => {
    const res = await request(app)
      .patch(`/api/users/${userId}`)
      .set('Authorization', adminToken())
      .send({ username: 'test_admin' }) // already exists

    expect(res.status).toBe(409)
  })

  it('blocks changing own role', async () => {
    const res = await request(app)
      .patch(`/api/users/${ADMIN_ID}`)
      .set('Authorization', adminToken())
      .send({ role: 'worker' })

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/own role/i)
  })

  it('returns 404 for nonexistent id', async () => {
    const res = await request(app)
      .patch(`/api/users/${randomUUID()}`)
      .set('Authorization', adminToken())
      .send({ full_name: 'Ghost' })

    expect(res.status).toBe(404)
  })

  it('returns 400 for empty body', async () => {
    const res = await request(app)
      .patch(`/api/users/${userId}`)
      .set('Authorization', adminToken())
      .send({})

    expect(res.status).toBe(400)
  })
})

// ─── DELETE /api/users/:id ──────────────────────────────────────────────────

describe('DELETE /api/users/:id', () => {
  it('deactivates a user (soft delete)', async () => {
    const create = await request(app)
      .post('/api/users')
      .set('Authorization', adminToken())
      .send(makeWorker({ username: `delme_${randomUUID().slice(0, 6)}` }))

    const res = await request(app)
      .delete(`/api/users/${create.body.id}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/deactivated/i)

    // Verify in DB
    const row = await db('users').where({ id: create.body.id }).first()
    expect(row.is_active).toBeFalsy()
  })

  it('blocks self-deactivation', async () => {
    const res = await request(app)
      .delete(`/api/users/${ADMIN_ID}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/own account/i)
  })

  it('returns 404 for nonexistent id', async () => {
    const res = await request(app)
      .delete(`/api/users/${randomUUID()}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(404)
  })

  it('returns 403 for a worker token', async () => {
    const res = await request(app)
      .delete(`/api/users/${randomUUID()}`)
      .set('Authorization', workerToken())

    expect(res.status).toBe(403)
  })
})

// ─── 13B.6: Soft-deleted users inaccessible via ID ──────────────────────────

describe('soft-deleted users inaccessible via GET/:id and PATCH/:id', () => {
  let deletedUserId

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', adminToken())
      .send(makeWorker({ username: `softdel_${randomUUID().slice(0, 6)}` }))
    deletedUserId = res.body.id

    // Permanently soft-delete the user via the ?permanent=true flag
    await request(app)
      .delete(`/api/users/${deletedUserId}?permanent=true`)
      .set('Authorization', adminToken())
  })

  it('GET /:id returns 404 for a soft-deleted user', async () => {
    const res = await request(app)
      .get(`/api/users/${deletedUserId}`)
      .set('Authorization', adminToken())
    expect(res.status).toBe(404)
  })

  it('PATCH /:id returns 404 for a soft-deleted user', async () => {
    const res = await request(app)
      .patch(`/api/users/${deletedUserId}`)
      .set('Authorization', adminToken())
      .send({ full_name: 'Ghost Update' })
    expect(res.status).toBe(404)
  })
})
