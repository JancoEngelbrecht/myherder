const { randomUUID } = require('crypto')
const request = require('supertest')
const app = require('../app')
const db = require('../config/database')
const { seedUsers, DEFAULT_FARM_ID } = require('./helpers/setup')
const { adminToken } = require('./helpers/tokens')

beforeAll(async () => {
  await db.migrate.latest()
  await seedUsers(db)
})

afterAll(() => db.destroy())

// Helper — inserts a medication row and returns its id
async function createMedication(overrides = {}) {
  const id = randomUUID()
  const now = new Date().toISOString()
  await db('medications').insert({
    id,
    farm_id: DEFAULT_FARM_ID,
    name: `Med-${id.slice(0, 8)}`,
    withdrawal_milk_hours: 48,
    withdrawal_meat_days: 4,
    is_active: true,
    created_at: now,
    updated_at: now,
    ...overrides,
  })
  return id
}

// ─── GET /api/medications ──────────────────────────────────────────────────────

describe('GET /api/medications', () => {
  it('returns only active medications by default', async () => {
    const activeId = await createMedication({ is_active: true })
    const inactiveId = await createMedication({ is_active: false })

    const res = await request(app).get('/api/medications').set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const ids = res.body.map((m) => m.id)
    expect(ids).toContain(activeId)
    expect(ids).not.toContain(inactiveId)
  })

  it('returns all medications when ?all=1', async () => {
    const inactiveId = await createMedication({ is_active: false })

    const res = await request(app)
      .get('/api/medications?all=1')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.some((m) => m.id === inactiveId)).toBe(true)
  })

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/medications')
    expect(res.status).toBe(401)
  })
})

// ─── GET /api/medications/:id ──────────────────────────────────────────────────

describe('GET /api/medications/:id', () => {
  it('returns the medication', async () => {
    const id = await createMedication({ name: 'Penicillin' })

    const res = await request(app).get(`/api/medications/${id}`).set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(id)
    expect(res.body.name).toBe('Penicillin')
  })

  it('returns 404 for a nonexistent id', async () => {
    const res = await request(app)
      .get(`/api/medications/${randomUUID()}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(404)
  })
})

// ─── POST /api/medications ─────────────────────────────────────────────────────

describe('POST /api/medications', () => {
  it('creates a medication and returns 201', async () => {
    const res = await request(app)
      .post('/api/medications')
      .set('Authorization', adminToken())
      .send({
        name: 'Banamine',
        active_ingredient: 'Flunixin',
        withdrawal_milk_hours: 36,
        withdrawal_meat_days: 4,
      })

    expect(res.status).toBe(201)
    expect(res.body.name).toBe('Banamine')
    expect(res.body.id).toBeDefined()
  })

  it('returns 400 for missing required fields', async () => {
    const res = await request(app)
      .post('/api/medications')
      .set('Authorization', adminToken())
      .send({ name: 'Incomplete' }) // missing withdrawal fields

    expect(res.status).toBe(400)
  })

  it('returns 403 for a token without can_manage_medications', async () => {
    const jwt = require('jsonwebtoken')
    const { jwtSecret } = require('../config/env')
    const { WORKER_ID, DEFAULT_FARM_ID } = require('./helpers/setup')
    const noPermToken = `Bearer ${jwt.sign(
      { id: WORKER_ID, farm_id: DEFAULT_FARM_ID, role: 'worker', permissions: [], token_version: 0 },
      jwtSecret,
      { expiresIn: '1h' },
    )}`

    const res = await request(app)
      .post('/api/medications')
      .set('Authorization', noPermToken)
      .send({ name: 'X', withdrawal_milk_hours: 0, withdrawal_meat_days: 0 })

    expect(res.status).toBe(403)
  })
})

// ─── PUT /api/medications/:id ──────────────────────────────────────────────────

describe('PUT /api/medications/:id', () => {
  it('updates the medication and returns 200', async () => {
    const id = await createMedication({ name: 'OldName' })

    const res = await request(app)
      .put(`/api/medications/${id}`)
      .set('Authorization', adminToken())
      .send({ name: 'NewName', withdrawal_milk_hours: 72, withdrawal_meat_days: 6 })

    expect(res.status).toBe(200)
    expect(res.body.name).toBe('NewName')
    expect(res.body.withdrawal_milk_hours).toBe(72)
  })

  it('returns 404 for a nonexistent id', async () => {
    const res = await request(app)
      .put(`/api/medications/${randomUUID()}`)
      .set('Authorization', adminToken())
      .send({ name: 'Ghost', withdrawal_milk_hours: 0, withdrawal_meat_days: 0 })

    expect(res.status).toBe(404)
  })
})

// ─── DELETE /api/medications/:id ───────────────────────────────────────────────

describe('DELETE /api/medications/:id', () => {
  it('deactivates the medication (sets is_active = false), does not remove the row', async () => {
    const id = await createMedication({ is_active: true })

    const res = await request(app)
      .delete(`/api/medications/${id}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)

    // Row still exists but is now inactive
    const row = await db('medications').where({ id }).first()
    expect(row).toBeDefined()
    expect(row.is_active).toBe(0) // SQLite stores booleans as 0/1
  })

  it('returns 404 for a nonexistent id', async () => {
    const res = await request(app)
      .delete(`/api/medications/${randomUUID()}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(404)
  })
})

// ─── Query Validation (12B.8) ───────────────────────────────────────────────

describe('GET /api/medications query validation', () => {
  it('returns 400 for unknown query param', async () => {
    const res = await request(app)
      .get('/api/medications?bogus=1')
      .set('Authorization', adminToken())
    expect(res.status).toBe(400)
  })
})
