const request = require('supertest')
const app = require('../app')
const db = require('../config/database')
const { ADMIN_ID, WORKER_ID, ADMIN_PASSWORD, WORKER_PIN, seedUsers } = require('./helpers/setup')

beforeAll(async () => {
  await db.migrate.latest()
  await seedUsers(db)
})

afterAll(() => db.destroy())

// ─── Password login ────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('returns 200 with token and user payload for valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test_admin', password: ADMIN_PASSWORD })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('token')
    expect(typeof res.body.token).toBe('string')
    expect(res.body.user.username).toBe('test_admin')
    expect(res.body.user.role).toBe('admin')
    // Must never expose the password hash
    expect(res.body.user).not.toHaveProperty('password_hash')
  })

  it('returns 401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test_admin', password: 'wrong-password' })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid credentials')
  })

  it('returns 401 for unknown username', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nobody', password: ADMIN_PASSWORD })

    expect(res.status).toBe(401)
  })

  it('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test_admin' })

    expect(res.status).toBe(400)
  })

  it('returns 400 when both fields are missing', async () => {
    const res = await request(app).post('/api/auth/login').send({})
    expect(res.status).toBe(400)
  })
})

// ─── PIN login ─────────────────────────────────────────────────────────────────

describe('POST /api/auth/login-pin', () => {
  it('returns 200 with token and user payload for valid PIN', async () => {
    const res = await request(app)
      .post('/api/auth/login-pin')
      .send({ username: 'test_worker', pin: WORKER_PIN })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('token')
    expect(res.body.user.username).toBe('test_worker')
    expect(res.body.user.role).toBe('worker')
    expect(res.body.user).not.toHaveProperty('pin_hash')
  })

  it('returns 401 for wrong PIN', async () => {
    // Reset first so we don't accidentally trigger lockout
    await db('users').where({ id: WORKER_ID }).update({ failed_attempts: 0, locked_until: null })

    const res = await request(app)
      .post('/api/auth/login-pin')
      .send({ username: 'test_worker', pin: '9999' })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid credentials')
  })

  it('returns 401 for unknown username', async () => {
    const res = await request(app)
      .post('/api/auth/login-pin')
      .send({ username: 'nobody', pin: WORKER_PIN })

    expect(res.status).toBe(401)
  })

  it('returns 400 when PIN is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login-pin')
      .send({ username: 'test_worker' })

    expect(res.status).toBe(400)
  })

  it('locks the account after reaching the failed-attempt threshold', async () => {
    // Fresh slate so the counter is predictable
    await db('users').where({ id: WORKER_ID }).update({ failed_attempts: 0, locked_until: null })

    // lockoutThreshold defaults to 5 — make 5 bad attempts
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/login-pin')
        .send({ username: 'test_worker', pin: 'bad' })
    }

    const user = await db('users').where({ id: WORKER_ID }).first()
    expect(user.failed_attempts).toBeGreaterThanOrEqual(5)
    expect(user.locked_until).not.toBeNull()
  })

  it('returns 423 while account is locked', async () => {
    // Ensure the account is still locked from the previous test (or force it)
    await db('users')
      .where({ id: WORKER_ID })
      .update({ locked_until: new Date(Date.now() + 60_000).toISOString() })

    const res = await request(app)
      .post('/api/auth/login-pin')
      .send({ username: 'test_worker', pin: WORKER_PIN })

    expect(res.status).toBe(423)
  })
})

// ─── Password login lockout ────────────────────────────────────────────────────

describe('POST /api/auth/login lockout', () => {
  beforeEach(async () => {
    await db('users').where({ id: ADMIN_ID }).update({ failed_attempts: 0, locked_until: null })
  })

  it('locks admin account after reaching the failed-attempt threshold', async () => {
    // lockoutThreshold defaults to 5 — make 5 bad password attempts
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ username: 'test_admin', password: 'wrong-password' })
    }

    const user = await db('users').where({ id: ADMIN_ID }).first()
    expect(user.failed_attempts).toBeGreaterThanOrEqual(5)
    expect(user.locked_until).not.toBeNull()
  })

  it('returns 423 while admin account is locked', async () => {
    await db('users')
      .where({ id: ADMIN_ID })
      .update({ locked_until: new Date(Date.now() + 60_000).toISOString() })

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test_admin', password: ADMIN_PASSWORD })

    expect(res.status).toBe(423)
    expect(res.body.error).toBe('Account temporarily locked')
  })

  it('clears lockout state on successful login', async () => {
    // Unlock and ensure login succeeds, then verify failed_attempts is reset
    await db('users').where({ id: ADMIN_ID }).update({ failed_attempts: 3, locked_until: null })

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test_admin', password: ADMIN_PASSWORD })

    expect(res.status).toBe(200)
    const user = await db('users').where({ id: ADMIN_ID }).first()
    expect(user.failed_attempts).toBe(0)
    expect(user.locked_until).toBeNull()
  })
})

// ─── Auth middleware ───────────────────────────────────────────────────────────

describe('Auth middleware', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app).get('/api/cows')
    expect(res.status).toBe(401)
  })

  it('returns 401 for a malformed token', async () => {
    const res = await request(app)
      .get('/api/cows')
      .set('Authorization', 'Bearer not.a.valid.token')
    expect(res.status).toBe(401)
  })
})
