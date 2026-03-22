const request = require('supertest')
const app = require('../app')
const db = require('../config/database')
const jwt = require('jsonwebtoken')
const { jwtSecret } = require('../config/env')
const {
  ADMIN_ID,
  WORKER_ID,
  DEFAULT_FARM_ID,
  ADMIN_PASSWORD,
  WORKER_PIN,
  seedUsers,
} = require('./helpers/setup')

const FARM_CODE = 'TEST'

beforeAll(async () => {
  await db.migrate.latest()
  await seedUsers(db)
})

afterAll(() => db.destroy())

// ─── Password login ────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('returns 200 with token and user payload for valid credentials + farm_code', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test_admin', password: ADMIN_PASSWORD, farm_code: FARM_CODE })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('token')
    expect(typeof res.body.token).toBe('string')
    expect(res.body.user.username).toBe('test_admin')
    expect(res.body.user.role).toBe('admin')
    expect(res.body.user.farm_id).toBe(DEFAULT_FARM_ID)
    expect(res.body.user.token_version).toBe(0)
    expect(res.body.user).not.toHaveProperty('password_hash')
  })

  it('returns 401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test_admin', password: 'wrong-password', farm_code: FARM_CODE })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid credentials')
  })

  it('returns 401 for unknown username', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nobody', password: ADMIN_PASSWORD, farm_code: FARM_CODE })

    expect(res.status).toBe(401)
  })

  it('returns 401 for invalid farm code', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test_admin', password: ADMIN_PASSWORD, farm_code: 'BADCODE' })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid farm code')
  })

  it('returns 401 when no farm_code and user is not super_admin', async () => {
    // Without farm_code, login only works for super_admin role
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test_admin', password: ADMIN_PASSWORD })

    expect(res.status).toBe(401)
  })

  it('returns 400 when password is missing', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'test_admin' })

    expect(res.status).toBe(400)
  })

  it('returns 400 when both fields are missing', async () => {
    const res = await request(app).post('/api/auth/login').send({})
    expect(res.status).toBe(400)
  })
})

// ─── PIN login ─────────────────────────────────────────────────────────────────

describe('POST /api/auth/login-pin', () => {
  beforeEach(async () => {
    await db('users').where({ id: WORKER_ID }).update({ failed_attempts: 0, locked_until: null })
  })

  it('returns 200 with token and user payload for valid PIN + farm_code', async () => {
    const res = await request(app)
      .post('/api/auth/login-pin')
      .send({ username: 'test_worker', pin: WORKER_PIN, farm_code: FARM_CODE })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('token')
    expect(res.body.user.username).toBe('test_worker')
    expect(res.body.user.role).toBe('worker')
    expect(res.body.user.farm_id).toBe(DEFAULT_FARM_ID)
    expect(res.body.user).not.toHaveProperty('pin_hash')
  })

  it('returns 400 when farm_code is missing (PIN requires farm_code)', async () => {
    const res = await request(app)
      .post('/api/auth/login-pin')
      .send({ username: 'test_worker', pin: WORKER_PIN })

    expect(res.status).toBe(400)
  })

  it('returns 401 for wrong PIN', async () => {
    const res = await request(app)
      .post('/api/auth/login-pin')
      .send({ username: 'test_worker', pin: '9999', farm_code: FARM_CODE })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid credentials')
  })

  it('returns 401 for unknown username', async () => {
    const res = await request(app)
      .post('/api/auth/login-pin')
      .send({ username: 'nobody', pin: WORKER_PIN, farm_code: FARM_CODE })

    expect(res.status).toBe(401)
  })

  it('returns 400 when PIN is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login-pin')
      .send({ username: 'test_worker', farm_code: FARM_CODE })

    expect(res.status).toBe(400)
  })

  it('locks the account after reaching the failed-attempt threshold', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/login-pin')
        .send({ username: 'test_worker', pin: '0000', farm_code: FARM_CODE })
    }

    const user = await db('users').where({ id: WORKER_ID }).first()
    expect(user.failed_attempts).toBeGreaterThanOrEqual(5)
    expect(user.locked_until).not.toBeNull()
  })

  it('returns 423 while account is locked', async () => {
    await db('users')
      .where({ id: WORKER_ID })
      .update({ locked_until: new Date(Date.now() + 60_000).toISOString() })

    const res = await request(app)
      .post('/api/auth/login-pin')
      .send({ username: 'test_worker', pin: WORKER_PIN, farm_code: FARM_CODE })

    expect(res.status).toBe(423)
  })
})

// ─── Password login lockout ────────────────────────────────────────────────────

describe('POST /api/auth/login lockout', () => {
  beforeEach(async () => {
    await db('users').where({ id: ADMIN_ID }).update({ failed_attempts: 0, locked_until: null })
  })

  it('locks admin account after reaching the failed-attempt threshold', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ username: 'test_admin', password: 'wrong-password', farm_code: FARM_CODE })
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
      .send({ username: 'test_admin', password: ADMIN_PASSWORD, farm_code: FARM_CODE })

    expect(res.status).toBe(423)
    expect(res.body.error).toBe('Account temporarily locked')
  })

  it('clears lockout state on successful login', async () => {
    await db('users').where({ id: ADMIN_ID }).update({ failed_attempts: 3, locked_until: null })

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test_admin', password: ADMIN_PASSWORD, farm_code: FARM_CODE })

    expect(res.status).toBe(200)
    const user = await db('users').where({ id: ADMIN_ID }).first()
    expect(user.failed_attempts).toBe(0)
    expect(user.locked_until).toBeNull()
  })
})

// ─── Token version check ────────────────────────────────────────────────────

describe('Token version', () => {
  it('includes token_version in JWT payload', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test_admin', password: ADMIN_PASSWORD, farm_code: FARM_CODE })

    expect(res.status).toBe(200)
    const decoded = jwt.verify(res.body.token, jwtSecret)
    expect(decoded.token_version).toBe(0)
  })

  it('rejects token when token_version is bumped', async () => {
    // Login to get a token with token_version=0
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test_admin', password: ADMIN_PASSWORD, farm_code: FARM_CODE })

    const token = loginRes.body.token

    // Bump the token_version in DB
    await db('users').where({ id: ADMIN_ID }).update({ token_version: 1 })

    // Try to use the old token — should be rejected
    const res = await request(app).get('/api/cows').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Token revoked')

    // Reset for other tests
    await db('users').where({ id: ADMIN_ID }).update({ token_version: 0 })
  })

  it('rejects refresh when token_version is bumped', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test_admin', password: ADMIN_PASSWORD, farm_code: FARM_CODE })

    await db('users').where({ id: ADMIN_ID }).update({ token_version: 1 })

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Authorization', `Bearer ${loginRes.body.token}`)

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Token revoked')

    await db('users').where({ id: ADMIN_ID }).update({ token_version: 0 })
  })
})

// ─── Temp token security ──────────────────────────────────────────────────

describe('Temp token security', () => {
  it('rejects temp tokens on regular endpoints', async () => {
    const tempToken = jwt.sign({ id: ADMIN_ID, role: 'super_admin', type: 'temp' }, jwtSecret, {
      expiresIn: '10m',
    })

    const res = await request(app).get('/api/cows').set('Authorization', `Bearer ${tempToken}`)

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Temporary token not valid for this endpoint')
  })

  it('rejects temp tokens on refresh', async () => {
    const tempToken = jwt.sign({ id: ADMIN_ID, role: 'super_admin', type: 'temp' }, jwtSecret, {
      expiresIn: '10m',
    })

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Authorization', `Bearer ${tempToken}`)

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Temporary tokens cannot be refreshed')
  })
})

// ─── Auth middleware ───────────────────────────────────────────────────────────

describe('Auth middleware', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app).get('/api/cows')
    expect(res.status).toBe(401)
  })

  it('returns 401 for a malformed token', async () => {
    const res = await request(app).get('/api/cows').set('Authorization', 'Bearer not.a.valid.token')
    expect(res.status).toBe(401)
  })
})

// ─── Farm switcher ─────────────────────────────────────────────────────────────

describe('GET /api/auth/my-farms', () => {
  it('returns the list of active farms for the authenticated user', async () => {
    // The admin user (test_admin) is assigned to DEFAULT_FARM_ID
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test_admin', password: ADMIN_PASSWORD, farm_code: FARM_CODE })

    expect(loginRes.status).toBe(200)
    const token = loginRes.body.token

    const res = await request(app).get('/api/auth/my-farms').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThanOrEqual(1)
    expect(res.body[0]).toHaveProperty('id')
    expect(res.body[0]).toHaveProperty('name')
    expect(res.body[0]).toHaveProperty('code')
    expect(res.body[0]).toHaveProperty('species')
  })

  it('includes species info when farm_species row exists', async () => {
    const cattle = await db('species').where({ code: 'cattle' }).first()
    // Ensure the test farm has a farm_species row
    await db('farm_species')
      .insert({ farm_id: DEFAULT_FARM_ID, species_id: cattle.id })
      .onConflict(['farm_id'])
      .ignore()

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test_admin', password: ADMIN_PASSWORD, farm_code: FARM_CODE })
    const token = loginRes.body.token

    const res = await request(app).get('/api/auth/my-farms').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    const farm = res.body.find((f) => f.id === DEFAULT_FARM_ID)
    expect(farm).toBeDefined()
    expect(farm.species).toBeDefined()
    expect(farm.species.code).toBe('cattle')

    // Clean up
    await db('farm_species').where({ farm_id: DEFAULT_FARM_ID, species_id: cattle.id }).del()
  })

  it('returns 401 without authentication', async () => {
    const res = await request(app).get('/api/auth/my-farms')
    expect(res.status).toBe(401)
  })
})

describe('POST /api/auth/switch-farm/:farmId', () => {
  it('issues a new scoped JWT when user is assigned to target farm', async () => {
    // test_admin is already assigned to DEFAULT_FARM_ID
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test_admin', password: ADMIN_PASSWORD, farm_code: FARM_CODE })
    const token = loginRes.body.token

    const res = await request(app)
      .post(`/api/auth/switch-farm/${DEFAULT_FARM_ID}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
    expect(typeof res.body.token).toBe('string')
    expect(res.body.user.farm_id).toBe(DEFAULT_FARM_ID)
    expect(res.body.farm.id).toBe(DEFAULT_FARM_ID)
  })

  it('returns decoded JWT with correct farm_id', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test_admin', password: ADMIN_PASSWORD, farm_code: FARM_CODE })
    const token = loginRes.body.token

    const switchRes = await request(app)
      .post(`/api/auth/switch-farm/${DEFAULT_FARM_ID}`)
      .set('Authorization', `Bearer ${token}`)

    const decoded = jwt.verify(switchRes.body.token, jwtSecret)
    expect(decoded.farm_id).toBe(DEFAULT_FARM_ID)
    expect(decoded.username).toBe('test_admin')
  })

  it('returns 403 when user is not assigned to target farm', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test_admin', password: ADMIN_PASSWORD, farm_code: FARM_CODE })
    const token = loginRes.body.token

    // Try to switch to a non-existent / unassigned farm
    const nonExistentFarmId = '00000000-dead-4000-beef-000000000000'
    const res = await request(app)
      .post(`/api/auth/switch-farm/${nonExistentFarmId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/not assigned/i)
  })

  it('returns 404 when target farm exists but is inactive', async () => {
    const { seedFarm, seedFarmUser } = require('./helpers/setup')

    // Create a farm where test_admin username also has an account
    const newFarmId = await seedFarm(db, 'SWTEST', 'Switch Test Farm')
    await seedFarmUser(db, newFarmId, { username: 'test_admin', password: ADMIN_PASSWORD })

    // Deactivate that farm
    await db('farms').where({ id: newFarmId }).update({ is_active: false })

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test_admin', password: ADMIN_PASSWORD, farm_code: FARM_CODE })
    const token = loginRes.body.token

    const res = await request(app)
      .post(`/api/auth/switch-farm/${newFarmId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/not found or inactive/i)
  })

  it('returns 401 without authentication', async () => {
    const res = await request(app).post(`/api/auth/switch-farm/${DEFAULT_FARM_ID}`)
    expect(res.status).toBe(401)
  })
})
